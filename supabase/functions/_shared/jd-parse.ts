// Job-description parsing: a model PROPOSES the requirements a posting states;
// this module admits only well-formed ones. Requirement text is used verbatim
// downstream, so a requirement with no text is not a requirement.

export type RequirementType = "skill" | "experience" | "credential" | "responsibility";
export type RequirementPriority = "required" | "preferred";

export interface ParsedRequirement {
  text: string;
  type: RequirementType;
  priority: RequirementPriority;
}

export interface JdParseResult {
  title: string | null;
  company: string | null;
  requirements: ParsedRequirement[];
  malformed: { raw: unknown; reason: string }[];
}

const REQUIREMENT_TYPES: RequirementType[] = ["skill", "experience", "credential", "responsibility"];
const REQUIREMENT_PRIORITIES: RequirementPriority[] = ["required", "preferred"];

export function buildJdParsePrompt(jobDescription: string): { system: string; user: string } {
  const system = `You extract the structured requirements a job posting states.

For each distinct requirement the posting asks for, emit one object:
- "text": the requirement in one short standalone sentence, in the posting's own terms.
- "type": one of "skill" (a tool, technique, or ability), "experience" (time spent doing something, or a domain worked in), "credential" (degree, certification, license), "responsibility" (a duty the role owns).
- "priority": "required" if the posting states or implies it is a must-have, "preferred" if it is a nice-to-have.

Also extract "title" (the job title) and "company" (the hiring company), or null when the posting does not state them.

Rules:
- Split compound requirements. "SQL and Python with 5 years in fintech" is three requirements.
- Do not invent requirements the posting does not state.
- Do not editorialize about the candidate; you are reading the posting only.

Each object has EXACTLY these fields: {"text": "...", "type": "skill" or "experience" or "credential" or "responsibility", "priority": "required" or "preferred"}

Return ONLY a JSON object: {"title": ... , "company": ..., "requirements": [...]}.`;

  const user = `JOB POSTING:\n${jobDescription}`;
  return { system, user };
}

export function parseJdResponse(value: unknown): JdParseResult {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { requirements?: unknown }).requirements)) {
    throw new Error('AI response is not an object with a "requirements" array');
  }
  const v = value as { title?: unknown; company?: unknown; requirements: unknown[] };
  const requirements: ParsedRequirement[] = [];
  const malformed: { raw: unknown; reason: string }[] = [];

  for (const raw of v.requirements) {
    const reason = validateRequirementShape(raw);
    if (reason) {
      malformed.push({ raw, reason });
      continue;
    }
    const r = raw as Record<string, unknown>;
    requirements.push({
      text: (r.text as string).trim(),
      type: r.type as RequirementType,
      priority: r.priority as RequirementPriority,
    });
  }

  return {
    title: typeof v.title === "string" && v.title.trim() !== "" ? v.title.trim() : null,
    company: typeof v.company === "string" && v.company.trim() !== "" ? v.company.trim() : null,
    requirements,
    malformed,
  };
}

function validateRequirementShape(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "requirement is not an object";
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== "string" || r.text.trim() === "") return "missing text";
  if (!REQUIREMENT_TYPES.includes(r.type as RequirementType)) return `invalid type: ${String(r.type)}`;
  if (!REQUIREMENT_PRIORITIES.includes(r.priority as RequirementPriority)) {
    return `invalid priority: ${String(r.priority)}`;
  }
  return null;
}
