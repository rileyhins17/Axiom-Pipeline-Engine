import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = 'force-dynamic';

export default async function LatestLeadPage() {
  await requireSession();

  const prisma = getPrisma();
  const lead = await prisma.lead.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (lead) {
    redirect(`/lead/${lead.id}`);
  }

  redirect("/vault");
}
