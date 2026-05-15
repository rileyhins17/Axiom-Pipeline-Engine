/**
 * Gmail Integration Module
 *
 * Handles OAuth2 flow and email sending via the Gmail REST API.
 * Uses raw fetch() — no googleapis package needed, fully Cloudflare Workers compatible.
 */

import { getServerEnv } from "@/lib/env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_THREAD_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GMAIL_MESSAGE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_REQUEST_TIMEOUT_MS = 20000;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// ─── Token Encryption ──────────────────────────────────────────────

/**
 * Derive a 256-bit AES key from BETTER_AUTH_SECRET via SHA-256.
 */
async function deriveKey(): Promise<CryptoKey> {
  const env = getServerEnv();
  const keyMaterial = new TextEncoder().encode(env.BETTER_AUTH_SECRET);
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial);

  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string of `iv:ciphertext`.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an AES-256-GCM encrypted token.
 */
export async function decryptToken(encrypted: string): Promise<string> {
  const key = await deriveKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

// ─── OAuth2 Flow ────────────────────────────────────────────────────

export function getOAuthRedirectUri(): string {
  const env = getServerEnv();
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  return `${base}/api/outreach/gmail/callback`;
}

/**
 * Build the Google OAuth2 consent URL.
 */
export type GmailOAuthState = {
  sessionId: string;
  targetEmail?: string;
};

export function normalizeGmailAddress(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

export function buildGmailOAuthState(state: GmailOAuthState): string {
  return new URLSearchParams({
    sessionId: state.sessionId,
    ...(state.targetEmail ? { targetEmail: normalizeGmailAddress(state.targetEmail) } : {}),
  }).toString();
}

export function parseGmailOAuthState(rawState: string | null): GmailOAuthState | null {
  if (!rawState) return null;

  const params = new URLSearchParams(rawState);
  const sessionId = params.get("sessionId");

  if (sessionId) {
    return {
      sessionId,
      targetEmail: normalizeGmailAddress(params.get("targetEmail")),
    };
  }

  // Backward compatibility with the previous state shape, which was just the session id.
  return { sessionId: rawState };
}

export function buildOAuthUrl(
  state: string,
  options: { loginHint?: string } = {},
): string {
  const env = getServerEnv();

  if (!env.GMAIL_CLIENT_ID) {
    throw new Error("GMAIL_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    redirect_uri: getOAuthRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    state,
  });

  const loginHint = normalizeGmailAddress(options.loginHint);
  if (loginHint) {
    params.set("login_hint", loginHint);
  }

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const env = getServerEnv();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      redirect_uri: getOAuthRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Refresh an expired access token using a refresh token (plaintext).
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const env = getServerEnv();
  const timeout = withTimeout(GMAIL_REQUEST_TIMEOUT_MS);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
    signal: timeout.signal,
  }).finally(timeout.clear);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}

/**
 * Fetch the user's email and name from Google's userinfo endpoint.
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  email: string;
  name: string;
}> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const data = (await response.json()) as { email?: string; name?: string };
  return {
    email: data.email || "",
    name: data.name || "",
  };
}

/**
 * Revoke a Google OAuth token (access or refresh).
 */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  // Best-effort revocation — don't throw on failure.
}

// ─── Email Sending ──────────────────────────────────────────────────

function buildRfc2822Message(options: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
}): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
  const fromHeader = formatAddressHeader(options.from, options.fromName);
  const unsubEmail = sanitizeHeaderValue(options.from);

  const lines = [
    `From: ${fromHeader}`,
    `To: ${sanitizeHeaderValue(options.to)}`,
    `Subject: ${encodeMimeHeader(options.subject)}`,
    `MIME-Version: 1.0`,
    `List-Unsubscribe: <mailto:${unsubEmail}?subject=unsubscribe>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64EncodeUtf8(options.bodyPlain),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64EncodeUtf8(options.bodyHtml),
    ``,
    `--${boundary}--`,
  ];

  return lines.join("\r\n");
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function encodeMimeHeader(value: string) {
  const sanitized = sanitizeHeaderValue(value);
  if (/^[\x20-\x7E]*$/.test(sanitized)) {
    return sanitized;
  }

  return `=?UTF-8?B?${base64EncodeUtf8(sanitized)}?=`;
}

function formatAddressHeader(email: string, displayName?: string) {
  const safeEmail = sanitizeHeaderValue(email);
  const safeName = sanitizeHeaderValue(displayName || "");
  if (!safeName) {
    return safeEmail;
  }

  if (/^[\x20-\x7E]*$/.test(safeName)) {
    return `"${safeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${safeEmail}>`;
  }

  return `${encodeMimeHeader(safeName)} <${safeEmail}>`;
}

