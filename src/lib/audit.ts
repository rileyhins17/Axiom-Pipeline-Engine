import { getPrisma } from "@/lib/prisma";

type AuditEventInput = {
  action: string;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ipAddress: input.ipAddress ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[AUDIT_WRITE_FAILED]", error);
  }
}
