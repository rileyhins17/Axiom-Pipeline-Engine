import { create } from "zustand";

import { type QueueItem } from "@/components/hunt/queue-summary";
import { type LogEntry } from "@/components/hunt/terminal-panel";
import { createInitialState, applyParseResult, type HuntSessionState, resetCounters } from "./hunt-session-store";
import { parseSSELine } from "./sse-parser";

type RemoteJobStatus = "pending" | "claimed" | "running" | "completed" | "failed" | "canceled";

interface HuntStore {
  queue: QueueItem[];
  session: HuntSessionState;
  loading: boolean;
  currentJobId: string | null;
  currentRemoteJobId: string | null;
  logs: LogEntry[];
  elapsed: number;
  totalStats: { leadsFound: number; withEmail: number };

  isPaused: boolean;
  isCanceled: boolean;
  bufferedEvents: { message: string; data: any }[];
  eventSource: EventSource | null;
  timerInterval: ReturnType<typeof setInterval> | null;
  logIdCounter: number;
  jobStart: number;

  setQueue: (queue: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => void;
  addToQueue: (niche: string, city: string, radius: string, maxDepth: string) => void;
  removeFromQueue: (id: string) => void;
  skipJob: (id: string) => void;

  runQueue: () => Promise<void>;
  handlePause: () => void;
  handleResume: () => void;
  handleCancel: () => void;

  processSSEMessage: (message: string, data: any) => void;
  addLogEntry: (message: string, level?: LogEntry["level"]) => void;
  togglePin: (id: number) => void;
}

function mapRemoteStatus(status: string): QueueItem["status"] {
  switch (status) {
    case "claimed":
      return "claimed";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return "pending";
  }
}

function applyRemoteJobUpdate(queue: QueueItem[], data: any): QueueItem[] {
  if (!data?.jobId || !data?.jobStatus) {
    return queue;
  }

  const nextStatus = mapRemoteStatus(String(data.jobStatus));
  const nextStats =
    data.stats && typeof data.stats === "object"
      ? {
          avgScore: Number(data.stats.avgScore || 0),
          leadsFound: Number(data.stats.leadsFound || 0),
          withEmail: Number(data.stats.withEmail || 0),
        }
      : undefined;

  return queue.map((item) =>
    item.jobId === data.jobId
      ? {
          ...item,
          status: nextStatus,
          stats: nextStats ? { ...item.stats, ...nextStats } : item.stats,
        }
      : item,
  );
}

export const useHuntStore = create<HuntStore>((set, get) => ({
  queue: [],
  session: createInitialState(),
  loading: false,
  currentJobId: null,
  currentRemoteJobId: null,
  logs: [],
  elapsed: 0,
  totalStats: { leadsFound: 0, withEmail: 0 },

  isPaused: false,
  isCanceled: false,
  bufferedEvents: [],
  eventSource: null,
  timerInterval: null,
  logIdCounter: 0,
  jobStart: 0,

  setQueue: (action) => {
    set((state) => ({
      queue: typeof action === "function" ? action(state.queue) : action,
    }));
  },

  addToQueue: (niche, city, radius, maxDepth) => {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      niche,
      city,
      jobId: null,
      maxDepth,
      radius,
      status: "pending",
    };
    set((state) => ({ queue: [...state.queue, item] }));
  },

  removeFromQueue: (id) => {
    set((state) => ({ queue: state.queue.filter((q) => q.id !== id) }));
  },

  skipJob: (id) => {
    set((state) => ({
      queue: state.queue.map((q) => (q.id === id ? { ...q, status: "canceled" } : q)),
    }));
  },

  addLogEntry: (message, level = "default") => {
    set((state) => {
      const nextId = state.logIdCounter + 1;
      const entry: LogEntry = {
        id: nextId,
        message,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          hour12: false,
          minute: "2-digit",
          second: "2-digit",
        }),
        level,
        pinned: false,
      };
      return { logIdCounter: nextId, logs: [...state.logs, entry] };
    });
  },

