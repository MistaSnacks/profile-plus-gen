# TAILOR Roadmap — From profile-plus-gen-1 to the Grounded Product

**2026-07-18** · Sequenced design for achieving the TAILOR vision (grounded, corpus-based resume tailoring) starting from the current Lovable-built prototype. Companion to the mission doc ("TAILOR — What This Product Is").

## Starting point

The repo is a working end-to-end Lovable prototype: Vite + React + shadcn frontend; Supabase (Lovable-managed) with auth, `documents` (raw `extracted_text`), `document_embeddings` (pgvector, currently unused by generation), `job_descriptions`, and `generated_resumes`; five edge functions, the core being `generate-resume` — a multi-step prompt pipeline (parse JD → generate from concatenated document text → LLM ATS score → document-aware analysis tagged `[REPHRASE]`/`[INFERENCE]`/`[GAP]` → verified reformat → rescore).

What it has: auth, upload/extraction, a full flow, and a prompt-level prototype of the founding mechanism (the three-category analysis).

What it lacks, structurally:

1. **Grounding is prompted, not constructed.** Anti-fabrication lives in prompt warnings — exactly the "better prompting" the mission doc says is not a moat. No data structure makes an unsupported claim impossible.
2. **No claims/evidence layer.** Documents are concatenated raw text; there is no extracted-claim model, no evidence spans, no provenance. "Click to see where it came from" has nothing to point at.
3. **ATS score is the headline metric.** The vision demotes it; nothing computes inference yield.
4. **No lane/narrative selection and no fit-honesty surface.** `[GAP]` findings exist inside prompt output text but never reach the user as a verdict.

## Decisions made

- **Full roadmap first**, then per-phase specs/plans. Each phase is its own spec → plan → implementation cycle.
- **Stay on Lovable's stack for now** (managed Supabase + AI gateway) purely as a convenience — no migration appetite at the moment.
- **Model-agnostic by design (first-class principle).** Because Lovable is a convenience, every new component must survive a provider swap: all model calls go through one thin client module with a provider-neutral request/response shape; correctness never depends on which model answers (models propose, code admits — see Phase 1); no Lovable-specific coupling in new business logic; schema stays plain Postgres + pgvector. Switching providers later should touch one module.
- **Near-term goal: dogfood output quality** — make outputs hit the "better than the candidate could write" bar on real applications before optimizing for demos or external users.
- **Approach: foundation-first plus eval harness** (chosen over strangler-fig incremental and eval-only-first). The claims/evidence engine lands first, with a minimal automated quality harness, because "dogfood quality" needs a runnable definition of quality and every later feature is a view over the claims structure.

## Organizing principle

Move grounding from prompts into data as early as possible. Provenance clicks, fit honesty, lane selection, and inference yield are all views over the same structure: **claims linked to evidence**.

| Phase | Delivers | Vision property it lands |
|---|---|---|
| 1 | Claims/evidence corpus engine + eval harness | Grounding by construction; measurable quality |
| 2 | Grounded generation v2 (selection, not writing) | Right narrative; full expression; inference |
| 3 | Trust surfaces: provenance UX + fit-honesty report | Inspectable trust; honesty about fit |
| 4 | Living asset: guided corpus growth, inference-yield dashboard, speed pass | The career asset; primary metric; minutes |
| 5 | Externalization: own the stack, cohort hardening, honest billing | Built for the cohort; trust past the resume |

## Phase 1 — Corpus claims engine + eval harness

**Mechanism.** Extend document processing so a model reads each document and *proposes* typed **claims** — skill, achievement, scope, credential, role — each carrying a verbatim quote from the source. Plain code then *admits* claims by verifying the quote literally appears in the document's `extracted_text` (whitespace-normalized match). A claim whose quote doesn't match is rejected. This converts "please don't hallucinate" into "unsupported claims cannot enter the corpus," and it holds regardless of which model proposes — the model-agnostic principle and the grounding mechanism are the same design.

**Inferred claims are first-class.** A claim like "data visualization," earned from years of Tableau bullets, is stored with kind `inferred`, linked to the verified claims that support it, with the model's stated reasoning. Inference — the reason the product exists — is in the data model from day one, and every inference chains back to verbatim source text.

**Schema** (new tables beside existing ones):

- `claims`: user_id, kind (`verified` | `inferred` | `user-attested`), type (skill/achievement/scope/credential/role), text, normalized labels, date range, status (active/rejected).
- `claim_evidence`: claim_id → document_id, quote text, char offsets, match-verified flag.
- Inferred claims additionally link to their supporting claim ids.
- Existing `documents` / `document_embeddings` unchanged.

