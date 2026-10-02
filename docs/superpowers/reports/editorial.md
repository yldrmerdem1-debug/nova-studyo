# Editorial, structured output and provenance verification

Source: `C:/Users/erdem/Videos/Yeni klasör/nova-studio`. No Git operations, provider spending, real credentials, or modifications to existing output videos.

## Implemented

- `src/llm.js` validates JSON recursively through `src/structured-output.js`: required properties, nested objects/arrays, types, enums, additional properties, bounds, string constraints and schema alternatives used by the pipeline. Invalid/truncated output has at most three response attempts, with a bounded 64K token ceiling. A 400/404 structured-output rejection retries using the **entire schema** in the prompt; overload never disables schema support globally. Text and image JSON use the same validation/repair path.
- Every successful provider response is counted, including failed validation, truncation and `pause_turn` continuations. Refused responses are accounted before the failure is raised. Provider-reported model identity is retained. Cache reads/writes are separate from uncached inputs; legacy input totals remain inclusive.
- Research retains text from every continuation, inline citation URLs and exact returned citation metadata in its saved text. Disabled/unavailable web search, missing source links and an exhausted continuation limit are explicit warnings. Research prompts ask for dated, linked evidence and uncertainty. Copyediting no longer guesses which conflicting number is correct.
- Genre opening instructions use the shared `getStyleProfile()` hook policy. They request an immediate, specific promise, truthful stakes, new information per section and an explicit payoff. SEO receives extractive summaries covering **every section and segment**, including the ending. Its response requires 3–5 titles, nonempty publication assets and a useful question. Each title must have an exact supporting quotation from an identified script segment; fabricated quotations and unsupported title/thumbnail numbers trigger bounded repair.
- `publicationAudit()` exposes observable opening/ending and evidence warnings plus human review questions. It does not produce an invented quality score or claim guaranteed retention. Exact quotation checks do not prove semantic entailment; editorial review remains necessary.
- Wikipedia image URLs resolve to Commons file metadata: actual creator, license, license URL, source page and creator link. Wikipedia-hosted non-Commons portraits do not silently become free assets. Commons videos request the same metadata. Openverse/Europeana/Archive/stock provenance is carried into chosen and replacement media. New candidates and legacy candidate downloads require verifiable supported permission records; unspecified NASA/LOC/archive rights are not assumed public domain. Existing cached media is preserved for recovery, with missing-permission warnings in credits.
- Credits list source/license links, available attribution and modification notes. Public-domain items remain traceable. A music filename no longer implies YouTube Audio Library origin. Music entries can carry explicit source/license metadata.
- `runSections` accepts checkpointed section results and awaits a completion callback before publishing successful section results. Recovery-owned media partial-cache hooks were preserved.

## API contracts

Existing function signatures remain compatible. Additions:

- `callJSON(options)` / `callVisionJSON(options)`: optional `request(params, logFn, model, usage)` transport boundary (used for offline testing) and optional `validate(parsed) -> string[]` domain validation.
- `callText(options)`: optional transport boundary; returns a string as before, with warnings/citations/provenance embedded. It uses `usage.model` when present.
- `sumUsage(target, response, modelRates?)` reads `target.modelRates` before live settings, allowing job-frozen rates. Rates are `{[model]: {input, output, cacheRead, cacheWrite}}` in USD per million tokens, with no guessed defaults.
- Usage fields: `requests`, inclusive `inputTokens`, `outputTokens`, `uncachedInputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `byModel` containing the same counters plus estimates, `estimatedUsd` (known subtotal), `unpricedRequests`, `unpricedModels`, `estimateComplete`, `webSearchRequests`, `legacyUnpricedUsage` when needed, and Turkish `costNote`. Missing provider usage, absent rates, web tool fees and old totals with unknown models prevent a complete estimate.
- `usage.budgetUsd`: positive values check the estimated threshold before each new LLM call, including backups/continuations/repairs. Per root UI contract, zero/null/undefined disable the threshold. Unpriced usage or missing rates block a positive-budget call with an actionable message. This is an estimate threshold, **not** a provider hard-spend reservation; in-flight calls can cross it. TTS/image/video charges are outside this token ledger.
- `runSeo(job, script, usage, logFn, options?)` returns prior publication fields plus `evidence: [{titleIndex, segId, quote}]` and `publicationAudit`.
- `publicationAudit(script, seo)` returns `{opening, ending, sectionCount, segmentCount, warnings:[{code,message}], reviewRequired:string[], note}`.
- `runSections(..., isCancelled, {cached:[], onSection(index,result)}={})` reuses nonempty cached section text. The recovery caller is responsible for matching the input fingerprint. Existing post-assembly copyediting remains; the final script checkpoint prevents repetition once complete.
- Media candidate/file fields remain unchanged, with added `lisansUrl`, `sahipUrl`, `attribution`, `restrictions`, `sourceUrl`, `articleUrl`, `permissionVerified`, `modifications`. `kunyeUret()` additionally returns `warnings`.
- `muzikKunyesi()` accepts prior filenames or objects `{file|path,title,artist,sourceUrl,license,licenseUrl}`. Filename-derived names are labelled uncertain when origin is absent.

## RED / GREEN evidence

All focused tests use isolated `NOVA_HOME`, `TEMP` and `TMP`; transport and Commons metadata boundaries are offline fixtures.

- Initial structured-output tests reproduced missing schema enforcement, missing fallback schema, missing continuation counts/citations and missing cache/cost reporting. The transport-injection seam was absent before implementation; no test attempted to load a real key.
- Provenance RED: `resolveCommonsImage` / permission classifier absent; credits lacked source/license links; music falsely asserted a platform origin.
- Engagement RED: no full-script briefing/audit helper. Cached `runSections` RED attempted the paid boundary and failed on the intentionally absent key; GREEN reuses the saved section without a provider call.
- Additional RED cases reproduced a falsely complete estimate for legacy totals and accepting the phrase “Not public domain”. Both are corrected.
- Command: `node --test test/editorial-llm.test.mjs test/editorial-provenance.test.mjs test/editorial-engagement.test.mjs test/editorial-budget-editor.test.mjs` — **23 tests passed, zero failures**. Saved output: `editorial-focused.log`.
- Replaced brittle legacy `kunye` and `tavan-tekrar` source-pattern tests with behavioral credits and bounded-truncation tests. Updated music-origin and render/cache linkage checks for intentional behavior changes. Selected legacy tests passed, including `token-tavani`, `sekiz-duzeltme`, `bos-bolum`, `konu-kisisi`, `gorselsiz-konu`, `kucuk-gorsel`, `ai-istem`, `muzik-kunyesi`, `kesik-alaka`, `sorgu-onarim`.
- Initial full `npm test` stopped on a real A/V duration defect in `hareket-uctan-uca`: 126 ms stream duration difference. Audiovisual owner fixed redundant final `-shortest` clipping of reordered H264 tail frames and reran both formats: 7 ms difference, passing. Initial log retained as `editorial-full-suite.log`.
- Remaining legacy suite was run separately to identify further blockers; its log is `editorial-remainder.log`. Integration owners corrected stale assertions in their changed flows. Final full-suite status is recorded by root after integration.

## Limits

No live paid provider end-to-end request was made. Real provider schema availability, model output quality and current remote asset availability therefore remain untested. Metadata-derived license records support review; they do not prove every possible right associated with an image. Unknown permissions reduce candidate availability rather than silently claiming permission. Semantic headline accuracy, truthful payoff and music rights still require publication review.

## Final integration follow-up

Budget recovery was fixed after independent review: inactive jobs can save numeric `costBudgetUsd` (0–10000, zero disables) and explicitly `refreshModelRates:true`, even when script generation never started. Full patch validation occurs before mutation. Refresh copies only validated current prices into usage/snapshot and preserves historical uncertainty. `capabilities.canAdjustBudget` is independent of script availability. `creativeSettings()` excludes billing metadata from the three section/render fingerprints; an actual checkpoint test proves refreshing prices neither repeats paid section writing nor invokes render again, while changing the creative model invalidates the cache. Four new editor tests passed alongside all 15 current recovery tests.

Legacy final ledger: **61/61 test files passed**, consolidated across the initial run, remainder run and corrected targeted reruns. This is a file count, not an invented assertion count and not a claim that the original single `npm test` invocation exited zero. Initial first nine files passed. The A/V fixture passed after the actual mux fix. Forty-six remainder files passed directly, including final native render in all three modes (57.520 s plan, 57.534 s output, 14 ms deviation each). Five initial source-contract failures (`kesik-alaka`, `sorgu-onarim`, `muzik-seviye`, `ai-istem`, `muzik-kunyesi`) were fixed and all five reran with exit 0 in `editorial-fixed-reruns.log`. Per-file evidence is in `editorial-checks-ledger.json`. No heavy full-suite repetition was performed after these targeted passes, per root instruction.
