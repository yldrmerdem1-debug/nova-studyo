// Görünüş doğrulaması (29 Ekim 2026, "videolar hep siyah, hep aynı"): bitmiş bir işin sahnelerini YENİ görünüş
// kurallarıyla yeniden planlar (konu kimliği + sanat yönetmeninin modelsiz planı + kurgu dilbilgisi) ve aynı karelerin
// eski videodaki hâliyle yan yana karşılaştırma sayfası çıkarır. Ücretli API çağırmaz; tek tarayıcı, düşük öncelik.
//   node scripts/look-verify.mjs <iş klasörü> <çıktı klasörü> [--n 16]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR } from '../lib/produce.mjs';
import { placeTimeline } from '../src/timeline.js';
import { applyEditGrammar } from '../lib/edit-grammar.mjs';
import { buildPlan, applyArtPlan, loadCatalogs } from '../../src/pipeline/docu-art-director.js';
import { topicIdentity } from '../../src/pipeline/docu-topic-bible.js';

try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
const args = process.argv.slice(2);
const [jobDir, outDir] = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--n');
const N = Number(args.includes('--n') ? args[args.indexOf('--n') + 1] : 16);
if (!jobDir || !outDir) { console.error('kullanım: node scripts/look-verify.mjs <iş klasörü> <çıktı klasörü> [--n 16]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const FPS = 30;
const ff = createRequire(join(ENGINE_DIR, '..', 'package.json'))('ffmpeg-static');
const id = jobDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const props = JSON.parse(readFileSync(join(jobDir, 'docu', `${id}.props.json`), 'utf8'));
const old = props.script;

// 1) Yeni plan: önbellekteki konu kimliği onarılır, sanat yönetmeni modelsiz plan kurar, motorun dilbilgisi uygulanır.
let s = structuredClone(old);
const bibleFile = join(jobDir, 'docu-topic-bible.json');
if (existsSync(bibleFile)) {
  const raw = JSON.parse(readFileSync(bibleFile, 'utf8'));
  const bible = raw.bible ?? raw.result ?? raw;
  try { const t = topicIdentity(bible, s); if (t) s.topic = t; } catch (e) { console.warn('konu kimliği onarılamadı:', e.message); }
}
for (const sc of s.scenes) { delete sc.grade; delete sc.backdrop; delete sc.fx; }
const plan = buildPlan(s, { history: [], catalogs: loadCatalogs() });
s = applyArtPlan(s, plan, { logFn: (m) => console.log('›', m) });
applyEditGrammar(s, { gravity: s.editGravity ?? undefined });
writeFileSync(join(outDir, 'yeni-plan.json'), JSON.stringify({ look: s.look, grading: plan.grading, topic: s.topic && { grade: s.topic.grade, accentGrade: s.topic.accentGrade, motif: s.topic.motif }, chapterLooks: s.chapterLooks }, null, 1));
console.log('yeni plan:', JSON.stringify(plan.grading), 'görünüş', s.look?.variant);

// 2) Paket: kaynaktaki src'den ayrı bir paket (kurulu uygulamanın build/bundle'ına dokunmaz).
async function devBundle(dir) {
  const h = createHash('sha1');
  const walk = (d) => { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else h.update(relative(dir, p)).update(readFileSync(p)); } };
  walk(dir);
  const out = join(os.tmpdir(), `docu-look-bundle-${h.digest('hex').slice(0, 12)}`);
  if (existsSync(join(out, 'index.html'))) return out;
  console.log('› paketleniyor', dir);
  const { bundle } = await import('@remotion/bundler');
  const emptyPublic = join(os.tmpdir(), 'docu-look-empty-public');
  mkdirSync(emptyPublic, { recursive: true });
  await bundle({ entryPoint: join(dir, 'index.ts'), outDir: out, publicDir: emptyPublic });
  return out;
}
const bundleDir = await devBundle(join(ENGINE_DIR, 'src'));
const site = join(os.tmpdir(), `docu-look-verify-${process.pid}`);
mkdirSync(site, { recursive: true });
for (const f of readdirSync(bundleDir)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundleDir, f), join(site, f), { recursive: true });
symlinkSync(join(jobDir, 'docu', 'public'), join(site, 'public'), 'junction');

