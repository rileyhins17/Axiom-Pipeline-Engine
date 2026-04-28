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
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.metadata",
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

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

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
  const fromHeader = options.fromName
    ? `"${options.fromName.replace(/"/g, '\\"')}" <${options.from}>`
    : options.from;

  const lines = [
    `From: ${fromHeader}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(options.bodyPlain))),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(options.bodyHtml))),
    ``,
    `--${boundary}--`,
  ];

  return lines.join("\r\n");
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  const encoded = base64UrlEncode(rawMessage);
  const payload: Record<string, string> = { raw: encoded };
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
  });

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
  const response = await fetch(`${GMAIL_THREAD_URL}/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

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
