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
