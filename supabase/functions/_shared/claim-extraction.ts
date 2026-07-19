// Claim extraction: a model PROPOSES claims about a document; this module
// ADMITS only claims whose evidence survives code verification. Grounding
// lives here, not in the prompt — the prompt asks nicely, this file enforces.

import { findQuote } from "./quote-match.ts";
import type { AiClient } from "./ai-client.ts";

export type ClaimType = "skill" | "achievement" | "scope" | "credential" | "role";

export interface ProposedClaim {
  kind: "verified" | "inferred";
  type: ClaimType;
  text: string;
  labels: string[];
  /** Required for kind=verified: verbatim quote from the document. */
  quote?: string;
  /** Required for kind=inferred: indexes into the proposal array of supporting verified claims. */
  supports?: number[];
  reasoning?: string;
  date_start?: string | null;
  date_end?: string | null;
}

export interface AdmittedClaim extends ProposedClaim {
  /** Position in the original proposal array (used to resolve `supports`). */
  index: number;
  /** Present for verified claims: verified quote with original-text offsets. */
  evidence?: { quote: string; start: number; end: number };
}

export interface RejectedClaim {
  claim: ProposedClaim;
  index: number;
  reason: string;
}

export interface ExtractionResult {
  admitted: AdmittedClaim[];
  rejected: RejectedClaim[];
  malformedCount: number;
}

const CLAIM_TYPES: ClaimType[] = ["skill", "achievement", "scope", "credential", "role"];

export function buildExtractionPrompt(documentText: string): { system: string; user: string } {
  const system = `You extract structured career claims from one source document.

Claim kinds:
- "verified": directly stated in the document. MUST include "quote": an EXACT, character-for-character excerpt copied from the document (whitespace differences are tolerated, rewording is not). A claim whose quote does not appear verbatim in the document will be rejected by automated verification.
- "inferred": a qualification the document demonstrates but never names (e.g. years of Tableau work demonstrates "data visualization"). MUST include "supports": an array of zero-based indexes of the verified claims in YOUR OWN output that justify it, and "reasoning": one sentence explaining the inference. Make conservative, defensible inferences only.

Claim types: "skill", "achievement", "scope" (team size, budget, volume), "credential" (degrees, certifications), "role" (job title + employer + dates).

Rules:
- Extract every distinct claim the document supports. Prefer many small claims over few broad ones.
- "labels" is a short array of lowercase kebab-case tags for the claim.
- "date_start"/"date_end" are "YYYY" or "YYYY-MM" strings when the document states them, else null.
- Never invent. If the document does not support a claim, do not propose it.

Each claim object has EXACTLY these fields:
{"kind": "verified" or "inferred", "type": "skill" or "achievement" or "scope" or "credential" or "role", "text": "the claim stated as one short standalone sentence", "labels": ["kebab-case-tag"], "quote": "exact excerpt (verified claims only)", "supports": [0], "reasoning": "one sentence (inferred claims only)", "date_start": "YYYY" or "YYYY-MM" or null, "date_end": "YYYY" or "YYYY-MM" or null}

Return ONLY a JSON object: {"claims": [...]}.`;

  const user = `DOCUMENT:\n${documentText}`;
  return { system, user };
}

/** A ProposedClaim paired with its position in the model's OWN output array
 *  (before malformed entries are dropped). `supports` indexes are defined in
 *  terms of that original array, so this position must survive filtering. */
export interface IndexedClaim {
  claim: ProposedClaim;
  /** Position in the original proposal array (index into `value.claims`). */
  index: number;
}

export function parseProposedClaims(value: unknown): {
  valid: IndexedClaim[];
  malformed: { raw: unknown; reason: string }[];
} {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { claims?: unknown }).claims)) {
    throw new Error('AI response is not an object with a "claims" array');
  }
  const valid: IndexedClaim[] = [];
  const malformed: { raw: unknown; reason: string }[] = [];
  (value as { claims: unknown[] }).claims.forEach((raw, index) => {
    const reason = validateClaimShape(raw);
    if (reason) {
      malformed.push({ raw, reason });
    } else {
      const c = raw as Record<string, unknown>;
      valid.push({
        index,
        claim: {
          kind: c.kind as "verified" | "inferred",
          type: c.type as ClaimType,
          text: c.text as string,
          labels: Array.isArray(c.labels) ? (c.labels as unknown[]).filter((l): l is string => typeof l === "string") : [],
          quote: typeof c.quote === "string" ? c.quote : undefined,
          supports: Array.isArray(c.supports) ? (c.supports as unknown[]).filter((s): s is number => Number.isInteger(s)) : undefined,
          reasoning: typeof c.reasoning === "string" ? c.reasoning : undefined,
          date_start: typeof c.date_start === "string" ? c.date_start : null,
          date_end: typeof c.date_end === "string" ? c.date_end : null,
        },
      });
    }
  });
  return { valid, malformed };
}

function validateClaimShape(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "claim is not an object";
  const c = raw as Record<string, unknown>;
  if (c.kind !== "verified" && c.kind !== "inferred") return `invalid kind: ${String(c.kind)}`;
  if (!CLAIM_TYPES.includes(c.type as ClaimType)) return `invalid type: ${String(c.type)}`;
  if (typeof c.text !== "string" || c.text.trim() === "") return "missing text";
  return null;
}

export function admitClaims(
  proposals: IndexedClaim[],
  documentText: string,
): { admitted: AdmittedClaim[]; rejected: RejectedClaim[] } {
  const admitted: AdmittedClaim[] = [];
  const rejected: RejectedClaim[] = [];
  // Keyed by ORIGINAL proposal-array position — the same space `supports`
  // indexes live in — not by position within the (possibly filtered) array
  // passed in here.
  const admittedVerifiedIndexes = new Set<number>();

  // Pass 1: verified claims — the quote must literally exist in the document.
  for (const { claim, index } of proposals) {
    if (claim.kind !== "verified") continue;
    if (!claim.quote || claim.quote.trim() === "") {
      rejected.push({ claim, index, reason: "verified claim missing quote" });
      continue;
    }
    const match = findQuote(claim.quote, documentText);
    if (!match.found) {
      rejected.push({ claim, index, reason: `quote not found in document: "${claim.quote.slice(0, 80)}"` });
      continue;
    }
    admitted.push({ ...claim, index, evidence: { quote: claim.quote, start: match.start, end: match.end } });
    admittedVerifiedIndexes.add(index);
  }

  // Pass 2: inferred claims — every support must be an ADMITTED verified claim,
  // resolved by its ORIGINAL proposal-array position.
  for (const { claim, index } of proposals) {
    if (claim.kind !== "inferred") continue;
    if (!claim.supports || claim.supports.length === 0) {
      rejected.push({ claim, index, reason: "inferred claim has no supports" });
      continue;
    }
    const bad = claim.supports.filter((s) => !admittedVerifiedIndexes.has(s));
    if (bad.length > 0) {
      rejected.push({ claim, index, reason: `supports reference non-admitted claims: [${bad.join(", ")}]` });
      continue;
    }
    admitted.push({ ...claim, index });
  }

  return { admitted, rejected };
}

export async function extractClaimsFromDocument(
  documentText: string,
  ai: AiClient,
): Promise<ExtractionResult> {
  const { system, user } = buildExtractionPrompt(documentText);
  const raw = await ai.chatJson({ system, user });
  const { valid, malformed } = parseProposedClaims(raw);
  const { admitted, rejected } = admitClaims(valid, documentText);
  return { admitted, rejected, malformedCount: malformed.length };
}
