import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

import { parse as parseEnvFile } from "dotenv";

import { launchAutomationBrowser } from "../src/lib/browser-rendering";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicLogoPath = resolve(repoRoot, "public", "axiomtransparentlogo.png");
const workerScriptPath = resolve(repoRoot, "scripts", "local-scrape-worker.ts");
const workerPidPath = resolve(repoRoot, ".worker.pid");
const workerEnvPath = resolve(repoRoot, ".env.worker");
const workerEnvExamplePath = resolve(repoRoot, ".env.worker.example");
const devVarsPath = resolve(repoRoot, ".dev.vars");
const liveControlPlaneUrl = "https://operations.getaxiom.ca";
const host = "127.0.0.1";
const port = Number(process.env.WORKER_STUDIO_PORT || process.env.PORT || 4799);
const browserUrl = `http://${host}:${port}`;
const liveAppUrl = `${liveControlPlaneUrl}/hunt`;

let child: ReturnType<typeof spawn> | null = null;
let childStdout = "";
let childStderr = "";
let nextLogId = 1;
let shuttingDown = false;
let startupPromise: Promise<void> | null = null;
const expectedStopPids = new Set<number>();

let state = {
  config: {
    controlPlaneUrl: liveControlPlaneUrl,
    machineName: sanitizeWorkerName(os.hostname() || "local-machine"),
    liveMode: true,
    workerName: `local-${sanitizeWorkerName(os.hostname() || "local-machine")}`,
  },
  logs: [] as Array<{ id: number; kind: string; message: string; timestamp: string }>,
  preflight: {
    checkedAt: null as string | null,
    details: [] as Array<{ label: string; ok: boolean; message: string }>,
    ok: null as boolean | null,
    stage: null as string | null,
    summary: "Not checked yet.",
  },
  worker: {
    activeJob: null as string | null,
    controlPlaneUrl: liveControlPlaneUrl,
    currentJobLabel: null as string | null,
    lastError: null as string | null,
    lastExitCode: null as number | null,
    lastSignal: null as string | null,
    pid: null as number | null,
    startedAt: null as string | null,
    status: "idle" as "idle" | "starting" | "running" | "stopping" | "error",
    workerName: `local-${sanitizeWorkerName(os.hostname() || "local-machine")}`,
  },
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeWorkerName(value: string) {
  const cleaned = String(value || "").trim().replace(/[^A-Za-z0-9._-]/g, "-");
  const normalized = cleaned.replace(/^-+/, "").replace(/-+$/, "");
  return normalized || "local-worker";
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(String(value || "").trim());
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  try {
    return parseEnvFile(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function ensureWorkerEnvFile() {
  if (existsSync(workerEnvPath)) return;
  if (existsSync(workerEnvExamplePath)) {
    copyFileSync(workerEnvExamplePath, workerEnvPath);
    addLog("system", "Created .env.worker from .env.worker.example.");
  }
}

function getMachineName() {
  return sanitizeWorkerName(os.hostname() || "local-machine");
}

function resolveConfig() {
  ensureWorkerEnvFile();

  const fileEnv = {
    ...readEnvFile(devVarsPath),
    ...readEnvFile(workerEnvPath),
  };
  const env = {
    ...fileEnv,
    ...process.env,
  };

  const explicit = String(env.WORKER_CONTROL_PLANE_URL || env.CONTROL_PLANE_URL || env.APP_BASE_URL || "").trim();
  const controlPlaneUrl = explicit && !isLocalUrl(explicit) ? explicit.replace(/\/$/, "") : liveControlPlaneUrl;
  const workerName = sanitizeWorkerName(String(env.WORKER_NAME || env.AGENT_NAME || `local-${getMachineName()}`));
  const geminiApiKey = String(env.GEMINI_API_KEY || "").trim();
  const agentSharedSecret = String(env.AGENT_SHARED_SECRET || "").trim();
  const claimPollIntervalMs = Math.max(1000, Number(env.CLAIM_POLL_INTERVAL_MS || 5000));
  const heartbeatIntervalMs = Math.max(5000, Number(env.HEARTBEAT_INTERVAL_MS || 15000));
  const scrapeTimeoutMs = Math.max(1800000, Number(env.SCRAPE_TIMEOUT_MS || 1800000));

  return {
    controlPlaneUrl,
    workerName,
    machineName: getMachineName(),
    liveMode: controlPlaneUrl === liveControlPlaneUrl,
    geminiApiKey,
    agentSharedSecret,
    claimPollIntervalMs,
    heartbeatIntervalMs,
    scrapeTimeoutMs,
    env,
  };
}

function setWorkerState(patch: Partial<typeof state.worker>) {
  state.worker = { ...state.worker, ...patch };
}

function addLog(kind: string, message: string) {
  state.logs.push({ id: nextLogId++, kind, message, timestamp: nowIso() });
  if (state.logs.length > 300) {
    state.logs.splice(0, state.logs.length - 300);
  }
  if (kind !== "system") {
    console.log(`[studio] ${message}`);
  }
}

function syncStateFromConfig() {
  const config = resolveConfig();
  state.config = {
    controlPlaneUrl: config.controlPlaneUrl,
    machineName: config.machineName,
    liveMode: config.liveMode,
    workerName: config.workerName,
  };

  if (!state.worker.pid && state.worker.status === "idle") {
    state.worker.controlPlaneUrl = config.controlPlaneUrl;
    state.worker.workerName = config.workerName;
  }

  return config;
}

function parseWorkerLine(line: string) {
  const runningMatch = line.match(/^\[worker\] running (.+) \(([0-9a-f-]{36})\)$/i);
  if (runningMatch) {
    setWorkerState({ activeJob: runningMatch[2], currentJobLabel: runningMatch[1] });
    return;
  }

  if (/\[worker\] (completed|stopped)/i.test(line) || /^\[DONE\]/i.test(line)) {
    setWorkerState({ activeJob: null, currentJobLabel: null });
  }

  if (/\[worker\] failed/i.test(line) || /fatal error/i.test(line)) {
    setWorkerState({ lastError: line, status: "error" });
  }
}

function flushLines(kind: "stdout" | "stderr", chunk: string) {
  if (kind === "stdout") {
    childStdout += chunk;
    const lines = childStdout.split(/\r?\n/);
    childStdout = lines.pop() || "";
    lines.forEach((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return;
      addLog(kind, trimmed);
      parseWorkerLine(trimmed);
    });
    return;
  }

  childStderr += chunk;
  const lines = childStderr.split(/\r?\n/);
  childStderr = lines.pop() || "";
  lines.forEach((line) => {
    const trimmed = line.trimEnd();
    if (!trimmed) return;
    addLog(kind, trimmed);
    parseWorkerLine(trimmed);
  });
}

function resolveTsxCommand() {
  const direct = resolve(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (existsSync(direct)) {
    return { file: direct, args: [workerScriptPath] };
  }
  if (process.platform === "win32") {
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", "npx --yes tsx scripts\\local-scrape-worker.ts"],
    };
  }
  return { file: "npx", args: ["--yes", "tsx", workerScriptPath] };
}

function buildWorkerEnv() {
  const config = resolveConfig();
  return {
    ...config.env,
    AGENT_NAME: config.workerName,
    AGENT_SHARED_SECRET: config.agentSharedSecret,
    APP_BASE_URL: config.controlPlaneUrl,
    CLAIM_POLL_INTERVAL_MS: String(config.claimPollIntervalMs),
    CONTROL_PLANE_URL: config.controlPlaneUrl,
    GEMINI_API_KEY: config.geminiApiKey,
    HEARTBEAT_INTERVAL_MS: String(config.heartbeatIntervalMs),
    NODE_ENV: process.env.NODE_ENV || "development",
    SCRAPE_TIMEOUT_MS: String(config.scrapeTimeoutMs),
    WORKER_NAME: config.workerName,
  };
}

function collectKnownWorkerPids(includeDiscovered = false) {
  const pids = new Set<number>();

  for (const value of [child?.pid ?? null, state.worker.pid, readPidFile()]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value !== process.pid) {
      pids.add(value);
    }
  }

  if (includeDiscovered && process.platform === "win32") {
    for (const pid of discoverWindowsWorkerPids()) {
      if (pid > 0 && pid !== process.pid) {
        pids.add(pid);
      }
    }
  }

  return Array.from(pids);
}

function discoverWindowsWorkerPids() {
  if (process.platform !== "win32") {
    return [];
  }

  const query = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$patterns = @(",
    "  'local-scrape-worker\\.ts',",
    "  'npm(\\.cmd)?\\s+run\\s+worker(:local)?',",
    "  'tsx(\\.cmd)?\\s+scripts[\\\\/]local-scrape-worker\\.ts',",
    "  'start-worker\\.ps1'",
    ")",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $line = $_.CommandLine",
    "  if (-not $line) { return $false }",
    "  foreach ($pattern in $patterns) {",
    "    if ($line -match $pattern) { return $true }",
    "  }",
    "  return $false",
    "} | Select-Object -ExpandProperty ProcessId",
  ].join("; ");

  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", query],
    { encoding: "utf8", windowsHide: true },
  );

  if (result.error) {
    return [];
  }

  const raw = String(result.stdout || "");
  const discovered = raw
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);

  return Array.from(new Set(discovered));
}

function isProcessAlive(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidFile() {
  if (!existsSync(workerPidPath)) return null;
  try {
    const value = Number(readFileSync(workerPidPath, "utf8").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writePidFile(pid: number | null) {
  if (!pid) {
    if (existsSync(workerPidPath)) {
      try { unlinkSync(workerPidPath); } catch {}
    }
    return;
  }

  try {
    writeFileSync(workerPidPath, String(pid), "utf8");
  } catch {}
}

function refreshExternalWorkerState() {
  const pids = collectKnownWorkerPids(false);
  const pid = pids.find((candidate) => isProcessAlive(candidate)) || null;

  if (pid) {
    if (state.worker.pid !== pid) {
      writePidFile(pid);
    }
    setWorkerState({ pid, status: state.worker.status === "stopping" ? "stopping" : "running" });
    return;
  }

  if (process.platform === "win32") {
    const discoveredPid = discoverWindowsWorkerPids().find((candidate) => isProcessAlive(candidate)) ?? null;
    if (discoveredPid) {
      writePidFile(discoveredPid);
      setWorkerState({ pid: discoveredPid, status: state.worker.status === "stopping" ? "stopping" : "running" });
      return;
    }
  }

  if (state.worker.status !== "starting" && state.worker.status !== "stopping") {
    setWorkerState({ activeJob: null, currentJobLabel: null, pid: null, status: state.worker.status === "error" ? "error" : "idle" });
    writePidFile(null);
  }
}

async function runPreflight() {
  const config = resolveConfig();
  const details: Array<{ label: string; ok: boolean; message: string }> = [];
  const add = (label: string, ok: boolean, message: string) => details.push({ label, ok, message });

  add("Control plane", Boolean(config.controlPlaneUrl), config.liveMode ? `Using live control plane ${config.controlPlaneUrl}.` : `Using ${config.controlPlaneUrl}.`);
  add("Worker name", Boolean(config.workerName), `Running as ${config.workerName}.`);
  add("Agent secret", Boolean(config.agentSharedSecret), config.agentSharedSecret ? "Agent auth is configured." : "AGENT_SHARED_SECRET is missing.");
  add("Gemini key", Boolean(config.geminiApiKey), config.geminiApiKey ? "Gemini enrichment is enabled." : "GEMINI_API_KEY is missing.");

  try {
    const browser = await launchAutomationBrowser();
    await browser.close().catch(() => undefined);
    add("Playwright", true, "Chromium launched cleanly.");
  } catch (error) {
    add("Playwright", false, error instanceof Error ? error.message : "Unable to launch Playwright.");
  }

  try {
    const response = await fetch(config.controlPlaneUrl, { method: "GET" });
    add("Network", response.ok, response.ok ? `Live site responded with ${response.status}.` : `Live site responded with ${response.status}.`);
  } catch (error) {
    add("Network", false, error instanceof Error ? error.message : "Unable to reach live site.");
  }

  const ok = details.every((item) => item.ok);
  state.preflight = {
    checkedAt: nowIso(),
    details,
    ok,
    stage: ok ? "ready" : "blocked",
    summary: ok ? "Preflight passed. The worker is ready to start." : "Preflight failed. Fix the red items before starting the worker.",
  };

  return state.preflight;
}

async function startWorker() {
  refreshExternalWorkerState();
  if (state.worker.status === "running" || state.worker.status === "starting") {
    addLog("system", "Worker is already running.");
    return;
  }

  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    const preflight = await runPreflight();
    if (!preflight.ok) {
      setWorkerState({ lastError: preflight.summary, status: "error" });
      addLog("error", preflight.summary);
      return;
    }

    const config = resolveConfig();
    const command = resolveTsxCommand();
    setWorkerState({
      activeJob: null,
      currentJobLabel: null,
      lastError: null,
      lastExitCode: null,
      lastSignal: null,
      pid: null,
      startedAt: nowIso(),
      status: "starting",
      controlPlaneUrl: config.controlPlaneUrl,
      workerName: config.workerName,
    });
    addLog("system", `Starting worker ${config.workerName} against ${config.controlPlaneUrl}.`);

    child = spawn(command.file, command.args, {
      cwd: repoRoot,
      env: buildWorkerEnv(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    if (!child.pid) {
      setWorkerState({ lastError: "The worker process did not return a PID.", status: "error" });
      addLog("error", "Worker process did not return a PID.");
      child = null;
      return;
    }

    const spawnedPid = child.pid;
    expectedStopPids.delete(spawnedPid);
    writePidFile(spawnedPid);
    setWorkerState({ pid: spawnedPid, status: "running" });
    addLog("system", `Worker started with PID ${spawnedPid}.`);

    child.stdout?.on("data", (chunk: Buffer) => flushLines("stdout", chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => flushLines("stderr", chunk.toString("utf8")));

    child.on("error", (error) => {
      setWorkerState({ lastError: error.message, status: "error" });
      addLog("error", `Worker failed to start: ${error.message}`);
    });

    child.on("exit", (code, signal) => {
      const intentional = shuttingDown || state.worker.status === "stopping" || expectedStopPids.has(spawnedPid);
      expectedStopPids.delete(spawnedPid);
      setWorkerState({
        activeJob: null,
        currentJobLabel: null,
        lastExitCode: typeof code === "number" ? code : null,
        lastSignal: signal,
        pid: null,
        status: intentional ? "idle" : code === 0 ? "idle" : "error",
      });
      writePidFile(null);
      addLog("system", intentional ? "Worker stopped cleanly." : `Worker exited${typeof code === "number" ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}.`);
      child = null;
      refreshExternalWorkerState();
    });
  })();

  try {
    await startupPromise;
  } finally {
    startupPromise = null;
  }
}

function killProcessTree(pid: number) {
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

async function waitForPidsToExit(pids: number[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let alive = pids.filter((pid) => isProcessAlive(pid));

  while (alive.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    alive = alive.filter((pid) => isProcessAlive(pid));
  }

  return alive;
}

async function stopWorker() {
  refreshExternalWorkerState();
  const pids = collectKnownWorkerPids(true).filter((candidate) => isProcessAlive(candidate));
  if (pids.length === 0) {
    addLog("system", "No worker is currently running.");
    setWorkerState({ pid: null, status: "idle" });
    writePidFile(null);
    return;
  }

  setWorkerState({ status: "stopping" });
  addLog("system", `Stopping worker process chain(s): ${pids.join(", ")}.`);
  shuttingDown = true;
  for (const pid of pids) {
    expectedStopPids.add(pid);
  }

  if (child?.pid && pids.includes(child.pid)) {
    try {
      child.kill("SIGINT");
    } catch {}
  }

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGINT");
    } catch {}
  }

  let alive = await waitForPidsToExit(pids, 3000);

  for (const pid of alive) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  alive = await waitForPidsToExit(alive, 2000);
  for (const pid of alive) {
    killProcessTree(pid);
  }

  alive = await waitForPidsToExit(alive, 4000);
  if (process.platform === "win32") {
    for (const discovered of discoverWindowsWorkerPids()) {
      if (isProcessAlive(discovered) && !alive.includes(discovered)) {
        alive.push(discovered);
      }
    }
  }

  alive = Array.from(new Set(alive.filter((pid) => isProcessAlive(pid))));
  shuttingDown = false;
  child = null;

  if (alive.length > 0) {
    const message = `Some worker processes are still alive after stop: ${alive.join(", ")}.`;
    writePidFile(alive[0]);
    setWorkerState({
      activeJob: null,
      currentJobLabel: null,
      pid: alive[0],
      status: "error",
      lastError: message,
    });
    addLog("error", message);
    return;
  }

  for (const pid of pids) {
    expectedStopPids.delete(pid);
  }
  writePidFile(null);
  setWorkerState({
    activeJob: null,
    currentJobLabel: null,
    pid: null,
    status: "idle",
    lastError: null,
  });
  addLog("system", "Worker stopped.");
}

async function openConfigFile() {
  const target = existsSync(workerEnvPath) ? workerEnvPath : existsSync(devVarsPath) ? devVarsPath : workerEnvExamplePath;
  if (!existsSync(target)) {
    addLog("error", "No config file was found to open.");
    return;
  }

  if (process.platform === "win32") {
    spawn("notepad.exe", [target], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    const editor = process.env.EDITOR || "nano";
    spawn(editor, [target], { detached: true, stdio: "ignore" }).unref();
  }

  addLog("system", `Opened ${target.split(/[\\/]/).pop()} for editing.`);
}

async function shutdownStudio() {
  addLog("system", "Shutting down the studio.");
  await stopWorker().catch(() => undefined);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortDisplayUrl(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return String(value || "").replace(/^https?:\/\//i, "");
  }
}

function renderHtml() {
  const initial = JSON.stringify({ ...state, config: syncStateFromConfig() }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>Axiom Worker Studio</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #02050a;
      --panel: rgba(8, 13, 19, 0.84);
      --panel-2: rgba(11, 16, 24, 0.94);
      --border: rgba(255,255,255,0.08);
      --accent: #35f2b6;
      --accent-2: #34d5ff;
      --warning: #f9c74f;
      --danger: #ff5b71;
      --text: rgba(248,250,252,0.96);
      --muted: rgba(148,163,184,0.78);
      --shadow: 0 24px 70px rgba(0,0,0,0.45);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 0%, rgba(52,213,255,0.12), transparent 26%),
        radial-gradient(circle at 80% 20%, rgba(53,242,182,0.10), transparent 22%),
        linear-gradient(180deg, #02050a 0%, #09111a 100%);
      font-family: "Aptos", "Segoe UI", system-ui, -apple-system, sans-serif;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.18;
      background-image:
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.82), transparent 92%);
    }
    .shell {
      max-width: 1440px;
      margin: 0 auto;
      padding: 28px;
      min-height: 100vh;
      position: relative;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 22px;
    }
    .brand { display: flex; align-items: center; gap: 18px; }
    .logo-wrap {
      padding: 14px 16px;
      border-radius: 22px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(18px);
    }
    .brand-logo {
      width: 170px;
      display: block;
      filter: drop-shadow(0 0 18px rgba(255,255,255,0.06));
    }
    .brand-copy h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      line-height: 1;
    }
    .brand-copy p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .pill, .status-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-radius: 999px; border: 1px solid var(--border);
      background: rgba(255,255,255,0.04); color: rgba(241,245,249,0.92);
      font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; white-space: nowrap;
      backdrop-filter: blur(12px);
    }
    .pill .dot, .status-pill .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--warning); box-shadow: 0 0 12px rgba(249,199,79,0.45); }
    .pill.running, .status-pill.running { border-color: rgba(53,242,182,0.22); color: rgba(188,255,233,0.96); background: rgba(53,242,182,0.08); }
    .pill.running .dot, .status-pill.running .dot { background: var(--accent); box-shadow: 0 0 14px rgba(53,242,182,0.55); }
    .pill.error, .status-pill.error { border-color: rgba(255,91,113,0.22); color: rgba(255,206,211,0.96); background: rgba(255,91,113,0.08); }
    .pill.error .dot, .status-pill.error .dot { background: var(--danger); box-shadow: 0 0 14px rgba(255,91,113,0.55); }
    .pill.stopping, .status-pill.stopping { border-color: rgba(249,199,79,0.22); color: rgba(255,239,198,0.98); background: rgba(249,199,79,0.08); }
    .grid { display: grid; grid-template-columns: minmax(360px, 470px) minmax(0, 1fr); gap: 20px; align-items: start; }
    .panel {
      position: relative; overflow: hidden; border-radius: 26px; border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), var(--panel);
      box-shadow: var(--shadow); backdrop-filter: blur(20px);
    }
    .panel::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
      background: linear-gradient(135deg, rgba(53,242,182,0.18), rgba(52,213,255,0.10), transparent 60%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
    }
    .panel-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      padding: 22px 22px 16px;
    }
    .title { margin: 0; font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; }
    .subtitle { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; max-width: 58ch; }
    .content { padding: 0 22px 22px; display: grid; gap: 18px; }
    .toggle {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 16px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(135deg, rgba(10,16,22,0.98), rgba(10,16,22,0.78)); color: var(--text);
      cursor: pointer; transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
    }
    .toggle:hover { transform: translateY(-1px); border-color: rgba(53,242,182,0.18); }
    .toggle:disabled { opacity: 0.72; cursor: not-allowed; transform: none; }
    .toggle-copy { display: grid; gap: 6px; text-align: left; }
    .toggle-copy strong { font-size: 18px; font-weight: 700; }
    .toggle-copy span { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .switch { width: 94px; height: 48px; border-radius: 999px; position: relative; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.05); transition: all 180ms ease; flex: 0 0 auto; }
    .switch::after { content: ""; position: absolute; top: 5px; left: 5px; width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(227,242,255,0.78)); box-shadow: 0 8px 24px rgba(0,0,0,0.38); transition: transform 240ms cubic-bezier(.2,.8,.2,1), background 180ms ease; }
    .toggle.running { border-color: rgba(53,242,182,0.24); box-shadow: 0 0 0 1px rgba(53,242,182,0.08), inset 0 1px 0 rgba(255,255,255,0.03); }
    .toggle.running .switch { background: rgba(53,242,182,0.12); border-color: rgba(53,242,182,0.30); }
    .toggle.running .switch::after { transform: translateX(46px); background: linear-gradient(180deg, rgba(53,242,182,0.96), rgba(52,213,255,0.88)); }
    .toggle.error { border-color: rgba(255,91,113,0.24); }
    .toggle.error .switch { background: rgba(255,91,113,0.10); border-color: rgba(255,91,113,0.24); }
    .toggle.error .switch::after { transform: translateX(0); background: linear-gradient(180deg, rgba(255,91,113,0.96), rgba(249,199,79,0.78)); }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .stat { padding: 14px 15px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
    .stat label { display: block; color: var(--muted); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; margin-bottom: 8px; }
    .stat strong { display: block; font-size: 14px; line-height: 1.35; word-break: break-word; }
    .stat small { display: block; margin-top: 6px; color: rgba(148,163,184,0.72); font-size: 12px; line-height: 1.35; }
    .checklist {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .check-item {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 13px 14px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      min-width: 0;
    }
    .check-mark {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-top: 5px;
      background: var(--warning);
      box-shadow: 0 0 12px rgba(249,199,79,0.45);
      flex: 0 0 auto;
    }
    .check-item.ok .check-mark { background: var(--accent); box-shadow: 0 0 12px rgba(53,242,182,0.55); }
    .check-item.bad .check-mark { background: var(--danger); box-shadow: 0 0 12px rgba(255,91,113,0.55); }
    .check-copy { min-width: 0; display: grid; gap: 4px; }
    .check-copy strong { display: block; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(241,245,249,0.94); }
    .check-copy span { display: block; color: rgba(148,163,184,0.82); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .button {
      appearance: none; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
      color: rgba(248,250,252,0.96); border-radius: 14px; padding: 12px 14px; cursor: pointer;
      font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
      transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
    }
    .button:hover { transform: translateY(-1px); border-color: rgba(53,242,182,0.24); background: rgba(255,255,255,0.06); }
    .button:disabled { opacity: 0.62; cursor: not-allowed; transform: none; }
    .button.primary { border-color: rgba(53,242,182,0.20); background: linear-gradient(135deg, rgba(53,242,182,0.18), rgba(52,213,255,0.12)); }
    .button.danger { border-color: rgba(255,91,113,0.20); background: rgba(255,91,113,0.08); }
    .footer-note { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: rgba(148,163,184,0.72); font-size: 12px; line-height: 1.45; }
    .footer-note strong { color: rgba(248,250,252,0.92); font-weight: 600; }
    .footer-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .log-panel { display: flex; flex-direction: column; min-height: 0; }
    .log-stream {
      min-height: 530px; flex: 1; border-top: 1px solid rgba(255,255,255,0.06);
      background: linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.34));
      padding: 16px 18px 18px; overflow: auto; font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 12px; line-height: 1.65;
    }
    .log-line { display: grid; grid-template-columns: 96px 1fr; gap: 12px; padding: 6px 10px; border-radius: 10px; margin-bottom: 6px; }
    .log-line:hover { background: rgba(255,255,255,0.03); }
    .log-time { color: rgba(148,163,184,0.76); }
    .log-kind { display: inline-flex; align-items: center; justify-content: center; min-width: 70px; padding: 0 10px; border-radius: 999px; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin-right: 10px; background: rgba(255,255,255,0.05); color: rgba(226,232,240,0.85); }
    .log-kind.stdout { color: rgba(188,255,233,0.98); }
    .log-kind.stderr, .log-kind.error { color: rgba(255,188,195,0.98); background: rgba(255,91,113,0.12); }
    .log-kind.system { color: rgba(191,219,254,0.98); background: rgba(52,213,255,0.08); }
    .log-message { overflow-wrap: anywhere; white-space: pre-wrap; color: rgba(241,245,249,0.94); }
    .side-status { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; text-align: right; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.04); color: rgba(241,245,249,0.92); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
    .status-badge .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--warning); box-shadow: 0 0 12px rgba(249,199,79,0.45); }
    .status-badge.running { border-color: rgba(53,242,182,0.22); color: rgba(188,255,233,0.96); background: rgba(53,242,182,0.08); }
    .status-badge.running .dot { background: var(--accent); box-shadow: 0 0 14px rgba(53,242,182,0.55); }
    .status-badge.error { border-color: rgba(255,91,113,0.22); color: rgba(255,206,211,0.96); background: rgba(255,91,113,0.08); }
    .status-badge.error .dot { background: var(--danger); box-shadow: 0 0 14px rgba(255,91,113,0.55); }
    .status-badge.stopping { border-color: rgba(249,199,79,0.22); color: rgba(255,239,198,0.98); background: rgba(249,199,79,0.08); }
    @media (max-width: 1140px) { .grid { grid-template-columns: 1fr; } .log-stream { min-height: 360px; } }
    @media (max-width: 780px) {
      .shell { padding: 18px; } .topbar { flex-direction: column; align-items: stretch; }
      .brand { flex-direction: column; align-items: flex-start; gap: 10px; }
      .side-status { align-items: flex-start; text-align: left; }
      .panel-header { flex-direction: column; }
      .stats { grid-template-columns: 1fr; }
      .checklist { grid-template-columns: 1fr; }
      .log-line { grid-template-columns: 1fr; gap: 4px; }
      .footer-note { flex-direction: column; align-items: flex-start; }
      .footer-actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="logo-wrap"><img class="brand-logo" src="/axiomtransparentlogo.png" alt="Axiom" /></div>
        <div class="brand-copy">
          <h1>Worker Studio</h1>
          <p>Control the live scraping worker from this machine and watch its output in real time.</p>
        </div>
      </div>
      <div id="statusPill" class="status-pill"><span class="dot"></span><span id="statusPillLabel">Idle</span></div>
    </header>

    <main class="grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="title">Worker Control</h2>
            <p class="subtitle">This studio runs the scraper locally, sends jobs to the live control plane, and preflights Playwright before it starts so you catch problems early.</p>
          </div>
          <div class="side-status">
            <div id="workerBadge" class="status-badge"><span class="dot"></span><strong id="workerBadgeLabel">Idle</strong></div>
            <div style="color: var(--muted); font-size: 12px;" id="currentJobLine">No job active.</div>
          </div>
        </div>
        <div class="content">
          <button id="toggleWorker" class="toggle" type="button">
            <div class="toggle-copy">
              <strong id="toggleHeadline">Start the worker</strong>
              <span id="toggleDescription">Launch the live scraping loop for this machine.</span>
            </div>
            <div class="switch" aria-hidden="true"></div>
          </button>

          <div class="stats">
            <div class="stat"><label>Control plane</label><strong id="controlPlaneValue">${escapeHtml(shortDisplayUrl(state.config.controlPlaneUrl))}</strong><small id="controlPlaneNote">Live mode is enforced.</small></div>
            <div class="stat"><label>Worker name</label><strong id="workerNameValue">${escapeHtml(state.config.workerName)}</strong><small id="machineNameValue">${escapeHtml(state.config.machineName)}</small></div>
            <div class="stat"><label>Process</label><strong id="processValue">Not running</strong><small id="startedValue">Waiting for start.</small></div>
          </div>

          <div class="checklist" id="preflightList"></div>

          <div class="actions">
            <button id="preflightBtn" class="button primary" type="button">Run preflight</button>
            <button id="openLiveBtn" class="button" type="button">Open live hunt</button>
            <button id="openConfigBtn" class="button" type="button">Edit config</button>
            <button id="quitBtn" class="button danger" type="button">Quit studio</button>
          </div>

          <div class="footer-note">
            <div>
              <strong id="preflightSummary">Not checked yet.</strong>
              <div id="preflightDetail">The studio checks Playwright, the Gemini key, and the live site before starting.</div>
            </div>
            <div class="footer-actions">
              <span class="pill"><span class="dot"></span><span>Local UI</span></span>
              <span class="pill"><span class="dot"></span><span>Live backend</span></span>
            </div>
          </div>
        </div>
      </section>

      <section class="panel log-panel">
        <div class="panel-header" style="padding-bottom: 16px;">
          <div>
            <h2 class="title">Live Log</h2>
            <p class="subtitle">The worker's stdout and stderr are streamed here, along with studio events, so you can see exactly what is happening.</p>
          </div>
          <div class="side-status">
            <div class="pill"><span class="dot"></span><span id="logCount">${state.logs.length}</span>&nbsp;lines</div>
            <div style="color: var(--muted); font-size: 12px;" id="lastRefresh">Ready.</div>
          </div>
        </div>
        <div class="log-stream" id="logStream" aria-live="polite"></div>
      </section>
    </main>
  </div>

  <script>
    const INITIAL_STATE = ${initial};
    const liveUrl = ${JSON.stringify(liveAppUrl)};
    const state = JSON.parse(JSON.stringify(INITIAL_STATE));
    let pending = false;
    let followLogs = true;

    const els = {
      controlPlaneNote: document.getElementById("controlPlaneNote"),
      controlPlaneValue: document.getElementById("controlPlaneValue"),
      preflightList: document.getElementById("preflightList"),
      currentJobLine: document.getElementById("currentJobLine"),
      lastRefresh: document.getElementById("lastRefresh"),
      logCount: document.getElementById("logCount"),
      logStream: document.getElementById("logStream"),
      openConfigBtn: document.getElementById("openConfigBtn"),
      openLiveBtn: document.getElementById("openLiveBtn"),
      preflightBtn: document.getElementById("preflightBtn"),
      preflightDetail: document.getElementById("preflightDetail"),
      preflightSummary: document.getElementById("preflightSummary"),
      processValue: document.getElementById("processValue"),
      quitBtn: document.getElementById("quitBtn"),
      statusPill: document.getElementById("statusPill"),
      statusPillLabel: document.getElementById("statusPillLabel"),
      startedValue: document.getElementById("startedValue"),
      toggleDescription: document.getElementById("toggleDescription"),
      toggleHeadline: document.getElementById("toggleHeadline"),
      toggleWorker: document.getElementById("toggleWorker"),
      workerBadge: document.getElementById("workerBadge"),
      workerBadgeLabel: document.getElementById("workerBadgeLabel"),
      workerNameValue: document.getElementById("workerNameValue"),
    };

    function badgeText(status) {
      if (status === "running") return "Running";
      if (status === "starting") return "Starting";
      if (status === "stopping") return "Stopping";
      if (status === "error") return "Error";
      return "Idle";
    }

    function statusClass(status) {
      if (status === "running" || status === "starting") return "running";
      if (status === "stopping") return "stopping";
      if (status === "error") return "error";
      return "";
    }

    function kindClass(kind) {
      if (kind === "stderr" || kind === "error") return "stderr";
      if (kind === "stdout") return "stdout";
      return "system";
    }

    function kindLabel(kind) {
      if (kind === "stderr") return "stderr";
      if (kind === "error") return "error";
      if (kind === "stdout") return "stdout";
      return "system";
    }

    function formatTime(value) {
      try {
        return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } catch {
        return String(value || "");
      }
    }

    function escapeText(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function renderLogs(logs) {
      els.logCount.textContent = String(logs.length);
      var nearBottom = followLogs && els.logStream.scrollHeight - els.logStream.scrollTop - els.logStream.clientHeight < 120;
      els.logStream.innerHTML = logs.map(function (entry) {
        return '<div class="log-line">' +
          '<div class="log-time">' + formatTime(entry.timestamp) + '</div>' +
          '<div>' +
            '<span class="log-kind ' + kindClass(entry.kind) + '">' + kindLabel(entry.kind) + '</span>' +
            '<span class="log-message">' + escapeText(entry.message) + '</span>' +
          '</div>' +
        '</div>';
      }).join("");
      if (nearBottom) {
        requestAnimationFrame(function () {
          els.logStream.scrollTop = els.logStream.scrollHeight;
        });
      }
    }

    function renderPreflight(preflight) {
      els.preflightSummary.textContent = preflight.summary || "Not checked yet.";
      els.preflightDetail.textContent = preflight.checkedAt ? ("Checked at " + formatTime(preflight.checkedAt) + ".") : "The studio checks Playwright, the Gemini key, and the live site before starting.";
      var lines = (preflight.details || []).map(function (item) {
        return '<div class="check-item ' + (item.ok ? 'ok' : 'bad') + '">' +
          '<span class="check-mark"></span>' +
          '<div class="check-copy">' +
            '<strong>' + escapeText(item.label) + '</strong>' +
            '<span>' + escapeText(item.message) + '</span>' +
          '</div>' +
        '</div>';
      });
      els.preflightList.innerHTML = lines.length ? lines.join("") : '<div class="check-item ok"><span class="check-mark"></span><div class="check-copy"><strong>Preflight</strong><span>' + escapeText(state.config.liveMode ? "Live mode is enforced." : "Custom control plane set.") + '</span></div></div>';
      els.controlPlaneNote.textContent = state.config.liveMode ? "Live control plane locked." : "Custom control plane set.";
    }

    function renderWorker(worker) {
      var status = worker.status || "idle";
      els.statusPill.className = "status-pill " + statusClass(status);
      els.statusPillLabel.textContent = badgeText(status);
      els.workerBadge.className = "status-badge " + statusClass(status);
      els.workerBadgeLabel.textContent = badgeText(status);
      els.toggleWorker.className = "toggle " + statusClass(status);

      var running = status === "running" || status === "starting";
      els.toggleHeadline.textContent = running ? "Stop the worker" : "Start the worker";
      els.toggleDescription.textContent = running ? "Pause the local loop without touching the live site." : "Launch the live scraping loop for this machine.";

      if (worker.pid) {
        els.processValue.textContent = "PID " + worker.pid;
        els.startedValue.textContent = worker.startedAt ? ("Started " + formatTime(worker.startedAt)) : "Running now.";
      } else {
        els.processValue.textContent = "Not running";
        els.startedValue.textContent = worker.lastExitCode !== null ? ("Last exit code " + worker.lastExitCode + (worker.lastSignal ? (" (" + worker.lastSignal + ")") : "")) : "Waiting for start.";
      }

      els.currentJobLine.textContent = worker.currentJobLabel
        ? ("Now working: " + worker.currentJobLabel)
        : (status === "running" ? "Connected to the live queue and waiting for a claim." : (worker.lastError || "No job active."));
    }

    function render() {
      renderPreflight(state.preflight || {});
      renderWorker(state.worker || {});
      renderLogs(state.logs || []);
      els.workerNameValue.textContent = state.config.workerName;
      els.controlPlaneValue.textContent = shortDisplayUrl(state.config.controlPlaneUrl);
      els.lastRefresh.textContent = "Updated " + formatTime(new Date().toISOString());
    }

    async function request(path, options) {
      const response = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
      const payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload.error || ("Request failed with " + response.status));
      }
      return payload;
    }

    async function refresh() {
      try {
        const next = await request("/api/state");
        Object.assign(state, next);
        render();
      } catch (error) {
        els.lastRefresh.textContent = error instanceof Error ? error.message : "Failed to refresh.";
      }
    }

    async function performAction(path) {
      pending = true;
      [els.toggleWorker, els.preflightBtn, els.openConfigBtn, els.openLiveBtn, els.quitBtn].forEach(function (el) { el.disabled = true; });
      try {
        const next = await request(path, { method: "POST" });
        Object.assign(state, next);
        render();
      } finally {
        pending = false;
        [els.toggleWorker, els.preflightBtn, els.openConfigBtn, els.openLiveBtn, els.quitBtn].forEach(function (el) { el.disabled = false; });
      }
    }

    els.toggleWorker.addEventListener("click", async function () {
      if (pending) return;
      const running = state.worker.status === "running" || state.worker.status === "starting";
      try {
        await performAction(running ? "/api/stop" : "/api/start");
      } catch (error) {
        state.worker.lastError = error instanceof Error ? error.message : "Action failed.";
        state.worker.status = "error";
        render();
      }
    });

    els.preflightBtn.addEventListener("click", async function () {
      if (pending) return;
      try {
        await performAction("/api/preflight");
      } catch (error) {
        state.preflight = {
          checkedAt: new Date().toISOString(),
          details: [],
          ok: false,
          stage: "client-error",
          summary: error instanceof Error ? error.message : "Preflight failed.",
        };
        render();
      }
    });

    els.openLiveBtn.addEventListener("click", function () {
      window.open(liveUrl, "_blank", "noopener,noreferrer");
    });

    els.openConfigBtn.addEventListener("click", function () {
      performAction("/api/open-config").catch(function (error) {
        state.worker.lastError = error instanceof Error ? error.message : "Unable to open config.";
        state.worker.status = "error";
        render();
      });
    });

    els.quitBtn.addEventListener("click", function () {
      performAction("/api/shutdown").catch(function (error) {
        state.worker.lastError = error instanceof Error ? error.message : "Unable to quit studio.";
        state.worker.status = "error";
        render();
      });
    });

    els.logStream.addEventListener("scroll", function () {
      followLogs = els.logStream.scrollTop + els.logStream.clientHeight >= els.logStream.scrollHeight - 40;
    });

    render();
    setInterval(refresh, 1500);
    refresh();
  </script>
