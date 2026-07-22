// Requirement→claim matching and lane selection. The model PROPOSES which
// claims answer which requirement and which career story to tell; this module
// admits only citations that resolve to claims actually offered to the model,
// and demotes any coverage the model asserts but cannot point at.

import type { ParsedRequirement } from "./jd-parse.ts";

export type CoverageStatus = "verified" | "inferred" | "gap";

export interface CandidateClaim {
  id: string;
  kind: "verified" | "inferred" | "user_attested";
  type: string;
  text: string;
}

export interface Lane {
  name: string;
  claimIds: string[];
}

export interface LaneDecision {
  selected: Lane;
  rationale: string;
  competing: Lane[];
  excludedClaimIds: string[];
}

export interface CoverageEntry {
  requirementIndex: number;
  status: CoverageStatus;
  claimIds: string[];
  rationale: string | null;
}

export interface CoverageResult {
  lane: LaneDecision;
  /** True when the model's selected lane resolved to no known claims and every claim was used instead. */
  laneFallback: boolean;
  coverage: CoverageEntry[];
  demoted: { requirementIndex: number; reason: string }[];
  malformed: { raw: unknown; reason: string }[];
}

const COVERAGE_STATUSES: CoverageStatus[] = ["verified", "inferred", "gap"];

export function buildCoveragePrompt(
  requirements: ParsedRequirement[],
  claims: CandidateClaim[],
): { system: string; user: string } {
  const system = `You match a candidate's evidence-backed claims against a job posting's requirements, and you choose which career story the resume should tell.

You will be given REQUIREMENTS (each with an index) and CLAIMS (each with an id).

First, group the claims into candidate lanes — coherent career stories the corpus could tell (e.g. "fraud operations" vs "data engineering"). Pick ONE lane for this posting. Do not blend lanes: a resume that tells two stories tells neither.

Then, for EVERY requirement index, decide coverage:
- "verified": at least one claim of kind "verified" directly answers the requirement.
- "inferred": claims answer it only by reasonable inference.
- "gap": the claims do not answer it. This is a normal, useful answer — do not stretch to avoid it.

Rules:
- Cite ONLY claim ids from the CLAIMS list. An id you invent will be discarded and the coverage downgraded.
- A "verified" or "inferred" status MUST cite at least one claim id. Coverage you cannot point at is a gap.
- You may cite claims outside the selected lane when they genuinely answer a requirement.
- "rationale" is one sentence, or null for gaps.

Return ONLY a JSON object:
{"lanes": [{"name": "...", "claim_ids": ["..."]}],
 "selected_lane": {"selected": {"name": "...", "claim_ids": ["..."]}, "rationale": "...", "competing": [{"name": "...", "claim_ids": ["..."]}], "excluded_claim_ids": ["..."]},
 "coverage": [{"requirement_index": 0, "status": "verified", "claim_ids": ["..."], "rationale": "..."}]}`;

  const requirementLines = requirements
    .map((r, i) => `[${i}] (${r.priority} ${r.type}) ${r.text}`)
    .join("\n");
  const claimLines = claims
    .map((c) => `id=${c.id} kind=${c.kind} type=${c.type} :: ${c.text}`)
    .join("\n");

  const user = `REQUIREMENTS:\n${requirementLines}\n\nCLAIMS:\n${claimLines}`;
  return { system, user };
}

