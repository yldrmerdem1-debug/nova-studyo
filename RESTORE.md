# Restoring Nova Studyo from scratch

This repository holds all of Nova Studyo's source code. Large user data (audio library, settings, history files) and the ready-made installer are not in the repo; they are attached to a GitHub **Release** (`yedek-...`).

## Easiest: the ready-made installer

1. GitHub → this repo → **Releases** → the latest `yedek-...` release.
2. Download `Nova.Studyo.Setup.X.exe` and install it to `D:\Nova Studyo\Uygulama` (silent install: `"Nova Studyo Setup X.exe" /S /D=D:\Nova Studyo\Uygulama`).
3. Download both `nova-veri-*.zip` files from the same release and extract them into `D:\Nova Studyo\data` (they contain `audio-library`, `tools`, the history JSON files and `settings.json`).
4. Open Nova and re-enter the API keys in **Settings** (Anthropic, OpenAI, ElevenLabs, Kling, Replicate, Pexels, Pixabay, Unsplash, Europeana, Higgsfield, fal). The keys in the backed-up `settings.json` were blanked for safety; every other preference is kept.

## From source

Requirements: Node.js 22+ and Git (ffmpeg ships inside the app via `ffmpeg-static`).

```bash
git clone https://github.com/yldrmerdem1-debug/nova-studyo.git "D:/Nova Studyo/source/nova-studio"
cd "D:/Nova Studyo/source/nova-studio"
npm install
cd docu-engine && npm install && cd ..
npm test
npm run dist        # the installer lands in dist/
```

After installing, steps 3 and 4 above (data zips + API keys) are the same.

## Deliberately not backed up

- `data/jobs`, `data/shorts`, `Ciktilar`: finished videos and per-video work folders (hundreds of GB). They do not fit on GitHub and are not needed to make new videos.
- `data/docu-cache`: picture/audio cache; Nova downloads or regenerates it when needed.
- `data/docu-runtime`: the Chrome build Remotion downloads; it comes back on the first render.
- `node_modules`, `dist`: rebuilt by `npm install` / `npm run dist`.
- API keys: never put on GitHub.
