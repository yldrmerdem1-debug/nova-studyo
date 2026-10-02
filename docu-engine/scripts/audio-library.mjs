// Ses kütüphanesi hazırlayıcı — müzik ve efekt dosyalarını Nova'nın kütüphanesine alır,
// her birini ölçer (süre, ses yüksekliği, enerji eğrisi) ve müzikleri bir yapay zekâya
// DİNLETİP etiketletir: hangi duyguya, hangi video stiline, hangi sahneye uyuyor.
// Motor (lib/audio-director.mjs) bu etiketlere bakarak profesyonel bir editör gibi seçer.
//
//   node scripts/audio-library.mjs ingest-music <kaynak klasör> [--source youtube-audio-library]
//   node scripts/audio-library.mjs ingest-sfx <seçim.json>   (Mixkit: id → wav/mp3 indirir)
//   node scripts/audio-library.mjs tag            (etiketsiz müzikleri OpenAI ses modeliyle etiketler)
//   node scripts/audio-library.mjs measure        (eksik ses yüksekliği / efekt başlangıç ölçümlerini doldurur, ücretsiz)
//   node scripts/audio-library.mjs stats
//   node scripts/audio-library.mjs plan <senaryo.json> [stil]   (ses yönetmeninin seçimlerini gösterir; okur, yazmaz)
//
// Kütüphane kökü: NOVA_AUDIO_LIB ya da <NOVA_HOME>/data/audio-library.
// OpenAI anahtarı: NOVA_OPENAI_KEY (yazdırılmaz).
//
// Birden çok komut aynı anda çalışabilir (etiketleme sürerken efekt indirme): library.json
// her yazışta kilit altında diskten yeniden okunur ve yalnızca değişen kayıt işlenir,
// böylece biri diğerinin eklediklerini ezmez.
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.NOVA_AUDIO_LIB || join(process.env.NOVA_HOME || 'C:/Users/erdem/Videos/Nova Studyo', 'data', 'audio-library');
/* ffmpeg: explicit env, else the ffmpeg-static that ships with Nova, else PATH. */
function findFfmpeg() {
  if (process.env.NOVA_FFMPEG) return process.env.NOVA_FFMPEG;
  try {
    return createRequire(import.meta.url)('ffmpeg-static') || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
}
const FFMPEG = findFfmpeg();
const MUSIC = join(ROOT, 'music');
const SFX = join(ROOT, 'sfx');
const INDEX = join(ROOT, 'library.json');
const LOCK = `${INDEX}.lock`;

const load = () => (existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { version: 1, music: [], sfx: [] });
const save = (lib) => {
  const tmp = INDEX + '.tmp';
  writeFileSync(tmp, JSON.stringify(lib, null, 1));
  renameSync(tmp, INDEX);
};
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Run `fn` holding the index lock; a lock left by a crashed run is taken over after 60s. */
function withLock(fn) {
  mkdirSync(ROOT, { recursive: true });
  for (let i = 0; ; i++) {
    try {
      closeSync(openSync(LOCK, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 60_000) {
          rmSync(LOCK, { force: true });
          continue;
        }
      } catch {}
      if (i > 1200) throw new Error(`kütüphane kilidi alınamadı: ${LOCK}`);
      nap(50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(LOCK, { force: true });
  }
}
/** Read-modify-write the index from disk, so concurrent commands never overwrite each other. */
const update = (mutate) => withLock(() => {
  const lib = load();
  const r = mutate(lib);
  save(lib);
  return r;
});

const slug = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const ff = (args) => execFileSync(FFMPEG, args, { maxBuffer: 1 << 28, windowsHide: true });
const round = (x, n = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);

/**
 * Duration, integrated loudness and a 1-second energy curve (dB below the loudest second).
 * With `short` (sound effects): also max momentary loudness (integrated under-reads a
 * one-shot with a long tail), where the sound starts (`onset`, leading silence) and where
 * its loudest 10 ms sits (`peakAt`) — so an explosion can be landed ON the spoken word.
 */
export function measure(file, o = {}) {
  const bin = o.ffmpeg || FFMPEG;
  const SR = 8000;
  const raw = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 1 << 28, windowsHide: true });
  const x = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
  // ebur128 writes its summary to stderr on SUCCESS too: read stderr, not the exit status.
  // (Reading it only from a thrown error is why every entry measured before had lufs: null.)
  const r = spawnSync(bin, ['-hide_banner', '-nostats', '-i', file, '-af', o.short ? 'apad=pad_dur=0.5,ebur128=peak=sample:framelog=info' : 'ebur128=peak=sample', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true });
  const text = String(r.stderr || '');
  const sum = text.slice(Math.max(0, text.lastIndexOf('Summary:')));
  const I = Number((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const P = Number((sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
  const out = { duration: x.length / SR, lufs: Number.isFinite(I) && I > -70 ? I : null, peak: Number.isFinite(P) ? P : null };
  if (o.short) {
    let maxM = -Infinity;
    for (const m of text.matchAll(/M:\s*(-?[\d.]+)/g)) {
      const v = Number(m[1]);
      if (v > -70 && v > maxM) maxM = v;
    }
    out.lufsMax = Number.isFinite(maxM) ? maxM : out.lufs;
    const hop = SR / 100;
    const env = [];
    for (let i = 0; i + hop <= x.length; i += hop) {
      let e = 0;
      for (let j = i; j < i + hop; j++) e += x[j] * x[j];
      env.push(e / hop);
    }
    const top = env.length ? Math.max(...env) : 0;
    const peakIdx = env.indexOf(top);
    const onsetIdx = env.findIndex((e) => e >= top * 1e-3); // within 30 dB of the peak
    out.onset = round(Math.max(0, onsetIdx) / 100);
    out.peakAt = round(Math.max(0, peakIdx) / 100);
    return out;
  }
  const secs = Math.floor(x.length / SR);
  const curve = [];
  for (let s = 0; s < secs; s++) {
    let e = 0;
    for (let i = s * SR; i < (s + 1) * SR; i++) e += x[i] * x[i];
    curve.push(10 * Math.log10(1e-9 + e / SR / (32768 * 32768)));
  }
  const peak = curve.length ? Math.max(...curve) : 0;
  out.energy = curve.map((v) => Math.round(Math.max(-60, v - peak)));
  return out;
}

function ingestMusic(dir, source) {
  mkdirSync(MUSIC, { recursive: true });
  const have = new Set(load().music.map((m) => m.id));
  const files = readdirSync(dir).filter((f) => /\.(mp3|wav|m4a|flac|ogg)$/i.test(f));
  let batch = [];
  let added = 0;
  const flush = () => {
    if (!batch.length) return;
    const b = batch;
    batch = [];
    update((lib) => {
      for (const e of b) if (!lib.music.some((m) => m.id === e.id)) lib.music.push(e);
    });
  };
  for (const f of files) {
    const src = join(dir, f);
    const id = createHash('sha1').update(readFileSync(src)).digest('hex').slice(0, 12);
    if (have.has(id)) continue;
    const name = basename(f, extname(f)).replace(/ \(\d+\)$/, '');
    const [title, ...rest] = name.split(' - ');
    const artist = rest.join(' - ').replace(/ _ /g, ' / ');
    const file = `music/${slug(title)}-${id.slice(0, 6)}${extname(f).toLowerCase()}`;
    copyFileSync(src, join(ROOT, file));
    let m;
    try { m = measure(join(ROOT, file)); } catch (e) { console.log('ölçülemedi', f, e.message.slice(0, 80)); continue; }
    batch.push({ id, file, title: title.trim(), artist, source, license: source === 'youtube-audio-library' ? 'YouTube Ses Kitaplığı — atıf gerekmez' : '', ...m, tags: null });
    have.add(id);
    added++;
    if (added % 20 === 0) { flush(); console.log('eklendi', added); }
  }
  flush();
  console.log(`müzik: +${added}, toplam ${load().music.length}`);
}

/* Kind from the role when a pick does not name it (the audio director keys pools on `kind`). */
const KINDS = ['whoosh', 'hit', 'riser', 'swell', 'snap', 'ticks', 'glitch', 'stinger', 'bed', 'event'];
function kindOf(p) {
  const k = String(p.kind || '').toLowerCase();
  if (KINDS.includes(k)) return k;
  const r = `${k} ${p.role || ''}`.toLowerCase();
  if (/bed|ambien|room.?tone|atmos/.test(r)) return 'bed';
  if (/sting|scare/.test(r)) return 'stinger';
  if (/riser|build/.test(r)) return 'riser';
  if (/whoosh|swoosh|swish/.test(r)) return 'whoosh';
  if (/swell/.test(r)) return 'swell';
  if (/snap|shutter|click/.test(r)) return 'snap';
  if (/tick|clock/.test(r)) return 'ticks';
  if (/glitch|static/.test(r)) return 'glitch';
  if (/hit|impact|boom|braam/.test(r)) return 'hit';
  return 'event';
}

async function ingestSfx(pickFile) {
  mkdirSync(SFX, { recursive: true });
  const picks = JSON.parse(readFileSync(pickFile, 'utf8'));
  const list = picks.library ?? picks;
  const have = new Set(load().sfx.map((s) => s.sourceId));
  let added = 0;
  for (const p of list) {
    if (have.has(`mixkit:${p.id}`)) continue;
    // Mixkit serves most sounds as WAV; some older ones only as MP3.
    let file = null;
    for (const ext of ['wav', 'mp3']) {
      const f = `sfx/${slug(p.slug || p.title)}-${p.id}.${ext}`;
      if (existsSync(join(ROOT, f))) { file = f; break; }
      const r = await fetch(`https://assets.mixkit.co/active_storage/sfx/${p.id}/${p.id}.${ext}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      // Written under a temp name first: a half-downloaded file must never look like a sound.
      const tmp = join(ROOT, `${f}.part`);
      writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      renameSync(tmp, join(ROOT, f));
      file = f;
      break;
    }
    if (!file) { console.log('indirilemedi', p.id, p.title); continue; }
    let m = {};
    try { m = measure(join(ROOT, file), { short: true }); } catch {}
    const { id, ...tags } = p;
    const entry = {
      sourceId: `mixkit:${id}`, file, source: 'mixkit', license: 'Mixkit Free License — ticari kullanım, atıf gerekmez',
      ...tags, kind: kindOf(p),
      duration: m.duration, lufs: m.lufs, lufsMax: m.lufsMax, peak: m.peak, onset: m.onset, peakAt: m.peakAt,
    };
    update((lib) => {
      if (!lib.sfx.some((s) => s.sourceId === entry.sourceId)) lib.sfx.push(entry);
    });
    have.add(entry.sourceId);
    added++;
  }
  if (picks.rules) update((lib) => { lib.sfxRules = picks.rules; });
  console.log(`efekt: +${added}, toplam ${load().sfx.length}`);
}

/** Fill in loudness and SFX onset data that older ingests left empty. Local ffmpeg only, no network. */
function measureAll() {
  const lib = load();
  const todo = [
    ...lib.music.filter((m) => m.lufs == null).map((m) => ({ key: 'music', id: m.id, file: m.file, short: false })),
    ...lib.sfx.filter((s) => s.lufs == null || s.lufsMax == null || s.onset == null).map((s) => ({ key: 'sfx', id: s.file, file: s.file, short: true })),
  ];
  console.log('ölçülecek', todo.length);
  let done = 0;
  let batch = [];
  const flush = () => {
    const b = batch;
    batch = [];
    if (!b.length) return;
    update((l) => {
      for (const { key, id, m } of b) {
        const e = key === 'music' ? l.music.find((x) => x.id === id) : l.sfx.find((x) => x.file === id);
        if (!e) continue;
        e.lufs = m.lufs;
        e.peak = m.peak;
        if (key === 'sfx') Object.assign(e, { lufsMax: m.lufsMax, onset: m.onset, peakAt: m.peakAt, duration: e.duration ?? m.duration });
      }
    });
  };
  for (const t of todo) {
    const abs = resolve(ROOT, t.file);
    if (!existsSync(abs)) continue;
    try {
      batch.push({ ...t, m: measure(abs, { short: t.short }) });
    } catch (e) {
      console.log('ölçülemedi', t.file, e.message.slice(0, 80));
    }
    if (++done % 25 === 0) { flush(); console.log('ölçüldü', done); }
  }
  flush();
  console.log('bitti');
}

/* ------------------------------------------------------------ AI listening */

const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];
const GENRES = ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror'];
const TAG_SCHEMA = {
  description: 'string, one sentence',
  instruments: 'string[]',
  vocals: 'none | wordless | lyrics',
  energy: 'integer 1-5',
  tempo: 'slow | medium | fast',
  culture: 'western orchestral | electronic | ambient | piano | middle-eastern | east-asian | indian | latin | americana | other',
  moodFit: Object.fromEntries(MOODS.map((m) => [m, 'number 0-1'])),
  genreFit: Object.fromEntries(GENRES.map((g) => [g, 'number 0-1'])),
  documentaryUsable: 'boolean — false if cheesy, comedic, kids, party/EDM drop, lyrics, game-like: anything a serious documentary editor would never use',
  bestUse: 'string — where an editor would put it: cold open, investigation, chapter title, loss, finale...',
};

async function listen(track, key) {
  // Two excerpts: the opening and the loudest stretch — a track is judged by both.
  const src = join(ROOT, track.file);
  const loud = Math.max(0, track.energy.indexOf(0));
  const dur = track.duration;
  const a0 = Math.min(6, Math.max(0, dur - 40));
  const a1 = Math.max(0, Math.min(dur - 20, loud - 6));
  const tmp = join(ROOT, '.tmp');
  mkdirSync(tmp, { recursive: true });
  const clip = join(tmp, `${track.id}.mp3`);
  ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-filter_complex',
    `[0:a]atrim=${a0.toFixed(1)}:${(a0 + 20).toFixed(1)},asetpts=PTS-STARTPTS[p0];[0:a]atrim=${a1.toFixed(1)}:${(a1 + 20).toFixed(1)},asetpts=PTS-STARTPTS[p1];[p0][p1]concat=n=2:v=0:a=1[o]`,
    '-map', '[o]', '-ac', '1', '-ar', '22050', '-b:a', '48k', clip]);
  const b64 = readFileSync(clip).toString('base64');
  const body = {
    model: process.env.NOVA_AUDIO_TAG_MODEL || 'gpt-audio-1.5',
    modalities: ['text'],
    messages: [
      { role: 'system', content: 'You are a senior music supervisor for cinematic YouTube documentaries (MagnatesMedia, Netflix true crime, history channels). You listen to a track and rate how an editor would use it. Scores are 0..1 and honest: most tracks fit only 1-3 moods well. Reply with ONLY a JSON object with exactly these keys: ' + JSON.stringify(TAG_SCHEMA) },
      { role: 'user', content: [
        { type: 'text', text: `Track "${track.title}" by ${track.artist || 'unknown'} (${Math.round(dur)}s). The audio is two 20-second excerpts: the opening, then the loudest part. Moods: curious (mystery, intrigue), calm (neutral narration bed), tension (building, urgent), dread (dark, ominous, horror), reveal (big climactic peak), sad (loss, grief), triumph (victory, uplift). Styles: documentary (general history), crime, epic (war/history), science (space), inspire (biography), finance (money/markets), horror.` },
        { type: 'input_audio', input_audio: { data: b64, format: 'mp3' } },
      ] },
    ],
  };
  for (let attempt = 1; ; attempt++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) {
      const j = await r.json();
      const txt = j.choices?.[0]?.message?.content || '';
      return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    }
    const t = await r.text();
    if (/insufficient_quota|billing/.test(t)) throw new Error('OpenAI kredisi yok');
    if (attempt >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(`OpenAI (${r.status}): ${t.slice(0, 200)}`);
    await new Promise((res) => setTimeout(res, 3000 * attempt));
  }
}

async function tag(limit) {
  const key = process.env.NOVA_OPENAI_KEY;
  if (!key) throw new Error('NOVA_OPENAI_KEY yok');
  const todo = load().music.filter((m) => !m.tags).slice(0, limit || Infinity);
  console.log('etiketlenecek', todo.length);
  let done = 0;
  let fatal = null;
  const workers = Array.from({ length: 6 }, async () => {
    while (todo.length && !fatal) {
      const t = todo.shift();
      try {
        const tags = await listen(t, key);
        // Only this track's tags are written, on top of whatever else changed meanwhile.
        update((lib) => {
          const m = lib.music.find((x) => x.id === t.id);
          if (m) m.tags = tags;
        });
      } catch (e) {
        console.log('etiketlenemedi', t.title, e.message.slice(0, 200));
        if (/kredisi yok/.test(e.message)) fatal = e;
      }
      if (++done % 10 === 0) console.log('etiket', done);
    }
  });
  await Promise.all(workers);
  if (fatal) throw fatal;
  const lib = load();
  console.log(`bitti. belgesele uymayan: ${lib.music.filter((m) => m.tags && !m.tags.documentaryUsable).length}`);
}

function stats() {
  const lib = load();
  const ok = lib.music.filter((m) => m.tags?.documentaryUsable);
  console.log('müzik', lib.music.length, 'kullanılabilir', ok.length, 'etiketsiz', lib.music.filter((m) => !m.tags).length, 'ölçülmemiş', lib.music.filter((m) => m.lufs == null).length);
  for (const mood of MOODS) console.log('  duygu', mood, ok.filter((m) => m.tags.moodFit[mood] >= 0.6).length);
  for (const g of GENRES) console.log('  stil', g, ok.filter((m) => m.tags.genreFit[g] >= 0.6).length);
  const kinds = {};
  lib.sfx.forEach((s) => (kinds[s.kind || s.role] = (kinds[s.kind || s.role] || 0) + 1));
  console.log('efekt', lib.sfx.length, JSON.stringify(kinds), 'ölçülmemiş', lib.sfx.filter((s) => s.lufs == null).length);
}

/**
 * Dry run of the audio director on a script: which tracks, beds and one-shots it
 * would pick. Reads only; no network, no files written (levels are not measured,
 * so bed/event gains are the nominal ones).
 */
async function planPreview(scriptFile, genre) {
  if (!scriptFile) throw new Error('senaryo dosyası gerekli: plan <senaryo.json> [stil]');
  const AD = await import('../lib/audio-director.mjs');
  const lib = AD.loadLibrary(ROOT);
  if (!lib) throw new Error(`kütüphane yok ya da boş: ${ROOT}`);
  const script = JSON.parse(readFileSync(scriptFile, 'utf8'));
  const g = genre || script.genre || 'documentary';
  const seed = script.seedKey || script.id || basename(scriptFile);
  const scenes = script.scenes || [];
  const secs = scenes.map((s) => Math.max(Number(s.dur) || 0, (Number(s.voiceDur) || 0) + 0.4));
  const total = secs.reduce((a, v) => a + v, 0);
  const t = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  const byId = new Map(lib.music.map((m) => [m.id, m]));

  const { cues } = AD.planScore({ script, lib, genre: g, seed });
  console.log(`\nMÜZİK — ${g}, ${scenes.length} sahne, ${t(total)}; ${cues.filter((c) => c.trackId).length} ipucu`);
  for (const c of cues) {
    const m = c.trackId ? byId.get(c.trackId) : null;
    const flags = [c.coldOpen && 'soğuk açılış', c.chained && 'zincir', c.resume && 'devam', c.backTimed && 'sona hizalı', c.reused && 'TEKRAR'].filter(Boolean).join(', ');
    console.log(`  ${t(c.fromSec)}–${t(c.toSec)}  ${c.mood.padEnd(8)} ${m ? `${m.title} (${m.tags?.culture || '?'}), giriş ${c.startAt} sn` : '— sessizlik —'}${flags ? `  [${flags}]` : ''}`);
  }

  const amb = AD.planAmbience({ script, lib, genre: g, seed, measure: false });
  let covered = 0;
  for (const a of amb) for (let i = a.fromScene; i <= a.toScene; i++) covered += secs[i] || 0;
  console.log(`\nORTAM — ${amb.length} yatak, sürenin %${Math.round((100 * covered) / Math.max(1, total))}'i`);
  for (const a of amb) console.log(`  sahne ${a.fromScene}–${a.toScene}  ${basename(a.file)}  ${(20 * Math.log10(a.gain)).toFixed(1)} dB  "${(scenes[a.fromScene].sound || '').slice(0, 60)}"`);

  const ev = AD.planEvents({ script, lib, genre: g, seed, measure: false });
  console.log(`\nOLAY SESLERİ — ${ev.length}`);
  for (const e of ev) console.log(`  sahne ${e.scene} @${e.at} sn  ${basename(e.file)}  "${String(scenes[e.scene].say || '').replace(/\[[^\]]*\]\s*/g, '').slice(0, 70)}"`);
}

/* The CLI runs only when this file is executed, so tests and the audio director can import `measure`. */
const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  if (cmd === 'ingest-music') ingestMusic(arg, rest.includes('--source') ? rest[rest.indexOf('--source') + 1] : 'youtube-audio-library');
  else if (cmd === 'ingest-sfx') await ingestSfx(arg);
  else if (cmd === 'tag') await tag(Number(arg) || 0);
  else if (cmd === 'measure') measureAll();
  else if (cmd === 'stats') stats();
  else if (cmd === 'plan') await planPreview(arg, rest[0]);
  else console.log('kullanım: ingest-music <klasör> | ingest-sfx <seçim.json> | tag [adet] | measure | stats | plan <senaryo.json> [stil]');
}
