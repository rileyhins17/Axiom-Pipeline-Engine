import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";

type SessionResponse = Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>;
type SessionWithUser = Exclude<SessionResponse, null | undefined>;
type ApiSessionResult =
  | { session: SessionWithUser }
  | { response: NextResponse };

export async function getSession() {
  return getAuth().api.getSession({
    headers: await headers(),
  });
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/sign-in");
  }
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}

export async function getApiSession(request: Request) {
  return getAuth().api.getSession({
    headers: request.headers,
  });
}

export async function requireApiSession(request: Request): Promise<ApiSessionResult> {
  const session = await getApiSession(request);
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { session };
}

export async function requireAdminApiSession(request: Request): Promise<ApiSessionResult> {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult;
  }

  if (authResult.session.user.role !== "admin") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return authResult;
}
