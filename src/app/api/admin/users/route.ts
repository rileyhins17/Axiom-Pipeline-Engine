import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: number | null;
  createdAt: string;
  image: string | null;
};

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const role = (authResult.session.user as Record<string, unknown>).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = getDatabase();
  const result = await db
    .prepare(
      `SELECT "id", "name", "email", "role", "banned", "createdAt", "image"
       FROM "user"
       ORDER BY "createdAt" DESC`,
    )
    .all<UserRow>();

  const users = (result.results ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: u.banned === 1,
    createdAt: u.createdAt,
    hasImage: !!u.image,
  }));

  return NextResponse.json({ users });
}

export async function PATCH(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const role = (authResult.session.user as Record<string, unknown>).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: { userId: string; action: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userId || !body.action) {
    return NextResponse.json({ error: "Missing userId or action" }, { status: 400 });
  }

  // Prevent self-modification
  if (body.userId === authResult.session.user.id) {
    return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
  }

  const db = getDatabase();

  switch (body.action) {
    case "ban": {
      await db
        .prepare(`UPDATE "user" SET "banned" = 1, "updatedAt" = datetime('now') WHERE "id" = ?`)
        .bind(body.userId)
        .run();
      return NextResponse.json({ ok: true, action: "banned" });
    }
    case "unban": {
      await db
        .prepare(`UPDATE "user" SET "banned" = 0, "updatedAt" = datetime('now') WHERE "id" = ?`)
        .bind(body.userId)
        .run();
      return NextResponse.json({ ok: true, action: "unbanned" });
    }
    case "make_admin": {
      await db
        .prepare(`UPDATE "user" SET "role" = 'admin', "updatedAt" = datetime('now') WHERE "id" = ?`)
        .bind(body.userId)
        .run();
      return NextResponse.json({ ok: true, action: "promoted" });
    }
    case "remove_admin": {
      await db
        .prepare(`UPDATE "user" SET "role" = 'user', "updatedAt" = datetime('now') WHERE "id" = ?`)
        .bind(body.userId)
        .run();
      return NextResponse.json({ ok: true, action: "demoted" });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
