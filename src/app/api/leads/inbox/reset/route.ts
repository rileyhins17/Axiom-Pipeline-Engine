import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const prisma = getPrisma();

  const { count } = await prisma.lead.updateMany({
    where: {
      isArchived: false,
      dealStage: null,
      outreachStatus: { in: ["REPLIED", "INTERESTED"] },
    },
    data: { outreachStatus: null },
  });

  return NextResponse.json({ reset: count });
}
