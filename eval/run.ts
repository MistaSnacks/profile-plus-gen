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
