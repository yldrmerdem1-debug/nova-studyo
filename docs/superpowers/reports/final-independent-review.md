# Independent integration review — 2026-09-07

Scope: recovery/editor, structured output/accounting, genre/audio rendering, publication/UI integration. Source compared with the non-Git baseline where needed. No real settings or API keys were read; no provider requests were sent. Imports/tests used an isolated NOVA_HOME, TEMP and TMP.

## Important findings

1. **Budget recovery was unavailable:** a stopped job retained its original budget/rates with no inactive-job way to update them. Settings changes could not fix the frozen usage configuration. Reported to root; editorial agent implements budget/rates recovery and cache-key exclusions, root implements controls.
2. **Partial collage recovery discarded local replacements:** when a valid cached replacement had no original keyframe, the no-animation/provider-unavailable branches omitted it while another beat was regenerated. Reproduced offline: input cached keys `[b0]`, output `[b1]`. Fixed by reusing valid media before requiring a keyframe in both branches.
3. **Paid image/video calls ignored the job settings snapshot:** provider selection and generator request parameters consulted global settings. Changing settings while a job waited could select a different provider/model than its recorded configuration. Fixed by passing effective job settings through collage readiness/providers/generators, AI clip generation and job-scoped media download/recovery. Existing independent callers retain defaults. Local dry-run helpers also receive those settings. Video capability cache is now keyed by provider/model so a negative result for one model cannot disable another.

## Verification

New `test/recovery-provider-snapshot.test.mjs`: three regressions failed before production edits and passed after. Tests cover partial cache preservation in both fallback paths, frozen provider/model at image/AI/video boundaries, and distinct capability-cache entries. Paid boundaries are replaced with local spies; network is forbidden except an in-memory fake capability response.

Command: `node --test test/recovery-provider-snapshot.test.mjs test/recovery-cache.test.mjs test/recovery-backend.test.mjs test/ai-kurtarma.test.mjs test/ai-butce.test.mjs test/import-butunlugu.test.mjs`

Result: 21 tests passed, 0 failed. Includes per-segment voice recovery, completed render cache, previous-video preservation, source preservation, duplicate resume prevention and edited cover preservation. Existing AI budget/recovery/import checks passed.

Edited files for findings 2–3: `src/pipeline/collage.js`, `src/pipeline/aivideo.js`, `src/pipeline/index.js` (generator call sites only), `src/pipeline/media.js`, `test/recovery-provider-snapshot.test.mjs`.

No remaining critical or important finding was identified in the inspected paths after these fixes. This assessment is limited to local code and offline behavior; the root task is responsible for full-suite, browser, packaged build and final audiovisual verification. No live paid provider end-to-end claim is made.
