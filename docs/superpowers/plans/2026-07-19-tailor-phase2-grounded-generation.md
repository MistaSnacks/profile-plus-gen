# TAILOR Phase 2 — Grounded Generation v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a second resume-generation pipeline that writes only from the Phase 1 claims corpus, records which claims every bullet drew from, and reports per-requirement coverage — with code, not prompts, enforcing the grounding.

**Architecture:** Two edge functions (`analyze-jd`, `render-grounded`) over three dependency-free shared modules that hold all the admit logic and all the tests. Five new tables plus two `lane_decision` columns persist requirements, coverage, bullets, and their claim citations. The existing v1 `generate-resume` is untouched; a toggle on the Generate page runs one or the other.

**Tech Stack:** Deno edge functions (Supabase), TypeScript shared modules under `supabase/functions/_shared/`, vitest for unit tests, tsx for the eval harness, React + shadcn/ui + TanStack Query for UI, Postgres with RLS.

## Global Constraints

- **Model-agnostic:** all model calls go through `_shared/ai-client.ts`; provider config (`baseUrl`, `apiKey`, `model`) is passed in by the caller, never read inside a shared module. Default gateway: `https://ai.gateway.lovable.dev/v1`, default model `google/gemini-2.5-flash`.
- **Models propose, code admits:** no requirement, coverage row, or bullet is persisted unless code validated it — a cited claim id must resolve to a claim that is this user's, `status = 'active'`, and was in the candidate set sent to the model. A bullet citing zero admitted claims is rejected.
- **Shared modules are dependency-free and runtime-neutral:** no imports, no `Deno.*`, no `process.*` inside `supabase/functions/_shared/*.ts` (except relative imports of each other, always with explicit `.ts` extensions — Deno requires them; vitest resolves them fine).
- **RLS on every new table**, following the corrected Phase 1 style: every policy checks ownership on every side it references.
- **Coverage is reported, never gated:** the eval harness fails on fabrications > 0 and uncited bullets > 0 only. A low coverage number is information, not a failure.
- **Database changes and edge-function deploys go through the Lovable MCP**, not the session's Supabase MCP (which targets the wrong project). Repo project: supabase ref `tdmeripiyfocaexvoyiu` = Lovable project id `b25051a7-ba3d-41a7-8944-7015a774850b`. Every migration is also saved under `supabase/migrations/` for the repo record.
- **Do not modify** `generate-resume`, the claims engine, `/corpus`, or the dead `document_embeddings` / `match_document_chunks` infrastructure.
- TDD for all pure logic; frequent commits; YAGNI (no embeddings, no lane curation UI, no provenance panel, no fit-honesty tiers in this phase).

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260719000000_phase2_grounded_generation.sql` | 3 enums, 5 tables, 2 columns, RLS, indexes |
| `supabase/functions/_shared/jd-parse.ts` | Requirement-extraction prompt; validate + admit proposed requirements |
| `supabase/functions/_shared/coverage.ts` | Matching prompt; admit matches + lane decision |
| `supabase/functions/_shared/render.ts` | Rendering prompt; admit bullets (cite check); plain-text rendering |
| `supabase/functions/analyze-jd/index.ts` | Edge fn: auth → parse → match → lane → persist → coverage map |
| `supabase/functions/render-grounded/index.ts` | Edge fn: auth → load coverage → render → cite check → persist |
| `eval/run.ts` | Extended: JD fixtures, coverage metric, uncited-bullet invariant |
| `eval/fixtures/ops-analyst/jds/*.txt` | Two synthetic postings (in-lane, adjacent-lane) |
| `src/pages/Generate.tsx` | v1/v2 engine toggle + coverage panel |
| `src/components/CoveragePanel.tsx` | Renders the coverage map + lane decision |
| `src/components/V2ResumeContent.tsx` | Renders a v2 resume from `resume_bullets` |
| `src/pages/Resumes.tsx` | One-line swap to V2ResumeContent when `metadata.engine === 'v2'` |
| `tests/jd-parse.test.ts`, `tests/coverage.test.ts`, `tests/render.test.ts` | Vitest unit tests |

---

### Task 1: Phase 2 schema migration

**Files:**
- Create: `supabase/migrations/20260719000000_phase2_grounded_generation.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: existing `job_descriptions`, `generated_resumes`, `claims` tables.
- Produces: enums `requirement_type` (`skill`|`experience`|`credential`|`responsibility`), `requirement_priority` (`required`|`preferred`), `coverage_status` (`verified`|`inferred`|`gap`); tables `jd_requirements`, `requirement_coverage`, `coverage_claims`, `resume_bullets`, `bullet_claims`; columns `job_descriptions.lane_decision` and `generated_resumes.lane_decision` (both JSONB).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260719000000_phase2_grounded_generation.sql`:

```sql
-- TAILOR Phase 2: grounded generation.
-- Requirements parsed from a posting, their coverage against the claims corpus,
-- and the bullets a generated resume is built from. Citations are join tables,
-- not arrays, so a deleted claim takes its citations with it rather than
-- leaving a saved resume pointing at evidence that no longer exists.

CREATE TYPE public.requirement_type AS ENUM ('skill', 'experience', 'credential', 'responsibility');
CREATE TYPE public.requirement_priority AS ENUM ('required', 'preferred');
CREATE TYPE public.coverage_status AS ENUM ('verified', 'inferred', 'gap');

CREATE TABLE public.jd_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_description_id UUID NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type public.requirement_type NOT NULL,
  priority public.requirement_priority NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.requirement_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL UNIQUE REFERENCES public.jd_requirements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.coverage_status NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.coverage_claims (
  coverage_id UUID NOT NULL REFERENCES public.requirement_coverage(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (coverage_id, claim_id)
);

CREATE TABLE public.resume_bullets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.generated_resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bullet_claims (
  bullet_id UUID NOT NULL REFERENCES public.resume_bullets(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (bullet_id, claim_id)
);

ALTER TABLE public.job_descriptions ADD COLUMN lane_decision JSONB;
ALTER TABLE public.generated_resumes ADD COLUMN lane_decision JSONB;

CREATE INDEX idx_jd_requirements_jd ON public.jd_requirements(job_description_id);
CREATE INDEX idx_jd_requirements_user ON public.jd_requirements(user_id);
CREATE INDEX idx_requirement_coverage_user ON public.requirement_coverage(user_id);
CREATE INDEX idx_coverage_claims_claim ON public.coverage_claims(claim_id);
CREATE INDEX idx_resume_bullets_resume ON public.resume_bullets(resume_id);
CREATE INDEX idx_bullet_claims_claim ON public.bullet_claims(claim_id);

ALTER TABLE public.jd_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_bullets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bullet_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own jd requirements"
  ON public.jd_requirements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own requirement coverage"
  ON public.requirement_coverage FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own coverage claims"
  ON public.coverage_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.requirement_coverage rc WHERE rc.id = coverage_id AND rc.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.requirement_coverage rc WHERE rc.id = coverage_id AND rc.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users manage own resume bullets"
  ON public.resume_bullets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own bullet claims"
  ON public.bullet_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.resume_bullets b WHERE b.id = bullet_id AND b.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resume_bullets b WHERE b.id = bullet_id AND b.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply the migration**

Apply the SQL above verbatim using the Lovable MCP tool `mcp__plugin_lovable_lovable__query_database` with `project_id: "b25051a7-ba3d-41a7-8944-7015a774850b"`.

Do NOT use `mcp__supabase__*` tools — that server targets a different project.

- [ ] **Step 3: Verify schema landed**

Run via the same `query_database` tool:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('jd_requirements','requirement_coverage','coverage_claims','resume_bullets','bullet_claims')
ORDER BY table_name;
```

Expected: all five rows.

```sql
SELECT c.relname, c.relrowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('jd_requirements','requirement_coverage','coverage_claims','resume_bullets','bullet_claims');
```

Expected: `relrowsecurity = true` and `policies = 1` for all five.

- [ ] **Step 4: Regenerate TypeScript types**

There is no local supabase link and the Supabase MCP typegen targets the wrong project. Generate from the live database with `@supabase/postgres-meta` over the session pooler, using a temporary read-only role.

Create the role via `query_database` (use a role name not used before — supavisor caches dropped-role OIDs):

```sql
CREATE ROLE typegen_p2 LOGIN PASSWORD 'REPLACE_WITH_OUTPUT_OF_openssl_rand_hex_24' CONNECTION LIMIT 3;
GRANT pg_read_all_data TO typegen_p2;
```

Generate the password first with `openssl rand -hex 24` and substitute it into both the SQL above and the URL below.

```bash
cd <scratchpad-dir>
npm install @supabase/postgres-meta
PG_META_DB_URL="postgresql://typegen_p2.tdmeripiyfocaexvoyiu:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  PG_META_PORT=19741 node node_modules/@supabase/postgres-meta/dist/server/server.js > meta.log 2>&1 &
sleep 4
curl -s "http://localhost:19741/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true&postgrest_version=13.0.5" \
  -o types-p2.ts
pkill -f "postgres-meta/dist/server/server.js"
```

Verify `types-p2.ts` is ~20KB and contains `jd_requirements`, then copy it over `src/integrations/supabase/types.ts`.

Drop the role via `query_database`:

```sql
DROP ROLE typegen_p2;
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds (a pre-existing chunk-size warning is fine).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260719000000_phase2_grounded_generation.sql src/integrations/supabase/types.ts
git commit -m "feat: add Phase 2 requirements, coverage, and bullet citation tables"
```

---

### Task 2: JD parsing module

**Files:**
- Create: `supabase/functions/_shared/jd-parse.ts`
- Test: `tests/jd-parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types `RequirementType = "skill" | "experience" | "credential" | "responsibility"`, `RequirementPriority = "required" | "preferred"`, `ParsedRequirement = { text: string; type: RequirementType; priority: RequirementPriority }`, `JdParseResult = { title: string | null; company: string | null; requirements: ParsedRequirement[]; malformed: { raw: unknown; reason: string }[] }`.
  - `buildJdParsePrompt(jobDescription: string): { system: string; user: string }`
  - `parseJdResponse(value: unknown): JdParseResult` — throws `Error` when the payload is not an object with a `requirements` array.

- [ ] **Step 1: Write the failing tests**

Create `tests/jd-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildJdParsePrompt,
  parseJdResponse,
} from "../supabase/functions/_shared/jd-parse.ts";

const req = (over: Record<string, unknown> = {}) => ({
  text: "5+ years in fraud operations",
  type: "experience",
  priority: "required",
  ...over,
});

describe("buildJdParsePrompt", () => {
  it("embeds the posting text in the user message", () => {
    const { system, user } = buildJdParsePrompt("Fraud Analyst at Brightpay");
    expect(user).toContain("Fraud Analyst at Brightpay");
    expect(system).toContain("requirements");
  });
});

describe("parseJdResponse", () => {
  it("accepts a well-formed payload", () => {
    const result = parseJdResponse({
      title: "Fraud Analyst",
      company: "Brightpay",
      requirements: [req()],
    });
    expect(result.title).toBe("Fraud Analyst");
    expect(result.company).toBe("Brightpay");
    expect(result.requirements).toHaveLength(1);
    expect(result.malformed).toHaveLength(0);
  });

  it("defaults missing title and company to null", () => {
    const result = parseJdResponse({ requirements: [req()] });
    expect(result.title).toBeNull();
    expect(result.company).toBeNull();
  });

  it("throws when the top level has no requirements array", () => {
    expect(() => parseJdResponse({ title: "x" })).toThrow(/requirements/);
  });

  it("collects malformed entries without dropping valid ones", () => {
    const result = parseJdResponse({
      requirements: [
        req(),
        req({ type: "wizardry" }),
        req({ priority: "someday" }),
        req({ text: "   " }),
        "not an object",
      ],
    });
    expect(result.requirements).toHaveLength(1);
    expect(result.malformed).toHaveLength(4);
    expect(result.malformed[0].reason).toMatch(/invalid type/i);
    expect(result.malformed[1].reason).toMatch(/invalid priority/i);
    expect(result.malformed[2].reason).toMatch(/missing text/i);
    expect(result.malformed[3].reason).toMatch(/not an object/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/jd-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `supabase/functions/_shared/jd-parse.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/jd-parse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/jd-parse.ts tests/jd-parse.test.ts
git commit -m "feat: add job-description requirement parsing module"
```

---

### Task 3: Coverage matching module

**Files:**
- Create: `supabase/functions/_shared/coverage.ts`
- Test: `tests/coverage.test.ts`

**Interfaces:**
- Consumes: `ParsedRequirement` from `./jd-parse.ts`.
- Produces:
  - `CoverageStatus = "verified" | "inferred" | "gap"`
  - `CandidateClaim = { id: string; kind: "verified" | "inferred" | "user_attested"; type: string; text: string }`
  - `Lane = { name: string; claimIds: string[] }`
  - `LaneDecision = { selected: Lane; rationale: string; competing: Lane[]; excludedClaimIds: string[] }`
  - `CoverageEntry = { requirementIndex: number; status: CoverageStatus; claimIds: string[]; rationale: string | null }`
  - `CoverageResult = { lane: LaneDecision; laneFallback: boolean; coverage: CoverageEntry[]; demoted: { requirementIndex: number; reason: string }[]; malformed: { raw: unknown; reason: string }[] }`
  - `buildCoveragePrompt(requirements: ParsedRequirement[], claims: CandidateClaim[]): { system: string; user: string }`
  - `admitCoverage(value: unknown, requirementCount: number, claims: CandidateClaim[]): CoverageResult` — throws when the payload is not an object with a `coverage` array.

Admission rules, applied per coverage entry in this order: cited ids not in the candidate set are dropped; `gap` keeps no ids; a non-`gap` status left with no ids is demoted to `gap`; a `verified` status whose remaining claims include no claim of `kind === "verified"` is demoted to `inferred`. Entries whose `requirementIndex` is out of range are malformed. Requirements the model omitted default to `gap` with no ids.

- [ ] **Step 1: Write the failing tests**

Create `tests/coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildCoveragePrompt,
  admitCoverage,
  type CandidateClaim,
} from "../supabase/functions/_shared/coverage.ts";

const CLAIMS: CandidateClaim[] = [
  { id: "c-verified", kind: "verified", type: "skill", text: "Tableau dashboard development" },
  { id: "c-inferred", kind: "inferred", type: "skill", text: "Data visualization" },
  { id: "c-other", kind: "verified", type: "role", text: "Fraud Operations Analyst" },
];

const LANE = {
  selected: { name: "Fraud operations", claim_ids: ["c-verified", "c-other"] },
  rationale: "The posting is mostly fraud work.",
  competing: [{ name: "Analytics", claim_ids: ["c-inferred"] }],
  excluded_claim_ids: ["c-inferred"],
};

const payload = (coverage: unknown[], lane: unknown = LANE) => ({ lanes: [], selected_lane: lane, coverage });

describe("buildCoveragePrompt", () => {
  it("lists claim ids and requirement indexes for the model to reference", () => {
    const { user } = buildCoveragePrompt(
      [{ text: "Tableau experience", type: "skill", priority: "required" }],
      CLAIMS,
    );
    expect(user).toContain("c-verified");
    expect(user).toContain("Tableau experience");
    expect(user).toContain("[0]");
  });
});

describe("admitCoverage", () => {
  it("admits a verified match backed by a verified claim", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-verified"], rationale: "Direct." }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("verified");
    expect(result.coverage[0].claimIds).toEqual(["c-verified"]);
    expect(result.demoted).toHaveLength(0);
  });

  it("drops claim ids that were not in the candidate set", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-verified", "c-hallucinated"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].claimIds).toEqual(["c-verified"]);
  });

  it("demotes a verified status backed only by inferred claims", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-inferred"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("inferred");
    expect(result.demoted[0].reason).toMatch(/no verified claim/i);
  });

  it("demotes a covered status that cites nothing to gap", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "inferred", claim_ids: [], rationale: "trust me" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("gap");
    expect(result.coverage[0].claimIds).toEqual([]);
    expect(result.demoted[0].reason).toMatch(/cites no admitted claim/i);
  });

  it("demotes to gap when every cited id is unknown", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["nope"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("gap");
  });

  it("strips claim ids from an explicit gap", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "gap", claim_ids: ["c-verified"], rationale: null }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("gap");
    expect(result.coverage[0].claimIds).toEqual([]);
  });

  it("defaults requirements the model omitted to gap", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-verified"], rationale: "x" }]),
      3,
      CLAIMS,
    );
    expect(result.coverage).toHaveLength(3);
    expect(result.coverage[1].status).toBe("gap");
    expect(result.coverage[2].status).toBe("gap");
  });

  it("treats an out-of-range requirement index as malformed", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 7, status: "verified", claim_ids: ["c-verified"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.malformed[0].reason).toMatch(/requirement_index/i);
  });

  it("keeps only candidate claim ids in the selected lane", () => {
    const result = admitCoverage(
      payload([], { ...LANE, selected: { name: "Fraud operations", claim_ids: ["c-verified", "ghost"] } }),
      0,
      CLAIMS,
    );
    expect(result.lane.selected.claimIds).toEqual(["c-verified"]);
    expect(result.laneFallback).toBe(false);
  });

  it("falls back to all claims when the selected lane resolves to nothing", () => {
    const result = admitCoverage(
      payload([], { ...LANE, selected: { name: "Ghosts", claim_ids: ["ghost"] } }),
      0,
      CLAIMS,
    );
    expect(result.laneFallback).toBe(true);
    expect(result.lane.selected.claimIds).toEqual(["c-verified", "c-inferred", "c-other"]);
  });

  it("throws when the payload has no coverage array", () => {
    expect(() => admitCoverage({ selected_lane: LANE }, 1, CLAIMS)).toThrow(/coverage/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/coverage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `supabase/functions/_shared/coverage.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/coverage.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/coverage.ts tests/coverage.test.ts
git commit -m "feat: add requirement coverage matching and lane selection module"
```

---

### Task 4: Rendering module with cite check

**Files:**
- Create: `supabase/functions/_shared/render.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: `ParsedRequirement` from `./jd-parse.ts`; `CandidateClaim` from `./coverage.ts`.
- Produces:
  - `ProposedBullet = { section: string; text: string; claimIds: string[] }`
  - `AdmittedBullet = ProposedBullet & { position: number }`
  - `RejectedBullet = { bullet: ProposedBullet; reason: string }`
  - `RenderResult = { admitted: AdmittedBullet[]; rejected: RejectedBullet[]; malformed: number }`
  - `buildRenderPrompt(requirements: ParsedRequirement[], claims: CandidateClaim[]): { system: string; user: string }`
  - `admitBullets(value: unknown, selectedClaimIds: string[]): RenderResult` — throws when the payload is not an object with a `bullets` array.
  - `renderPlainText(bullets: AdmittedBullet[]): string`

Cite check: a bullet is admitted only if it cites at least one id and **every** cited id is in `selectedClaimIds`. A bullet citing any unknown id is rejected whole — partial credit would let a hallucinated citation ride along beside a real one. `position` is assigned per section in admission order, starting at 0.

- [ ] **Step 1: Write the failing tests**

Create `tests/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildRenderPrompt,
  admitBullets,
  renderPlainText,
} from "../supabase/functions/_shared/render.ts";

const SELECTED = ["c-1", "c-2"];

const bullet = (over: Record<string, unknown> = {}) => ({
  section: "Experience",
  text: "Built weekly fraud dashboards in Tableau for the risk leadership team.",
  claim_ids: ["c-1"],
  ...over,
});

describe("buildRenderPrompt", () => {
  it("lists the claim ids the model is allowed to cite", () => {
    const { system, user } = buildRenderPrompt(
      [{ text: "Tableau experience", type: "skill", priority: "required" }],
      [{ id: "c-1", kind: "verified", type: "skill", text: "Tableau dashboards" }],
    );
    expect(user).toContain("c-1");
    expect(system).toContain("claim_ids");
  });
});

describe("admitBullets", () => {
  it("admits a bullet citing a selected claim", () => {
    const result = admitBullets({ bullets: [bullet()] }, SELECTED);
    expect(result.admitted).toHaveLength(1);
    expect(result.admitted[0].claimIds).toEqual(["c-1"]);
    expect(result.admitted[0].position).toBe(0);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a bullet that cites nothing", () => {
    const result = admitBullets({ bullets: [bullet({ claim_ids: [] })] }, SELECTED);
    expect(result.admitted).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/cites no claim/i);
  });

  it("rejects a bullet citing a claim outside the selected set", () => {
    const result = admitBullets({ bullets: [bullet({ claim_ids: ["c-1", "c-outside"] })] }, SELECTED);
    expect(result.admitted).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/not in the selected set/i);
  });

  it("counts malformed entries without dropping valid ones", () => {
    const result = admitBullets(
      { bullets: [bullet(), "nope", bullet({ text: "  " }), bullet({ section: "" })] },
      SELECTED,
    );
    expect(result.admitted).toHaveLength(1);
    expect(result.malformed).toBe(3);
  });

  it("numbers positions per section", () => {
    const result = admitBullets(
      {
        bullets: [
          bullet({ section: "Experience", text: "First." }),
          bullet({ section: "Skills", text: "Second." }),
          bullet({ section: "Experience", text: "Third." }),
        ],
      },
      SELECTED,
    );
    const positions = result.admitted.map((b) => `${b.section}:${b.position}`);
    expect(positions).toEqual(["Experience:0", "Skills:0", "Experience:1"]);
  });

  it("throws when the payload has no bullets array", () => {
    expect(() => admitBullets({ sections: [] }, SELECTED)).toThrow(/bullets/);
  });
});

describe("renderPlainText", () => {
  it("groups bullets under their section headings in position order", () => {
    const result = admitBullets(
      {
        bullets: [
          bullet({ section: "Experience", text: "First." }),
          bullet({ section: "Skills", text: "A skill." }),
          bullet({ section: "Experience", text: "Second." }),
        ],
      },
      SELECTED,
    );
    const text = renderPlainText(result.admitted);
    expect(text).toBe("EXPERIENCE\n- First.\n- Second.\n\nSKILLS\n- A skill.");
  });

  it("returns an empty string for no bullets", () => {
    expect(renderPlainText([])).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `supabase/functions/_shared/render.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all suites pass (27 pre-existing + 27 new = 54 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/render.ts tests/render.test.ts
git commit -m "feat: add grounded rendering module with bullet cite check"
```

---

### Task 5: analyze-jd edge function

**Files:**
- Create: `supabase/functions/analyze-jd/index.ts`
- Modify: `supabase/config.toml` (add function entry)

**Interfaces:**
- Consumes: `buildJdParsePrompt`/`parseJdResponse` (Task 2), `buildCoveragePrompt`/`admitCoverage`/`CandidateClaim` (Task 3), `createAiClient`/`DEFAULT_AI_BASE_URL`/`DEFAULT_AI_MODEL` (existing `_shared/ai-client.ts`), tables from Task 1.
- Produces: POST endpoint `analyze-jd`, body `{ jobDescription: string, jobDescriptionId?: string }`, response `{ success: true, jobDescriptionId, lane, coverage: [{ requirementId, text, type, priority, status, claimIds, rationale }], summary: { requirements, verified, inferred, gaps, malformed, demoted } }`.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/analyze-jd/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { buildJdParsePrompt, parseJdResponse } from "../_shared/jd-parse.ts";
import { buildCoveragePrompt, admitCoverage, type CandidateClaim } from "../_shared/coverage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { jobDescription, jobDescriptionId } = await req.json();
    if (typeof jobDescription !== 'string' || jobDescription.trim() === '') {
      throw new Error('jobDescription is required');
    }

    // The corpus is the whole point: an empty one means "extract claims first",
    // not "you are unqualified for everything".
    const { data: claimRows, error: claimsError } = await supabase
      .from('claims')
      .select('id, kind, type, text')
      .eq('user_id', user.id)
      .eq('status', 'active');
    if (claimsError) {
      throw new Error(`Failed to load claims: ${claimsError.message}`);
    }
    if (!claimRows || claimRows.length === 0) {
      throw new Error('No claims in your corpus yet — extract claims from your documents first');
    }
    const claims: CandidateClaim[] = claimRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      type: c.type,
      text: c.text,
    }));

    const ai = createAiClient({
      baseUrl: Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL,
      apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('LOVABLE_API_KEY')!,
      model: Deno.env.get('AI_MODEL') || DEFAULT_AI_MODEL,
    });

    // 1. Parse the posting into structured requirements.
    const parsePrompt = buildJdParsePrompt(jobDescription);
    const parsed = parseJdResponse(await ai.chatJson(parsePrompt));
    if (parsed.requirements.length === 0) {
      throw new Error('No requirements could be parsed from this text — is it a job posting?');
    }
    console.log('Parsed requirements:', parsed.requirements.length, 'malformed:', parsed.malformed.length);

    // 2. Match requirements against the corpus and pick a lane.
    const coveragePrompt = buildCoveragePrompt(parsed.requirements, claims);
    const result = admitCoverage(
      await ai.chatJson(coveragePrompt),
      parsed.requirements.length,
      claims,
    );
    console.log(
      'Coverage — demoted:', result.demoted.length,
      'malformed:', result.malformed.length,
      'laneFallback:', result.laneFallback,
    );

    // 3. Persist. Upsert the posting first so requirements have a parent.
    let jdId = jobDescriptionId as string | undefined;
    const laneDecision = { ...result.lane, laneFallback: result.laneFallback };

    if (jdId) {
      const { error } = await supabase
        .from('job_descriptions')
        .update({ title: parsed.title, company: parsed.company, lane_decision: laneDecision })
        .eq('id', jdId)
        .eq('user_id', user.id);
      if (error) {
        throw new Error(`Failed to update job description: ${error.message}`);
      }
    } else {
      const { data: row, error } = await supabase
        .from('job_descriptions')
        .insert({
          user_id: user.id,
          title: parsed.title,
          company: parsed.company,
          description: jobDescription,
          lane_decision: laneDecision,
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to create job description: ${error?.message}`);
      }
      jdId = row.id;
    }

    // Idempotent re-analysis: requirements cascade to coverage and citations.
    const { error: deleteError } = await supabase
      .from('jd_requirements')
      .delete()
      .eq('job_description_id', jdId)
      .eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Failed to clear previous requirements: ${deleteError.message}`);
    }

    const responseCoverage: {
      requirementId: string;
      text: string;
      type: string;
      priority: string;
      status: string;
      claimIds: string[];
      rationale: string | null;
    }[] = [];

    for (let i = 0; i < parsed.requirements.length; i++) {
      const requirement = parsed.requirements[i];
      const entry = result.coverage[i];

      const { data: reqRow, error: reqError } = await supabase
        .from('jd_requirements')
        .insert({
          job_description_id: jdId,
          user_id: user.id,
          text: requirement.text,
          type: requirement.type,
          priority: requirement.priority,
          position: i,
        })
        .select('id')
        .single();
      if (reqError || !reqRow) {
        throw new Error(`Failed to insert requirement: ${reqError?.message}`);
      }

      const { data: covRow, error: covError } = await supabase
        .from('requirement_coverage')
        .insert({
          requirement_id: reqRow.id,
          user_id: user.id,
          status: entry.status,
          rationale: entry.rationale,
        })
        .select('id')
        .single();
      if (covError || !covRow) {
        throw new Error(`Failed to insert coverage: ${covError?.message}`);
      }

      if (entry.claimIds.length > 0) {
        const { error: linkError } = await supabase
          .from('coverage_claims')
          .insert(entry.claimIds.map((claimId) => ({ coverage_id: covRow.id, claim_id: claimId })));
        if (linkError) {
          throw new Error(`Failed to insert coverage claims: ${linkError.message}`);
        }
      }

      responseCoverage.push({
        requirementId: reqRow.id,
        text: requirement.text,
        type: requirement.type,
        priority: requirement.priority,
        status: entry.status,
        claimIds: entry.claimIds,
        rationale: entry.rationale,
      });
    }

    const counts = (status: string) => responseCoverage.filter((c) => c.status === status).length;

    return new Response(
      JSON.stringify({
        success: true,
        jobDescriptionId: jdId,
        lane: laneDecision,
        coverage: responseCoverage,
        summary: {
          requirements: responseCoverage.length,
          verified: counts('verified'),
          inferred: counts('inferred'),
          gaps: counts('gap'),
          malformed: parsed.malformed.length + result.malformed.length,
          demoted: result.demoted.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing job description:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
```

- [ ] **Step 2: Register the function**

Append to `supabase/config.toml`:

```toml

[functions.analyze-jd]
verify_jwt = true
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyze-jd/index.ts supabase/config.toml
git commit -m "feat: add analyze-jd edge function"
```

Deployment happens in Task 6 once both functions exist, so the two are deployed together.

---

### Task 6: render-grounded edge function

**Files:**
- Create: `supabase/functions/render-grounded/index.ts`
- Modify: `supabase/config.toml` (add function entry)

**Interfaces:**
- Consumes: `buildRenderPrompt`/`admitBullets`/`renderPlainText` (Task 4), `CandidateClaim` (Task 3), `createAiClient`/defaults (existing), tables and columns from Task 1, data written by Task 5.
- Produces: POST endpoint `render-grounded`, body `{ jobDescriptionId: string, resumeId?: string }`, response `{ success: true, resumeId, summary: { bullets, rejectedBullets, malformed, claimsUsed, requirementsAddressed } }`.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/render-grounded/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { buildRenderPrompt, admitBullets, renderPlainText } from "../_shared/render.ts";
import type { CandidateClaim } from "../_shared/coverage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { jobDescriptionId, resumeId } = await req.json();
    if (typeof jobDescriptionId !== 'string' || jobDescriptionId === '') {
      throw new Error('jobDescriptionId is required');
    }

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('id, title, company, lane_decision')
      .eq('id', jobDescriptionId)
      .eq('user_id', user.id)
      .single();
    if (jdError || !jd) {
      throw new Error('Job description not found');
    }
    const laneDecision = jd.lane_decision as { selected?: { claimIds?: string[] } } | null;
    const laneClaimIds: string[] = laneDecision?.selected?.claimIds ?? [];
    if (laneClaimIds.length === 0) {
      throw new Error('No lane decision on this posting — run analyze-jd first');
    }

    // Requirements and their coverage were decided by analyze-jd; this function
    // never re-derives them, so what the user saw is what gets written.
    const { data: requirements, error: reqError } = await supabase
      .from('jd_requirements')
      .select('id, text, type, priority, position, requirement_coverage(id, status, coverage_claims(claim_id))')
      .eq('job_description_id', jobDescriptionId)
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    if (reqError) {
      throw new Error(`Failed to load requirements: ${reqError.message}`);
    }
    if (!requirements || requirements.length === 0) {
      throw new Error('No requirements for this posting — run analyze-jd first');
    }

    // Selected claims = cited by non-gap coverage AND inside the chosen lane.
    const laneSet = new Set(laneClaimIds);
    const citedIds = new Set<string>();
    let requirementsAddressed = 0;
    for (const r of requirements as unknown as {
      requirement_coverage: { status: string; coverage_claims: { claim_id: string }[] }[] | null;
    }[]) {
      const coverage = Array.isArray(r.requirement_coverage) ? r.requirement_coverage[0] : r.requirement_coverage;
      if (!coverage || coverage.status === 'gap') continue;
      const inLane = (coverage.coverage_claims ?? []).map((cc) => cc.claim_id).filter((id) => laneSet.has(id));
      if (inLane.length > 0) requirementsAddressed++;
      for (const id of inLane) citedIds.add(id);
    }
    if (citedIds.size === 0) {
      throw new Error('No claims in the selected lane cover any requirement — nothing to write from');
    }

    const { data: claimRows, error: claimsError } = await supabase
      .from('claims')
      .select('id, kind, type, text')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('id', Array.from(citedIds));
    if (claimsError) {
      throw new Error(`Failed to load claims: ${claimsError.message}`);
    }
    const claims: CandidateClaim[] = (claimRows ?? []).map((c) => ({
      id: c.id,
      kind: c.kind,
      type: c.type,
      text: c.text,
    }));

    const ai = createAiClient({
      baseUrl: Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL,
      apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('LOVABLE_API_KEY')!,
      model: Deno.env.get('AI_MODEL') || DEFAULT_AI_MODEL,
    });

    const renderPrompt = buildRenderPrompt(
      (requirements as unknown as { text: string; type: string; priority: string }[]).map((r) => ({
        text: r.text,
        type: r.type as "skill" | "experience" | "credential" | "responsibility",
        priority: r.priority as "required" | "preferred",
      })),
      claims,
    );
    const rendered = admitBullets(await ai.chatJson(renderPrompt), claims.map((c) => c.id));
    console.log('Bullets admitted:', rendered.admitted.length, 'rejected:', rendered.rejected.length);
    if (rendered.admitted.length === 0) {
      throw new Error(
        `Every bullet failed the citation check (${rendered.rejected.length} rejected) — no resume was written`,
      );
    }

    const content = renderPlainText(rendered.admitted);
    const title = `${jd.title ?? 'Untitled role'}${jd.company ? ` at ${jd.company}` : ''}`;

    let finalResumeId = resumeId as string | undefined;
    if (finalResumeId) {
      const { error } = await supabase
        .from('generated_resumes')
        .update({ title, content, lane_decision: jd.lane_decision, metadata: { engine: 'v2' } })
        .eq('id', finalResumeId)
        .eq('user_id', user.id);
      if (error) {
        throw new Error(`Failed to update resume: ${error.message}`);
      }
      const { error: clearError } = await supabase
        .from('resume_bullets')
        .delete()
        .eq('resume_id', finalResumeId)
        .eq('user_id', user.id);
      if (clearError) {
        throw new Error(`Failed to clear previous bullets: ${clearError.message}`);
      }
    } else {
      const { data: row, error } = await supabase
        .from('generated_resumes')
        .insert({
          user_id: user.id,
          job_description_id: jobDescriptionId,
          title,
          content,
          format: 'plain_text',
          lane_decision: jd.lane_decision,
          metadata: { engine: 'v2' },
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to create resume: ${error?.message}`);
      }
      finalResumeId = row.id;
    }

    for (const bullet of rendered.admitted) {
      const { data: bulletRow, error: bulletError } = await supabase
        .from('resume_bullets')
        .insert({
          resume_id: finalResumeId,
          user_id: user.id,
          section: bullet.section,
          position: bullet.position,
          text: bullet.text,
        })
        .select('id')
        .single();
      if (bulletError || !bulletRow) {
        throw new Error(`Failed to insert bullet: ${bulletError?.message}`);
      }
      const { error: citeError } = await supabase
        .from('bullet_claims')
        .insert(bullet.claimIds.map((claimId) => ({ bullet_id: bulletRow.id, claim_id: claimId })));
      if (citeError) {
        throw new Error(`Failed to insert bullet citations: ${citeError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        resumeId: finalResumeId,
        summary: {
          bullets: rendered.admitted.length,
          rejectedBullets: rendered.rejected.length,
          malformed: rendered.malformed,
          claimsUsed: claims.length,
          requirementsAddressed,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error rendering grounded resume:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
```

- [ ] **Step 2: Register the function**

Append to `supabase/config.toml`:

```toml

[functions.render-grounded]
verify_jwt = true
```

- [ ] **Step 3: Deploy both functions**

The Supabase MCP deploy tool targets the wrong project. Deploy through the Lovable agent with `mcp__plugin_lovable_lovable__send_message`, `project_id: "b25051a7-ba3d-41a7-8944-7015a774850b"`, supplying the EXACT contents of these five files and instructing it to change nothing else:

- `supabase/functions/_shared/jd-parse.ts`
- `supabase/functions/_shared/coverage.ts`
- `supabase/functions/_shared/render.ts`
- `supabase/functions/analyze-jd/index.ts`
- `supabase/functions/render-grounded/index.ts`

plus the two `supabase/config.toml` entries, then deploy `analyze-jd` and `render-grounded`.

- [ ] **Step 4: Verify deployment parity and reachability**

```bash
git fetch origin
git diff HEAD origin/main -- supabase/functions/_shared supabase/functions/analyze-jd supabase/functions/render-grounded supabase/config.toml
```

Expected: empty output (the deployed copies are byte-identical to this branch).

```bash
curl -s -o /dev/null -w "analyze-jd: %{http_code}\n" -X OPTIONS https://tdmeripiyfocaexvoyiu.supabase.co/functions/v1/analyze-jd
curl -s -o /dev/null -w "render-grounded: %{http_code}\n" -X OPTIONS https://tdmeripiyfocaexvoyiu.supabase.co/functions/v1/render-grounded
```

Expected: `200` for both.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/render-grounded/index.ts supabase/config.toml
git commit -m "feat: add render-grounded edge function"
```

---

### Task 7: Eval harness — JD fixtures, coverage metric, uncited-bullet invariant

**Files:**
- Create: `eval/fixtures/ops-analyst/jds/fraud-operations-analyst.txt`, `eval/fixtures/ops-analyst/jds/data-engineer.txt`
- Modify: `eval/run.ts`, `eval/README.md`

**Interfaces:**
- Consumes: `buildJdParsePrompt`/`parseJdResponse` (Task 2), `buildCoveragePrompt`/`admitCoverage`/`CandidateClaim` (Task 3), `buildRenderPrompt`/`admitBullets` (Task 4), plus the existing claim-extraction imports already in `eval/run.ts`.
- Produces: `npm run eval` additionally reports per-posting coverage and an uncited-bullet count, and exits nonzero when uncited bullets > 0 (alongside the existing fabrication invariant).

- [ ] **Step 1: Create the in-lane posting fixture**

Create `eval/fixtures/ops-analyst/jds/fraud-operations-analyst.txt`:

```
Fraud Operations Analyst — Northwind Payments

About the role
You will investigate suspicious payment activity, tune our detection rules, and
give the risk leadership team the reporting they need to act.

What you will do
- Investigate escalated chargeback and dispute cases end to end
- Build and maintain recurring fraud reporting for risk leadership
- Partner with data science to tune alert thresholds and reduce false positives
- Document investigation standards and coach newer analysts

What we are looking for
- 3+ years in fraud, risk, or payment operations
- Strong SQL for querying transaction data
- Experience building dashboards in a BI tool such as Tableau or Looker
- Track record of measurably reducing false positives or fraud losses
- Bachelor's degree or equivalent practical experience

Nice to have
- CAMS, CFE, or similar certification
- Experience onboarding and training analysts
```

- [ ] **Step 2: Create the adjacent-lane posting fixture**

Create `eval/fixtures/ops-analyst/jds/data-engineer.txt`:

```
Senior Data Engineer — Meridian Logistics

About the role
You will own the pipelines that move our warehouse and shipment data, and the
models the analytics team builds on top of them.

What you will do
- Design and operate batch and streaming pipelines in production
- Model warehouse data for downstream analytics consumers
- Own data quality monitoring, alerting, and on-call for pipeline incidents
- Mentor analysts moving into engineering work

What we are looking for
- 5+ years building production data pipelines
- Expert Python and SQL
- Hands-on Airflow or dbt experience
- Kafka or equivalent streaming platform experience in production
- Experience with infrastructure as code and CI/CD for data systems

Nice to have
- Kubernetes experience
- Prior work in logistics or supply chain
```

This posting is deliberately outside the fixture corpus's lane. Its expected result is
mostly gaps — that is the metric working, not failing.

- [ ] **Step 3: Extend the harness**

Replace the contents of `eval/run.ts` with:

```ts
// TAILOR eval harness — Phases 1-2.
// Runs claim extraction over fixture corpora, then (when a fixture has postings
// in jds/) runs JD parsing, coverage matching, and grounded rendering.
// Reports:
//   - fabrication count: admitted verified claims whose quote fails re-verification (MUST be 0)
//   - inference yield: admitted inferred claims whose text appears nowhere verbatim in the corpus
//   - coverage: requirements answered by verified claims / by inference / gap (reported, never gated)
//   - uncited bullets: rendered bullets citing no admitted claim (MUST be 0)
// Usage: AI_API_KEY=... npm run eval

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createAiClient,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
} from "../supabase/functions/_shared/ai-client.ts";
import { extractClaimsFromDocument, type AdmittedClaim } from "../supabase/functions/_shared/claim-extraction.ts";
import { findQuote } from "../supabase/functions/_shared/quote-match.ts";
import { buildJdParsePrompt, parseJdResponse } from "../supabase/functions/_shared/jd-parse.ts";
import { buildCoveragePrompt, admitCoverage, type CandidateClaim } from "../supabase/functions/_shared/coverage.ts";
import { buildRenderPrompt, admitBullets } from "../supabase/functions/_shared/render.ts";

const apiKey = process.env.AI_API_KEY;
if (!apiKey) {
  console.error("AI_API_KEY is required (any OpenAI-compatible provider key; defaults target the Lovable gateway).");
  process.exit(1);
}

const ai = createAiClient({
  baseUrl: process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL,
  apiKey,
  model: process.env.AI_MODEL || DEFAULT_AI_MODEL,
});

const fixturesDir = join(import.meta.dirname!, "fixtures");
const reportsDir = join(import.meta.dirname!, "reports");
mkdirSync(reportsDir, { recursive: true });

let invariantViolations = 0;
let uncitedBulletTotal = 0;

for (const fixture of readdirSync(fixturesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const docsDir = join(fixturesDir, fixture.name, "docs");
  if (!existsSync(docsDir)) continue;
  const docFiles = readdirSync(docsDir).filter((f) => f.endsWith(".txt"));
  if (docFiles.length === 0) continue;

  console.log(`\n=== Fixture: ${fixture.name} (${docFiles.length} docs) ===`);

  const allSources: string[] = [];
  const perDoc: {
    file: string;
    admitted: AdmittedClaim[];
    rejectedReasons: string[];
    malformed: number;
    fabrications: number;
  }[] = [];

  for (const file of docFiles) {
    const text = readFileSync(join(docsDir, file), "utf-8");
    allSources.push(text);
    const result = await extractClaimsFromDocument(text, ai);

    // Fabrication invariant: every admitted verified claim must re-verify.
    let fabrications = 0;
    for (const claim of result.admitted.filter((c) => c.kind === "verified")) {
      if (!findQuote(claim.evidence!.quote, text).found) fabrications++;
    }
    invariantViolations += fabrications;

    perDoc.push({
      file,
      admitted: result.admitted,
      rejectedReasons: result.rejected.map((r) => r.reason),
      malformed: result.malformedCount,
      fabrications,
    });
    console.log(
      `  ${file}: admitted ${result.admitted.length}, rejected ${result.rejected.length}, malformed ${result.malformedCount}, fabrications ${fabrications}`,
    );
  }

  // Inference yield: inferred claims whose text is NOT verbatim anywhere in the corpus.
  const inferred = perDoc.flatMap((d) => d.admitted.filter((c) => c.kind === "inferred"));
  const yieldClaims = inferred.filter((c) => !allSources.some((s) => findQuote(c.text, s).found));

  const totalAdmitted = perDoc.reduce((n, d) => n + d.admitted.length, 0);
  const totalVerified = perDoc.reduce((n, d) => n + d.admitted.filter((c) => c.kind === "verified").length, 0);
  const totalRejected = perDoc.reduce((n, d) => n + d.rejectedReasons.length, 0);
  const totalFabrications = perDoc.reduce((n, d) => n + d.fabrications, 0);

  // The corpus as the matcher sees it. Eval has no database, so claim ids are
  // synthesized positionally — the admit logic only requires them to be stable
  // within a run.
  const corpusClaims: CandidateClaim[] = perDoc.flatMap((d, docIndex) =>
    d.admitted.map((c) => ({
      id: `${docIndex}-${c.index}`,
      kind: c.kind as CandidateClaim["kind"],
      type: c.type,
      text: c.text,
    })),
  );

  const postingReports: string[] = [];
  const jdsDir = join(fixturesDir, fixture.name, "jds");
  const jdFiles = existsSync(jdsDir) ? readdirSync(jdsDir).filter((f) => f.endsWith(".txt")) : [];

  for (const jdFile of jdFiles) {
    const jdText = readFileSync(join(jdsDir, jdFile), "utf-8");

    const parsed = parseJdResponse(await ai.chatJson(buildJdParsePrompt(jdText)));
    if (parsed.requirements.length === 0) {
      console.log(`  ${jdFile}: no requirements parsed — skipped`);
      postingReports.push(`### ${jdFile}\n\n_No requirements parsed._\n`);
      continue;
    }

    const coverage = admitCoverage(
      await ai.chatJson(buildCoveragePrompt(parsed.requirements, corpusClaims)),
      parsed.requirements.length,
      corpusClaims,
    );
    const covered = (status: string) => coverage.coverage.filter((c) => c.status === status).length;

    // Render from the selected lane ∩ cited claims, then re-apply the cite check.
    const laneSet = new Set(coverage.lane.selected.claimIds);
    const selectedIds = Array.from(
      new Set(
        coverage.coverage
          .filter((c) => c.status !== "gap")
          .flatMap((c) => c.claimIds)
          .filter((id) => laneSet.has(id)),
      ),
    );
    const selectedClaims = corpusClaims.filter((c) => selectedIds.includes(c.id));

    let bulletCount = 0;
    let rejectedCount = 0;
    let uncited = 0;
    if (selectedClaims.length > 0) {
      const rendered = admitBullets(
        await ai.chatJson(buildRenderPrompt(parsed.requirements, selectedClaims)),
        selectedIds,
      );
      bulletCount = rendered.admitted.length;
      rejectedCount = rendered.rejected.length;
      // Independent re-check of the admit gate, in the same spirit as the
      // fabrication re-verification above: assert the property from OUTSIDE the
      // function that is supposed to guarantee it, so a regression inside
      // admitBullets surfaces here instead of in production. Counting
      // `rendered.rejected` here instead would be meaningless — rejected
      // bullets never reach a page, and a model attempting one is a quality
      // signal, not an invariant violation.
      const selectedSet = new Set(selectedIds);
      uncited = rendered.admitted.filter(
        (b) => b.claimIds.length === 0 || b.claimIds.some((id) => !selectedSet.has(id)),
      ).length;
      uncitedBulletTotal += uncited;
    }

    console.log(
      `  ${jdFile}: requirements ${parsed.requirements.length}, verified ${covered("verified")}, inferred ${covered("inferred")}, gaps ${covered("gap")}, bullets ${bulletCount}, rejected ${rejectedCount}, uncited ${uncited}`,
    );

    postingReports.push(
      [
        `### ${jdFile}`,
        ``,
        `Lane: **${coverage.lane.selected.name}**${coverage.laneFallback ? " _(fallback — no usable lane proposed)_" : ""} — ${coverage.lane.rationale || "no rationale given"}`,
        ``,
        `| Metric | Value |`,
        `|---|---|`,
        `| Requirements | ${parsed.requirements.length} |`,
        `| Covered by verified claims | ${covered("verified")} |`,
        `| Covered by inference | ${covered("inferred")} |`,
        `| Gaps | ${covered("gap")} |`,
        `| Bullets rendered | ${bulletCount} |`,
        `| Bullets rejected by the cite check | ${rejectedCount} |`,
        `| **Uncited bullets (must be 0)** | **${uncited}** |`,
        ``,
        `Gaps:`,
        ``,
        ...(covered("gap") > 0
          ? coverage.coverage
              .filter((c) => c.status === "gap")
              .map((c) => `- ${parsed.requirements[c.requirementIndex].text}`)
          : ["_None._"]),
        ``,
      ].join("\n"),
    );
  }

  const lines = [
    `# Eval report: ${fixture.name}`,
    ``,
    `Run: ${new Date().toISOString()} · model: ${process.env.AI_MODEL || DEFAULT_AI_MODEL}`,
    ``,
    `## Corpus`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Admitted claims | ${totalAdmitted} |`,
    `| — verified | ${totalVerified} |`,
    `| — inferred | ${inferred.length} |`,
    `| **Inference yield** (inferred, nowhere verbatim in corpus) | **${yieldClaims.length}** |`,
    `| Rejected by admit gate | ${totalRejected} |`,
    `| **Fabrications (must be 0)** | **${totalFabrications}** |`,
    ``,
    `## Inference-yield claims`,
    ``,
    ...(yieldClaims.length > 0
      ? yieldClaims.map((c) => `- **${c.text}** (${c.type}) — ${c.reasoning ?? "no reasoning"}`)
      : ["_None._"]),
    ``,
    `## Rejections`,
    ``,
    ...perDoc.flatMap((d) => d.rejectedReasons.map((r) => `- ${d.file}: ${r}`)),
    ``,
    `## Postings`,
    ``,
    ...(postingReports.length > 0 ? postingReports : ["_No postings in jds/._"]),
  ];

  const reportPath = join(reportsDir, `${fixture.name}.md`);
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`  Report: ${reportPath} — inference yield ${yieldClaims.length}, fabrications ${totalFabrications}`);
}

if (invariantViolations > 0) {
  console.error(`\nFABRICATION INVARIANT VIOLATED: ${invariantViolations} admitted claims failed re-verification.`);
  process.exit(1);
}
if (uncitedBulletTotal > 0) {
  console.error(`\nCITATION INVARIANT VIOLATED: ${uncitedBulletTotal} admitted bullets cite no claim.`);
  process.exit(1);
}
console.log("\nFabrication invariant holds (0 violations). Citation invariant holds (0 uncited bullets).");
```

- [ ] **Step 4: Update the eval README**

Replace the "Metrics:" section of `eval/README.md` with:

```markdown
Metrics:
- **Fabrications** — admitted verified claims whose quote fails re-verification.
  Must always be 0; the harness exits nonzero otherwise.
- **Inference yield** — admitted inferred claims whose text appears nowhere
  verbatim in the corpus. This is the product's primary quality metric: higher
  is better, at zero fabrication.
- **Coverage** — per posting in `fixtures/<name>/jds/*.txt`: requirements covered
  by verified claims, by inference, or left as gaps. Reported, never gated — a
  posting the corpus genuinely cannot answer *should* show gaps, and gating that
  number would reward claiming coverage the evidence does not support.
- **Uncited bullets** — admitted bullets that cite nothing, or cite a claim that
  was not offered to the model, re-checked independently of the admit gate that
  is supposed to prevent both. Must always be 0; the harness exits nonzero
  otherwise. (Bullets the model wrote and the gate *rejected* are reported
  separately as a quality signal — a rejection is the system working.)

To eval your own documents, create `fixtures/personal/docs/` and drop `.txt`
exports in it — that directory is gitignored. Postings go in
`fixtures/<name>/jds/`.
```

- [ ] **Step 5: Run the harness with no key to confirm the guard still fires**

Run: `npm run eval`
Expected: exits 1 with `AI_API_KEY is required (...)`.

- [ ] **Step 6: Run the harness live**

```bash
set -a; source .env.eval; set +a
npm run eval
```

Expected: per-document extraction lines, then one line per posting with requirement/coverage/bullet counts, a report at `eval/reports/ops-analyst.md` containing a `## Postings` section, `Fabrication invariant holds (0 violations). Citation invariant holds (0 uncited bullets).`, and exit code 0. The `data-engineer.txt` posting is expected to show mostly gaps.

- [ ] **Step 7: Commit**

```bash
git add eval/run.ts eval/README.md eval/fixtures/ops-analyst/jds/
git commit -m "feat: add coverage metric and citation invariant to eval harness"
```

---

### Task 8: Generate page — engine toggle and coverage panel

**Files:**
- Create: `src/components/CoveragePanel.tsx`
- Modify: `src/pages/Generate.tsx`

**Interfaces:**
- Consumes: `analyze-jd` and `render-grounded` endpoints (Tasks 5-6).
- Produces: `CoveragePanel` component taking `{ coverage: CoverageRow[]; lane: LaneInfo; summary: CoverageSummary }`; a v1/v2 toggle on `/generate`.

- [ ] **Step 1: Create the coverage panel component**

Create `src/components/CoveragePanel.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lightbulb, CircleSlash, Route } from "lucide-react";

export interface CoverageRow {
  requirementId: string;
  text: string;
  type: string;
  priority: string;
  status: "verified" | "inferred" | "gap";
  claimIds: string[];
  rationale: string | null;
}

export interface LaneInfo {
  selected: { name: string; claimIds: string[] };
  rationale: string;
  competing: { name: string; claimIds: string[] }[];
  laneFallback?: boolean;
}

export interface CoverageSummary {
  requirements: number;
  verified: number;
  inferred: number;
  gaps: number;
}

const STATUS_META = {
  verified: { label: "Verified", icon: CheckCircle2, className: "text-success" },
  inferred: { label: "Inferred", icon: Lightbulb, className: "text-warning" },
  gap: { label: "Gap", icon: CircleSlash, className: "text-muted-foreground" },
} as const;

export const CoveragePanel = ({
  coverage,
  lane,
  summary,
}: {
  coverage: CoverageRow[];
  lane: LaneInfo;
  summary: CoverageSummary;
}) => {
  return (
    <Card className="p-6 bg-card shadow-soft">
      <div className="flex items-start gap-3 mb-4">
        <Route className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {lane.selected.name}
            {lane.laneFallback && (
              <span className="ml-2 text-xs text-muted-foreground">(no distinct lane found)</span>
            )}
          </h3>
          {lane.rationale && <p className="text-sm text-muted-foreground">{lane.rationale}</p>}
          {lane.competing.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Not chosen: {lane.competing.map((c) => c.name).join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Badge variant="default">{summary.verified} verified</Badge>
        <Badge variant="secondary">{summary.inferred} inferred</Badge>
        <Badge variant="outline">{summary.gaps} gaps</Badge>
        <span className="text-xs text-muted-foreground self-center">
          of {summary.requirements} requirements
        </span>
      </div>

      <div className="space-y-2">
        {coverage.map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.icon;
          return (
            <div key={row.requirementId} className="flex items-start gap-2 border-b border-border/40 pb-2">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.className}`} />
              <div className="flex-1">
                <p className="text-sm text-foreground">{row.text}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {row.priority} · {row.type} · {meta.label}
                    {row.claimIds.length > 0 && ` · ${row.claimIds.length} claim${row.claimIds.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {row.rationale && (
                  <p className="text-xs text-muted-foreground italic mt-1">{row.rationale}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
```

- [ ] **Step 2: Add the toggle and v2 flow to the Generate page**

In `src/pages/Generate.tsx`, replace the import block on lines 1-11 with:

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Sparkles, FileText, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  CoveragePanel,
  type CoverageRow,
  type LaneInfo,
  type CoverageSummary,
} from "@/components/CoveragePanel";
```

Replace the state declarations on lines 17-18 with:

```tsx
  const [jobDescription, setJobDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [engine, setEngine] = useState<"v1" | "v2">("v1");
  const [coverage, setCoverage] = useState<
    { rows: CoverageRow[]; lane: LaneInfo; summary: CoverageSummary } | null
  >(null);
```

Replace the whole `handleGenerate` function (lines 26-60) with:

```tsx
  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      toast({
        title: "Job description required",
        description: "Please enter a job description to generate resumes",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setCoverage(null);
    try {
      if (engine === "v1") {
        const { data, error } = await supabase.functions.invoke("generate-resume", {
          body: { jobDescription },
        });
        if (error) throw error;
        toast({
          title: "Resume generated!",
          description: `Your resume has been created with an ATS score of ${data.resume?.ats_score ?? "—"}%`,
        });
        navigate("/resumes");
        return;
      }

      // v2: analyze first so the coverage map is on screen before the resume is written.
      const { data: analysis, error: analyzeError } = await supabase.functions.invoke("analyze-jd", {
        body: { jobDescription },
      });
      if (analyzeError) throw analyzeError;

      setCoverage({
        rows: analysis.coverage,
        lane: analysis.lane,
        summary: analysis.summary,
      });
      toast({
        title: "Coverage mapped",
        description: `${analysis.summary.verified} verified, ${analysis.summary.inferred} inferred, ${analysis.summary.gaps} gaps — writing the resume now`,
      });

      const { data: render, error: renderError } = await supabase.functions.invoke("render-grounded", {
        body: { jobDescriptionId: analysis.jobDescriptionId },
      });
      if (renderError) throw renderError;

      toast({
        title: "Resume generated!",
        description: `${render.summary.bullets} bullets, every one backed by a claim`,
      });
      navigate("/resumes");
    } catch (error) {
      console.error("Generation error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };
```

- [ ] **Step 3: Render the toggle and the panel**

In `src/pages/Generate.tsx`, replace the button row (lines 101-122, the `<div className="flex items-center gap-3 mt-4">` block) with:

```tsx
              <div className="flex items-center gap-2 mt-4">
                <span className="text-sm text-muted-foreground mr-1">Engine:</span>
                <Button
                  size="sm"
                  variant={engine === "v1" ? "default" : "outline"}
                  onClick={() => setEngine("v1")}
                >
                  v1
                </Button>
                <Button
                  size="sm"
                  variant={engine === "v2" ? "default" : "outline"}
                  onClick={() => setEngine("v2")}
                >
                  v2 (grounded)
                </Button>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <Button variant="outline" className="flex-1">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </Button>
                <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
                  <Button
                    className="w-full bg-gradient-primary"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>Generating...</>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Resumes
                      </>
                    )}
                  </Button>
                </motion.div>
              </div>
```

Then, immediately after the closing `</Card>` of the Job Description card (line 123 in the original file), add:

```tsx
            {coverage && (
              <CoveragePanel coverage={coverage.rows} lane={coverage.lane} summary={coverage.summary} />
            )}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/CoveragePanel.tsx src/pages/Generate.tsx
git commit -m "feat: add v1/v2 engine toggle and coverage panel to Generate page"
```

---

### Task 9: Render v2 resumes from their bullets

**Files:**
- Create: `src/components/V2ResumeContent.tsx`
- Modify: `src/pages/Resumes.tsx:24` (import), `src/pages/Resumes.tsx:887` (conditional render)

**Interfaces:**
- Consumes: `resume_bullets` table (Task 1), `generated_resumes.metadata.engine` written by Task 6.
- Produces: `V2ResumeContent` component taking `{ resumeId: string; fallbackContent: string }`.

- [ ] **Step 1: Create the v2 renderer**

Create `src/components/V2ResumeContent.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Bullet {
  id: string;
  section: string;
  position: number;
  text: string;
}

export const V2ResumeContent = ({
  resumeId,
  fallbackContent,
}: {
  resumeId: string;
  fallbackContent: string;
}) => {
  const { data: bullets, isLoading } = useQuery({
    queryKey: ["resume-bullets", resumeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resume_bullets")
        .select("id, section, position, text")
        .eq("resume_id", resumeId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as Bullet[];
    },
  });

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  // A v2 resume with no bullet rows means its claims were re-extracted out from
  // under it; the stored text is still the honest record of what was generated.
  if (!bullets || bullets.length === 0) {
    return <pre className="whitespace-pre-wrap font-sans text-xs text-foreground">{fallbackContent}</pre>;
  }

  const sections: string[] = [];
  const bySection = new Map<string, Bullet[]>();
  for (const b of bullets) {
    if (!bySection.has(b.section)) {
      bySection.set(b.section, []);
      sections.push(b.section);
    }
    bySection.get(b.section)!.push(b);
  }

  return (
    <div className="text-xs text-foreground space-y-4">
      {sections.map((section) => (
        <div key={section}>
          <h4 className="font-semibold uppercase tracking-wide text-foreground mb-1">{section}</h4>
          <ul className="space-y-1">
            {bySection
              .get(section)!
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((b) => (
                <li key={b.id} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span>{b.text}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Import it in the Resumes page**

In `src/pages/Resumes.tsx`, after line 24 (`import { ResumeContent } from "@/components/ResumeContent";`), add:

```tsx
import { V2ResumeContent } from "@/components/V2ResumeContent";
```

- [ ] **Step 3: Render v2 resumes from bullets**

In `src/pages/Resumes.tsx`, replace line 887:

```tsx
                <ResumeContent content={previewResume?.content || ''} />
```

with:

```tsx
                {previewResume?.metadata?.engine === 'v2' ? (
                  <V2ResumeContent
                    resumeId={previewResume.id}
                    fallbackContent={previewResume.content || ''}
                  />
                ) : (
                  <ResumeContent content={previewResume?.content || ''} />
                )}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all suites pass (54 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/V2ResumeContent.tsx src/pages/Resumes.tsx
git commit -m "feat: render v2 resumes from their bullet rows"
```

---

### Task 10: Live end-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: evidence that the pipeline works against the live database, and that the citation invariant holds in production data.

- [ ] **Step 1: Create a disposable test user and corpus**

The Chrome extension is unavailable, so verify at the API layer. `ANON` is the
`VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.

```bash
ANON="<VITE_SUPABASE_PUBLISHABLE_KEY from .env>"
curl -s -X POST "https://tdmeripiyfocaexvoyiu.supabase.co/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"tailor.p2.e2e@gettailor.ai","password":"E2e-Test-2026-Tailor!"}' | head -c 200
```

Expected: JSON containing an `access_token`.

Note: zsh's `UID` is readonly — name the shell variable something else (e.g. `TUID`).

```bash
JWT=$(curl -s -X POST "https://tdmeripiyfocaexvoyiu.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"tailor.p2.e2e@gettailor.ai","password":"E2e-Test-2026-Tailor!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
TUID=$(python3 -c "import base64,json;t='$JWT'.split('.')[1];t+='='*(-len(t)%4);print(json.loads(base64.urlsafe_b64decode(t))['sub'])")
DOC=$(curl -s -X POST "https://tdmeripiyfocaexvoyiu.supabase.co/rest/v1/documents" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"user_id\":\"$TUID\",\"name\":\"p2-e2e.txt\",\"type\":\"experience\",\"file_path\":\"e2e/p2.txt\",\"extracted_text\":\"$(sed 's/"/\\"/g; s/$/\\n/' eval/fixtures/ops-analyst/docs/resume.txt | tr -d '\n')\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST "https://tdmeripiyfocaexvoyiu.supabase.co/functions/v1/extract-claims" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC\"}"
```

Expected: `{"success":true,"summary":{"admitted":N,...}}` with N > 0.

- [ ] **Step 2: Run analyze-jd**

```bash
JD=$(python3 -c "print(open('eval/fixtures/ops-analyst/jds/fraud-operations-analyst.txt').read())" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))")
curl -s -X POST "https://tdmeripiyfocaexvoyiu.supabase.co/functions/v1/analyze-jd" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"jobDescription\": $JD}" > /tmp/analyze.json
python3 -c "
import json; d=json.load(open('/tmp/analyze.json'))
print('summary:', d.get('summary'))
print('lane:', d.get('lane',{}).get('selected',{}).get('name'))
print('jdId:', d.get('jobDescriptionId'))
"
```

Expected: a summary with `requirements` > 0 and `verified` + `inferred` > 0, a lane name, and a job description id.

- [ ] **Step 3: Run render-grounded**

```bash
JDID=$(python3 -c "import json;print(json.load(open('/tmp/analyze.json'))['jobDescriptionId'])")
curl -s -X POST "https://tdmeripiyfocaexvoyiu.supabase.co/functions/v1/render-grounded" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"jobDescriptionId\":\"$JDID\"}"
```

Expected: `{"success":true,"resumeId":"...","summary":{"bullets":N,...}}` with N > 0.

- [ ] **Step 4: Assert the citation invariant in SQL**

Via `mcp__plugin_lovable_lovable__query_database`:

```sql
SELECT
  (SELECT count(*) FROM public.resume_bullets b
     WHERE NOT EXISTS (SELECT 1 FROM public.bullet_claims bc WHERE bc.bullet_id = b.id)) AS uncited_bullets,
  (SELECT count(*) FROM public.bullet_claims bc
     JOIN public.resume_bullets b ON b.id = bc.bullet_id
     JOIN public.claims c ON c.id = bc.claim_id
     WHERE c.user_id <> b.user_id) AS cross_user_citations,
  (SELECT count(*) FROM public.coverage_claims cc
     JOIN public.requirement_coverage rc ON rc.id = cc.coverage_id
     JOIN public.claims c ON c.id = cc.claim_id
     WHERE c.user_id <> rc.user_id) AS cross_user_coverage;
```

Expected: `0` for all three. A nonzero `uncited_bullets` means the cite check failed
and must be fixed before this task passes.

- [ ] **Step 5: Verify idempotent re-analysis**

Re-run the Step 2 command with the same posting text, then:

```sql
SELECT count(*) AS requirement_rows
FROM public.jd_requirements
WHERE job_description_id = '<JDID from step 3>';
```

Expected: the same count as the first run — not doubled.

- [ ] **Step 6: Clean up test data**

Via `query_database`:

```sql
DELETE FROM public.documents WHERE id = '<DOC id>';
DELETE FROM public.job_descriptions WHERE id = '<JDID>';
DELETE FROM auth.users WHERE email = 'tailor.p2.e2e@gettailor.ai';
SELECT
  (SELECT count(*) FROM public.claims) AS claims_left,
  (SELECT count(*) FROM public.resume_bullets) AS bullets_left,
  (SELECT count(*) FROM auth.users WHERE email LIKE 'tailor.p2%') AS users_left;
```

Expected: all zero (assuming no other test data is present).

- [ ] **Step 7: Record the results**

No commit — this task's deliverable is the evidence recorded in the task report:
the analyze-jd summary, the render-grounded summary, the three SQL invariant counts,
and the idempotency count.

---

## Verification checklist (whole phase)

- `npm test` passes (quote-match, ai-client, claim-extraction, jd-parse, coverage, render — 54 tests).
- `npm run build` passes.
- `npm run eval` with `.env.eval` sourced: fabrications 0, uncited bullets 0, exit 0, and `eval/reports/ops-analyst.md` contains a `## Postings` section showing coverage for both fixtures, with the data-engineer posting showing mostly gaps.
- `/generate` with the v2 toggle produces a coverage panel and then a resume; `/resumes` shows that resume rendered from its bullets.
- Live SQL: zero uncited bullets, zero cross-user citations, re-analysis does not duplicate requirement rows.
