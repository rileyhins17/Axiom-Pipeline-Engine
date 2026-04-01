/**
 * Contact Validation Module
 *
 * Validates email quality (type, disposable domain detection, pattern sanity)
 * and phone formatting with area code verification.
 */

export interface ContactValidation {
    emailType: "owner" | "staff" | "generic" | "unknown";
    emailConfidence: number;     // 0.0 - 1.0
    phoneConfidence: number;     // 0.0 - 1.0
    emailFlags: string[];        // e.g. ["generic_prefix", "free_provider"]
    phoneFlags: string[];        // e.g. ["valid_ontario_area_code"]
}

export interface ValidateEmailOptions {
    ownerName?: string | null;
    businessWebsite?: string | null;
}

const GENERIC_PREFIXES = [
    "info", "contact", "hello", "office", "admin", "support",
    "sales", "enquiry", "inquiry", "mail", "team", "service",
    "general", "help", "customerservice", "reception",
    "bookings", "booking", "appointments", "frontdesk", "dispatch",
    "operations", "welcome",
];

const STAFF_PREFIXES = [
    "marketing", "events", "billing", "accounts", "finance",
    "careers", "jobs", "recruiting", "hr", "manager", "service",
    "parts", "claims", "operations", "dispatch",
];

const OWNER_PREFIXES = [
    "owner", "founder", "president", "ceo", "principal", "director",
];

const DISPOSABLE_DOMAINS = [
    "mailinator.com", "guerrillamail.com", "tempmail.com",
    "throwaway.email", "yopmail.com", "trashmail.com",
    "10minutemail.com", "fakeinbox.com", "sharklasers.com",
    "guerrillamailblock.com", "temp-mail.org", "dispostable.com",
    "maildrop.cc", "getairmail.com", "mohmal.com",
];

const FREE_PROVIDERS = [
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "aol.com", "icloud.com", "live.com", "msn.com",
    "protonmail.com", "mail.com", "zoho.com",
    "yahoo.ca", "outlook.ca",
];

const ONTARIO_AREA_CODES = [
    "226", "249", "289", "343", "365", "382",
    "416", "437", "519", "548", "613", "647",
    "705", "742", "807", "905",
];

const CANADIAN_AREA_CODES = [
    "204", "236", "250", "306", "403", "418",
    "431", "438", "450", "506", "514", "579",
    "581", "587", "604", "639", "709", "778",
    "780", "819", "825", "867", "873", "902",
];

