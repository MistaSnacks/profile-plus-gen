# TAILOR Phase 2 — Grounded Generation v2

Design spec. Written 2026-07-19. Implements Phase 2 of
`docs/superpowers/specs/2026-07-18-tailor-roadmap-design.md` (lines 55-64).

## Goal

Replace prompt-begged grounding with code-enforced grounding at the *output* end. Phase 1
built a claims corpus where nothing enters without a verified receipt. Phase 2 makes the
generated resume draw only from that corpus, and makes the selection inspectable: which
requirements the posting asks for, which claims answer them, which are gaps, and which
career story the resume chose to tell.

Today's `generate-resume` stuffs every document's full text into a prompt, asks the model
not to fabricate, and marks its own additions with `**bold**`. It never touches the claims
tables. Phase 2 ships a second pipeline beside it so both can run on the same posting and
be compared. v1 is not modified or removed in this phase.

**Headline result changes** from ATS score to the coverage map. ATS scoring survives as a
secondary diagnostic on v1 only; v2 does not compute it in this phase.

## Non-goals (YAGNI)

- **No embeddings.** A user's corpus is 10-100 claims — it fits in one prompt. The existing
  `document_embeddings` table and `match_document_chunks` RPC are dead code with a
  768-vs-1536 dimension mismatch; Phase 2 does not use, fix, or delete them.
- **No lane curation UI.** Lanes are inferred per run and logged, not user-managed entities.
- **No provenance UX.** Clicking a bullet to see its receipt is Phase 3. Phase 2 only
  guarantees the data exists to build it.
- **No fit-honesty verdict tiers.** Phase 3. Phase 2 returns the raw coverage map.
- **No changes to v1** (`generate-resume`), the claims engine, or `/corpus`.
- **No PDF extraction fixes**, no claim dedup, no cross-document claim merging.

## Architecture

Two edge functions, three shared modules. The split exists because Phase 3 needs to show
coverage *before* generating; there, the UI simply stops auto-calling the second function.

```
Generate page (v1 | v2 toggle)
      │
      ▼
  analyze-jd                     ~2 model calls
    parse JD → requirements        → jd_requirements
    match requirements → claims    → requirement_coverage (+ coverage_claims)
    infer + select lane            → job_descriptions.lane_decision
    returns: coverage map + lane decision
      │
      ▼
  render-grounded                ~1 model call
    select claims for the lane
    write bullets, each citing claim ids
    POST-RENDER CITE CHECK (code)  → resume_bullets (+ bullet_claims)
    render plain text              → generated_resumes.content
    returns: resume id + render summary
```

Shared modules, all under `supabase/functions/_shared/`, following the Phase 1 contract —
dependency-free, runtime-neutral (no `Deno.*`, no `process.*`, no imports except each other
with explicit `.ts` extensions), so vitest exercises the same code the edge runtime runs:

| Module | Responsibility |
|---|---|
| `jd-parse.ts` | Requirement-extraction prompt; validate + admit proposed requirements |
| `coverage.ts` | Matching prompt; validate + admit proposed matches and the lane decision |
| `render.ts` | Rendering prompt; validate + admit proposed bullets; the cite check |

All model calls go through the existing `_shared/ai-client.ts` with caller-injected config
(roadmap line 22: model-agnostic is a first-class principle). Neither new function reads a
provider name; both read `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` with the Lovable gateway
as fallback, exactly as `extract-claims` does.

## The invariant, restated for Phase 2

Phase 1: *models propose claims, code admits them against source documents.*
Phase 2 extends the same rule to three new model boundaries:

| Boundary | Model proposes | Code admits only if |
|---|---|---|
| JD parse | requirements | shape valid; text non-empty; type/priority in enum |
| Matching | requirement → claim ids | every id resolves to a claim that is **this user's**, **status = active**, and was in the candidate set sent to the model |
| Rendering | bullets + cited claim ids | bullet cites ≥1 id; every id resolves as above **and** was in the selected lane's claim set |