export function admitCoverage(
  value: unknown,
  requirementCount: number,
  claims: CandidateClaim[],
): CoverageResult {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { coverage?: unknown }).coverage)) {
    throw new Error('AI response is not an object with a "coverage" array');
  }
  const v = value as { coverage: unknown[]; selected_lane?: unknown };

  const byId = new Map(claims.map((c) => [c.id, c]));
  const malformed: { raw: unknown; reason: string }[] = [];
  const demoted: { requirementIndex: number; reason: string }[] = [];

  // Every requirement starts as a gap; the model can only upgrade one by
  // citing claims that exist.
  const coverage: CoverageEntry[] = Array.from({ length: requirementCount }, (_, i) => ({
    requirementIndex: i,
    status: "gap" as CoverageStatus,
    claimIds: [],
    rationale: null,
  }));

  for (const raw of v.coverage) {
    if (typeof raw !== "object" || raw === null) {
      malformed.push({ raw, reason: "coverage entry is not an object" });
      continue;
    }
    const e = raw as Record<string, unknown>;
    const index = e.requirement_index;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= requirementCount) {
      malformed.push({ raw, reason: `requirement_index out of range: ${String(index)}` });
      continue;
    }
    if (!COVERAGE_STATUSES.includes(e.status as CoverageStatus)) {
      malformed.push({ raw, reason: `invalid status: ${String(e.status)}` });
      continue;
    }

    const i = index as number;
    const proposed = e.status as CoverageStatus;
    const rationale = typeof e.rationale === "string" && e.rationale.trim() !== "" ? e.rationale.trim() : null;
    const citedIds = Array.isArray(e.claim_ids)
      ? (e.claim_ids as unknown[]).filter((id): id is string => typeof id === "string" && byId.has(id))
      : [];

    if (proposed === "gap") {
      coverage[i] = { requirementIndex: i, status: "gap", claimIds: [], rationale };
      continue;
    }
    if (citedIds.length === 0) {
      demoted.push({ requirementIndex: i, reason: `${proposed} status cites no admitted claim` });
      coverage[i] = { requirementIndex: i, status: "gap", claimIds: [], rationale };
      continue;
    }
    if (proposed === "verified" && !citedIds.some((id) => byId.get(id)!.kind === "verified")) {
      demoted.push({ requirementIndex: i, reason: "verified status cites no verified claim" });
      coverage[i] = { requirementIndex: i, status: "inferred", claimIds: citedIds, rationale };
      continue;
    }
    coverage[i] = { requirementIndex: i, status: proposed, claimIds: citedIds, rationale };
  }

  const { lane, laneFallback } = admitLane(v.selected_lane, claims, byId);
  return { lane, laneFallback, coverage, demoted, malformed };
}

function admitLane(
  raw: unknown,
  claims: CandidateClaim[],
  byId: Map<string, CandidateClaim>,
): { lane: LaneDecision; laneFallback: boolean } {
  const allIds = claims.map((c) => c.id);
  const fallback: LaneDecision = {
    selected: { name: "All claims", claimIds: allIds },
    rationale: "No usable lane was proposed; every claim is in scope.",
    competing: [],
    excludedClaimIds: [],
  };

  if (typeof raw !== "object" || raw === null) return { lane: fallback, laneFallback: true };
  const l = raw as Record<string, unknown>;
  const selectedRaw = l.selected;
  if (typeof selectedRaw !== "object" || selectedRaw === null) return { lane: fallback, laneFallback: true };

  const s = selectedRaw as Record<string, unknown>;
  const selectedIds = toKnownIds(s.claim_ids, byId);
  if (selectedIds.length === 0) return { lane: fallback, laneFallback: true };

  const selectedSet = new Set(selectedIds);
  return {
    lane: {
      selected: {
        name: typeof s.name === "string" && s.name.trim() !== "" ? s.name.trim() : "Selected lane",
        claimIds: selectedIds,
      },
      rationale: typeof l.rationale === "string" ? l.rationale.trim() : "",
      competing: Array.isArray(l.competing)
        ? (l.competing as unknown[]).flatMap((c) => {
            if (typeof c !== "object" || c === null) return [];
            const cc = c as Record<string, unknown>;
            return [{
              name: typeof cc.name === "string" ? cc.name.trim() : "Unnamed lane",
              claimIds: toKnownIds(cc.claim_ids, byId),
            }];
          })
        : [],
      // Derived from the selection rather than trusted: whatever is not in the
      // selected lane is excluded, by definition.
      excludedClaimIds: allIds.filter((id) => !selectedSet.has(id)),
    },
    laneFallback: false,
  };
}

function toKnownIds(raw: unknown, byId: Map<string, CandidateClaim>): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter((id): id is string => typeof id === "string" && byId.has(id));
}
