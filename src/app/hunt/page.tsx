import HuntClient from "./HuntClient"
import { isIntakeLead } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

export const dynamic = 'force-dynamic';

export default async function HuntPage() {
    await requireAdminSession();

    const prisma = getPrisma();
    const intakeLeads = await prisma.lead.findMany({
        where: { isArchived: false },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
            id: true,
            businessName: true,
            city: true,
            niche: true,
            email: true,
            source: true,
            enrichedAt: true,
            outreachStatus: true,
            createdAt: true,
        },
    }).catch(() => []);

    return <HuntClient initialIntakeLeads={JSON.parse(JSON.stringify(intakeLeads.filter((lead) => isIntakeLead(lead))))} />
}
