import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, Number(limitParam)), 5000) : null;

  const db = getDatabase();

  if (search && search.length >= 2) {
    const pattern = `%${search}%`;
    const stmt = db.prepare(
      `SELECT id, businessName, niche, city, category, address, phone, email,
              socialLink, websiteUrl, websiteDomain, rating, reviewCount, websiteStatus,
              contactName, tacticalNote, outreachStatus, outreachChannel,
              firstContactedAt, lastContactedAt, nextFollowUpDue, outreachNotes,
              createdAt
       FROM "Lead"
       WHERE COALESCE(isArchived, 0) = 0
         AND ("businessName" LIKE ?1 OR "email" LIKE ?1 OR "city" LIKE ?1 OR "niche" LIKE ?1 OR "contactName" LIKE ?1)
       ORDER BY createdAt DESC
       LIMIT ?2`,
    ).bind(pattern, limit ?? 100);
    const result = await stmt.all<Record<string, unknown>>();
    return NextResponse.json({ leads: result.results ?? [] });
  }

  const query = limit
    ? `SELECT id, businessName, niche, city, category, address, phone, email,
              socialLink, websiteUrl, websiteDomain, rating, reviewCount, websiteStatus,
              contactName, tacticalNote, outreachStatus, outreachChannel,
              firstContactedAt, lastContactedAt, nextFollowUpDue, outreachNotes,
              createdAt
       FROM "Lead"
       WHERE COALESCE(isArchived, 0) = 0
       ORDER BY createdAt DESC
       LIMIT ${limit}`
    : `SELECT id, businessName, niche, city, category, address, phone, email,
              socialLink, websiteUrl, websiteDomain, rating, reviewCount, websiteStatus,
              contactName, tacticalNote, outreachStatus, outreachChannel,
              firstContactedAt, lastContactedAt, nextFollowUpDue, outreachNotes,
              createdAt
       FROM "Lead"
       WHERE COALESCE(isArchived, 0) = 0
       ORDER BY createdAt DESC`;

  const result = await db.prepare(query).all<Record<string, unknown>>();
  return NextResponse.json({ leads: result.results ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const body = await request.json();
  const { businessName, niche, city, email, phone, contactName, websiteUrl, category, address, tacticalNote } = body as Record<string, string | null>;

  if (!businessName?.trim() || !niche?.trim() || !city?.trim()) {
    return NextResponse.json(
      { error: "businessName, niche, and city are required" },
      { status: 400 }
    );
  }

  const prisma = getPrisma();
  const lead = await prisma.lead.create({
    data: {
      businessName: businessName.trim(),
      niche: niche.trim(),
      city: city.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      contactName: contactName?.trim() || null,
      websiteUrl: websiteUrl?.trim() || null,
      category: category?.trim() || null,
      address: address?.trim() || null,
      tacticalNote: tacticalNote?.trim() || null,
      source: "manual",
      axiomTier: "C",
      axiomScore: 0,
      leadScore: 0,
      isArchived: false,
    },
  });

  return NextResponse.json({ lead }, { status: 201 });
}
