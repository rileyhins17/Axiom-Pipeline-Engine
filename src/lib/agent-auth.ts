import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import {
  AGENT_AUTH_WINDOW_MS,
  AGENT_HEADERS,
  normalizeAgentName,
  verifySignedAgentRequest,
} from "@/lib/agent-protocol";

const seenNonces = new Map<string, number>();

function pruneSeenNonces(now = Date.now()) {
  for (const [nonce, expiresAt] of seenNonces.entries()) {
    if (expiresAt <= now) {
      seenNonces.delete(nonce);
    }
  }
}

function rememberNonce(nonce: string, expiresAt: number): boolean {
  const existing = seenNonces.get(nonce);
  if (existing && existing > Date.now()) {
    return false;
  }

  seenNonces.set(nonce, expiresAt);
  return true;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export type AgentAuthResult = { agentName: string } | { response: NextResponse };

export async function requireAgentAuth(request: Request): Promise<AgentAuthResult> {
  const env = getServerEnv();
  const expectedSecret = env.AGENT_SHARED_SECRET;

  if (!expectedSecret) {
    return { response: NextResponse.json({ error: "Agent authentication is not configured." }, { status: 500 }) };
  }

  const agentName = normalizeAgentName(request.headers.get(AGENT_HEADERS.name));
  const timestamp = request.headers.get(AGENT_HEADERS.timestamp) || "";
  const nonce = request.headers.get(AGENT_HEADERS.nonce) || "";
  const signature = request.headers.get(AGENT_HEADERS.signature) || "";

  if (!agentName || !timestamp || !nonce || !signature) {
    return { response: unauthorized() };
  }

  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp)) {
    return { response: unauthorized() };
  }

  const age = Math.abs(Date.now() - parsedTimestamp);
  if (age > AGENT_AUTH_WINDOW_MS) {
    return { response: unauthorized() };
  }

  pruneSeenNonces();

  const bodyText = await request.clone().text();
  const path = new URL(request.url).pathname;
  if (
    !verifySignedAgentRequest({
      bodyText,
      method: request.method,
      nonce,
      path,
      secret: expectedSecret,
      signature,
      timestamp,
    })
  ) {
    return { response: unauthorized() };
  }

  if (!rememberNonce(nonce, parsedTimestamp + AGENT_AUTH_WINDOW_MS)) {
    return { response: unauthorized() };
  }

  return { agentName };
}
