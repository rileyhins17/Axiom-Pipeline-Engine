import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import {
  getScrapeJob,
  getScrapeJobEventsAfter,
} from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);

function encodeSseEvent(encoder: TextEncoder, payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function encodeSseComment(encoder: TextEncoder, comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { id: jobId } = await context.params;
  const job = await getScrapeJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const ipAddress = getClientIp(request);
  await writeAuditEvent({
    action: "scrape.job_stream_opened",
    actorUserId: authResult.session.user.id,
    ipAddress,
    targetId: jobId,
    targetType: "scrape_job",
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastEventId = 0;
      let lastStatus = "";
      let terminalEventSent = false;

      const send = (payload: unknown) => {
        if (closed) return false;
        try {
          controller.enqueue(encodeSseEvent(encoder, payload));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      const close = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore close races
        }
      };

      let lastKeepAliveAt = Date.now();

      request.signal.addEventListener(
        "abort",
        () => {
          closed = true;
          close();
        },
        { once: true },
      );

      try {
        while (!closed) {
          const currentJob = await getScrapeJob(jobId);
          if (!currentJob) {
            send({ error: "Job not found", jobId });
            break;
          }

          if (currentJob.status !== lastStatus) {
            lastStatus = currentJob.status;
            send({
              jobId,
              jobStatus: currentJob.status,
              message: `[JOB] Status ${currentJob.status}`,
            });
          }

          const events = await getScrapeJobEventsAfter(jobId, lastEventId);
          for (const event of events) {
            lastEventId = event.id;
            if (event.payload._done) {
              terminalEventSent = true;
            }
            if (event.payload.error) {
              terminalEventSent = true;
            }
            send({
              ...event.payload,
              eventType: event.eventType,
              jobId,
            });
          }

          if (!closed && Date.now() - lastKeepAliveAt >= 15000) {
            controller.enqueue(encodeSseComment(encoder, "keepalive"));
            lastKeepAliveAt = Date.now();
          }

          if (TERMINAL_STATUSES.has(currentJob.status)) {
            if (currentJob.status === "completed" && !terminalEventSent) {
              send({
                _done: true,
                jobId,
                stats: currentJob.stats || {
                  avgScore: 0,
                  leadsFound: 0,
                  withEmail: 0,
                },
              });
            }

            if (currentJob.status === "failed" && !terminalEventSent) {
              send({
                error: currentJob.errorMessage || "Scrape failed.",
                jobId,
              });
            }

            if (currentJob.status === "canceled" && !terminalEventSent) {
              send({
                jobId,
                jobStatus: "canceled",
                message: currentJob.errorMessage || "Scrape canceled.",
              });
            }

            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } finally {
        close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