A model hallucinating a claim id, citing another user's claim, or writing an uncited bullet
produces a **rejected** item with a reason — never a persisted row. Rejections are counted
and returned, mirroring `ExtractionResult`'s admitted/rejected/malformed shape.

## Schema

Five new tables (three entities, two citation join tables), three enums. RLS owner-only on
every table, following the *corrected* Phase 1 style: each policy checks ownership on every
side it references, and mutable rows get an `updated_at` trigger.

```sql
CREATE TYPE public.requirement_type AS ENUM
  ('skill', 'experience', 'credential', 'responsibility');
CREATE TYPE public.requirement_priority AS ENUM ('required', 'preferred');
CREATE TYPE public.coverage_status AS ENUM ('verified', 'inferred', 'gap');

CREATE TABLE public.jd_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_description_id UUID NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type public.requirement_type NOT NULL,
  priority public.requirement_priority NOT NULL,
  position INTEGER NOT NULL,           -- order as parsed from the posting
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.requirement_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.jd_requirements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.coverage_status NOT NULL,
  rationale TEXT,                      -- one sentence, model's reason; null for gaps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requirement_id)              -- current coverage; re-analysis replaces it
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
  section TEXT NOT NULL,               -- e.g. "Experience", "Skills"
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bullet_claims (
  bullet_id UUID NOT NULL REFERENCES public.resume_bullets(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (bullet_id, claim_id)
);
```

Plus a `lane_decision` column on two existing tables:

```sql
ALTER TABLE public.job_descriptions   ADD COLUMN lane_decision JSONB;  -- written by analyze-jd
ALTER TABLE public.generated_resumes  ADD COLUMN lane_decision JSONB;  -- copied by render-grounded
```

`analyze-jd` writes the decision against the posting; `render-grounded` reads it there and
copies it onto the resume, so a saved resume permanently records the lane it was built from
even if the posting is later re-analyzed into a different one. Shape:

```json
{
  "selected": { "name": "Fraud & risk operations", "claim_ids": ["…"] },
  "rationale": "The posting is majority fraud-investigation and chargeback work.",
  "competing": [{ "name": "Data engineering", "claim_ids": ["…"] }],
  "excluded_claim_ids": ["…"]
}
```

`selected.claim_ids` is the set `render-grounded` restricts itself to, so it must be
persisted, not recomputed.

### Why join tables rather than `claim_ids uuid[]`

*This reverses the array approach approved during brainstorming; raised here for the review
gate.* Postgres cannot foreign-key an array element, and `extract-claims` **deletes and
re-inserts a document's claims on every re-extraction** (its idempotency design). With
arrays, a routine re-extraction would leave saved bullets and coverage rows citing ids that
no longer exist — and Phase 3's entire proposition is clicking a line to see its receipt.
Join tables make the database enforce it: when a claim goes, its citations go with it, and a
bullet that loses all its evidence reads as uncited rather than as a broken link.

The cost is two extra tables and a join on read. The alternative — arrays plus
application-level filtering of unresolvable ids on every read — pushes an invariant the
database can hold into every future consumer.

### Idempotency

Both functions are re-runnable, matching `extract-claims`' delete-first pattern:

- `analyze-jd` deletes `jd_requirements` for `(job_description_id, user_id)` before
  inserting. Coverage and its citations cascade away with the requirement rows.
- `render-grounded` deletes `resume_bullets` for `(resume_id, user_id)` when re-rendering an
  existing resume; bullet citations cascade.

Coverage is therefore always *current* against the corpus as it stands. Re-running
`analyze-jd` after extracting new claims is the supported way to refresh a stale map.

## Pipeline detail

### `analyze-jd`