function base64UrlEncodeUtf8(str: string): string {
  return base64EncodeUtf8(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

export type SendEmailResult = {
  messageId: string;
  threadId: string;
};

export type GmailThreadMetadata = {
  id: string;
  messages: Array<{
    id: string;
    threadId: string;
    internalDate?: string;
    labelIds?: string[];
    headers: {
      from: string;
      to: string;
      subject: string;
    };
  }>;
};

/**
 * Send an email via the Gmail REST API.
 */
export async function sendGmailEmail(options: {
  accessToken: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  threadId?: string;
}): Promise<SendEmailResult> {
  const rawMessage = buildRfc2822Message(options);
  const encoded = base64UrlEncodeUtf8(rawMessage);
  const payload: Record<string, string> = { raw: encoded };
  const timeout = withTimeout(GMAIL_REQUEST_TIMEOUT_MS);
  if (options.threadId) {
    payload.threadId = options.threadId;
  }

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: timeout.signal,
  }).finally(timeout.clear);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${text}`);
  }

  const result = (await response.json()) as { id?: string; threadId?: string };
  return {
    messageId: result.id || "",
    threadId: result.threadId || "",
  };
}

function getHeaderValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const wanted = name.toLowerCase();
  return headers?.find((header) => header.name?.toLowerCase() === wanted)?.value || "";
}

export async function getGmailThreadMetadata(
  accessToken: string,
  threadId: string,
): Promise<GmailThreadMetadata> {
  const timeout = withTimeout(GMAIL_REQUEST_TIMEOUT_MS);
  const response = await fetch(`${GMAIL_THREAD_URL}/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: timeout.signal,
  }).finally(timeout.clear);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Gmail thread metadata (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    messages?: Array<{
      id?: string;
      threadId?: string;
      internalDate?: string;
      labelIds?: string[];
      payload?: {
        headers?: Array<{ name?: string; value?: string }>;
      };
    }>;
  };

  return {
    id: payload.id || threadId,
    messages: (payload.messages || []).map((message) => ({
      id: message.id || "",
      threadId: message.threadId || threadId,
      internalDate: message.internalDate,
      labelIds: message.labelIds || [],
      headers: {
        from: getHeaderValue(message.payload?.headers, "From"),
        to: getHeaderValue(message.payload?.headers, "To"),
        subject: getHeaderValue(message.payload?.headers, "Subject"),
      },
    })),
  };
}

// ─── Message Search & Metadata ─────────────────────────────────────

const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

export type GmailMessageMeta = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet: string;
  headers: {
    from: string;
    to: string;
    subject: string;
    xFailedRecipients: string;
  };
};

export async function searchGmailMessages(
  accessToken: string,
  query: string,
  maxResults = 20,
): Promise<Array<{ id: string; threadId: string }>> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const timeout = withTimeout(GMAIL_REQUEST_TIMEOUT_MS);
  const response = await fetch(`${GMAIL_MESSAGES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: timeout.signal,
  }).finally(timeout.clear);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail search failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    messages?: Array<{ id?: string; threadId?: string }>;
  };

  return (payload.messages || []).map((m) => ({
    id: m.id || "",
    threadId: m.threadId || "",
  }));
}

export async function getGmailMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageMeta> {
  // Gmail API needs repeated metadataHeaders params
  const url = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=X-Failed-Recipients`;

  const timeout = withTimeout(GMAIL_REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: timeout.signal,
  }).finally(timeout.clear);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail message metadata failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    threadId?: string;
    internalDate?: string;
    snippet?: string;
    payload?: {
      headers?: Array<{ name?: string; value?: string }>;
    };
  };

  return {
    id: payload.id || messageId,
    threadId: payload.threadId || "",
    internalDate: payload.internalDate,
    snippet: payload.snippet || "",
    headers: {
      from: getHeaderValue(payload.payload?.headers, "From"),
      to: getHeaderValue(payload.payload?.headers, "To"),
      subject: getHeaderValue(payload.payload?.headers, "Subject"),
      xFailedRecipients: getHeaderValue(payload.payload?.headers, "X-Failed-Recipients"),
    },
  };
}

