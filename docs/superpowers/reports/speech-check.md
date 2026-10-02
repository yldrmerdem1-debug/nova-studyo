# Optional paid speech comparison — 2026-09-07

Implemented in `src/speech-check.js`; root owns API/UI integration and any explicitly authorized live check.

## Contract

- `readSpeechCheck(id)` synchronously returns `{available, stale, report:null|report}`. Availability requires an inactive job, completed output, script, no pending render/edit lock, and configured ElevenLabs access. An old report remains readable and is marked stale when the final output/script signature changes or edits await rendering.
- `await checkSpeech(id, {force?:boolean}={})` returns a report. A matching cache avoids extraction and provider calls; `force:true` explicitly repeats the paid check. Active/shared-locked jobs and pending script edits return Turkish 409 errors.
- Report: `{jobId,checkedAt,source:'elevenlabs-scribe',model:'scribe_v2',signature,expectedText,transcript,comparison:{expectedWords,recognizedWords,editDistance,wordDifferenceRatio},findings:[{message,timestamp?,expected?,recognized?}],note}`.
- Files: `job/speech-check/final-audio.wav` and atomic `report.json`. No key or full provider payload is stored. No existing video is modified.

## Behavior and boundaries

Actual final MP4 duration is measured using bundled FFprobe with a 30-second timeout. Only 0.1-second through 30-minute sources are accepted. Bundled FFmpeg extracts **only audio**, 16 kHz mono PCM WAV, with a two-minute timeout. Audio must fit 64 MB. MP4 bytes/images are never submitted.

One multipart POST is made to ElevenLabs `/v1/speech-to-text` with `model_id=scribe_v2`, `file` WAV, `timestamps_granularity=word`, `tag_audio_events=false`, and language `tr` or `en`. Three-minute request timeout, no automatic retries. Uncertain transport failures explicitly say the provider may already have processed the request. Response bodies are bounded to 4 MB; text to 200,000 characters and 10,000 words.

Comparison normalizes Unicode, Turkish/English casing, apostrophes, punctuation and TTS tags. Exact word edit distance uses two rows and linear memory. Ratio is distance divided by expected word count (can exceed 1 for many insertions). Up to 24 local difference hints are shown; timestamps are attached only where normalized provider word order matches the transcript. Hints are possible differences, not a pronunciation diagnosis. Number spelling and special-name differences are explicitly uncertain. No claim of listening or subjective voice-quality verification is made.

Official request contract checked: [ElevenLabs Create transcript](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).

## Verification

`node --test test/speech-check.test.mjs` — **4 passed, 0 failed**.

Behavior tests were observed RED with stubbed implementation, then GREEN. Native FFmpeg generated a small local fixture. All provider responses were in-memory fakes; no live provider calls or real settings/key files were read. Checks cover normalization/edit distance, bounded text, PCM format/form fields, cache reuse, explicit force, stale output/script detection, active/edit locks, pending rerender rejection, no retry after HTTP 503, and a tiny real 1801-second container rejected despite misleading one-second job metadata. Missing credentials reject before provider calls. Tests use isolated NOVA_HOME/TEMP/TMP.
