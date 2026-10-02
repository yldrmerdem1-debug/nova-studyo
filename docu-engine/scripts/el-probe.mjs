// Probes what the ElevenLabs key can actually do: Turkish TTS with word
// timings, and sound-effect generation. Tiny inputs so it costs almost nothing.
import { writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('ELEVENLABS_API_KEY yok');
mkdirSync('out/probe', { recursive: true });

const MUSA = 'JKJ5z8hs4F7XP8fr2Y5U';

async function tts() {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${MUSA}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Her şey tek bir sokak arabasıyla başladı.',
      model_id: 'eleven_multilingual_v2',
    }),
  });
  if (!r.ok) return `TTS HATA ${r.status}: ${(await r.text()).slice(0, 200)}`;
  const j = await r.json();
  writeFileSync('out/probe/tts.mp3', Buffer.from(j.audio_base64, 'base64'));
  const a = j.alignment;
  const end = a.character_end_times_seconds.at(-1);
  return `TTS OK — ${a.characters.length} karakter zamanlamasi, ${end.toFixed(2)} sn`;
}

async function sfx() {
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Deep cinematic trailer impact hit with a long reverb tail',
      duration_seconds: 2,
      prompt_influence: 0.5,
    }),
  });
  if (!r.ok) return `SFX HATA ${r.status}: ${(await r.text()).slice(0, 200)}`;
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync('out/probe/hit.mp3', buf);
  return `SFX OK — ${Math.round(buf.length / 1024)} KB`;
}

async function music() {
  const r = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'tense documentary underscore, low strings, pulsing', music_length_ms: 10000 }),
  });
  if (!r.ok) return `MUZIK HATA ${r.status}: ${(await r.text()).slice(0, 200)}`;
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync('out/probe/music.mp3', buf);
  return `MUZIK OK — ${Math.round(buf.length / 1024)} KB`;
}

console.log(await tts());
console.log(await sfx());
console.log(await music());
