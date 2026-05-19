import { strict as assert } from "node:assert";
import test from "node:test";

import { sendGmailEmail, sendGmailReply } from "./gmail";

type CapturedSendBody = {
  raw: string;
  threadId?: string;
};

function decodeRawMessage(raw: string) {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(`${base64}${padding}`, "base64").toString("utf8");
}

test("gmail cold emails keep mailto unsubscribe without invalid one-click header", async () => {
  const captures: CapturedSendBody[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    captures.push(JSON.parse(String(init?.body)) as CapturedSendBody);
    return new Response(JSON.stringify({ id: "m1", threadId: "t1" }), { status: 200 });
  }) as typeof fetch;

  try {
    await sendGmailEmail({
      accessToken: "token",
      from: "sender@example.com",
      to: "lead@example.com",
      subject: "Hello",
      bodyHtml: "<p>Hello</p>",
      bodyPlain: "Hello",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const body = captures[0];
  assert.ok(body);
  const raw = decodeRawMessage(body.raw);
  assert.match(raw, /^List-Unsubscribe: <mailto:sender@example\.com\?subject=unsubscribe>/m);
  assert.doesNotMatch(raw, /^List-Unsubscribe-Post:/m);
});

test("gmail replies include message reference headers for cross-client threading", async () => {
  const captures: CapturedSendBody[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    captures.push(JSON.parse(String(init?.body)) as CapturedSendBody);
    return new Response(JSON.stringify({ id: "m2", threadId: "t1" }), { status: 200 });
  }) as typeof fetch;

  try {
    await sendGmailReply({
      accessToken: "token",
      from: "sender@example.com",
      to: "lead@example.com",
      subject: "Original subject",
      bodyHtml: "<p>Reply</p>",
      bodyPlain: "Reply",
      threadId: "t1",
      inReplyTo: "<original-message@example.com>",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const body = captures[0];
  assert.ok(body);
  assert.equal(body.threadId, "t1");
  const raw = decodeRawMessage(body.raw);
  assert.match(raw, /^In-Reply-To: <original-message@example\.com>/m);
  assert.match(raw, /^References: <original-message@example\.com>/m);
});
