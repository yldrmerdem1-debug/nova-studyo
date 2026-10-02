# Pilot final-mix local speech check

Verified the final job `20260907-9d7671` publication at `2026-09-07T22:25:19Z` after its status became `done` and `needsRerender` became false. This is the 1.3.1 restrained editorial publication after the final orbital-map frame correction. Its complete decoded audio matches the locally transcribed 22:20:01 UTC interim publication exactly, so the existing transcript and measurements apply through audio equivalence. No new transcription was claimed or required for this final visual-only correction. Local machine transcription recovered all four narration sections, including the closing sentence ending at 54.40 seconds. No entire sentence omission is apparent in the transcript. Two small differences remain after explicitly normalizing spelling and number formats; either could be a recognition error. This is machine transcription and signal measurement, not human listening or a pronunciation certificate.

The exact final video was `C:/Users/erdem/Videos/Nova Studyo/data/jobs/20260907-9d7671/output.mp4`. SHA-256 was unchanged before and after the final decoded-audio comparison:

`71652ed15f297c2c91f2e7dee15f5520b47d3e4d1b94ddae44d7950656ebb15b`

## Transcript comparison

| Comparison | Expected words | Recognized words | Word edit distance | Difference ratio |
| --- | ---: | ---: | ---: | ---: |
| Case/punctuation/apostrophe normalization | 153 | 153 | 10 | 6.54% |
| Additional documented spelling/number equivalents | 153 | 152 | 2 | 1.31% |

These are differences between the script and automatic transcript, not measured speech-error rates. The secondary comparison removes numeric thousands separators and equates `boot print` with `bootprint`, `centimeters` with `centimetres`, `81000` with `eighty one thousand`, and `2 centimetres` with `two centimetres`. Both original and normalized results are retained.

| Approximate time | Expected | Recognized | Interpretation |
| --- | --- | --- | --- |
| 7.32 s | afterward | afterwards | Small lexical variation; possible recognition error. |
| 13.48 s | bootprint | boot print | Word segmentation only. |
| 27.58 s | A 2016 | 2,016 | Number formatting plus possibly unrecognized opening article. Review this short passage if exact wording matters. |
| 33.36 s | two centimetres | 2 centimeters | Number and regional spelling equivalents. |
| 34.98 s | eighty-one thousand | 81,000 | Number formatting equivalent. |

All four sections have recognizable coverage: opening and Apollo trails at 0.00–10.82 s; bootprint and lunar soil at 11.84–26.34 s; the qualified 2016 study estimate at 27.58–40.16 s; solar wind, impacts, and closing distinction at 41.14–54.40 s. The final recognized word ends 3.00 seconds before the container ends; this includes any remaining speech-file silence, transitions, and configured ending. This measured interval is not a subjective assessment of the video tail.

## Final-media measurements

| Measurement | Result |
| --- | --- |
| Container duration | 57.400 s |
| Video | H.264, 1920 × 1080; stream duration 57.334 s |
| Audio | AAC, stereo, 48 kHz; stream duration 57.400 s |
| Measured integrated loudness | -14.07 LUFS |
| Measured true peak | -1.45 dBTP |
| Measured loudness range | 2.60 LU |

Loudness figures are FFmpeg `loudnorm` **input** measurements from the transcribed interim mix, carried forward because the complete decoded final audio is byte-identical. The tool's hypothetical normalized-output values are retained in the raw JSON but were not applied. No job media or source code was changed by this check. These signal figures do not establish perceived music balance, articulation, or subjective quality.

## Local method and evidence

An isolated Python virtual environment and public `base.en` model were installed beneath `C:/Users/erdem/Videos/Nova Studyo/quality-review/asr-runtime`. Inference used faster-whisper 1.2.1 / CTranslate2 4.8.2 on CPU with int8, four CPU threads, beam size 5, word timestamps, VAD, and previous-text conditioning disabled. The model ran from its local folder with offline access enabled and no initial prompt or script conditioning. This follows the project's documented CPU int8 and word-timestamp interfaces. [Official faster-whisper documentation](https://github.com/SYSTRAN/faster-whisper)

For the 22:20:01 UTC interim publication, bundled FFmpeg extracted only the finished video's final audio mix to mono 16 kHz PCM WAV for local analysis. Inference took 10.141 seconds; decoded audio duration was 57.344 seconds and VAD-retained duration was 55.152 seconds. No audio was uploaded, no paid API was called, and no further ElevenLabs request was made. Public model/package downloads were setup only; global Python settings were not modified.

Evidence directory: `C:/Users/erdem/Videos/Nova Studyo/quality-review/pilot-asr/`.

- `transcript.txt` and `transcript.json`: complete recognized text, segments, word timestamps/probabilities, and runtime metadata.
- `expected.txt` and `script-snapshot.json`: script used for the comparison.
- `comparison.json`: original comparison, source hash, difference timestamps, and raw loudness measurement.
- `format-normalized-comparison.json`: explicit equivalence rules and remaining differences.
- `ffprobe.json`: final container and stream measurements.
- `final-mix-mono16k.wav`: locally extracted analysis audio.

Reproduction script: `C:/Users/erdem/Videos/Nova Studyo/quality-review/asr-runtime/check_pilot.py`. Exact installed versions: `C:/Users/erdem/Videos/Nova Studyo/quality-review/asr-runtime/requirements-frozen.txt`.

First-pass evidence, including its original report, is preserved under `C:/Users/erdem/Videos/Nova Studyo/quality-review/pilot-asr/pass-aeb5cef11340/`. Revision-2 evidence and its report are preserved under `C:/Users/erdem/Videos/Nova Studyo/quality-review/pilot-asr/pass-313fd30759df/`. The preceding editorial publication and its report are preserved under `C:/Users/erdem/Videos/Nova Studyo/quality-review/pilot-asr/pass-f4142531ff42/`. The preceding visual-polish publication and its report are preserved under `C:/Users/erdem/Videos/Nova Studyo/quality-review/pilot-asr/pass-ca8c768a83f3/`. The ASR-verified interim 1.3.1 publication and its report are preserved under `C:/Users/erdem/Videos/Nova Studyo/quality-review/pilot-asr/pass-260bd0db4569/`. The current comparison and container evidence describe the final corrected 1.3.1 publication. The revised check loaded the existing local model without a download.





## Final-publication audio equivalence

At 22:25:19 UTC, both the ASR-verified interim publication (`260bd0db45698e0b2522ddff6c9217400df2083cb7f8fded5e25aff100c5226e`) and final publication decoded to the same complete stereo 48 kHz PCM signed-16-bit byte sequence. FFmpeg performed no resampling or channel conversion. SHA-256 of each decoded stream was:

`8d1b04c3c981178edc9eef214a15a2fd7636d4c84a108afd378ba49349cb1965`

`audio-equivalence.json` records both video hashes, both decoded-audio hashes, the equality result, and the final verification timestamp. `decoded-audio-reference.json` records the interim baseline. `comparison.json` retains the original ASR timestamp and source video hash alongside the final video's hash. `ffprobe.json` was freshly generated for the final file. Transcript files and the analysis WAV remain the original local ASR evidence; they were not falsely relabeled as a new transcription. The decoded-audio equality supports carrying forward narration coverage and signal measurements, but does not certify visual changes or subjective listening quality.
