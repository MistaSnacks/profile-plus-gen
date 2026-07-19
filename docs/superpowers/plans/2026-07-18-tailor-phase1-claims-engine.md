# TAILOR Phase 1: Corpus Claims Engine + Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the claims/evidence corpus layer — model-proposed, code-admitted claims with verbatim evidence quotes — plus a corpus review page and a local eval harness measuring fabrication and inference yield.

**Architecture:** New dependency-free TypeScript modules in `supabase/functions/_shared/` (quote matching, AI client, claim extraction) are unit-tested with vitest under Node and deployed inside a new `extract-claims` Deno edge function. New Postgres tables (`claims`, `claim_evidence`, `claim_links`) with RLS hold the corpus. A React page (`/corpus`) lists and moderates claims. A tsx script (`eval/run.ts`) runs extraction over fixture corpora and reports metrics.

**Tech Stack:** Vite + React 18 + shadcn/Tailwind + framer-motion (existing), Supabase (Lovable-managed, project `tdmeripiyfocaexvoyiu`) with Deno edge functions, vitest + tsx (new devDependencies), OpenAI-compatible chat completions via Lovable AI gateway.

## Global Constraints

- **Model-agnostic:** all model calls go through `_shared/ai-client.ts`; provider config (`baseUrl`, `apiKey`, `model`) is passed in by the caller, never read inside the module. Default gateway: `https://ai.gateway.lovable.dev/v1`, default model `google/gemini-2.5-flash`.
- **Models propose, code admits:** no claim enters the database unless `findQuote` verifies its quote against the source document (verified claims) or all its supporting claims were admitted (inferred claims).
- **Shared modules are dependency-free and runtime-neutral:** no imports, no `Deno.*`, no `process.*` inside `supabase/functions/_shared/*.ts` (except relative imports of each other, always with explicit `.ts` extensions — Deno requires them; vitest resolves them fine).
- **RLS on every new table**, following the existing owner-only policy style in `supabase/migrations/`.
- **Fabrication invariant:** the eval harness must re-verify every admitted verified claim's quote and fail loudly if any does not match (count must be 0).
- **Database changes** are applied with the Supabase MCP tools (`apply_migration`, `generate_typescript_types`) — the project is Lovable-managed and there is no local supabase link. Every migration is also saved under `supabase/migrations/` for the repo record.
- **Follow existing UI patterns:** pages copy the structure of `src/pages/Generate.tsx` (Navigation, useAuth redirect, framer-motion header, shadcn Card/Button, useToast).
- TDD for all pure logic; frequent commits; YAGNI (no dedup, no cross-document claims, no PDF extraction fixes in this phase).

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/functions/_shared/quote-match.ts` | Whitespace/case-normalized verbatim quote matching with original-text offsets |
| `supabase/functions/_shared/ai-client.ts` | Thin OpenAI-compatible chat client returning parsed JSON |
| `supabase/functions/_shared/claim-extraction.ts` | Prompt, response validation, admit/reject logic, orchestration |
| `supabase/functions/extract-claims/index.ts` | Edge function: auth → load doc → extract → persist → summary |
| `supabase/migrations/20260718000000_claims_engine.sql` | claims / claim_evidence / claim_links tables + RLS |
| `src/pages/Corpus.tsx` | Corpus review page: extract per document, list/reject claims |
| `eval/run.ts` | Eval harness: run extraction on fixtures, write metrics report |
| `eval/fixtures/ops-analyst/docs/*.txt` | Synthetic fixture corpus |
| `tests/quote-match.test.ts`, `tests/ai-client.test.ts`, `tests/claim-extraction.test.ts` | Vitest unit tests |

---

### Task 1: Test tooling + quote matcher

**Files:**
- Modify: `package.json` (devDependencies, scripts)
- Create: `supabase/functions/_shared/quote-match.ts`
- Test: `tests/quote-match.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findQuote(quote: string, source: string): QuoteMatch` where `QuoteMatch = { found: boolean; start: number; end: number }` (`start`/`end` are offsets into the ORIGINAL source string, end-exclusive; `-1`/`-1` when not found). Matching is case-insensitive and whitespace-run-insensitive.

- [ ] **Step 1: Install test tooling**

```bash
npm install -D vitest tsx
```

Then add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"eval": "tsx eval/run.ts"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/quote-match.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findQuote } from "../supabase/functions/_shared/quote-match.ts";

describe("findQuote", () => {
  it("finds an exact quote and returns original offsets", () => {
    const source = "Led fraud investigations using SQL and Tableau daily.";
    const result = findQuote("using SQL and Tableau", source);
    expect(result.found).toBe(true);
    expect(source.slice(result.start, result.end)).toBe("using SQL and Tableau");
  });

  it("matches across differing whitespace runs", () => {
    const source = "Built   dashboards\n\nin Tableau for executives.";
    const result = findQuote("Built dashboards in Tableau", source);
    expect(result.found).toBe(true);
    expect(result.start).toBe(0);
    expect(source.slice(result.start, result.end)).toBe("Built   dashboards\n\nin Tableau");
  });

  it("matches case-insensitively", () => {
    const source = "Managed a team of five analysts.";
    expect(findQuote("managed a team", source).found).toBe(true);
  });

  it("returns not-found for absent text", () => {
    const result = findQuote("Kubernetes", "SQL and Tableau experience.");
    expect(result).toEqual({ found: false, start: -1, end: -1 });
  });

  it("returns not-found for an empty or whitespace-only quote", () => {
    expect(findQuote("", "anything").found).toBe(false);
    expect(findQuote("   ", "anything").found).toBe(false);
  });

  it("ignores leading/trailing whitespace in the quote", () => {
    const source = "Reduced chargebacks by 18% in one year.";
    const result = findQuote("  Reduced chargebacks by 18%  ", source);
    expect(result.found).toBe(true);
    expect(source.slice(result.start, result.end)).toBe("Reduced chargebacks by 18%");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/quote-match.test.ts`
Expected: FAIL — cannot resolve `../supabase/functions/_shared/quote-match.ts`.

- [ ] **Step 4: Implement the matcher**

Create `supabase/functions/_shared/quote-match.ts`:

```ts
// Verbatim quote matching, tolerant only of whitespace runs and letter case.
// This is the admit-gate for the claims corpus: a claim whose quote this
// function cannot locate in the source document does not enter the corpus.

export interface QuoteMatch {
  found: boolean;
  /** Offset into the ORIGINAL source string (inclusive). -1 when not found. */
  start: number;
  /** Offset into the ORIGINAL source string (exclusive). -1 when not found. */
  end: number;
}