  togglePin: (id) => {
    set((state) => ({
      logs: state.logs.map((entry) => (entry.id === id ? { ...entry, pinned: !entry.pinned } : entry)),
    }));
  },

  processSSEMessage: (message, data) => {
    const parsed = parseSSELine(message);
    get().addLogEntry(message, parsed.level);

    set((state) => ({
      queue: applyRemoteJobUpdate(state.queue, data),
      session: applyParseResult(state.session, parsed, message),
    }));
  },

  handlePause: () => {
    set((state) => ({ isPaused: true, session: { ...state.session, status: "paused" } }));
  },

  handleResume: () => {
    const { bufferedEvents, processSSEMessage } = get();
    set((state) => ({
      isPaused: false,
      session: { ...state.session, status: "running" },
      bufferedEvents: [],
    }));

    for (const item of bufferedEvents) {
      processSSEMessage(item.message, item.data);
    }
  },

  handleCancel: () => {
    const state = get();
    state.isCanceled = true;

    if (state.eventSource) {
      state.eventSource.close();
    }

    if (state.currentRemoteJobId) {
      void fetch(`/api/scrape/jobs/${state.currentRemoteJobId}/cancel`, {
        method: "POST",
      }).catch(() => undefined);
    }

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    set((s) => ({
      currentRemoteJobId: null,
      eventSource: null,
      isCanceled: true,
      loading: false,
      timerInterval: null,
      session: { ...s.session, status: "canceled", stage: "idle" },
      queue: s.currentJobId
        ? s.queue.map((q) => (q.id === s.currentJobId ? { ...q, status: "canceled" } : q))
        : s.queue,
    }));
  },

