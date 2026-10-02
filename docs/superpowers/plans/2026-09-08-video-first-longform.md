# Video-First Long-Form Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Normal mode's relevant video coverage, multi-frame clip validation, motion-aware transitions, and long-form quality evidence.

**Architecture:** Add pure policy and reporting modules, then connect them to the existing search, audit, transition and render stages. Keep the existing fallback and licensing gates intact.

**Tech Stack:** Node.js ESM, FFmpeg/FFprobe, node:test, existing vision and render pipelines.

## Global Constraints

- Never force a video below the relevance threshold.
- Preserve 16:9 long-form defaults and 12/20-minute presets.
- Do not make paid provider requests during verification.
- Keep transition timing frame-exact and narration-synchronized.

---

### Task 1: Relevant video promotion

**Files:** Create `src/pipeline/video-policy.js`; modify `src/pipeline/media.js`; test `test/video-first-longform.test.mjs`.

**Interfaces:** `videoEligible(visual)`, `shouldSearchVideo(job, visual)`, `preferRelevantVideo(list, job, visual)`.

- [ ] Write assertions proving documents/portraits stay image-first and a relevant video within the score margin beats a still.
- [ ] Run `node --test test/video-first-longform.test.mjs` and confirm missing exports fail.
- [ ] Implement the pure policy and use it when gathering candidates and choosing automatic picks.
- [ ] Run the focused test and confirm it passes.

### Task 2: Multi-frame video audit

**Files:** Modify `src/pipeline/gorseldenetim.js`, `src/pipeline/index.js`; test `test/video-audit-contact-sheet.test.mjs`.

**Interfaces:** `videoSampleTimes(durationSec)` returns three safe timestamps; `makeAuditPreview(...)` returns the generated JPEG path.

- [ ] Write a test that creates a three-color video, extracts its contact sheet and verifies three panels are present.
- [ ] Run the test and confirm missing behavior fails.
- [ ] Implement FFprobe-based timestamps, FFmpeg contact sheet, aggregate consistency and flow fields.
- [ ] Persist `akis` and `videoTutarlilik` on selected media and route weak clips through existing replacement.
- [ ] Run the focused test and confirm it passes.

### Task 3: Motion-aware transitions

**Files:** Modify `src/pipeline/transitions.js`, `src/pipeline/render.js`; test `test/video-first-longform.test.mjs`.

**Interfaces:** `motionAwareTransition(transition, previousMedia, nextMedia)` returns a safe transition.

- [ ] Add failing tests for incoming left/right flow and conflicting motion.
- [ ] Implement directional slides and dissolve fallback without changing transition duration.
- [ ] Persist motion and media identity in `edit-plan.json`.
- [ ] Run transition and render-focused tests.

### Task 4: Long-form evidence and delivery

**Files:** Create `src/pipeline/longform-quality.js`; modify `src/pipeline/render.js`, `src/postflight.js`, `test/run-quality.mjs`; test `test/video-first-longform.test.mjs`.

**Interfaces:** `measureVisualQuality(beats, transitions)` returns duration-weighted coverage and warning inputs.

- [ ] Add a failing 12-minute/144-scene test for exact duration, coverage, repetition and transition metrics.
- [ ] Implement `visual-quality.json` and long-form review warnings.
- [ ] Run focused tests, `npm run test:quality`, package verification and build.
- [ ] Install the update, verify `/api/health`, and inspect the installed UI without starting a paid job.

