// Komut satırından üretim:  node scripts/produce.mjs videos/<ad>.json
// Anahtarlar ortam değişkenlerinden: ELEVENLABS_API_KEY, REPLICATE_API_TOKEN.
// Ses kütüphanesi: NOVA_AUDIO_LIB (yoksa Nova'nın data/audio-library klasörü); müziği ElevenLabs'e
// besteletmek için NOVA_MUSIC_SOURCE=eleven. Asıl iş lib/produce.mjs'de; Nova Studyo aynı kütüphaneyi
// bin/nova-run.mjs ile çalıştırır.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ENGINE_DIR, produce } from '../lib/produce.mjs';

const input = process.argv[2];
if (!input) throw new Error('kullanım: node scripts/produce.mjs videos/<ad>.json');
const script = JSON.parse(readFileSync(input, 'utf8'));
script.id ??= basename(input, '.json');

await produce(script, {
  workDir: join(ENGINE_DIR, 'out'),
  publicDir: join(ENGINE_DIR, 'public'),
  buildPrefix: `build/${script.id}`,
  cacheDir: join(ENGINE_DIR, 'public'),
  output: join(ENGINE_DIR, 'out', `${script.id}.mp4`),
  keys: { eleven: process.env.ELEVENLABS_API_KEY, replicate: process.env.REPLICATE_API_TOKEN },
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  audioLibrary: process.env.NOVA_AUDIO_LIB || undefined,
  musicSource: process.env.NOVA_MUSIC_SOURCE || undefined,
});
