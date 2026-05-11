import { NextResponse } from "next/server";

import { chatCompletion } from "@/lib/deepseek";
import { getErrorMessage } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

function parseLeadId(value: string) {
  const leadId = Number(value);
  return Number.isFinite(leadId) && leadId > 0 ? leadId : null;
}

const REPLY_SYSTEM_PROMPT = `You are a professional B2B sales development representative at Axiom, a web design and digital marketing agency. You write concise, warm, and professional reply emails to prospects.

CRITICAL RULES:
- Keep replies SHORT (3-5 sentences max). Nobody reads long sales emails.
- Be conversational and genuine — avoid corporate jargon and buzzwords.
- Mirror the prospect's tone. If they're casual, be casual. If formal, be formal.
- Always acknowledge what they said before pivoting to your point.
- If they showed interest, suggest a specific next step (brief call, quick demo, etc.).
- If they had objections, address them directly without being pushy.
- If they asked a question, answer it clearly and concisely.
- Never be aggressive or high-pressure. Build rapport.
- Sign off with just your first name — no elaborate signatures.
- Do NOT include a subject line — just the email body.
- Write in plain text. No HTML, no markdown formatting.`;

/**
 * POST /api/clients/[id]/emails/generate
 *
 * Generate an AI reply email using DeepSeek based on the email thread context.
 * Body: { threadContext, senderName?, tone? }
 *
 * threadContext: string — the email conversation history for context
 * senderName: string — name to sign off with (default: "The Axiom Team")
 * tone: "professional" | "casual" | "friendly" — reply tone preference
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const leadId = parseLeadId(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { threadContext, senderName, tone } = body as {
    threadContext?: string;
    senderName?: string;
    tone?: string;
  };

  if (!threadContext) {
    return NextResponse.json(
      { error: "threadContext is required" },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  // Verify lead exists and get business info for context
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.isArchived) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const toneInstruction = tone === "casual"
      ? "Use a casual, friendly tone."
      : tone === "friendly"
        ? "Use a warm, approachable tone."
        : "Use a professional yet warm tone.";

    const signOff = senderName || "The Axiom Team";

    const userPrompt = `Here is the email conversation thread with ${lead.businessName || "this prospect"}:

---
${threadContext.slice(0, 4000)}
---

Business info:
- Company: ${lead.businessName || "Unknown"}
- Niche: ${lead.niche || "Unknown"}
- City: ${lead.city || "Unknown"}
${lead.contactName ? `- Contact: ${lead.contactName}` : ""}
${lead.websiteUrl ? `- Website: ${lead.websiteUrl}` : ""}
${lead.dealStage ? `- Deal stage: ${lead.dealStage}` : ""}

Write a reply to the most recent message in this thread. ${toneInstruction} Sign off as "${signOff}".`;

    const response = await chatCompletion({
      messages: [
        { role: "system", content: REPLY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 1024,
    });

    return NextResponse.json({
      generatedReply: response.content.trim(),
      usage: response.usage,
    });
  } catch (error: unknown) {
    console.error("[emails/generate] Error generating reply:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to generate reply") },
      { status: 500 },
    );
  }
}
