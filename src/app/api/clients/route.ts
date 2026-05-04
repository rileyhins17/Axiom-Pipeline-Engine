import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const prisma = getPrisma();

  // All leads that have entered the CRM deal pipeline (have a dealStage set)
  // plus any leads with INTERESTED or REPLIED status that haven't been moved yet
  const leads = await prisma.lead.findMany({
    where: {
      isArchived: false,
      OR: [
        { outreachStatus: { in: ["REPLIED", "INTERESTED"] } },
        { dealStage: { not: null } },
      ],
    },
    orderBy: { lastUpdated: "desc" },
  });

  return NextResponse.json(leads);
}
