// Transcribe every narration line of a built video and flag stage directions
// that were read aloud ("whispers", "dramatic"...):  node scripts/voice-check.mjs <id>
import { readFileSync } from 'node:fs';

const KEY = process.env.ELEVENLABS_API_KEY;
const id = process.argv[2] ?? 'belgesel';
const { script } = JSON.parse(readFileSync(`out/${id}.props.json`, 'utf8'));
const TAGS = /\b(whisper|dramatic|curious|confident|warmly|quietly|slowly|softly|sighs?|sad|serious|pause)\b/i;

let bad = 0;
for (const [i, s] of script.scenes.entries()) {
  if (!s.voice) continue;
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'tur');
  form.append('file', new Blob([readFileSync(`public/${s.voice}`)]), 'v.mp3');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': KEY }, body: form });
  if (!r.ok) {
    console.log(i + 1, 'HATA', r.status, (await r.text()).slice(0, 200));
    continue;
  }
  const text = (await r.json()).text;
  const leak = TAGS.test(text);
  if (leak) bad++;
  console.log(`${i + 1} ${leak ? 'ETIKET OKUNDU' : 'ok'} | ${text}`);
}
process.exit(bad ? 1 : 0);
