import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const db = getDatabase();
  const result = await db
    .prepare(
      `SELECT id, businessName, niche, city, category, address, phone, email,
              socialLink, websiteUrl, websiteDomain, rating, reviewCount, websiteStatus,
              contactName, tacticalNote, outreachStatus, outreachChannel,
              firstContactedAt, lastContactedAt, nextFollowUpDue, outreachNotes,
              createdAt
       FROM "Lead"
       WHERE COALESCE(isArchived, 0) = 0
       ORDER BY createdAt DESC`,
    )
    .all<Record<string, unknown>>();

  return NextResponse.json({ leads: result.results ?? [] });
}