  runQueue: async () => {
    const state = get();
    const pendingJobs = state.queue.filter((q) => q.status === "pending");
    if (pendingJobs.length === 0) return;

    if (state.timerInterval) clearInterval(state.timerInterval);
    const timer = setInterval(() => {
      set((s) => ({ elapsed: s.elapsed + 1 }));
    }, 1000);

    set({
      loading: true,
      logs: [],
      totalStats: { leadsFound: 0, withEmail: 0 },
      isCanceled: false,
      isPaused: false,
      bufferedEvents: [],
      session: { ...createInitialState(), status: "running" },
      elapsed: 0,
      timerInterval: timer,
    });

    for (let jobIdx = 0; jobIdx < pendingJobs.length; jobIdx++) {
      if (get().isCanceled) break;

      const job = pendingJobs[jobIdx];
      set((s) => ({
        currentJobId: job.id,
        currentRemoteJobId: null,
        jobStart: Date.now(),
        elapsed: 0,
        session: {
          ...s.session,
          status: "running",
          stage: "extracting",
          counters: resetCounters(),
          currentJob: {
            city: job.city,
            index: jobIdx + 1,
            niche: job.niche,
            startedAt: Date.now(),
            total: pendingJobs.length,
          },
          lastEvent: `Submitting ${job.niche} in ${job.city}`,
        },
        queue: s.queue.map((q) => (q.id === job.id ? { ...q, status: "pending" } : q)),
      }));

      get().addLogEntry(`\n[🚀] ═══════════════════════════════════════════════`, "system");
      get().addLogEntry(`[🚀] QUEUE ${jobIdx + 1}/${pendingJobs.length}: ${job.niche} in ${job.city}`, "system");
      get().addLogEntry(`[🚀] ═══════════════════════════════════════════════`, "system");

      try {
        const createResponse = await fetch("/api/scrape", {
          body: JSON.stringify({
            city: job.city,
            maxDepth: job.maxDepth,
            niche: job.niche,
            radius: job.radius,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        const createBody = (await createResponse.json().catch(() => ({}))) as {
          error?: string;
          job?: { id?: string };
        };
        if (!createResponse.ok || !createBody.job?.id) {
          throw new Error(createBody.error || "Failed to create job.");
        }

        const remoteJobId = createBody.job.id;
        set((s) => ({
          currentRemoteJobId: remoteJobId,
          queue: s.queue.map((q) => (q.id === job.id ? { ...q, jobId: remoteJobId, status: "pending" } : q)),
        }));

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let streamDisconnectNotified = false;
          const finish = (result: "resolve" | "reject", error?: unknown) => {
            if (settled) return;
            settled = true;
            eventSource.close();
            if (result === "resolve") resolve();
            else reject(error);
          };

          const eventSource = new EventSource(`/api/scrape/jobs/${remoteJobId}/stream`);
          set({ eventSource });

          eventSource.onopen = () => {
            if (settled) return;
            if (streamDisconnectNotified) {
              get().addLogEntry("[JOB] SSE stream reconnected.", "system");
            }
            streamDisconnectNotified = false;
          };

          eventSource.onmessage = (event) => {
            if (settled) {
              return;
            }

            const current = get();
            if (current.isCanceled) {
              finish("reject", new Error("canceled"));
              return;
            }

            const data = JSON.parse(event.data);

            if (data.jobStatus === "canceled") {
              get().processSSEMessage(data.message || "[JOB] Canceled", data);
              finish("resolve");
              return;
            }

            if (data.error) {
              const errorMessage = `[!!!] ERROR: ${data.error}`;
              if (current.isPaused) {
                set((s) => ({ bufferedEvents: [...s.bufferedEvents, { message: errorMessage, data }] }));
              } else {
                current.processSSEMessage(errorMessage, data);
              }

              set((s) => ({
                queue: s.queue.map((q) => (q.id === job.id ? { ...q, status: "failed" } : q)),
              }));
              finish("reject", new Error(String(data.error)));
              return;
            }

            if (data._done) {
              const jobStats = data.stats || { leadsFound: 0, withEmail: 0 };
              set((s) => ({
                queue: s.queue.map((q) =>
                  q.id === job.id
                    ? {
                        ...q,
                        status: "completed",
                        stats: {
                          avgScore: Number(jobStats.avgScore || 0),
                          leadsFound: Number(jobStats.leadsFound || 0),
                          withEmail: Number(jobStats.withEmail || 0),
                        },
                      }
                    : q,
                ),
                totalStats: {
                  leadsFound: s.totalStats.leadsFound + Number(jobStats.leadsFound || 0),
                  withEmail: s.totalStats.withEmail + Number(jobStats.withEmail || 0),
                },
              }));
              finish("resolve");
              return;
            }

            const message = data.message || "";
            if (current.isPaused) {
              set((s) => ({ bufferedEvents: [...s.bufferedEvents, { message, data }] }));
            } else {
              current.processSSEMessage(message, data);
            }
          };

          eventSource.onerror = () => {
            if (settled) {
              return;
            }

            const current = get();
            if (current.isCanceled) {
              finish("resolve");
              return;
            }

            if (!streamDisconnectNotified) {
              streamDisconnectNotified = true;
              current.processSSEMessage("[JOB] SSE stream disconnected. Waiting to reconnect...", {});
            }
          };
        });
      } catch (error) {
        if (!get().isCanceled) {
          const message = error instanceof Error ? error.message : "Unknown job error";
          get().processSSEMessage(`[!!!] ERROR: ${message}`, {
            error: message,
            jobId: get().currentRemoteJobId || job.id,
            jobStatus: "failed",
          });
          set((s) => ({
            queue: s.queue.map((q) => (q.id === job.id ? { ...q, status: "failed" } : q)),
          }));
        }
      } finally {
        set({ currentRemoteJobId: null, eventSource: null });
      }
    }

    const finalState = get();
    if (finalState.timerInterval) clearInterval(finalState.timerInterval);

    set({
      currentJobId: null,
      currentRemoteJobId: null,
      loading: false,
      eventSource: null,
      timerInterval: null,
    });

    if (!finalState.isCanceled) {
      set((s) => ({ session: { ...s.session, status: "completed", stage: "done" } }));
      get().addLogEntry(`\n[✅] ═══════════════════════════════════════════════`, "ok");
      get().addLogEntry(`[✅] ALL QUEUE JOBS COMPLETE`, "ok");
      get().addLogEntry(`[✅] ═══════════════════════════════════════════════`, "ok");
    }
  },
}));
