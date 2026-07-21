// Resume rendering. The model PROPOSES bullets and the claims each one draws
// from; this module admits only bullets whose every citation is a claim that
// was actually offered. This is the admit gate at the output end: a bullet
// nothing backs does not reach the page.

import type { ParsedRequirement } from "./jd-parse.ts";
import type { CandidateClaim } from "./coverage.ts";

export interface ProposedBullet {
  section: string;
  text: string;
  claimIds: string[];
}

export interface AdmittedBullet extends ProposedBullet {
  /** Order within its section, starting at 0. */
  position: number;
}

export interface RejectedBullet {
  bullet: ProposedBullet;
  reason: string;
}

export interface RenderResult {
  admitted: AdmittedBullet[];
  rejected: RejectedBullet[];
  malformed: number;
}

export function buildRenderPrompt(
  requirements: ParsedRequirement[],
  claims: CandidateClaim[],
): { system: string; user: string } {
  const system = `You write resume bullets from a candidate's verified claims, targeted at a job posting.

Every bullet MUST cite the claims it draws from, by id, in "claim_ids". A bullet you cannot attribute to a claim will be discarded — so do not write one.

Rules:
- Use ONLY the CLAIMS provided. Do not add employers, dates, metrics, or technologies that no claim states.
- Cite ONLY ids from the CLAIMS list. An invented id discards the whole bullet.
- Prefer the claims that answer the posting's requirements; ignore claims that answer nothing.
- One accomplishment per bullet, past tense, concrete.
- "section" groups bullets on the page — use "Experience", "Skills", or "Education".
- If the claims cannot support a requirement, write nothing about it. Silence is correct; invention is not.

Each bullet has EXACTLY these fields: {"section": "...", "text": "...", "claim_ids": ["..."]}

Return ONLY a JSON object: {"bullets": [...]}.`;

  const requirementLines = requirements
    .map((r) => `- (${r.priority} ${r.type}) ${r.text}`)
    .join("\n");
  const claimLines = claims
    .map((c) => `id=${c.id} kind=${c.kind} :: ${c.text}`)
    .join("\n");

  const user = `POSTING REQUIREMENTS:\n${requirementLines}\n\nCLAIMS:\n${claimLines}`;
  return { system, user };
}

export function admitBullets(value: unknown, selectedClaimIds: string[]): RenderResult {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { bullets?: unknown }).bullets)) {
    throw new Error('AI response is not an object with a "bullets" array');
  }
  const selected = new Set(selectedClaimIds);
  const admitted: AdmittedBullet[] = [];
  const rejected: RejectedBullet[] = [];
  const positionBySection = new Map<string, number>();
  let malformed = 0;

  for (const raw of (value as { bullets: unknown[] }).bullets) {
    if (typeof raw !== "object" || raw === null) {
      malformed++;
      continue;
    }
    const b = raw as Record<string, unknown>;
    if (typeof b.section !== "string" || b.section.trim() === "") {
      malformed++;
      continue;
    }
    if (typeof b.text !== "string" || b.text.trim() === "") {
      malformed++;
      continue;
    }
    const claimIds = Array.isArray(b.claim_ids)
      ? (b.claim_ids as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    const bullet: ProposedBullet = {
      section: b.section.trim(),
      text: b.text.trim(),
      claimIds,
    };

    if (claimIds.length === 0) {
      rejected.push({ bullet, reason: "bullet cites no claim" });
      continue;
    }
    const unknown = claimIds.filter((id) => !selected.has(id));
    if (unknown.length > 0) {
      rejected.push({ bullet, reason: `cites claims not in the selected set: [${unknown.join(", ")}]` });
      continue;
    }

    const position = positionBySection.get(bullet.section) ?? 0;
    positionBySection.set(bullet.section, position + 1);
    admitted.push({ ...bullet, position });
  }

  return { admitted, rejected, malformed };
}

export function renderPlainText(bullets: AdmittedBullet[]): string {
  const sections: string[] = [];
  const bySection = new Map<string, AdmittedBullet[]>();
  for (const b of bullets) {
    if (!bySection.has(b.section)) {
      bySection.set(b.section, []);
      sections.push(b.section);
    }
    bySection.get(b.section)!.push(b);
  }
  return sections
    .map((section) => {
      const lines = bySection
        .get(section)!
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((b) => `- ${b.text}`)
        .join("\n");
      return `${section.toUpperCase()}\n${lines}`;
    })
    .join("\n\n");
}
