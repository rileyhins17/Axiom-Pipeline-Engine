import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const prisma = getPrisma();
    const emails = await prisma.outreachEmail.findMany({
      orderBy: { sentAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ emails });
  } catch (error: any) {
    console.error("Email log error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch email log" },
      { status: 500 },
    );
  }
}