interface Normalized {
  norm: string;
  /** map[i] = index in the original string of the char that produced norm[i] */
  map: number[];
}

function normalizeWithMap(text: string): Normalized {
  let norm = "";
  const map: number[] = [];
  let lastWasSpace = true; // drops leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        norm += " ";
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      lastWasSpace = false;
    }
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function findQuote(quote: string, source: string): QuoteMatch {
  const notFound: QuoteMatch = { found: false, start: -1, end: -1 };
  const q = normalizeWithMap(quote).norm;
  if (q.length === 0) return notFound;
  const { norm, map } = normalizeWithMap(source);
  const idx = norm.indexOf(q);
  if (idx === -1) return notFound;
  return { found: true, start: map[idx], end: map[idx + q.length - 1] + 1 };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/quote-match.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/quote-match.test.ts supabase/functions/_shared/quote-match.ts
git commit -m "feat: add vitest tooling and verbatim quote matcher"
```

---

### Task 2: Claims schema migration + regenerated types

**Files:**
- Create: `supabase/migrations/20260718000000_claims_engine.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: existing `documents` table.
- Produces: tables `public.claims`, `public.claim_evidence`, `public.claim_links`; enums `claim_kind` (`verified`|`inferred`|`user_attested`), `claim_type` (`skill`|`achievement`|`scope`|`credential`|`role`), `claim_status` (`active`|`rejected`). Date fields are TEXT (`YYYY` or `YYYY-MM`), not DATE.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260718000000_claims_engine.sql`:

```sql
-- TAILOR Phase 1: claims/evidence corpus layer.
-- Claims are model-PROPOSED but code-ADMITTED: a verified claim's evidence
-- quote must literally match its source document before insertion.

CREATE TYPE public.claim_kind AS ENUM ('verified', 'inferred', 'user_attested');
CREATE TYPE public.claim_type AS ENUM ('skill', 'achievement', 'scope', 'credential', 'role');
CREATE TYPE public.claim_status AS ENUM ('active', 'rejected');

CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin_document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  kind public.claim_kind NOT NULL,
  type public.claim_type NOT NULL,
  text TEXT NOT NULL,
  labels TEXT[] NOT NULL DEFAULT '{}',
  reasoning TEXT,
  date_start TEXT,
  date_end TEXT,
  status public.claim_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.claim_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  match_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.claim_links (
  inferred_claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  supporting_claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (inferred_claim_id, supporting_claim_id)
);

CREATE INDEX idx_claims_user ON public.claims(user_id);
CREATE INDEX idx_claims_origin_doc ON public.claims(origin_document_id);
CREATE INDEX idx_claim_evidence_claim ON public.claim_evidence(claim_id);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own claims"
  ON public.claims FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own claim evidence"
  ON public.claim_evidence FOR ALL
  USING (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid()));

