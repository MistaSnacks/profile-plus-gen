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
