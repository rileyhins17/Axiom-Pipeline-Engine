import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { getErrorMessage } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { CsvColumnDef, CsvDialectOptions, generateCsv, sortLeadsDeterministic } from "@/lib/export/csv";
import { exportPresets } from "@/lib/export/export-presets";
import { getPrisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAdminApiSession } from "@/lib/session";

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

type ExportFilters = {
  city?: string | null;
  delimiter?: string | null;
  niche?: string | null;
  tier?: string[] | null;
};

function getFilename(presetName: string, filters: ExportFilters, format = "csv"): string {
  const parts = ["omniscient_export_v4", presetName];
  if (filters.tier && filters.tier.length > 0) {
    parts.push(`tier-${sanitizeFilenamePart(filters.tier.join("-"))}`);
  }
  if (filters.city) {
    parts.push(`city-${sanitizeFilenamePart(filters.city)}`);
  }
  if (filters.niche) {
    parts.push(`niche-${sanitizeFilenamePart(filters.niche)}`);
  }

  if (format !== "xlsx") {
    if (filters.delimiter === "tab") {
      parts.push("delim-tab");
    } else if (filters.delimiter === "semicolon") {
      parts.push("delim-semicolon");
    } else {
      parts.push("delim-comma");
    }
  }

  const timestamp = new Date().toISOString();
  const datePart = timestamp.slice(0, 10);
  const timePart = timestamp.slice(11, 16).replace(":", "");
  parts.push(`${datePart}_${timePart}`);

  if (format === "xlsx") return `${parts.join("__")}.xlsx`;
  if (filters.delimiter === "tab") return `${parts.join("__")}.tsv`;
  return `${parts.join("__")}.csv`;
}

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const ipAddress = getClientIp(request);
  const env = getServerEnv();
  const rateLimit = await consumeRateLimit({
    identifier: `${authResult.session.user.id}:${ipAddress}`,
    limit: env.RATE_LIMIT_MAX_EXPORT,
    scope: "export",
    windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Export rate limit exceeded. Try again after ${rateLimit.resetAt.toISOString()}.` },
      {
        status: 429,
        headers: {
          "Retry-After": Math.max(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000), 1).toString(),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";
  const presetName = searchParams.get("preset") || "call_sheet";

  const tierFilterString = searchParams.get("tier");
  const tierFilter = tierFilterString ? tierFilterString.split(",") : ["S", "A", "B", "C"];

  const nicheFilter = searchParams.get("niche") || null;
  const cityFilter = searchParams.get("city") || null;
  const websiteStatus = searchParams.get("websiteStatus") || null;
  const hasEmail = searchParams.get("hasEmail");
  const hasPhone = searchParams.get("hasPhone");
  const includeArchived = searchParams.get("includeArchived") === "1";

  const delimiterParam = searchParams.get("delimiter") || "comma";
  let delimiterString = ",";
  if (delimiterParam === "semicolon") delimiterString = ";";
  if (delimiterParam === "tab") delimiterString = "\t";

  const dialectOptions: CsvDialectOptions = {
    delimiter: delimiterString,
    quote: searchParams.get("quote") === "always" ? "always" : "minimal",
    bom: searchParams.get("bom") !== "0",
    eol: searchParams.get("eol") === "lf" ? "lf" : "crlf",
    nulls: searchParams.get("nulls") === "na" ? "na" : "blank",
    headerStyle: searchParams.get("header") === "snake" ? "snake" : "pretty",
  };

  const columnsParam = searchParams.get("columns");
  const excludeParam = searchParams.get("exclude");

  try {
    const prisma = getPrisma();
    const where: Record<string, unknown> = {};

    if (!includeArchived) {
      where.isArchived = false;
    }
    if (tierFilterString) {
      where.axiomTier = { in: tierFilter };
    }
    if (nicheFilter) where.niche = nicheFilter;
    if (cityFilter) where.city = cityFilter;
    if (websiteStatus) where.websiteStatus = websiteStatus;

    const andConditions: Record<string, unknown>[] = [];
    if (hasEmail === "1") {
      andConditions.push({ email: { not: null, gt: "" } });
    } else if (hasEmail === "0") {
      andConditions.push({ OR: [{ email: null }, { email: "" }] });
    }
    if (hasPhone === "1") {
      andConditions.push({ phone: { not: null, gt: "" } });
    } else if (hasPhone === "0") {
      andConditions.push({ OR: [{ phone: null }, { phone: "" }] });
    }
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const leads = await prisma.lead.findMany({ where });
    sortLeadsDeterministic(leads);

    if (format === "jsonl") {
      const lines = leads.map((lead) => {
        let painSignalsParsed = [];
        let breakdownParsed = null;
        let assessmentParsed = null;

        try {
          painSignalsParsed = JSON.parse(lead.painSignals || "[]");
        } catch {}
        try {
          breakdownParsed = JSON.parse(lead.scoreBreakdown || "null");
        } catch {}
        try {
          assessmentParsed = JSON.parse(lead.axiomWebsiteAssessment || "null");
        } catch {}

        return JSON.stringify({
          businessName: lead.businessName,
          city: lead.city,
          category: lead.category,
          niche: lead.niche,
          phone: lead.phone,
          bestEmail: lead.email,
          axiomScore: lead.axiomScore,
          tier: lead.axiomTier,
          callOpener: lead.callOpener,
          followUpQuestion: lead.followUpQuestion,
          painSignals: painSignalsParsed,
          scoreBreakdown: breakdownParsed,
          website: lead.websiteStatus === "ACTIVE" ? "Has Website" : "No Website",
          websiteGrade: lead.websiteGrade,
          websiteUrl: lead.websiteUrl,
          websiteDomain: lead.websiteDomain,
          assessment: assessmentParsed,
          contactName: lead.contactName,
          emailType: lead.emailType,
          emailConfidence: lead.emailConfidence,
          emailFlags: lead.emailFlags,
          phoneConfidence: lead.phoneConfidence,
          phoneFlags: lead.phoneFlags,
          lastUpdated: lead.lastUpdated?.toISOString() || lead.createdAt.toISOString(),
          source: lead.source,
        });
      });

      await writeAuditEvent({
        action: "lead.export",
        actorUserId: authResult.session.user.id,
        ipAddress,
        metadata: {
          format,
          presetName,
          rowCount: leads.length,
        },
      });

      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Disposition": 'attachment; filename="axiom_call_sheet.jsonl"',
          "Content-Type": "application/x-ndjson",
        },
      });
    }

    if (format === "xlsx") {
      const { generateXlsx } = await import("@/lib/export/xlsx");
      const preset = exportPresets[presetName] || exportPresets.call_sheet;
      const filtersInfo = {
        tier: tierFilterString ? tierFilter : null,
        city: cityFilter,
        niche: nicheFilter,
      };
      const filename = getFilename(preset.name, filtersInfo, "xlsx");
      const xlsxBuffer = await generateXlsx(leads, preset.name, filtersInfo);

      await writeAuditEvent({
        action: "lead.export",
        actorUserId: authResult.session.user.id,
        ipAddress,
        metadata: {
          filename,
          format,
          presetName,
          rowCount: leads.length,
        },
      });

      return new Response(new Uint8Array(xlsxBuffer), {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Length": xlsxBuffer.byteLength.toString(),
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
    }

    const preset = exportPresets[presetName] || exportPresets.call_sheet;
    let targetColumns: CsvColumnDef[] | undefined;
    const warnings: string[] = [];

    if (columnsParam) {
      const requestedKeys = columnsParam.split(",").map((key) => key.trim()).filter(Boolean);
      const resolved = requestedKeys
        .map((key) => preset.columns.find((column) => column.key === key))
        .filter(Boolean) as CsvColumnDef[];
      const missing = requestedKeys.filter((key) => !preset.columns.find((column) => column.key === key));

      if (missing.length > 0) {
        warnings.push(`Unknown columns ignored: ${missing.join(", ")}`);
      }
      if (resolved.length >= 3) {
        targetColumns = resolved;
      } else {
        warnings.push("Requested columns fewer than 3, falling back to preset default.");
      }
    } else if (excludeParam) {
      const excludedKeys = excludeParam.split(",").map((key) => key.trim()).filter(Boolean);
      const remaining = preset.columns.filter((column) => !excludedKeys.includes(column.key));
      if (remaining.length >= 3) {
        targetColumns = remaining;
      } else {
        warnings.push("Exclusions left fewer than 3 columns, falling back to preset default.");
      }
    }

    const csvContent = generateCsv(leads, preset, targetColumns, dialectOptions);
    const filtersInfo = {
      tier: tierFilterString ? tierFilter : null,
      city: cityFilter,
      niche: nicheFilter,
      delimiter: delimiterParam,
    };
    const filename = getFilename(preset.name, filtersInfo, "csv");

    await writeAuditEvent({
      action: "lead.export",
      actorUserId: authResult.session.user.id,
      ipAddress,
      metadata: {
        filename,
        format,
        presetName,
        rowCount: leads.length,
        warnings,
      },
    });

    const headers: Record<string, string> = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type":
        delimiterParam === "tab" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
    };
    if (warnings.length > 0) {
      headers["X-Export-Warn"] = warnings.join("; ");
    }

    return new NextResponse(csvContent, { headers });
  } catch (error: unknown) {
    console.error("Export error:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Failed to export leads") }, { status: 500 });
  }
}