CREATE POLICY "Users manage own claim links"
  ON public.claim_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = inferred_claim_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = inferred_claim_id AND c.user_id = auth.uid()));
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `apply_migration` with name `claims_engine` and the exact SQL above.

- [ ] **Step 3: Verify tables exist**

Use MCP `list_tables` (schema `public`). Expected: `claims`, `claim_evidence`, `claim_links` present alongside existing tables.

- [ ] **Step 4: Regenerate TypeScript types**

Use MCP `generate_typescript_types` and overwrite `src/integrations/supabase/types.ts` with the output. Then run `npm run build` — expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718000000_claims_engine.sql src/integrations/supabase/types.ts
git commit -m "feat: add claims, claim_evidence, claim_links tables with RLS"
```

---

### Task 3: Model-agnostic AI client

**Files:**
- Create: `supabase/functions/_shared/ai-client.ts`
- Test: `tests/ai-client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseJsonResponse(raw: string): unknown` — strips markdown code fences, parses JSON, throws `Error("AI returned unparseable JSON: ...")` on failure.
  - `createAiClient(config: AiConfig): AiClient` where `AiConfig = { baseUrl: string; apiKey: string; model: string }` and `AiClient = { chatJson(opts: { system: string; user: string }): Promise<unknown> }`.
  - `DEFAULT_AI_BASE_URL = "https://ai.gateway.lovable.dev/v1"`, `DEFAULT_AI_MODEL = "google/gemini-2.5-flash"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ai-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "../supabase/functions/_shared/ai-client.ts";

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse('{"claims": []}')).toEqual({ claims: [] });
  });

  it("strips ```json fences", () => {
    expect(parseJsonResponse('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(parseJsonResponse('```\n[1, 2]\n```')).toEqual([1, 2]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseJsonResponse('  \n {"a": 1} \n ')).toEqual({ a: 1 });
  });

  it("throws a descriptive error on garbage", () => {
    expect(() => parseJsonResponse("Sure! Here is your resume."))
      .toThrow(/unparseable JSON/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ai-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

Create `supabase/functions/_shared/ai-client.ts`:

```ts
// Thin, provider-agnostic chat client (OpenAI-compatible /chat/completions).
// Config is injected by the caller; this module never reads environment
// variables, so it runs identically under Deno (edge) and Node (eval harness),
// and swapping providers later means changing only the caller's config.

export const DEFAULT_AI_BASE_URL = "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_AI_MODEL = "google/gemini-2.5-flash";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiClient {
  chatJson(opts: { system: string; user: string }): Promise<unknown>;
}

export function parseJsonResponse(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1];
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}

export function createAiClient(config: AiConfig): AiClient {
  return {
    async chatJson({ system, user }) {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      return parseJsonResponse(data.choices[0].message.content);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ai-client.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-client.ts tests/ai-client.test.ts
git commit -m "feat: add model-agnostic AI client module"
```

---

### Task 4: Claim extraction core (propose → admit)

**Files:**
- Create: `supabase/functions/_shared/claim-extraction.ts`
- Test: `tests/claim-extraction.test.ts`

**Interfaces:**
- Consumes: `findQuote` from `./quote-match.ts`; `AiClient` type from `./ai-client.ts`.
- Produces:
  - Types: `ClaimType`, `ProposedClaim`, `AdmittedClaim`, `RejectedClaim`, `ExtractionResult` (exact shapes in the code below).
  - `buildExtractionPrompt(documentText: string): { system: string; user: string }`
  - `parseProposedClaims(value: unknown): { valid: ProposedClaim[]; malformed: { raw: unknown; reason: string }[] }`
  - `admitClaims(proposals: ProposedClaim[], documentText: string): { admitted: AdmittedClaim[]; rejected: RejectedClaim[] }`
  - `extractClaimsFromDocument(documentText: string, ai: AiClient): Promise<ExtractionResult>`

- [ ] **Step 1: Write the failing tests**

Create `tests/claim-extraction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseProposedClaims,
  admitClaims,
  extractClaimsFromDocument,
  type ProposedClaim,
} from "../supabase/functions/_shared/claim-extraction.ts";
import type { AiClient } from "../supabase/functions/_shared/ai-client.ts";

const DOC = "Built weekly fraud dashboards in Tableau. Wrote SQL queries against Snowflake to flag chargeback anomalies, reducing losses by 18% in 2023.";

const verifiedClaim = (over: Partial<ProposedClaim> = {}): ProposedClaim => ({
  kind: "verified",
  type: "skill",
  text: "Tableau dashboard development",
  labels: ["tableau"],
  quote: "Built weekly fraud dashboards in Tableau",
  ...over,
});

describe("parseProposedClaims", () => {
  it("accepts a well-formed claims payload", () => {
    const { valid, malformed } = parseProposedClaims({ claims: [verifiedClaim()] });
    expect(valid).toHaveLength(1);
    expect(malformed).toHaveLength(0);
  });

  it("rejects the payload when the top level is not {claims: []}", () => {
    expect(() => parseProposedClaims({ notClaims: true })).toThrow(/claims/);
  });

  it("collects malformed entries without dropping valid ones", () => {
    const { valid, malformed } = parseProposedClaims({
      claims: [verifiedClaim(), { kind: "verified" }, { kind: "wizard", type: "skill", text: "x", labels: [] }],
    });
    expect(valid).toHaveLength(1);
    expect(malformed).toHaveLength(2);
  });
});

describe("admitClaims", () => {
  it("admits a verified claim whose quote matches, with offsets", () => {
    const { admitted, rejected } = admitClaims([verifiedClaim()], DOC);
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(1);
    const ev = admitted[0].evidence!;
    expect(DOC.slice(ev.start, ev.end)).toBe("Built weekly fraud dashboards in Tableau");
  });

  it("rejects a verified claim whose quote is not in the document", () => {
    const { admitted, rejected } = admitClaims(
      [verifiedClaim({ quote: "Certified Kubernetes administrator" })],
      DOC,
    );
    expect(admitted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/quote not found/i);
  });

  it("rejects a verified claim with no quote at all", () => {
    const { rejected } = admitClaims([verifiedClaim({ quote: undefined })], DOC);
    expect(rejected[0].reason).toMatch(/missing quote/i);
  });

  it("admits an inferred claim supported by admitted verified claims", () => {
    const inferred: ProposedClaim = {
      kind: "inferred",
      type: "skill",
      text: "Data visualization",
      labels: ["data-visualization"],
      supports: [0],
      reasoning: "Sustained Tableau dashboard work demonstrates data visualization.",
    };
    const { admitted, rejected } = admitClaims([verifiedClaim(), inferred], DOC);
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(2);
    expect(admitted[1].supports).toEqual([0]);
  });

  it("rejects an inferred claim whose support index points at a rejected claim", () => {
    const inferred: ProposedClaim = {
      kind: "inferred",
      type: "skill",
      text: "Container orchestration",
      labels: [],
      supports: [0],
      reasoning: "…",
    };
    const bogus = verifiedClaim({ quote: "Deployed Kubernetes clusters" });
    const { admitted, rejected } = admitClaims([bogus, inferred], DOC);
    expect(admitted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[1].reason).toMatch(/support/i);
  });

  it("rejects an inferred claim with no supports", () => {
    const inferred: ProposedClaim = {
      kind: "inferred", type: "skill", text: "Leadership", labels: [], supports: [], reasoning: "…",
    };
    const { rejected } = admitClaims([inferred], DOC);
    expect(rejected[0].reason).toMatch(/support/i);
  });
});

describe("extractClaimsFromDocument", () => {
  it("runs propose → parse → admit end to end with a fake AI", async () => {
    const fakeAi: AiClient = {
      chatJson: async () => ({
        claims: [
          verifiedClaim(),
          { kind: "verified", type: "achievement", text: "Fabricated award", labels: [], quote: "Employee of the Year" },
        ],
      }),
    };
    const result = await extractClaimsFromDocument(DOC, fakeAi);
    expect(result.admitted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.malformedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/claim-extraction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the extraction core**

Create `supabase/functions/_shared/claim-extraction.ts`:

```ts
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

Return ONLY a JSON object: {"claims": [...]}.`;

  const user = `DOCUMENT:\n${documentText}`;
  return { system, user };
}

export function parseProposedClaims(value: unknown): {
  valid: ProposedClaim[];
  malformed: { raw: unknown; reason: string }[];
} {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { claims?: unknown }).claims)) {
    throw new Error('AI response is not an object with a "claims" array');
  }
  const valid: ProposedClaim[] = [];
  const malformed: { raw: unknown; reason: string }[] = [];
  for (const raw of (value as { claims: unknown[] }).claims) {
    const reason = validateClaimShape(raw);
    if (reason) {
      malformed.push({ raw, reason });
    } else {
      const c = raw as Record<string, unknown>;
      valid.push({
        kind: c.kind as "verified" | "inferred",
        type: c.type as ClaimType,
        text: c.text as string,
        labels: Array.isArray(c.labels) ? (c.labels as unknown[]).filter((l): l is string => typeof l === "string") : [],
        quote: typeof c.quote === "string" ? c.quote : undefined,
        supports: Array.isArray(c.supports) ? (c.supports as unknown[]).filter((s): s is number => Number.isInteger(s)) : undefined,
        reasoning: typeof c.reasoning === "string" ? c.reasoning : undefined,
        date_start: typeof c.date_start === "string" ? c.date_start : null,
        date_end: typeof c.date_end === "string" ? c.date_end : null,
      });
    }
  }
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
  proposals: ProposedClaim[],
  documentText: string,
): { admitted: AdmittedClaim[]; rejected: RejectedClaim[] } {
  const admitted: AdmittedClaim[] = [];
  const rejected: RejectedClaim[] = [];
  const admittedVerifiedIndexes = new Set<number>();

  // Pass 1: verified claims — the quote must literally exist in the document.
  proposals.forEach((claim, index) => {
    if (claim.kind !== "verified") return;
    if (!claim.quote || claim.quote.trim() === "") {
      rejected.push({ claim, index, reason: "verified claim missing quote" });
      return;
    }
    const match = findQuote(claim.quote, documentText);
    if (!match.found) {
      rejected.push({ claim, index, reason: `quote not found in document: "${claim.quote.slice(0, 80)}"` });
      return;
    }
    admitted.push({ ...claim, index, evidence: { quote: claim.quote, start: match.start, end: match.end } });
    admittedVerifiedIndexes.add(index);
  });

  // Pass 2: inferred claims — every support must be an ADMITTED verified claim.
  proposals.forEach((claim, index) => {
    if (claim.kind !== "inferred") return;
    if (!claim.supports || claim.supports.length === 0) {
      rejected.push({ claim, index, reason: "inferred claim has no supports" });
      return;
    }
    const bad = claim.supports.filter((s) => !admittedVerifiedIndexes.has(s));
    if (bad.length > 0) {
      rejected.push({ claim, index, reason: `supports reference non-admitted claims: [${bad.join(", ")}]` });
      return;
    }
    admitted.push({ ...claim, index });
  });

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/claim-extraction.test.ts`
Expected: PASS (10 tests). Then run the whole suite: `npm test` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/claim-extraction.ts tests/claim-extraction.test.ts
git commit -m "feat: add claim extraction core with code-enforced admit gate"
```

---

### Task 5: extract-claims edge function

**Files:**
- Create: `supabase/functions/extract-claims/index.ts`
- Modify: `supabase/config.toml` (add function entry)

**Interfaces:**
- Consumes: `extractClaimsFromDocument` (Task 4), `createAiClient`/defaults (Task 3), tables from Task 2.
- Produces: POST endpoint `extract-claims`, body `{ documentId: string }`, response `{ success: true, summary: { admitted: number, verified: number, inferred: number, rejected: number, malformed: number } }`. Re-extraction is idempotent: existing claims with `origin_document_id = documentId` are deleted first.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/extract-claims/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { extractClaimsFromDocument } from "../_shared/claim-extraction.ts";

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

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (!user) {
      throw new Error('Unauthorized');
    }

    const { documentId } = await req.json();
    console.log('Extracting claims for document:', documentId);

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name, extracted_text')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }
    if (!document.extracted_text || document.extracted_text.startsWith('[')) {
      throw new Error('Document has no extracted text — process it first');
    }

    // AI provider is configurable via env; falls back to the Lovable gateway.
    const ai = createAiClient({
      baseUrl: Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL,
      apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('LOVABLE_API_KEY')!,
      model: Deno.env.get('AI_MODEL') || DEFAULT_AI_MODEL,
    });

    const result = await extractClaimsFromDocument(document.extracted_text, ai);
    console.log('Admitted:', result.admitted.length, 'Rejected:', result.rejected.length, 'Malformed:', result.malformedCount);

    // Idempotent re-extraction: clear this document's previous claims.
    const { error: deleteError } = await supabase
      .from('claims')
      .delete()
      .eq('origin_document_id', documentId)
      .eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Failed to clear previous claims: ${deleteError.message}`);
    }

    // Insert verified claims first so inferred claims can link to their ids.
    const indexToId = new Map<number, string>();
    let verifiedCount = 0;
    let inferredCount = 0;

    for (const claim of result.admitted.filter((c) => c.kind === 'verified')) {
      const { data: row, error } = await supabase
        .from('claims')
        .insert({
          user_id: user.id,
          origin_document_id: documentId,
          kind: 'verified',
          type: claim.type,
          text: claim.text,
          labels: claim.labels,
          date_start: claim.date_start ?? null,
          date_end: claim.date_end ?? null,
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to insert claim: ${error?.message}`);
      }
      indexToId.set(claim.index, row.id);
      verifiedCount++;

      const ev = claim.evidence!;
      const { error: evError } = await supabase.from('claim_evidence').insert({
        claim_id: row.id,
        document_id: documentId,
        quote: ev.quote,
        start_offset: ev.start,
        end_offset: ev.end,
        match_verified: true,
      });
      if (evError) {
        throw new Error(`Failed to insert evidence: ${evError.message}`);
      }
    }

    for (const claim of result.admitted.filter((c) => c.kind === 'inferred')) {
      const { data: row, error } = await supabase
        .from('claims')
        .insert({
          user_id: user.id,
          origin_document_id: documentId,
          kind: 'inferred',
          type: claim.type,
          text: claim.text,
          labels: claim.labels,
          reasoning: claim.reasoning ?? null,
          date_start: claim.date_start ?? null,
          date_end: claim.date_end ?? null,
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to insert inferred claim: ${error?.message}`);
      }
      inferredCount++;

      const links = (claim.supports ?? [])
        .map((s) => indexToId.get(s))
        .filter((id): id is string => Boolean(id))
        .map((supportingId) => ({ inferred_claim_id: row.id, supporting_claim_id: supportingId }));
      if (links.length > 0) {
        const { error: linkError } = await supabase.from('claim_links').insert(links);
        if (linkError) {
          throw new Error(`Failed to insert claim links: ${linkError.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          admitted: result.admitted.length,
          verified: verifiedCount,
          inferred: inferredCount,
          rejected: result.rejected.length,
          malformed: result.malformedCount,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting claims:', error);
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

[functions.extract-claims]
verify_jwt = true
```

- [ ] **Step 3: Deploy**

Use the Supabase MCP tool `deploy_edge_function` with name `extract-claims` and the files `index.ts` (above) plus `_shared/ai-client.ts`, `_shared/claim-extraction.ts`, `_shared/quote-match.ts` as written in Tasks 1/3/4.

- [ ] **Step 4: Smoke-test deployment**

```bash
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS https://tdmeripiyfocaexvoyiu.supabase.co/functions/v1/extract-claims
```

Expected: `200`. (Full end-to-end verification happens through the UI in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-claims/index.ts supabase/config.toml
git commit -m "feat: add extract-claims edge function"
```

---

### Task 6: Corpus review page

**Files:**
- Create: `src/pages/Corpus.tsx`
- Modify: `src/App.tsx` (route), `src/components/Navigation.tsx` (nav item)

**Interfaces:**
- Consumes: `extract-claims` endpoint (Task 5), `claims`/`claim_evidence` tables (Task 2), existing `Navigation`, `useAuth`, `supabase` client, shadcn components.
- Produces: route `/corpus`.

- [ ] **Step 1: Create the page**

Create `src/pages/Corpus.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Database, Sparkles, Quote, RotateCcw, X, Pencil, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

type Claim = {
  id: string;
  origin_document_id: string | null;
  kind: "verified" | "inferred" | "user_attested";
  type: "skill" | "achievement" | "scope" | "credential" | "role";
  text: string;
  labels: string[];
  reasoning: string | null;
  date_start: string | null;
  date_end: string | null;
  status: "active" | "rejected";
  claim_evidence: { id: string; quote: string; document_id: string }[];
};

const CLAIM_TYPE_ORDER = ["role", "achievement", "skill", "scope", "credential"] as const;

const Corpus = () => {
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const { data: documents } = useQuery({
    queryKey: ["corpus-documents"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: claims } = useQuery({
    queryKey: ["claims"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*, claim_evidence(id, quote, document_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Claim[];
    },
  });

  const extractMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke("extract-claims", {
        body: { documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      const s = data.summary;
      toast({
        title: "Claims extracted",
        description: `${s.verified} verified, ${s.inferred} inferred admitted — ${s.rejected} rejected by the evidence gate`,
      });
    },
    onError: (error) => {
      console.error("Extraction error:", error);
      toast({ title: "Extraction failed", description: String(error), variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "rejected" }) => {
      const { error } = await supabase.from("claims").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["claims"] }),
  });

  // Editing changes only the claim's articulation; its evidence quote is immutable.
  const textMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from("claims").update({ text }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    },
  });

  const docName = (id: string | null) =>
    documents?.find((d) => d.id === id)?.name ?? "unknown document";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Sparkles className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-foreground mb-2">Career Corpus</h1>
          <p className="text-muted-foreground">
            Every claim below is backed by evidence from your documents — nothing enters without a receipt
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <Card className="p-6 bg-card shadow-soft">
              <h3 className="text-lg font-semibold text-foreground mb-4">Documents</h3>
              <div className="space-y-3">
                {documents?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Upload documents on the Documents page first.
                  </p>
                )}
                {documents?.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground truncate">{doc.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={extractMutation.isPending}
                      onClick={() => extractMutation.mutate(doc.id)}
                    >
                      <Database className="w-4 h-4 mr-1" />
                      {extractMutation.isPending ? "Extracting…" : "Extract claims"}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {CLAIM_TYPE_ORDER.map((type) => {
              const group = claims?.filter((c) => c.type === type) ?? [];
              if (group.length === 0) return null;
              return (
                <Card key={type} className="p-6 bg-card shadow-soft">
                  <h3 className="text-lg font-semibold text-foreground mb-4 capitalize">
                    {type}s <span className="text-muted-foreground text-sm">({group.length})</span>
                  </h3>
                  <div className="space-y-4">
                    {group.map((claim) => (
                      <div
                        key={claim.id}
                        className={`border border-border/40 rounded-lg p-4 ${
                          claim.status === "rejected" ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {editingId === claim.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="text-sm"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={editText.trim() === ""}
                                  onClick={() => textMutation.mutate({ id: claim.id, text: editText.trim() })}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground">{claim.text}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge variant={claim.kind === "verified" ? "default" : "secondary"}>
                                {claim.kind}
                              </Badge>
                              {claim.date_start && (
                                <span className="text-xs text-muted-foreground">
                                  {claim.date_start}
                                  {claim.date_end ? ` – ${claim.date_end}` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(editingId === claim.id ? null : claim.id);
                                setEditText(claim.text);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                statusMutation.mutate({
                                  id: claim.id,
                                  status: claim.status === "active" ? "rejected" : "active",
                                })
                              }
                            >
                              {claim.status === "active" ? (
                                <X className="w-4 h-4" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {claim.claim_evidence.map((ev) => (
                          <blockquote
                            key={ev.id}
                            className="mt-3 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3"
                          >
                            <Quote className="w-3 h-3 inline mr-1" />
                            “{ev.quote}” — {docName(ev.document_id)}
                          </blockquote>
                        ))}
                        {claim.kind === "inferred" && claim.reasoning && (
                          <p className="mt-3 text-xs text-muted-foreground italic">
                            Inferred: {claim.reasoning}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            {(claims?.length ?? 0) === 0 && (
              <Card className="p-6 bg-card shadow-soft">
                <p className="text-sm text-muted-foreground">
                  No claims yet. Pick a document on the left and extract claims from it.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Corpus;
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add with the other page imports:

```tsx
import Corpus from "./pages/Corpus";
```

and inside `<Routes>`, after the `/documents` route:

```tsx
<Route path="/corpus" element={<Corpus />} />
```

- [ ] **Step 3: Add the nav item**

In `src/components/Navigation.tsx`, add `Database` to the lucide-react import:

```tsx
import { FileText, Sparkles, FolderOpen, MessageSquare, LogOut, Database } from "lucide-react";
```

and add to `navItems` after Documents:

```tsx
{ to: "/corpus", icon: Database, label: "Corpus" },
```

- [ ] **Step 4: Verify end to end**

Run: `npm run build` — expected: success. Then `npm run dev -- --port 3011`, sign in, open `/corpus`, click "Extract claims" on a processed document. Expected: toast reports admitted/rejected counts; claims appear grouped by type with kind badges, evidence quotes with document names, and inferred claims showing reasoning. Reject (X) fades a claim; restore brings it back; the pencil edits a claim's text inline (evidence quote stays immutable). Verify rows in the database with the Supabase MCP `execute_sql`: `SELECT kind, count(*) FROM claims GROUP BY kind;` — expected: nonzero verified (and usually inferred) counts.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Corpus.tsx src/App.tsx src/components/Navigation.tsx
git commit -m "feat: add corpus review page with claim extraction and moderation"
```

---

### Task 7: Eval harness

**Files:**
- Create: `eval/run.ts`, `eval/fixtures/ops-analyst/docs/resume.txt`, `eval/fixtures/ops-analyst/docs/achievements.txt`, `eval/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `extractClaimsFromDocument`, `createAiClient`, `findQuote` from `supabase/functions/_shared/`.
- Produces: `npm run eval` → writes `eval/reports/<fixture>.md` per fixture and exits nonzero if the fabrication invariant fails. Env: `AI_API_KEY` (required), `AI_BASE_URL`, `AI_MODEL` (optional, gateway defaults).

- [ ] **Step 1: Create the fixture corpus**

Create `eval/fixtures/ops-analyst/docs/resume.txt`:

```
JORDAN AVERY
Fraud Operations Analyst

EXPERIENCE

Fraud Operations Analyst, Brightpay (2021 - 2024)
- Investigated 40+ escalated chargeback cases weekly using SQL queries against the Snowflake warehouse
- Built weekly fraud-trend dashboards in Tableau for the risk leadership team
- Reduced false-positive holds by 18% in 2023 by re-tuning rule thresholds with the data science team
- Trained 6 new analysts on case triage and dispute-evidence standards

Customer Support Specialist, Brightpay (2019 - 2021)
- Handled 60+ support tickets daily in Zendesk, maintaining a 96% CSAT score
- Wrote the team macro library used by 25 agents

EDUCATION
B.A. Economics, State University (2019)
```

Create `eval/fixtures/ops-analyst/docs/achievements.txt`:

```
Achievement notes, kept for performance reviews.

Q3 2022: Led the chargeback-evidence overhaul. Documented the new SOP and rolled it
out to the whole fraud pod. Disputes won rate went from 31% to 44% over two quarters.

2023: Was the point person for the Tableau migration off legacy Excel reports.
Built 9 dashboards used in the weekly risk review.

2023: Interviewed 12 candidates for the analyst team as a panel lead.
```

- [ ] **Step 2: Write the harness**

Create `eval/run.ts`:

```ts
// TAILOR eval harness — Phase 1.
// Runs claim extraction over fixture corpora and reports:
//   - fabrication count: admitted verified claims whose quote fails re-verification (MUST be 0)
//   - inference yield: admitted inferred claims whose text appears nowhere verbatim in the corpus
//   - admit/reject/malformed totals
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

  const lines = [
    `# Eval report: ${fixture.name}`,
    ``,
    `Run: ${new Date().toISOString()} · model: ${process.env.AI_MODEL || DEFAULT_AI_MODEL}`,
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
  ];

  const reportPath = join(reportsDir, `${fixture.name}.md`);
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`  Report: ${reportPath} — inference yield ${yieldClaims.length}, fabrications ${totalFabrications}`);
}

if (invariantViolations > 0) {
  console.error(`\nFABRICATION INVARIANT VIOLATED: ${invariantViolations} admitted claims failed re-verification.`);
  process.exit(1);
}
console.log("\nFabrication invariant holds (0 violations).");
```

- [ ] **Step 3: Add README and gitignore entries**

Create `eval/README.md`:

```markdown
# TAILOR eval harness

Runs claim extraction over the fixture corpora in `fixtures/<name>/docs/*.txt`
and writes a metrics report per fixture to `reports/<name>.md`.

Run: `AI_API_KEY=<key> npm run eval`

Optional env: `AI_BASE_URL` (default Lovable gateway), `AI_MODEL`
(default google/gemini-2.5-flash). Any OpenAI-compatible provider works.

Metrics:
- **Fabrications** — admitted verified claims whose quote fails re-verification.
  Must always be 0; the harness exits nonzero otherwise.
- **Inference yield** — admitted inferred claims whose text appears nowhere
  verbatim in the corpus. This is the product's primary quality metric: higher
  is better, at zero fabrication.

To eval your own documents, create `fixtures/personal/docs/` and drop `.txt`
exports in it — that directory is gitignored.
```

Append to `.gitignore`:

```
eval/fixtures/personal/
eval/reports/
```

- [ ] **Step 4: Run the harness**

Run: `AI_API_KEY=<key from Lovable/any OpenAI-compatible provider> npm run eval`
Expected: console lines per document with admitted/rejected/malformed/fabrication counts, a report at `eval/reports/ops-analyst.md`, nonzero inference yield (e.g. "data visualization", "training and mentoring" style claims), and the final line `Fabrication invariant holds (0 violations).` Exit code 0.

If no API key is available at execution time, run `npm run eval` without the key and verify it exits 1 with the AI_API_KEY error message; leave live verification as a follow-up the user runs.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all vitest suites pass.

- [ ] **Step 6: Commit**

```bash
git add eval/ .gitignore
git commit -m "feat: add eval harness with fabrication invariant and inference-yield metric"
```

---

## Verification checklist (whole phase)

- `npm test` passes (quote-match, ai-client, claim-extraction suites).
- `npm run build` passes.
- `/corpus` page: extraction produces claims with evidence quotes; rejection works; toast shows the admit/reject split.
- `SELECT kind, count(*) FROM claims GROUP BY kind;` shows verified and inferred rows; every `claim_evidence.match_verified` is true.
- `npm run eval` writes a report with fabrications = 0 and inference yield > 0.