// ─── Full Thread Content ─────────────────────────────────────────

export type GmailMessageFull = {
  id: string;
  threadId: string;
  internalDate: string;
  from: string;
  to: string;
  subject: string;
  bodyPlain: string;
  bodyHtml: string;
  labelIds: string[];
};

export type GmailThreadFull = {
  id: string;
  messages: GmailMessageFull[];
};

/**
 * Decode base64url to UTF-8 string.
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Extract plain text and HTML body from a Gmail message payload (recursive MIME walk).
 */
function extractBodies(payload: GmailPayload): { plain: string; html: string } {
  let plain = "";
  let html = "";

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    const mimeType = payload.mimeType || "";
    if (mimeType === "text/plain") plain = decoded;
    else if (mimeType === "text/html") html = decoded;
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const sub = extractBodies(part);
      if (!plain && sub.plain) plain = sub.plain;
      if (!html && sub.html) html = sub.html;
    }
  }

  return { plain, html };
}

type GmailPayload = {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
};

/**
 * Fetch full thread content including message bodies.
 * Requires gmail.readonly scope.
 */
export async function getGmailThreadFull(
  accessToken: string,
  threadId: string,
): Promise<GmailThreadFull> {
  const timeout = withTimeout(GMAIL_REQUEST_TIMEOUT_MS);
  const response = await fetch(
    `${GMAIL_THREAD_URL}/${encodeURIComponent(threadId)}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: timeout.signal,
    },
  ).finally(timeout.clear);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Gmail thread (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    messages?: Array<{
      id?: string;
      threadId?: string;
      internalDate?: string;
      labelIds?: string[];
      payload?: GmailPayload;
    }>;
  };

  return {
    id: payload.id || threadId,
    messages: (payload.messages || []).map((msg) => {
      const hdrs = msg.payload?.headers || [];
      const bodies = msg.payload ? extractBodies(msg.payload) : { plain: "", html: "" };
      return {
        id: msg.id || "",
        threadId: msg.threadId || threadId,
        internalDate: msg.internalDate || "",
        from: getHeaderValue(hdrs, "From"),
        to: getHeaderValue(hdrs, "To"),
        subject: getHeaderValue(hdrs, "Subject"),
        bodyPlain: bodies.plain,
        bodyHtml: bodies.html,
        labelIds: msg.labelIds || [],
      };
    }),
  };
}

/**
 * Send a reply email on an existing Gmail thread.
 */
export async function sendGmailReply(options: {
  accessToken: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  threadId: string;
  inReplyTo?: string;
}): Promise<SendEmailResult> {
  return sendGmailEmail({
    accessToken: options.accessToken,
    from: options.from,
    fromName: options.fromName,
    to: options.to,
    subject: options.subject.startsWith("Re:") ? options.subject : `Re: ${options.subject}`,
    bodyHtml: options.bodyHtml,
    bodyPlain: options.bodyPlain,
    threadId: options.threadId,
  });
}

// ─── Token Management Helpers ──────────────────────────────────────

/**
 * Get a valid access token for a GmailConnection, refreshing if needed.
 * Returns the plaintext access token and optionally updated encrypted tokens.
 */
export async function getValidAccessToken(connection: {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}): Promise<{
  accessToken: string;
  updated?: {
    accessToken: string;
    tokenExpiresAt: Date;
  };
}> {
  const now = new Date();
  const expiresAt = new Date(connection.tokenExpiresAt);
  const bufferMs = 5 * 60 * 1000; // 5 min buffer

  // Decrypt the current tokens
  const decryptedRefresh = await decryptToken(connection.refreshToken);

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    // Still valid
    const decryptedAccess = await decryptToken(connection.accessToken);
    return { accessToken: decryptedAccess };
  }

  // Need to refresh
  const refreshed = await refreshAccessToken(decryptedRefresh);
  const newEncryptedAccess = await encryptToken(refreshed.access_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  return {
    accessToken: refreshed.access_token,
    updated: {
      accessToken: newEncryptedAccess,
      tokenExpiresAt: newExpiresAt,
    },
  };
}
