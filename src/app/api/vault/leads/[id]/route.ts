import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

const EDITABLE_FIELDS = new Set([
  "businessName",
  "phone",
  "email",
  "contactName",
  "city",
  "niche",
  "category",
  "address",
  "websiteUrl",
  "tacticalNote",
  "socialLink",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }

  const body = await request.json();
  const { field, value } = body as { field: string; value: string | number | null };

  if (!field || !EDITABLE_FIELDS.has(field)) {
    return NextResponse.json(
      { error: `Field "${field}" is not editable` },
      { status: 400 }
    );
  }

  const db = getDatabase();
  await db
    .prepare(
      `UPDATE "Lead" SET "${field}" = ?1, "lastUpdated" = datetime('now') WHERE "id" = ?2`
    )
    .bind(value ?? null, id)
    .run();

  return NextResponse.json({ ok: true, id, field, value });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }

  const db = getDatabase();
  await db.prepare(`DELETE FROM "Lead" WHERE "id" = ?`).bind(id).run();

  return new NextResponse(null, { status: 204 });
}
