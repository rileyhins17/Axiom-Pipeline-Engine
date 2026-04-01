import { NextResponse } from "next/server";

import { getTrustedOrigins } from "@/lib/env";

export function assertTrustedRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  if (!getTrustedOrigins().includes(normalizedOrigin)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  return null;
}
