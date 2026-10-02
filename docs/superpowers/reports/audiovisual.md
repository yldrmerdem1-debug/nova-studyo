# Audiovisual engine implementation — 2026-09-07

Implemented seven deterministic content profiles: belgesel, hikaye, haber, analiz, egitim, top5 and vox. `getStyleProfile(theme, intensity='balanced')` exports id/name/description/hookGuidance plus camera, transition, music and sound policies. Unknown themes fall back to documentary. Intensity accepts canonical restrained/balanced/dynamic; subtle/energetic remain aliases. News moves less and uses fewer effects; documentary/story use eased motion; lists and visual explanations use more frequent, restrained accents.

Renderer resolves `getJobSettings(job)` and explicit job editIntensity/soundDesign/sfxVolume/musicVolume. It threads the profile through classic, collage and cinematic camera paths, genre transition palettes/density and the optional edit-direction prompt. Manual `transitions:'yok'` remains hard cuts; subtitle mode stays unchanged. Scene duration selection varies with the profile; absolute frame layout preserves narration timing. Configured CRF is honored by collage and subtitle final encodes; cleaner intermediate encodes remain intentional.

Audio has separate narration, music and original SFX stems. Four deterministic damped percussion/tonal cues (tick, pop, bell, soft-hit) are generated locally from oscillators, not samples or downloads. Cues only mark chapter/data emphasis events, with genre-dependent minimum spacing, bounded duration and gain. No cue is attached indiscriminately to every cut. soundDesign=false or sfxVolume=0 disables cues. Music volume zero skips music inputs entirely. Placeholder yatak-* drones are excluded; missing genuine music produces an actionable Turkish warning. Existing music files are still selected by theme/role. Track-level normalization and speech sidechain ducking remain; gradual chapter gain envelopes continue even when all chapters share a single track. Final audio receives the existing measured two-pass loudness normalization, then a separate measurement of the actual encoded AAC output.

Artifacts in supplied jobDir:

- `edit-plan.json`: profile, CRF/FPS, frame total, transition plan and scene timing/camera policy.
- `sound-plan.json`: cue events/origin, music sources/policy, pre-normalization and actual encoded loudness measurements, warnings.
- `render/sfx.wav`: original sparse SFX stem when cues exist.

`renderAll` additionally returns `qualityWarnings:string[]`, `quality:{profile,audio,warnings}` and `reviewArtifacts:['edit-plan.json','sound-plan.json']`. Recovery should promote these artifacts and use warnings for review state. `audio` has integratedLufs, truePeakDb, loudnessRange and targetTruePeakDb, or null when measurement is unavailable.

Recovery integration: `cachedKurguPlani` stores atomic `kurgu-plan-cache.json` under `job.recoveryDir || jobDir`. Key includes scenes, title, profile and model. A valid identical cache avoids another paid edit-planning call after render failure. Changed scenes invalidate it; corrupt JSON is regenerated. Recovery supplies the stable root directory. No tests made paid requests.

## TDD evidence

Commands executed in source directory with:

```powershell
$env:NOVA_HOME='C:\Users\erdem\Videos\Nova Studyo\quality-review\audiovisual-home'
$env:TEMP=$env:NOVA_HOME
$env:TMP=$env:NOVA_HOME
```

- `node --test test/pro-style.test.mjs`: initial RED 4 failures for missing profiles/planner, no sparse policy, and placeholder drone planning. GREEN after implementation. Added single-track chapter dynamics test RED (missing eval=frame envelope), then GREEN. Added manual transition intensity regression RED (profile palette replacement lost scaling), then GREEN. Final 7/7 pass, including a RED/GREEN canonical UI intensity mapping test.
- `node --test test/pro-render.test.mjs`: RED at missing edit-plan.json after an actual render, then GREEN. Final test includes news/list collage plus standard documentary with actual SFX events; all use generated originals and offline speech-like pulses.
- `node --test test/pro-edit-cache.test.mjs`: RED missing cache function; GREEN verifies invocation counts on retry, changed text and corrupt cache.
- `node --test test/pro-audio-motion.test.mjs`: native FFmpeg coverage of all seven camera chains and separate speech-like/music/SFX stems, actual encoded loudness, sparse PCM occupancy and exact two-second camera clip duration. Also exercises cinematic renderScene with profile.