</body>
</html>`;
}

function sendJson(res: any, data: unknown, status = 200) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data, null, 2));
}

function serveLogo(res: any) {
  if (!existsSync(publicLogoPath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Logo not found");
    return;
  }

  res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "image/png" });
  res.end(readFileSync(publicLogoPath));
}

async function handleRequest(req: any, res: any) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self';",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(renderHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/axiomtransparentlogo.png") {
    serveLogo(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    refreshExternalWorkerState();
    sendJson(res, { ...state, config: syncStateFromConfig() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/preflight") {
    const result = await runPreflight();
    sendJson(res, { ...state, config: syncStateFromConfig() }, result.ok ? 200 : 409);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/start") {
    await startWorker();
    sendJson(res, { ...state, config: syncStateFromConfig() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stop") {
    await stopWorker();
    sendJson(res, { ...state, config: syncStateFromConfig() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/open-config") {
    await openConfigFile();
    sendJson(res, { ...state, config: syncStateFromConfig() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shutdown") {
    await shutdownStudio();
    sendJson(res, { ...state, config: syncStateFromConfig() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    refreshExternalWorkerState();
    sendJson(res, { ok: true, pid: state.worker.pid, status: state.worker.status });
    return;
  }

  res.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function openBrowser(url: string) {
  const command: { file: string; args: string[] } = process.platform === "win32"
    ? { file: "cmd", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { file: "open", args: [url] }
      : { file: "xdg-open", args: [url] };

  const proc = spawn(command.file, command.args, { detached: true, stdio: "ignore", windowsHide: true });
  proc.unref();
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    res.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal studio error" }));
  });
});

async function main() {
  syncStateFromConfig();
  state.preflight = await runPreflight().catch((error) => ({
    checkedAt: nowIso(),
    details: [],
    ok: false,
    stage: "startup",
    summary: error instanceof Error ? error.message : "Preflight failed to start.",
  }));

  server.listen(port, host, () => {
    addLog("system", `Worker Studio listening on ${browserUrl}.`);
    if (process.env.WORKER_STUDIO_OPEN_BROWSER !== "0") {
      openBrowser(browserUrl);
    }
  });

  process.on("SIGINT", () => { void shutdownStudio(); });
  process.on("SIGTERM", () => { void shutdownStudio(); });
  process.on("exit", () => {
    if (child && isProcessAlive(child.pid ?? null)) {
      try {
        child.kill("SIGINT");
      } catch {}
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