// 3) Kareler: videoya yayılmış N sahnenin ortası; eski kare bitmiş videodan, yeni kare yeni plandan.
const placed = placeTimeline(s.scenes, FPS, s.beats ?? []);
const oldPlaced = placeTimeline(old.scenes, FPS, old.beats ?? []);
const pick = [...new Set(Array.from({ length: N }, (_, k) => Math.round((k * (s.scenes.length - 1)) / (N - 1))))];
const PORT = 3400 + Math.floor(Math.random() * 500);
const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } });
const pairs = [];
try {
  const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: { script: s }, puppeteerInstance: browser, timeoutInMilliseconds: 240000, port: PORT });
  for (const i of pick) {
    const p = placed[i];
    const f = Math.round(p.from + p.frames * 0.6);
    const after = join(outDir, `sonra-${String(i).padStart(3, '0')}.jpg`);
    await renderStill({ composition, serveUrl: site, inputProps: { script: s }, frame: f, output: after, imageFormat: 'jpeg', jpegQuality: 88, puppeteerInstance: browser, timeoutInMilliseconds: 240000, port: PORT });
    const op = oldPlaced[i];
    const t = (Math.round(op.from + op.frames * 0.6) / FPS).toFixed(2);
    const before = join(outDir, `once-${String(i).padStart(3, '0')}.jpg`);
    spawnSync(ff, ['-y', '-v', 'error', '-ss', t, '-i', join(jobDir, 'output.mp4'), '-frames:v', '1', '-vf', 'scale=1920:1080', '-q:v', '3', before]);
    pairs.push({ i, before, after, type: s.scenes[i].type, grade: s.scenes[i].grade ?? '-', oldGrade: old.scenes[i].grade ?? '-' });
    console.log(`sahne ${i} (${s.scenes[i].type}) ${old.scenes[i].grade ?? '-'} → ${s.scenes[i].grade ?? '-'}`);
  }
} finally {
  await browser.close({ silent: true }).catch(() => {});
  rmSync(join(site, 'public'), { force: true, recursive: false });
  rmSync(site, { recursive: true, force: true });
}

// 4) Ölçüm ve karşılaştırma sayfası: sol eski, sağ yeni.
const stats = (file) => {
  const r = spawnSync(ff, ['-v', 'error', '-i', file, '-vf', 'scale=320:-2,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
  const y = Number((r.stdout.match(/YAVG=([\d.]+)/) || [])[1]);
  const sat = Number((r.stdout.match(/SATAVG=([\d.]+)/) || [])[1]);
  return { y, sat };
};
const m = { once: [], sonra: [] };
for (const p of pairs) { m.once.push(stats(p.before)); m.sonra.push(stats(p.after)); }
const avg = (a, k) => a.reduce((x, v) => x + v[k], 0) / Math.max(1, a.length);
const dark = (a) => (100 * a.filter((v) => v.y < 40).length) / Math.max(1, a.length);
const line = (k) => `${k}: parlaklık ${avg(m[k], 'y').toFixed(0)}, doygunluk ${avg(m[k], 'sat').toFixed(1)}, karanlık kare %${dark(m[k]).toFixed(0)}`;
const list = join(outDir, '.list.txt');
writeFileSync(list, pairs.flatMap((p) => [p.before, p.after]).map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
spawnSync(ff, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:270,tile=4x${Math.ceil(pairs.length / 2)}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, 'once-sonra.jpg')]);
rmSync(list, { force: true });
const report = [line('once'), line('sonra'), ...pairs.map((p) => `sahne ${p.i} ${p.type}: ${p.oldGrade} → ${p.grade}`)].join('\n');
writeFileSync(join(outDir, 'olcum.txt'), report + '\n');
console.log(report);
