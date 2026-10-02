# AI Yönetmen Sahne İncelemesi Implementation Plan

> **For agentic workers:** Execute inline in this session. Worktree creation is unavailable because this recovered source directory is not a Git repository.

**Goal:** Let AI Yönetmen review chosen media before generation and inspect every encoded shot before labelling the result ready.

**Architecture:** Reuse the existing candidate picker; persist only user-changed choices and protect them through media audit. A focused final-shot module extracts exact frame-centre samples and audits them in bounded batches. The existing publication path carries a JSON report and frame JPEGs to the quality desk, where the video can seek to each finding.

**Tech Stack:** Node.js ESM, Express, browser JavaScript, FFmpeg, current Anthropic vision abstraction, node:test.

## Global Constraints

- Preserve existing jobs, media, API settings and published output.
- Apply only to new AI Yönetmen jobs; other modes keep their defaults.
- A failed or unavailable vision response never means “clean”.
- Do not silently replace an explicitly changed user pick.

---

### Task 1: Optional pre-render source selection

**Files:** `public/production-modes.js`, `public/app.js`, `src/pipeline/index.js`, `src/pipeline/media.js`, `src/pipeline/automatic-editor.js`, `test/director-mode.test.mjs`, `test/director-editor.test.mjs`.

- [ ] Write tests for Director `mediaMode=manual`, auto default, changed-pick persistence, mismatched download and audited preservation; run them red.
- [ ] Enable the existing picker in AI Yönetmen and retain the chosen option through request normalization.
- [ ] Record only changed picks, reject fallback for these beats, and allow the automatic editor to keep only quality-approved manual picks.
- [ ] Run focused tests green.

### Task 2: Encoded shot proof and audit

**Files:** new `src/pipeline/director-shot-review.js`, `src/pipeline/render.js`, `src/pipeline/checkpoints.js`, `src/pipeline/index.js`, `test/director-shot-review.test.mjs`.

- [ ] Write failing tests using a short synthetic MP4: exact shot timestamps, one JPEG per shot, clean/flagged/unverified verdicts, cancellation and persistence.
- [ ] Implement extraction and bounded model review; return warnings and artifacts without inventing a clean result on failure.
- [ ] Publish report and frames with the render revision, and attach warnings to `needsReview`.
- [ ] Run focused tests green.

### Task 3: Quality screen, docs and delivery

**Files:** `server.js`, `public/quality-desk.js`, `public/style.css`, `docs/ai-director.md`, `test/director-mode.test.mjs`, `test/director-shot-review.test.mjs`, `package.json`, `package-lock.json`.

- [ ] Write failing safe-file/quality-presentation tests for shot artifacts and findings.
- [ ] Show every shot in order with image, narration, time and reason; click seeks the final MP4. Add the safe artifact route.
- [ ] Document the limits, run `node test/run-quality.mjs`, build 1.6.2 and verify the packaged app.
