// Compare narration engines on the same lines:  node scripts/voice-probe.mjs
// Writes out/voice-probe/*.mp3 and prints whether word timestamps came back.
import { mkdirSync, writeFileSync } from 'node:fs';

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = 'JKJ5z8hs4F7XP8fr2Y5U';
mkdirSync('out/voice-probe', { recursive: true });

const tests = [
  {
    name: 'v3-hook',
    model: 'eleven_v3',
    text: '[whispers] Bir tarif... [whispers] Bir sokak... [pause] [serious] Ve bir — ihanet.',
    settings: { stability: 0.0 },
  },
  {
    name: 'v3-reveal',
    model: 'eleven_v3',
    text: '[slowly] Ve o tarif... [pause] bir gece... [dramatic] çalındı.',
    settings: { stability: 0.0 },
  },
  {
    name: 'v3-sad',
    model: 'eleven_v3',
    text: '[sighs] Nermin... [sad] bundan tek kuruş almadı.',
    settings: { stability: 0.5 },
  },
  {
    name: 'v2-context-reveal',
    model: 'eleven_multilingual_v2',
    text: 'Ve o tarif, bir gece çalındı.',
    settings: { stability: 0.3, similarity_boost: 0.82, style: 0.6, use_speaker_boost: true, speed: 0.92 },
    previous_text: 'Ama o tarifi, aslında o yazmamıştı.',
    next_text: 'Nermin, bundan tek kuruş almadı.',
  },
];

for (const t of tests) {
  const body = { text: t.text, model_id: t.model, voice_settings: t.settings };
  if (t.previous_text) body.previous_text = t.previous_text;
  if (t.next_text) body.next_text = t.next_text;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.log(t.name, 'HATA', r.status, (await r.text()).slice(0, 300));
    continue;
  }
  const j = await r.json();
  writeFileSync(`out/voice-probe/${t.name}.mp3`, Buffer.from(j.audio_base64, 'base64'));
  const a = j.alignment;
  const chars = a?.characters?.join('') ?? '';
  console.log(t.name, 'ok', `${a?.character_end_times_seconds?.at(-1)?.toFixed(2)}s`, '| hizalama:', JSON.stringify(chars.slice(0, 90)));
}
