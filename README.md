# Nova Studyo

A Windows desktop app (Electron) that produces long YouTube videos and Shorts in one pipeline:

**research → script → pictures/archive → narration → edit (documentary engine) → captions → render → thumbnail + title + description**

Version: **1.16.29**

## What it does

- **Long documentary videos** (history, news, finance): chaptered scripts, real archive photos (Wikimedia Commons etc.), maps, counters, timelines, quote cards, period music.
- **Shorts**: a teaser for the long video, vertical edit, its own cover.
- **Documentary engine** (`docu-engine/`): Remotion-based editor with look variants, opening types, an audio director and an edit critic.
- **Packaging**: thumbnail (OpenAI images), title, description, tags.

## Folders

| Folder | Contents |
|---|---|
| `src/` | App and pipeline code |
| `docu-engine/` | Documentary edit/render engine (Remotion) |
| `electron/` | Desktop window |
| `server.js` | Local server and API (`/api/jobs/...`) |
| `test/` | Tests (`npm test`) |
| `docs/` | Design notes |
| `SURUM-NOTLARI.md` | Release notes |

## Services (keys are entered in Settings)

Anthropic (Claude), OpenAI (images), ElevenLabs (narration), Kling (motion shots), Replicate, fal, Higgsfield, Pexels, Pixabay, Unsplash, Europeana. Keys live in `data/settings.json` and are **never committed**.

## Install

- **Ready-made installer + user data:** the latest `yedek-...` release on the Releases page.
- **Step-by-step restore:** [RESTORE.md](RESTORE.md)

Run from source:

```bash
npm install
cd docu-engine && npm install && cd ..
npm start          # open the app
npm test           # tests
npm run dist       # Windows installer → dist/
```
