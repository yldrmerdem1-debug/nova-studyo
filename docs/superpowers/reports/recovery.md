# Recovery and scene editor implementation report

Source: C:/Users/erdem/Videos/Yeni klasör/nova-studio

Implemented atomic JSON checkpoints for saved script/sections, media entries, each successful narration segment, SEO and completed render. Startup interruption handling and cleanup preserve source media, TTS, unfinished renders and prior final outputs. Standard and collage paths reuse intact saved sources. Successful section generation uses editorial agent's new optional callback, keyframes/clips use per-result callbacks. Matching narration is reused before quota or provider requests; changed narration gets a separate content-keyed directory, preserving the preceding audio. Saved local media edits are copied into job-owned media/edits with new filenames.

Render runs under attempts/<revision>. Completed output is checked before publication; existing root artifacts are archived under previous/<revision>, replacements staged as .promoting and the video published last. A failed render leaves output.mp4 untouched. A completed render checkpoint avoids rendering again after a downstream interruption. Renderer review artifacts are published and job.quality/job.qualityWarnings/job.needsReview preserved. Source paths and output names remain compatible with existing API.

## API contract

All four functions are synchronous exports from src/pipeline/index.js. Errors carry statusCode 400, 404 or 409.

- resumeJob(jobId): requires inactive error/cancelled/interrupted job; queues resume and returns public job in queued state. Existing active queue/killers and waiting approvals reject duplicate work.
- rerenderJob(jobId): requires an inactive valid script; queues from earliest missing cache, returns public queued job.
- getEditorData(jobId): {job,script,scenes,capabilities}. Each scene: {segId:'sN',sectionIndex,segmentIndex,text,visuals,media:[{beatId,...savedMedia,available}],audioAvailable}. Standard beat IDs are sNbN; collage media uses saved beat IDs. Audio preview can resolve tts.json by segId, field audio.
- capabilities: {canEdit,canResume,canRerender,missingSteps:string[],warnings:string[]}. Missing steps: script/media/voice. Warnings are actionable Turkish messages; missing legacy sources explicitly warn regeneration may require paid providers.
- saveEditorChanges(jobId,{segments:[{segId,text?,mediaPath?}],thumbnailText?,guidance?,regenerateSeo?}): validates entire patch before mutation, rejects duplicate/unknown IDs and fields, text 1–5000 chars, thumbnail 0–120, guidance 0–1000. Local absolute paths only; disallows network paths/URLs and permits JPG/PNG/WebP/MP4/MOV/WebM with signature checks and <=2GB. Copies replacements, preserves other media and every previous audio file. Changes set needsRerender; text/guidance/explicit SEO regeneration invalidate SEO, media-only edits reuse paid SEO and rebuild credits on render. Saved thumbnail text overrides generated thumbnail text.
- Active states include running, queued, awaiting_picks and awaiting_cost; cancelled jobs still finishing callbacks are blocked via killers map.
- New jobs freeze nonsecret settingsSnapshot and usage.model/modelRates. Per-job costBudgetUsd, editIntensity (restrained/balanced/dynamic), soundDesign and sfxVolume are validated. usage.budgetUsd is initialized; zero disables cap per root UI contract.

## Validation

Command: node --test test/recovery-backend.test.mjs test/recovery-cache.test.mjs
Result: 15 tests passed, zero failed (2026-09-07).

Tests set isolated NOVA_HOME/TEMP/TMP before importing application modules. No real jobs/settings were used. Coverage includes startup preservation, selective text invalidation, local media replacement, malformed/missing legacy artifacts, whole-patch validation, active queue/duplicate enqueue rejection, retention during sweep, spend/settings fields, completed render cache reuse, failed replacement preservation and publication backup. End-to-end queue fixture resumed from script/media/TTS/render caches with global fetch guarded: zero provider requests. Narration test uses a mocked Eleven response containing locally generated valid PCM WAV; real bundled ffprobe reads it. One segment fails while another succeeds; retry requests only the missing segment and retains word timing. Collage caches return locally existing assets without provider credentials or requests. Feature tests first reproduced startup data loss/missing API/budget fields and missing collage cache support; later edge test reproduced malformed-script crash before fix.

## Limits and review notes

No live paid provider end-to-end run was made. File cache checks validate saved metadata and nonempty files, not every asset with a full decode on every editor request; render will still surface a corrupted media file as an actionable failed job. The scene upload gate checks signatures rather than decoding a full user-selected file. Multi-file publication is staged with backups and video-last promotion; it is not a filesystem-wide atomic transaction. Previous outputs remain archived if Windows locks a target during promotion.

Settings snapshot is applied to narration, rendering, model and estimate rates; legacy jobs use current settings where no snapshot exists. Some existing external image/video provider helper settings still originate from getSettings(), so no blanket frozen-provider claim is made. Budget tracks estimated model usage, not unknown provider billing. A provider request interrupted before its first completed local result is checkpointed cannot have its billing recovered by this application. Interrupted partial voice/keyframe/media results are checkpointed individually once locally available.

Changed owned files: src/pipeline/index.js, checkpoints.js, editor.js, voice.js, collage.js, aivideo.js; cache hook additions in media.js coordinated with editorial owner. src/store.js needed no modification because existing writeJson uses temporary-file rename. No git initialization or commits; no existing production video altered.


Post-review additions: Explicit cover.json preserves existing edited thumbnail and three variants during video publication (RED/GREEN regression). Shared job-locks.js exclusion prevents local cover/import operations racing queue or scene writes. Legacy completed manual jobs with intact selected media resume without asking for the same selection again. Both new cases have behavior coverage. Existing kesik-alaka and sorgu-onarim source assertions were updated for generalized saved-script resume/cached SEO; both suites passed in isolated data.

Root file review identified custom cover loss, collage publication normalization, saved feedback URL field mismatch, card preview images, missing explicit SEO regeneration action, estimate label wording and cover-versus-render locking. Findings were sent with source references; root is addressing its owned files, and recovery fixed custom cover preservation/shared lock usage. Root code review was read-only until the scoped preservation fix was explicitly reassigned.