Request `{ jobDescription: string, jobDescriptionId?: string }`. When no id is supplied it
creates the `job_descriptions` row (reusing v1's title/company extraction is out of scope —
v2 asks for title and company as part of the same structured parse, one call instead of
v1's separate regex-scraped call).

1. **Parse.** One model call returns `{ title, company, requirements: [{text, type,
   priority}] }`. Code validates each requirement's shape and enum membership; malformed
   entries are counted and dropped, valid ones persisted with their parse order as
   `position`. A posting yielding zero valid requirements is an error, not an empty success.
2. **Match + lane.** Load the user's `status = 'active'` claims (id, kind, type, text,
   labels, reasoning). One model call receives the requirement list and the claim list and
   returns, in a single structured response:
   - `lanes`: candidate career stories it sees in the corpus, each with a name and the claim
     ids belonging to it;
   - `selected_lane`: the chosen lane name, a one-sentence rationale, and the ids it is
     setting aside;
   - `coverage`: per requirement, a status and the claim ids that answer it.

   Code then admits: every cited id must be in the set that was sent; `verified` status
   requires at least one cited claim of `kind = 'verified'`; `inferred` requires at least one
   cited claim; `gap` requires none. A `verified`/`inferred` status citing nothing is
   demoted to `gap` with the reason recorded — the model does not get to assert coverage it
   cannot point at.
3. **Persist and return** the coverage map, the lane decision, and counts of what was
   rejected.

Response: `{ success, jobDescriptionId, lane: {...}, coverage: [{requirementId, text, type,
priority, status, claimIds, rationale}], summary: { requirements, verified, inferred, gaps,
malformed } }`.

### `render-grounded`

Request `{ jobDescriptionId: string, resumeId?: string }`. Reads the persisted requirements,
coverage, and lane decision — it does not re-derive them, so what you saw is what gets
written.

1. **Select.** Claims cited by `verified`/`inferred` coverage rows, restricted to the
   selected lane. Gaps contribute nothing: the resume stays silent on requirements the
   corpus cannot answer. (Phase 3 tells the user about them.)
2. **Render.** One model call receives the selected claims (with ids) and the requirements,
   and returns bullets grouped by section, each with the claim ids it drew from.
3. **Cite check (code).** A bullet is admitted only if it cites at least one id and every
   cited id is in the selected set. Rejected bullets are counted with reasons and never
   persisted. This is the admit gate at the output end.
4. **Persist.** Insert the `generated_resumes` row (or update it when `resumeId` was
   supplied): `title` as `"{job title} at {company}"` following v1's convention, `content`
   as the rendered plain text so the existing Resumes UI keeps working unchanged, `format`
   `'plain_text'`, `ats_score` null (v2 does not score), `lane_decision` copied from the
   posting, and `metadata.engine = 'v2'` so rows are distinguishable from v1's. Then the
   admitted bullets to `resume_bullets` + `bullet_claims`.

Response: `{ success, resumeId, summary: { bullets, rejectedBullets, claimsUsed,
requirementsAddressed } }`.

## UI

No new page. `src/pages/Generate.tsx` gains an engine toggle (v1 / v2), defaulting to v1
while v2 is being dogfooded.

A v2 run calls `analyze-jd`, renders the coverage map inline — requirements grouped by
status, each showing the claims that answer it and the lane decision above them — then calls
`render-grounded` and navigates to the resume as v1 does. Because the coverage panel renders
between the two calls, the Phase 3 change is removing the automatic second call, not
rebuilding the screen.

`src/pages/Resumes.tsx` renders v2 resumes from `resume_bullets` (ordered by section and
position) when `metadata.engine === 'v2'`, and falls back to today's markdown-parsed
`content` otherwise. The `**bold**` AI-addition convention is v1-only; v2 has no need for it
because the citation is the provenance.

Existing v1 bug left in place, noted for a later sweep: `Generate.tsx` reads
`data.atsScore` while the function returns `data.resume.ats_score`, so the v1 toast always
shows `undefined%`.

## Eval

`eval/run.ts` gains a second fixture axis: `eval/fixtures/<name>/jds/*.txt` alongside the
existing `docs/*.txt`. For each fixture, after extracting claims from the documents, it runs
the JD-parse and matching logic against each posting and reports:

