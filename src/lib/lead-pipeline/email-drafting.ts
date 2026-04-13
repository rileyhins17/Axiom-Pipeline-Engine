import { chatCompletion } from "@/lib/deepseek";
import {
  buildHtmlEmail,
  buildPlainTextEmail,
  BANNED_EMAIL_PHRASES,
} from "@/lib/outreach-email-style";

import {
  emailDraftSchema,
  type EmailDraft,
  type LeadAssessment,
  type LeadFacts,
} from "@/lib/lead-pipeline/schema";
import {
  buildEmailPromptVersion,
  resolveEmailSystemPrompt,
} from "@/lib/lead-pipeline/email-prompt";

const EMAIL_MODEL = "deepseek/deepseek-chat";

function sanitizeLine(value: string) {
  return value.replace(/[!]/g, ".").replace(/[—–]/g, ",").replace(/\s+/g, " ").trim();
}

function buildEvidenceContext(facts: LeadFacts, assessment: LeadAssessment) {
  const selectedRefs = assessment.painSignals[0]?.evidenceRefs || facts.evidence.slice(0, 1).map((item) => item.id);
  const evidence = facts.evidence.filter((item) => selectedRefs.includes(item.id)).slice(0, 3);
  return {
    refs: evidence.map((item) => item.id),
    lines: evidence.map((item) => `${item.id}: ${item.label} -> ${item.snippet}`),
  };
}

function validateDraftContent(draft: EmailDraft) {
  const lines = [draft.subject, draft.opener, draft.observation, draft.valueProposition, draft.cta];
  const combined = lines.join(" ").toLowerCase();

  if (/[!—–]/.test(lines.join(" "))) {
    throw new Error("Draft contains disallowed punctuation.");
  }

  const banned = BANNED_EMAIL_PHRASES.find((phrase) => combined.includes(phrase));
  if (banned) {
    throw new Error(`Draft contains banned phrase: ${banned}`);
  }
}

function buildBody(draft: EmailDraft, senderName: string) {
  const firstName = senderName.trim().split(/\s+/)[0] || senderName.trim() || "Riley";
  const body = [
    sanitizeLine(draft.opener),
    `${sanitizeLine(draft.observation)} ${sanitizeLine(draft.valueProposition)}`,
    sanitizeLine(draft.cta),
  ].join("\n\n");

  const bodyPlain = buildPlainTextEmail(body, firstName);
  const wordCount = bodyPlain.split(/\s+/).filter(Boolean).length;
  if (wordCount < 45 || wordCount > 140) {
    throw new Error(`Draft body length ${wordCount} is outside the safe range.`);
  }

  return {
    subject: sanitizeLine(draft.subject),
    bodyPlain,
    bodyHtml: buildHtmlEmail(bodyPlain),
  };
}

async function requestDraft(input: {
  facts: LeadFacts;
  assessment: LeadAssessment;
  senderName: string;
  systemPromptOverride?: string | null;
  retryMessage?: string;
}) {
  const evidence = buildEvidenceContext(input.facts, input.assessment);
  const systemPrompt = resolveEmailSystemPrompt(input.systemPromptOverride);
  const response = await chatCompletion({
    model: EMAIL_MODEL,
    responseFormat: "json_object",
    temperature: input.retryMessage ? 0.2 : 0.1,
    maxTokens: 1000,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Draft a cold email using the fixed skeleton.",
          output: {
            subject: "max 90 chars",
            opener: "1 short sentence",
            observation: "1 short grounded sentence",
            valueProposition: "1 short sentence",
            cta: "1 short low-friction sentence",
            personalizationStrength: "0-1",
            selectedEvidenceRefs: evidence.refs,
          },
          constraints: [
            "Observation must stay grounded in the supplied evidence.",
            "Do not mention missing features unless explicitly evidenced.",
            "Do not compliment the business unless tied to a factual signal.",
          ],
          senderName: input.senderName,
          lead: {
            businessName: input.facts.identity.businessName,
            city: input.facts.location.city,
            niche: input.facts.identity.primaryCategory || input.facts.discovery.discoveryQuery,
            website: input.facts.contact.website,
            evidence: evidence.lines,
          },
          assessment: {
            outreachAngle: input.assessment.outreachAngle,
            personalizationLine: input.assessment.personalizationLine,
            valueProposition: input.assessment.valueProposition,
            recommendedCTA: input.assessment.recommendedCTA,
            keyPainPoint: input.assessment.keyPainPoint,
            summaryForOperator: input.assessment.summaryForOperator,
          },
          retryMessage: input.retryMessage || null,
        }),
      },
    ],
  });

  const draft = emailDraftSchema.parse(JSON.parse(response.content));
  validateDraftContent(draft);
  return draft;
}

export async function draftLeadEmail(input: {
  facts: LeadFacts;
  assessment: LeadAssessment;
  senderName: string;
  systemPromptOverride?: string | null;
}) {
  try {
    const draft = await requestDraft(input);
    const built = buildBody(draft, input.senderName);
    return {
      draft,
      ...built,
      model: EMAIL_MODEL,
      promptVersion: buildEmailPromptVersion(input.systemPromptOverride),
    };
  } catch (error) {
    const draft = await requestDraft({
      ...input,
      retryMessage: error instanceof Error ? error.message : "Previous draft failed validation.",
    });
    const built = buildBody(draft, input.senderName);
    return {
      draft,
      ...built,
      model: EMAIL_MODEL,
      promptVersion: buildEmailPromptVersion(input.systemPromptOverride),
    };
  }
}