**Corpus review page.** Minimal UI: claims grouped by role/domain, expandable to receipts, with confirm / reject / edit. Seed of the living career asset; rejection is itself a grounding control.

**Eval harness.** Local script over a fixtures directory (test corpora + job descriptions; the founder's three documents are fixture #1, never the tuning target). Reports per run: fabrication count (output lines tracing to no claim), inference yield (evidence-backed claims surfaced that appear nowhere verbatim in source text), coverage. Replaces the hand-written `fabrication-test-*.md` ritual; becomes the regression gate for all later phases.

## Phase 2 — Grounded generation v2

A **new edge function beside the current one**, so both can be dogfooded on the same postings and compared.

1. **JD parsing** → structured requirements (text, type, priority), replacing the title/company regex step.
2. **Matching** → each requirement scored against the claims corpus (embedding shortlist + model judgment) producing a **coverage map**: covered-by-verified / covered-by-inference / gap. This artifact later becomes the fit-honesty report and the inference-yield numerator.
3. **Lane selection** → for multi-domain corpora, an explicit, logged decision about which career story this JD gets — not a blended average.
4. **Rendering** → the resume is written only from selected claims; every bullet records the claim ids it drew from. A post-render code check rejects any bullet citing nothing — the admit-gate applied at the output end.

ATS score survives as a secondary diagnostic; the coverage map replaces it as the headline result. "Did TAILOR select the right narrative?" becomes inspectable.

## Phase 3 — Trust surfaces

**Provenance UX.** Phase 2 bullets already carry claim ids, so this is a view, not a rebuild: click any line → panel with the claim(s), verbatim quote, source document, and for inferred claims the inference chain. Retires the bold-marker highlighting. Enables the "confidence without proofreading" review: skim lines, spot-check receipts, submit in minutes.

**Fit-honesty report.** Surface the coverage map *before* generation: requirements covered by verified claims, by inference, and genuine gaps — with a verdict tier including "poor match; here's what's missing; may not be worth tailoring." Generating anyway stays one click away. Cheapest phase; third only because it needs Phase 2's coverage map.

## Phase 4 — The living asset

**Guided corpus growth.** Repurpose the existing chat from Q&A-over-documents into a corpus-building interview: coverage-map gaps drive "have you ever done X?" questions; an affirmative answer mints a `user-attested` claim with the user's own words as evidence; a "no" is honestly recorded as a real gap. Claim dedup/merge keeps the corpus clean.

**Inference-yield dashboard.** The primary product metric, computed per generation and trended per user. The eval harness gains cohort fixtures (teacher, nurse, non-English source corpus) so "built for the cohort, not one profile" becomes a regression test.

**Speed pass.** Posting-to-resume in minutes: streaming generation, parallelized stages, cached JD parses. Deliberately last-within-phase — speed is a promise kept, not the pitch, and optimizing before the pipeline's shape settles is wasted work.

## Phase 5 — Externalization (trigger-based, not scheduled)

Documented triggers rather than a scheduled phase. **Own the stack** (own Supabase project, direct model APIs) when any of: the gateway's model ceiling measurably caps extraction/inference quality in the harness; Lovable dual-editing causes a real conflict; external users need infrastructure Lovable can't host. The model-agnostic principle makes this a one-module swap plus a database migration, not a rewrite. **Honest billing** (transparent pricing, real trial, easy cancellation) lands with first external users.

## Cross-cutting constraints

- **Model-agnostic everywhere.** One thin AI client module; provider-neutral shapes; structured outputs validated in code; no correctness dependency on any model's behavior. Models propose; code admits.
- **Lovable coexistence.** Local development is primary. Don't edit the same surfaces in Lovable's editor concurrently — its auto-commits collide with local work. Treat Lovable as hosting/sync until Phase 5 detaches it.
- **Eval harness as gate.** From Phase 1 on: no phase ships with fabrication count > 0 on fixtures; no change ships that lowers inference yield without an explicit stated reason.

## Testing approach

Each phase's spec defines its own tests, but the roadmap-level bar is the harness: fixtures in-repo, runnable locally against deployed edge functions, producing a markdown report per run. Unit-level: the quote-verification and bullet-citation checks are pure functions and get direct tests.

## Out of scope (for the roadmap, per YAGNI)

Template/formatting features, ATS-beating features of any kind, cover letters, job discovery, multi-user/team features, billing before external users.

## Next step

Phase 1 gets its own detailed spec and implementation plan (via the writing-plans process). Phases 2–5 each get the same treatment when reached, informed by what dogfooding the prior phase taught.