| Metric | Meaning | Gate |
|---|---|---|
| Fabrications | admitted verified claims failing quote re-verification | **must be 0** (existing) |
| Inference yield | inferred claims appearing nowhere verbatim | higher is better (existing) |
| **Coverage** | requirements covered-by-verified / by-inference / gap | reported per fixture |
| **Uncited bullets** | rendered bullets citing zero admitted claims | **must be 0** (new) |

The two must-be-zero counts fail the run with a nonzero exit, matching the existing
fabrication invariant. Coverage is reported, not gated: a posting the corpus genuinely
cannot answer *should* show gaps, and gating it would incentivize exactly the inflation this
system exists to prevent.

Rendering in eval uses the shared modules directly (no edge function, no database), which is
why the admit logic lives in `_shared/` rather than inside the functions.

The `ops-analyst` fixture gains two postings: one squarely in its lane (fraud/risk
operations) and one deliberately adjacent (a data-engineering role) so lane selection and
gap reporting are both exercised. Fixture JDs are synthetic, not real postings.

Credentials: `.env.eval` (gitignored) supplies `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`; run
with `set -a; source .env.eval; set +a; npm run eval`.

## Testing

TDD for all pure logic, vitest, mirroring Phase 1's suites:

- `tests/jd-parse.test.ts` — valid payload; malformed entries collected without dropping
  valid ones; bad enum values rejected; empty-requirements payload throws.
- `tests/coverage.test.ts` — a match citing an unknown claim id is rejected; a `verified`
  status citing only inferred claims is demoted; a status citing nothing is demoted to gap;
  lane selection excluding a claim keeps it out of the selected set; claims belonging to
  another user are never in the candidate set.
- `tests/render.test.ts` — an uncited bullet is rejected; a bullet citing an out-of-lane
  claim is rejected; a valid bullet is admitted with its citations; rejection reasons are
  specific.

Edge functions themselves are not unit-tested (Deno, network, database) — they are thin
orchestration over tested modules, verified live: run both functions against a disposable
user with fixture documents and a fixture posting, then assert in SQL that every persisted
bullet has at least one row in `bullet_claims`, and that every `coverage_claims.claim_id`
belongs to that user.

## Error handling

- **Empty corpus** (no active claims): `analyze-jd` returns a distinct, actionable error —
  extraction has to happen first — rather than a coverage map of all gaps, which would read
  as "you're unqualified" when it means "you haven't uploaded anything."
- **Zero requirements parsed**: error, not empty success. Usually means the pasted text was
  not a job posting.
- **Model call failure / unparseable JSON**: propagates from `ai-client.ts`; both functions
  wrap the pipeline and return the message with a 500, matching existing convention.
  (Phase 1's noted improvement — distinguishing 400/401 from 500 — is a follow-up across all
  functions, not Phase 2 scope.)
- **`render-grounded` with no coverage rows**: error directing the caller to run `analyze-jd`
  first; the function never silently re-derives.
- **All bullets rejected by the cite check**: no resume row is written; the response reports
  the rejection count and reasons. A resume of nothing is a failure, not an empty document.

## Expected shape of the work

Roughly ten tasks, in dependency order: migration → three shared modules (each TDD, each
independently testable) → `analyze-jd` → `render-grounded` → eval extension → UI. The
shared modules carry all the admit logic and all the tests; the edge functions stay thin
enough to review by reading. This is larger than Phase 1 but remains one coherent plan —
nothing here ships usefully on its own except as the whole pipeline.

## Deferred to later phases

- Provenance panel per bullet (Phase 3) — the data exists after Phase 2.
- Fit-honesty verdict tiers and pre-generation coverage gate (Phase 3).
- Lanes as first-class, user-editable entities (Phase 4).
- Embedding shortlist for large corpora — only if a corpus outgrows a single prompt.
- RLS hardening question inherited from Phase 1: a client can currently insert
  `kind = 'verified'` claims directly via REST, since the admit gate lives in the edge
  function rather than the database. Decide before any phase treats `verified` as a
  trust signal beyond the user's own view.
