# Midway Long Video, Shorts, and Provenance-Aware Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an English Midway documentary of at least 11 minutes and a connected portrait Shorts, while making AI Director preserve the visual boundary between archival evidence and AI reconstruction.

**Architecture:** Research, script, source manifest, voice, curated media, and Nova render outputs live under `quality-review/midway-20260923` and new job directories. A small pure rule in `src/pipeline/transitions.js` reads media provenance when AI Director requests transitions. `render.js` passes the Director flag; `director-policy.js` and `docs/ai-director.md` record the durable editorial lesson.

**Tech Stack:** Node.js ESM, FFmpeg, Nova render/voice modules, ElevenLabs, OpenAI images, U.S. Navy public-domain archive media.

## Global Constraints

- Preserve existing job, video, settings, and API files. No deletion or overwriting outside new job/review outputs.
- Long video 16:9 and at least 660 seconds; Shorts 9:16 and approximately 60 seconds; English Brian voice as in the prior history channel.
- Archival footage is only evidence for what its pixels actually show. AI reconstructions are never credited as archival evidence.
- A model verdict or successful encode alone does not prove publishable historical or editorial quality; inspect final frames and sound.
- The source project is recovered and has no Git repository; do not invent commits.

---

### Task 1: Grounded story and visual inventory

**Files:** Create `quality-review/midway-20260923/fact-check.md`, `content-long.json`, `content-short.json`, `sources.json`, and `assets/`.

**Interfaces:** Each content JSON has a title and chronological sections with paragraphs; visual inventory records local file, source URL, license, what the asset actually depicts, and permitted use. The final renderer consumes these files.

- [ ] Read NHHC chronology, action narrative, and archival captions; record precise claims and disputed simplifications in `fact-check.md`.
- [ ] Write an original 11+ minute long script and a ~60 second Shorts hook. Verify names, dates, losses, and the 10:22–10:26 window against the source list.
- [ ] Download official public-domain film and selected photos; inspect multiple frames before assigning a clip to a claim. Keep exact source URLs and rights metadata.

### Task 2: Source-boundary transition rule

**Files:** Create `test/director-provenance-transition.test.mjs`; modify `src/pipeline/transitions.js`, `src/pipeline/render.js`, `src/pipeline/director-policy.js`, `test/run-quality.mjs`, and `docs/ai-director.md`.

**Interfaces:** `planTransitions(beats,{...,director:true})` suppresses overlap within a segment or section when one beat is evidence and the other AI illustration; unchanged for non-Director work. The new Director policy version enters the existing render cache key.

- [ ] Write a failing test using one evidence clip and one AI illustration; require a hard cut between them in Director mode, and unchanged non-Director transitions. Include the reverse order and section boundary.
- [ ] Run `node --test test/director-provenance-transition.test.mjs` and confirm the expected red case.
- [ ] Implement the minimal provenance classification and transition rule, pass `director` from `renderAll`, and increase `DIRECTOR_POLICY_VERSION` with a literal rule.
- [ ] Run the focused test and `node test/run-quality.mjs`; update the Director documentation.

### Task 3: Voice and edited long video

**Files:** Create production helpers and audit records only in `quality-review/midway-20260923`; new job artifacts in `data/jobs/<new-id>`.

**Interfaces:** Use Nova `newJobFromRequest`, `synthesizeAll`, and `renderAll` with curated `script.json`, `tts.json`, `media.json`; preserve `sourceId`, illustration flags and local provenance.

- [ ] Generate Brian narration with saved per-segment checkpoints; confirm at least 660 seconds and correct English pronunciation.
- [ ] Map each spoken moment to a verified archive excerpt, official still, a native explanatory map, or clearly labeled AI reconstruction. Avoid source restarts and unused loops.
- [ ] Render the long video, compare final cuts to narration, check technical timing/audio/subtitles, replace weak scenes, and rerender until the review report is acceptable.

### Task 4: Shorts, publishing assets, and installed app

**Files:** Create `Midway - YouTube Paketi/` and `Midway - Shorts Paketi/` with MP4, SRT, cover, metadata, credits, and quality report. Update package version only after tests.

**Interfaces:** Shorts points at the long video's question and uses its own portrait composition; full source credits remain in both descriptions.

- [ ] Render a portrait Shorts with a distinct first-three-second hook, readable captions, safe subject crop, and no unsupported claim.
- [ ] Make long thumbnail, Shorts cover, concise titles/descriptions, source and rights notes. Package with recorded file sizes/hashes.
- [ ] Verify both MP4s with FFprobe/FFmpeg, listen and inspect sampled frames, and fix any defects found.
- [ ] Build and install the updated app if authorized by the current user request; verify installed version and bundled source hashes. Report any unavailable provider or incomplete live check honestly.
