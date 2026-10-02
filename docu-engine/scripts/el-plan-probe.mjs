// Does ElevenLabs Music accept a sectioned composition plan? If so the score
// can follow the story: quiet intro, rising tension, a drop, a sad resolve —
// each section timed to the scenes it sits under.
const KEY = process.env.ELEVENLABS_API_KEY;
const r = await fetch('https://api.elevenlabs.io/v1/music/plan', {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Documentary score: curious intro, building tension, a dramatic drop, then a sad reflective ending',
    music_length_ms: 30000,
  }),
});
console.log('plan HTTP', r.status);
const txt = await r.text();
console.log(txt.slice(0, 1500));
