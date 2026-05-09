import {
  getDealStageLabel,
  getEngagementTypeLabel,
  type CrmActivityType,
  type DealStage,
} from "@/lib/crm";
import type { LeadRecord } from "@/lib/prisma";

export type CrmActivityDraft = {
  type: CrmActivityType;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
};

type DefaultNextAction = {
  nextAction: string;
  nextActionDueAt: Date;
};

const DAY_MS = 86_400_000;

function addBusinessDays(start: Date, businessDays: number) {
  const result = new Date(start);
  result.setHours(17, 0, 0, 0);

  let remaining = businessDays;
  while (remaining > 0) {
    result.setTime(result.getTime() + DAY_MS);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return result;
}

export function getDefaultNextActionForStage(stage: DealStage, now = new Date()): DefaultNextAction | null {
  switch (stage) {
    case "PROPOSAL_SENT":
      return {
        nextAction: "Follow up on proposal",
        nextActionDueAt: addBusinessDays(now, 3),
      };
    case "NEGOTIATING":
      return {
        nextAction: "Confirm scope and next step",
        nextActionDueAt: addBusinessDays(now, 1),
      };
    case "SIGNED":
      return {
        nextAction: "Schedule kickoff",
        nextActionDueAt: addBusinessDays(now, 1),
      };
    case "ACTIVE":
      return {
        nextAction: "Confirm launch plan",
        nextActionDueAt: addBusinessDays(now, 5),
      };
    case "DELIVERED":
      return {
        nextAction: "Confirm handoff",
        nextActionDueAt: addBusinessDays(now, 5),
      };
    case "RETAINED":
      return {
        nextAction: "Review monthly priorities",
        nextActionDueAt: addBusinessDays(now, 20),
      };
    case "LOST":
      return null;
  }
}

function dateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function shortDate(value: Date | string | null | undefined) {
  const iso = dateValue(value);
  return iso ? iso.slice(0, 10) : null;
}

function fieldValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function changed(before: LeadRecord, after: LeadRecord, field: keyof LeadRecord) {
  const beforeValue = before[field];
  const afterValue = after[field];
  if (beforeValue instanceof Date || afterValue instanceof Date) {
    return dateValue(beforeValue as Date | string | null) !== dateValue(afterValue as Date | string | null);
  }
  return beforeValue !== afterValue;
}

function changeMetadata(before: LeadRecord, after: LeadRecord, field: keyof LeadRecord) {
  return {
    field,
    from: fieldValue(before[field]),
    to: fieldValue(after[field]),
  };
}

function pushActivity(
  activities: CrmActivityDraft[],
  type: CrmActivityType,
  title: string,
  body: string | null,
  metadata: Record<string, unknown>,
) {
  activities.push({ type, title, body, metadata });
}

export function buildDealUpdateActivities(before: LeadRecord, after: LeadRecord): CrmActivityDraft[] {
  const activities: CrmActivityDraft[] = [];
  const businessName = after.businessName || "Client";

  if (changed(before, after, "dealStage")) {
    const from = getDealStageLabel(before.dealStage);
    const to = getDealStageLabel(after.dealStage);
    const enteredPipeline = !before.dealStage && Boolean(after.dealStage);

    pushActivity(
      activities,
      "STAGE_CHANGE",
      enteredPipeline ? "Qualified into pipeline" : `Moved to ${to}`,
      `${businessName} moved from ${from} to ${to}.`,
      changeMetadata(before, after, "dealStage"),
    );

    if (after.dealStage === "LOST") {
      pushActivity(
        activities,
        "LOST",
        "Marked lost",
        after.dealLostReason ? `Reason: ${after.dealLostReason}` : null,
        {
          ...changeMetadata(before, after, "dealStage"),
          reason: after.dealLostReason,
        },
      );
    }
  }

  if (changed(before, after, "proposalSentAt") && after.proposalSentAt) {
    pushActivity(
      activities,
      "PROPOSAL_SENT",
      "Proposal sent",
      shortDate(after.proposalSentAt) ? `Proposal date: ${shortDate(after.proposalSentAt)}` : null,
      changeMetadata(before, after, "proposalSentAt"),
    );
  }

  if (changed(before, after, "signedAt") && after.signedAt) {
    pushActivity(
      activities,
      "SIGNED",
      "Agreement signed",
      shortDate(after.signedAt) ? `Signed date: ${shortDate(after.signedAt)}` : null,
      changeMetadata(before, after, "signedAt"),
    );
  }

  if (changed(before, after, "renewalDate") && after.renewalDate) {
    pushActivity(
      activities,
      "RENEWAL",
      "Renewal date updated",
      shortDate(after.renewalDate) ? `Renewal date: ${shortDate(after.renewalDate)}` : null,
      changeMetadata(before, after, "renewalDate"),
    );
  }

  if (changed(before, after, "projectNotes") && after.projectNotes) {
    pushActivity(
      activities,
      "NOTE",
      "Project notes updated",
      after.projectNotes.slice(0, 800),
      changeMetadata(before, after, "projectNotes"),
    );
  }

  if (changed(before, after, "nextAction") || changed(before, after, "nextActionDueAt")) {
    pushActivity(
      activities,
      "SYSTEM",
      "Next action updated",
      after.nextAction ?? "Next action cleared",
      {
        nextAction: changeMetadata(before, after, "nextAction"),
        nextActionDueAt: changeMetadata(before, after, "nextActionDueAt"),
      },
    );
  }

  if (changed(before, after, "monthlyValue") && after.monthlyValue !== null) {
    pushActivity(
      activities,
      "SYSTEM",
      "Deal value updated",
      `$${after.monthlyValue.toLocaleString()}/mo`,
      changeMetadata(before, after, "monthlyValue"),
    );
  }

  if (changed(before, after, "engagementType") && after.engagementType) {
    pushActivity(
      activities,
      "SYSTEM",
      "Engagement type updated",
      getEngagementTypeLabel(after.engagementType),
      changeMetadata(before, after, "engagementType"),
    );
  }

  return activities;
}