Combined render/style/audio run passed 7/7 before adding the final cache and intensity regression. Final focused style/cache run passed 7/7; the two already-passed native tests plus canonical intensity test make 10 current tests total. No deletion of existing videos or source assets; generated tests use fresh mkdtemp directories within verified isolated quality-review home.

## Native FFmpeg results

Full rendered output directory: `C:/Users/erdem/Videos/Nova Studyo/quality-review/audiovisual-home/pro-render-8pAoId`.

| Profile | MP4 duration | Integrated | True peak | LRA |
|---|---:|---:|---:|---:|
| haber (music/SFX disabled) | 12.467 s | -14.00 LUFS | -10.29 dBTP | 0.3 LU |
| top5 (original music enabled) | 12.467 s | -13.99 LUFS | -9.97 dBTP | 0.3 LU |
| belgesel (chapter music/SFX) | 21.800 s | -14.02 LUFS | -9.01 dBTP | 4.7 LU |

Duration error is below one frame at fixture 15 FPS. Documentary frame at 5 seconds was extracted and visually inspected: full image coverage, legible unclipped chapter text, no burned subtitles. Fixture deliberately uses a diagnostic test image and synthetic voice-like audio, not a claim of subjective storytelling quality.

Seven-genre audio/camera directory: `C:/Users/erdem/Videos/Nova Studyo/quality-review/audiovisual-home/pro-stems-MN5gck`; `measurements.json` stores results. Each audio test is 24 seconds; SFX active occupancy below 6%, raw stem peak below 0.12 full scale. Cue counts: documentary/story/analysis/education/vox 2, news 1, top5 3. Mastered loudness -14.01 to -14.00 LUFS; true peak -9.06 to -7.84 dBTP. All seven camera clips probe as exactly 2 seconds. Real section music envelope filters and cinematic camera filter both executed successfully.

## Legacy checks

Passed: `gecis-plan.test.mjs`, `kurgu-plani.test.mjs`, `gecis-niyet.test.mjs`, `muzik.test.mjs` (including native frequency/duration checks), `nefes-ve-yapi.test.mjs`, `muzik-pompalama.test.mjs`, `kamera.test.mjs` (including native frame measurements), `import-butunlugu.test.mjs`.

Authorized legacy updates: music planning fixture filenames now represent genuine tracks instead of placeholder drones; camera source assertions accept the new profile parameter, while the new tests exercise actual filters for all seven genres. `muzik-kunyesi.test.mjs` exposed unrelated changed-contract assertions for truthful music source and new index destructuring; communicated to editorial/recovery owners for correction.

Limits: synthetic fixtures establish timing, signal bounds and executable filters. They do not establish human speech intelligibility across every provider or subjective editing quality; review with surviving original narration/media remains root's delivery step. No paid provider end-to-end request, no guaranteed engagement claim, no external music licensing assumptions.


## Full-suite A/V regression found and fixed

The native `hareket-uctan-uca.test.mjs` exposed a real tail truncation: planned silent video had 938 frames / 31.267 seconds, but final stream-copy output had only 934 frames / 31.134 seconds while AAC was 31.260. The final mux used `-shortest`, which dropped reordered H.264 tail packets when audio was a fraction of a frame shorter. Both streams are already plan-bounded, so the redundant shortest option was removed. RED evidence was the full-suite failure AV delta 0.126; GREEN native rerun passes both 9:16 and 16:9 with output 31.267 and AV difference 0.007 seconds. No test tolerance relaxed. Also updated the legacy music-stage source regex to a functional `muzikZinciri` gain assertion; `muzik-seviye.test.mjs` native test now passes.