function tokenizeName(value: string | null | undefined): string[] {
    return (value || "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((token) => token.length >= 2);
}

function normalizeWebsiteHost(website: string | null | undefined): string | null {
    if (!website) return null;

    try {
        const url = new URL(website.startsWith("http") ? website : `https://${website}`);
        return url.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }
}

function extractRootDomain(hostname: string | null): string | null {
    if (!hostname) return null;
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join(".");
}

export function validateEmail(
    email: string | null | undefined,
    options: ValidateEmailOptions = {},
): {
    type: ContactValidation["emailType"];
    confidence: number;
    flags: string[];
} {
    if (!email || email.trim().length === 0) {
        return { type: "unknown", confidence: 0, flags: ["no_email"] };
    }

    const e = email.toLowerCase().trim();
    const flags: string[] = [];
    let confidence = 0.5;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(e)) {
        return { type: "unknown", confidence: 0.1, flags: ["invalid_format"] };
    }

    const [localPart, domain] = e.split("@");
    const ownerTokens = tokenizeName(options.ownerName);
    const localTokens = localPart.split(/[._+-]+/).filter(Boolean);
    const websiteRootDomain = extractRootDomain(normalizeWebsiteHost(options.businessWebsite));
    const emailRootDomain = extractRootDomain(domain);
    const matchesBusinessDomain = Boolean(websiteRootDomain && emailRootDomain && websiteRootDomain === emailRootDomain);
    const ownerNameMatch = ownerTokens.some((token) => localTokens.includes(token) || localPart.includes(token));
    const looksLikePerson = /^[a-z]+([._-][a-z]+)+$/.test(localPart) || /^[a-z]{4,}$/.test(localPart);
    const looksNumeric = /\d{4,}/.test(localPart);

    if (DISPOSABLE_DOMAINS.includes(domain)) {
        flags.push("disposable_domain");
        return { type: "unknown", confidence: 0.05, flags };
    }

    if (localPart.includes("noreply") || localPart.includes("no-reply") || localPart.includes("donotreply")) {
        flags.push("noreply");
        return { type: "unknown", confidence: 0.05, flags };
    }

    let type: ContactValidation["emailType"] = "unknown";

    const isGeneric = GENERIC_PREFIXES.some((prefix) => localPart === prefix || localPart.startsWith(prefix + "."));
    const isStaffPrefix = STAFF_PREFIXES.some((prefix) => localPart === prefix || localPart.startsWith(prefix + "."));
    const isOwnerPrefix = OWNER_PREFIXES.some((prefix) => localPart === prefix || localPart.startsWith(prefix + "."));

    if (isGeneric) {
        type = "generic";
        confidence = 0.45;
        flags.push("generic_prefix");
    }

    const isFreeProvider = FREE_PROVIDERS.includes(domain);
    if (isFreeProvider) {
      flags.push("free_provider");
      flags.push("personal_inbox");

      if (!isGeneric && (ownerNameMatch || isOwnerPrefix)) {
        type = "owner";
        confidence = ownerNameMatch ? 0.72 : 0.64;
        if (ownerNameMatch) {
          flags.push("owner_name_match");
        } else {
          flags.push("owner_prefix");
        }
      } else if (!isGeneric && looksLikePerson) {
        type = "staff";
        confidence = 0.48;
        flags.push("personal_name_like");
      } else if (!isGeneric) {
        type = "staff";
        confidence = 0.38;
      }
    }

    if (!isFreeProvider && !isGeneric) {
      type = "staff";
        confidence = localPart.length <= 3 || localPart.includes(".") ? 0.75 : 0.7;
        flags.push("business_domain");

        if (matchesBusinessDomain) {
          flags.push("business_domain_match");
          confidence += 0.08;
        }

        if (ownerNameMatch) {
          type = "owner";
          confidence = Math.max(confidence, 0.88);
          flags.push("owner_name_match");
        } else if (isOwnerPrefix) {
            type = "owner";
            confidence = Math.max(confidence, 0.78);
            flags.push("owner_prefix");
        } else if (looksLikePerson && localPart.length > 3) {
            type = "owner";
            confidence = Math.max(confidence, 0.8);
            flags.push("looks_like_person");
        } else if (isStaffPrefix) {
            type = "staff";
            confidence = Math.max(confidence, 0.62);
            flags.push("staff_prefix");
        }
    }

    if (looksNumeric) {
        confidence = Math.max(0.15, confidence - 0.15);
        flags.push("numeric_local_part");
    }

    if (type === "unknown" && confidence === 0.5) {
        confidence = 0.3;
    }

    confidence = Math.max(0, Math.min(1, confidence));

    return { type, confidence, flags };
}

export function validatePhone(phone: string | null | undefined): {
    confidence: number;
    flags: string[];
} {
    if (!phone || phone.trim().length === 0) {
        return { confidence: 0, flags: ["no_phone"] };
    }

    const digits = phone.replace(/\D/g, "");
    const flags: string[] = [];
    let confidence = 0.3;

    if (digits.length < 10) {
        flags.push("too_short");
        return { confidence: 0.1, flags };
    }

    if (digits.length > 11) {
        flags.push("too_long");
        return { confidence: 0.2, flags };
    }

    let areaCode: string;
    if (digits.length === 11 && digits.startsWith("1")) {
        areaCode = digits.substring(1, 4);
    } else if (digits.length === 10) {
        areaCode = digits.substring(0, 3);
    } else {
        return { confidence: 0.3, flags: ["unusual_length"] };
    }

    if (ONTARIO_AREA_CODES.includes(areaCode)) {
        confidence = 0.9;
        flags.push("valid_ontario_area_code");
    } else if (CANADIAN_AREA_CODES.includes(areaCode)) {
        confidence = 0.75;
        flags.push("valid_canadian_area_code");
    } else {
        confidence = 0.5;
        flags.push("non_local_area_code");
    }

    const allSame = new Set(digits.slice(-7)).size === 1;
    if (allSame) {
        confidence = 0.1;
        flags.push("suspicious_pattern");
    }

    return { confidence, flags };
}

export function validateContact(
    email: string | null | undefined,
    phone: string | null | undefined,
    options: ValidateEmailOptions = {},
): ContactValidation {
    const emailResult = validateEmail(email, options);
    const phoneResult = validatePhone(phone);

    return {
        emailType: emailResult.type,
        emailConfidence: emailResult.confidence,
        phoneConfidence: phoneResult.confidence,
        emailFlags: emailResult.flags,
        phoneFlags: phoneResult.flags,
    };
}
