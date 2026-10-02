// Render-only entry (cloud / remote machine): a produced video's props.json + its public/ dir ->
// the mastered mp4. Every paid step (script, voice, pictures, music) already ran on the PC
// (produce planOnly); this machine only draws frames and masters the audio. No API keys.
//
//   node bin/render-props.mjs <props.json> <public dir> <out.mp4> [--concurrency N]
import { readFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { masterAudio, render } from '../lib/produce.mjs';

const args = process.argv.slice(2);
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const [propsFile, publicDir, out] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--concurrency');
if (!propsFile || !publicDir || !out) {
  console.error('usage: node bin/render-props.mjs <props.json> <public dir> <out.mp4> [--concurrency N]');
  process.exit(2);
}
// Each browser tab holds ~0.5-1 GB and one busy core: half the cores, capped by memory.
const concurrency = Number(flag('--concurrency')) || Math.max(1, Math.min(Math.floor(os.cpus().length / 2), Math.floor(os.totalmem() / 2e9)));
const script = JSON.parse(readFileSync(propsFile, 'utf8')).script;
const work = dirname(resolve(out));
mkdirSync(work, { recursive: true });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
let last = -1;
const progress = (_stage, pct) => {
  const p = Math.floor(pct);
  if (p !== last) log(`ilerleme %${p}`);
  last = p;
};
log(`render: ${script.scenes?.length ?? 0} sahne, eşzamanlılık ${concurrency}, ${os.cpus().length} çekirdek`);
const r = await render({
  script,
  publicDir: resolve(publicDir),
  workDir: work,
  chunkDir: join(work, 'chunks'),
  id: script.id ?? 'video',
  ffmpeg: process.env.FFMPEG || 'ffmpeg',
  log,
  progress,
  cancelled: () => false,
  concurrency,
});
const m = masterAudio({ video: r.video, audio: r.audio, out: resolve(out), ffmpeg: process.env.FFMPEG || 'ffmpeg', log });
r.cleanup();
r.drop();
log(`hazır: ${resolve(out)} (${m.outputI ?? '?'} LUFS, ${((Date.now() - t0) / 60000).toFixed(1)} dk)`);
