// Nova Studyo: YouTube thumbnail stills. Usage:
//   ELECTRON_RUN_AS_NODE=1 <Nova Studyo.exe> bin/nova-thumbs.mjs <spec.json>
// spec.json: { items: [{props, out}], assets: {publicPath: sourceFile}, workDir, bundleDir? }
// stdout: one JSON event per line — {"type":"log"}, {"type":"done","files":[...],"failed":[...]}, {"type":"error"}.
import { readFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import { renderThumbnails } from '../lib/thumbnail.mjs';

// Background work: below-normal priority (inherited by Chrome), like nova-run.mjs.
try { setPriority(process.pid, Number(process.env.NOVA_RENDER_PRIORITY ?? 10)); } catch {}

const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const finish = (code) => process.stdout.write('', () => process.exit(code));
let stop = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (stop) process.exit(130); stop = true; });

try {
  const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const res = await renderThumbnails({ ...spec, log: (msg) => say({ type: 'log', msg }), cancelled: () => stop });
  say({ type: 'done', ...res });
  finish(0);
} catch (e) {
  say({ type: 'error', msg: String(e?.message ?? e).slice(0, 500), stack: String(e?.stack ?? '').slice(0, 2000), cancelled: !!e?.cancelled });
  finish(1);
}
