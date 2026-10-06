// Sinematik Belgesel arşiv adımı: bir fotoğraf bir videoda bir kez, NASA lisansı,
// LoC 403'ü, piksel boyutu ve isim kartı. Ağ ve ücretli görme çağrısı yok:
// arama/seçim/indirme sahte, görseller ffmpeg'in ürettiği sentetik kareler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-arsiv-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');

const media = await import('../src/pipeline/media.js');
const arch = await import('../src/pipeline/docu-archive.js');
const { permissionUsable } = await import('../src/pipeline/provenance.js');

// ---------- sentetik görseller (dHash'leri birbirinden ~30 bit uzak) ----------
const IMG = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-arsiv-img-'));
const make = (name, src) => {
  const f = path.join(IMG, name);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-frames:v', '1', f]);
  return f;
};
const KRANZ = make('kranz.png', 'testsrc2=size=1600x1000');
// Aynı fotoğrafın başka sitedeki kopyası: küçültülmüş, biraz parlatılmış, JPEG.
const KRANZ_FLICKR = path.join(IMG, 'kranz-flickr.jpg');
execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', KRANZ, '-vf', 'scale=1024:-2,eq=brightness=0.03', '-q:v', '8', KRANZ_FLICKR]);
const PORTRE = make('portre.png', 'mandelbrot=size=900x1200');
const NASA = make('nasa.png', 'smptebars=size=1280x720');
const KONTROL = make('kontrol.png', 'sierpinski=size=1200x800:seed=3');
const E = make('e.png', 'cellauto=size=1200x800:seed=7');
const F = make('f.png', 'life=size=1200x800:seed=5:ratio=0.3');
const G = make('g.png', 'testsrc=size=1400x900');

const W = 'https://upload.wikimedia.org/wikipedia/commons';
const U = {
  kranzUtm: `${W}/a/ab/Gene_Kranz.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original`,
  kranzThumb: `${W}/thumb/a/ab/Gene_Kranz.jpg/2560px-Gene_Kranz.jpg`,
  kranzThumb480: `${W}/thumb/a/ab/Gene_Kranz.jpg/480px-Gene_Kranz.jpg?utm_source=x`,
  kranzWiki: `${W}/a/ab/Gene_Kranz.jpg`,
  kranzFlickr: 'https://live.staticflickr.com/65535/777_abc_b.jpg',
  portre: `${W}/1/12/Portrait_1970.jpg`,
  nasa: 'https://images-assets.nasa.gov/image/S70-1/S70-1~orig.jpg',
  nasaThumb: 'https://images-assets.nasa.gov/image/S70-1/S70-1~thumb.jpg',
  kontrol: `${W}/c/cd/Mission_Control_1970.jpg`,
  e: `${W}/e/ee/Apollo_E.jpg`,
  f: `${W}/f/ff/Apollo_F.jpg`,
  g: `${W}/9/99/Apollo_G.jpg`,
};
// İndirme, gerçekte olduğu gibi adres biçimine değil DOSYAYA bakar.
const CONTENT = new Map([
  [media.photoKey(U.kranzWiki), KRANZ], [media.photoKey(U.kranzFlickr), KRANZ_FLICKR],
  [media.photoKey(U.portre), PORTRE], [media.photoKey(U.nasa), NASA], [media.photoKey(U.kontrol), KONTROL],
  [media.photoKey(U.e), E], [media.photoKey(U.f), F], [media.photoKey(U.g), G],
]);
const download = async (url, dest) => {
  const f = CONTENT.get(media.photoKey(url));
  if (!f) throw Error('HTTP 404');
  fs.copyFileSync(f, dest);
  return fs.statSync(dest).size;
};
const cand = (provider, url, extra = {}) => ({
  provider, type: 'image', url, width: 1600, height: 1000,
  eser: decodeURIComponent(url.split('?')[0].split('/').pop()), lisans: 'Public domain',
  sayfa: 'https://commons.wikimedia.org/wiki/File:Test.jpg', ...extra,
});
const photo = (search, say, extra = {}) => ({ type: 'photo', source: 'archive', search, say, dur: 4, imagePrompt: 'x', image: '', ...extra });

/** Bir arşiv çalıştırması: arama listeleri sabit, görme modeli her zaman 1. adayı seçer. */
async function runArchive(dir, scenes, lists, { pickFn, deps = {} } = {}) {
  const calls = { search: [], pick: [], download: [] };
  const logs = [];
  const search = async (q, wantType) => {
    calls.search.push(q);
    if (wantType === 'video') calls.videoSearch = (calls.videoSearch || 0) + 1;
    const l = typeof lists === 'function' ? lists(q) : lists[q];
    return structuredClone(l || []);
  };
  const pick = async (s, thumbs, { titles, sizes, video }) => {
    calls.pick.push({ search: s.search, titles, sizes, n: thumbs.length, video });
    return pickFn ? pickFn(s, titles, video) : { choice: 1, reason: 'test', namedPersonIsMainSubject: true, segment: 1 };
  };
  const out = await arch.resolveArchive({ id: 't', scenes }, {
    dir, publicDir: path.join(dir, 'public'), buildPrefix: 'build/t',
    settings: { ffmpegPath: FFMPEG }, usage: {}, logFn: (m) => logs.push(m),
    deps: { search, pick, download: async (url, dest, o) => { calls.download.push(url); return download(url, dest, o); }, ...deps },
  });
  return { ...out, calls, logs };
}
const cacheOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'docu-archive.json'), 'utf8'));
const keyOf = (s) => crypto.createHash('sha1').update(`${s.search}|${s.say}`).digest('hex').slice(0, 12);

// ---------- photoKey ----------

test('photoKey folds every address form of one file into one key, and keeps different files apart', () => {
  const k = media.photoKey;
  const kranz = k(U.kranzWiki);
  for (const u of [U.kranzUtm, U.kranzThumb, U.kranzThumb480, 'https://commons.wikimedia.org/wiki/File:Gene_Kranz.jpg',
    'http://upload.wikimedia.org/wikipedia/en/a/ab/Gene_Kranz.jpg']) assert.equal(k(u), kranz, u);
  assert.notEqual(k(`${W}/a/ab/Gene_Kranz_2.jpg`), kranz);
  // yüzde kodlama ve çok sayfalı TIFF önizlemesi
  assert.equal(k(`${W}/1/1a/Apollo_13_%281970%29.jpg`), k(`${W}/thumb/1/1a/Apollo_13_(1970).jpg/1280px-Apollo_13_(1970).jpg`));
  assert.equal(k(`${W}/thumb/1/12/Scan.tif/lossy-page1-2560px-Scan.tif.jpg`), k(`${W}/1/12/Scan.tif`));
  // NASA boyut ekleri, Flickr boyut ekleri
  assert.equal(k(U.nasa), k(U.nasaThumb));
  assert.notEqual(k(U.nasa), k('https://images-assets.nasa.gov/image/S70-2/S70-2~orig.jpg'));
  assert.equal(k('https://live.staticflickr.com/65535/777_abc_b.jpg'), k('https://farm6.staticflickr.com/65535/777_def_o.jpg'));
  // diğer siteler: boyut/izleme parametreleri atılır, kimlik parametresi kalır
  assert.equal(k('https://images.unsplash.com/photo-123?ixid=a&w=1080&q=80'), k('https://images.unsplash.com/photo-123?w=400'));
  assert.notEqual(k('https://example.org/img?id=1&w=200'), k('https://example.org/img?id=2&w=200'));
  assert.equal(k('https://example.org/img?id=1&w=200'), k('https://www.example.org/img?w=900&id=1'));
});

// ---------- tekrar: adres biçimleri ----------

test('URL-variant dedup: a photo already used (cached under ?utm) is never offered again under its Wikipedia/thumb address', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const s0 = photo('Gene Kranz mission control', 'Kranz masanın başında.');
  const r1 = await runArchive(dir, [s0], { 'Gene Kranz mission control': [cand('wikimedia', U.kranzUtm, { thumb: U.kranzThumb480 })] });
  assert.ok(r1.script.scenes[0].archived);
  assert.equal(r1.script.scenes[0].imgW, 1600);
  assert.equal(r1.script.scenes[0].imgH, 1000);

  // İkinci çalıştırma: yeni sahnenin listesinde aynı fotoğraf iki farklı adresle.
  const s1 = photo('Gene Kranz flight director', 'Kranz yeniden konuşuyor.');
  const r2 = await runArchive(dir, [s0, s1], {
    'Gene Kranz flight director': [
      cand('wikipedia', U.kranzWiki), cand('openverse', U.kranzThumb), cand('wikimedia', U.kontrol),
    ],
  });
  assert.equal(r2.calls.pick.length, 1, 'cached scene is not picked again');
  assert.equal(r2.calls.pick[0].n, 1, 'only the not-yet-used photo is offered');
  assert.match(r2.calls.pick[0].titles[0], /Mission_Control/);
  const [a, b] = r2.script.scenes;
  assert.ok(a.archived && b.archived);
  assert.notEqual(a.image, b.image);
  assert.notEqual(media.photoKey(r2.credits['scene-0'].url), media.photoKey(r2.credits['scene-1'].url));

  // Üçüncü: aynı fotoğrafın Flickr kopyası (farklı adres, farklı site) algısal özetle yakalanır.
  // Eski önbellek kaydında özet yoksa dosyadan hesaplanır.
  const c = cacheOf(dir);
  for (const v of Object.values(c)) delete v.dhash;
  fs.writeFileSync(path.join(dir, 'docu-archive.json'), JSON.stringify(c));
  const s2 = photo('Apollo 13 recovery ship', 'Kurtarma gemisi bekliyor.');
  const r3 = await runArchive(dir, [s0, s1, s2], {
    'Apollo 13 recovery ship': [cand('openverse', U.kranzFlickr), cand('nasa', U.nasa, { thumb: U.nasaThumb })],
  });
  assert.equal(r3.calls.pick.length, 1);
  assert.equal(r3.calls.pick[0].n, 1, 'the re-hosted copy of a used photo is filtered by its dHash');
  assert.equal(r3.credits['scene-2'].provider, 'nasa');
  assert.ok(Object.values(cacheOf(dir)).every((v) => !v.file || /^[0-9a-f]{16}$/.test(v.dhash)), 'legacy entries gained a dHash');
  assert.ok(!('dhash' in r3.credits['scene-2']), 'internal fields stay out of the credits');
});

test('legacy cache that stored one photo for two scenes (different URLs) keeps it on the first and re-searches the second', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const s0 = photo('Gene Kranz portrait', 'Kranz yirmi yaşında.');
  const s1 = photo('Gene Kranz vest', 'Yeleğini karısı dikmişti.');
  const pub = path.join(dir, 'public', 'build', 'old');
  fs.mkdirSync(pub, { recursive: true });
  for (const n of ['a.jpg', 'b.jpg']) execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', KRANZ, '-q:v', '2', path.join(pub, n)]);
  const base = { provider: 'wikimedia', lisans: 'Public domain', sayfa: 'https://commons.wikimedia.org/wiki/File:Gene_Kranz.jpg', eser: 'Gene Kranz' };
  fs.writeFileSync(path.join(dir, 'docu-archive.json'), JSON.stringify({
    [keyOf(s0)]: { ...base, file: 'build/old/a.jpg', url: U.kranzUtm },
    [keyOf(s1)]: { ...base, file: 'build/old/b.jpg', url: U.kranzWiki },
  }));
  const r = await runArchive(dir, [s0, s1], { 'Gene Kranz vest': [cand('wikipedia', U.kranzWiki), cand('wikimedia', U.kontrol)] });
  assert.equal(r.script.scenes[0].image, 'build/old/a.jpg');
  assert.equal(r.script.scenes[0].imgW, 1600, 'legacy entry gained its pixel size');
  assert.match(r.credits['scene-1'].url, /Mission_Control/);
  assert.ok(r.logs.some((l) => /yeniden aranacak/.test(l)));
});

test('parallel workers never put the same photo in two scenes, whatever address or site it comes from', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const kranzBicimleri = [U.kranzUtm, U.kranzThumb, U.kranzWiki, U.kranzFlickr, U.kranzThumb480, U.kranzUtm];
  const digerleri = [U.portre, U.kontrol, U.e, U.f, U.g, U.nasa];
  const scenes = Array.from({ length: 6 }, (_, i) => photo(`Sahne${i} archive photograph today`, `Sahne ${i}.`));
  // Her sahnenin listesi Kranz'ın BAŞKA bir biçimiyle başlıyor: altısı da onu ister.
  // Yarışı kaybeden sahne sadeleştirilmiş sorguyla ("Sahne3 archive photograph") aynı listeyi alır.
  const lists = (q) => {
    const i = Number(q.match(/^Sahne(\d)/)[1]);
    const rot = [...digerleri.slice(i), ...digerleri.slice(0, i)];
    return [cand('wikimedia', kranzBicimleri[i]), ...rot.map((u) => cand('wikimedia', u))];
  };
  const r = await runArchive(dir, scenes, lists);
  const used = r.script.scenes.filter((s) => s.archived);
  assert.equal(used.length, 6);
  const keys = Object.values(r.credits).map((c) => media.photoKey(c.url));
  assert.equal(new Set(keys).size, keys.length, `duplicate photo: ${keys.join(', ')}`);
  const hashes = Object.values(cacheOf(dir)).filter((v) => v.file).map((v) => v.dhash);
  for (let i = 0; i < hashes.length; i++) for (let j = i + 1; j < hashes.length; j++) assert.ok(!arch.ayniFotograf(hashes[i], hashes[j]), 'perceptual duplicate');
  assert.equal(keys.filter((k) => k === media.photoKey(U.kranzWiki) || k === media.photoKey(U.kranzFlickr)).length, 1, 'Kranz appears exactly once');
});

test('a scene that loses the race for a photo looks at the same list again before the simplified query', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'Gene Kranz mission control';
  const scenes = [photo(q, 'Kranz masanın başında.'), photo(q, 'Kranz kulaklığını takıyor.')];
  // İlk iki seçim birbirini bekler: ikisi de Kranz'ı görmüşken seçer, biri yarışı kaybeder.
  let gelen = 0;
  let ac;
  const kapi = new Promise((r) => { ac = r; });
  const t = setTimeout(() => ac(), 5000);
  const r = await runArchive(dir, scenes, (s) => (
    s === q ? [cand('wikimedia', U.kranzUtm), cand('wikimedia', U.kontrol)]
      : [cand('wikipedia', U.kranzWiki), cand('wikimedia', U.portre)]
  ), {
    pickFn: async () => {
      if (++gelen === 2) ac();
      if (gelen <= 2) await kapi;
      return { choice: 1, reason: 'test', namedPersonIsMainSubject: true };
    },
  });
  clearTimeout(t);
  assert.equal(r.calls.pick.length, 3, 'two picks at once, then one retry');
  assert.equal(r.calls.pick[2].n, 1, 'the retry offers the list minus the taken photo');
  assert.ok(!r.calls.search.includes(arch.simplerQuery(q)), 'the simplified query was not needed');
  const urls = Object.values(r.credits).map((c) => c.url).sort();
  assert.equal(urls.length, 2);
  assert.match(urls.join(' '), /Gene_Kranz.*Mission_Control|Mission_Control.*Gene_Kranz/);
  assert.ok(!r.logs.some((l) => /başka bir sahneye gitti/.test(l)));
});

// ---------- boyut, odak, isim kartı, tam ekran ----------

test('pixel size and portrait focus reach the scene; a name card on a crowd shot is dropped; small scans stay out of title/slam', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const scenes = [
    photo('Young pilot portrait 1925', 'Genç pilot.', { name: 'Vecihi Hürkuş', role: 'Pilot' }),
    photo('Mission control crowd 1970', 'Kontrol odası kalabalık.', { name: 'Gene Kranz', role: 'Uçuş direktörü' }),
    { type: 'title', source: 'archive', search: 'Apollo title backdrop', say: 'Apollo.', title: 'APOLLO', dur: 3 },
    photo('Mission control crowd 1970', 'Aynı arama, başka anlatım.'),
  ];
  // Yarışı kaybeden sahne sadeleştirilmiş sorguyla ("Mission control crowd") aynı listeyi alır.
  const r = await runArchive(dir, scenes, (q) => (
    q.startsWith('Young pilot') ? [cand('wikipedia', U.portre, { width: 900, height: 1200 })]
      : q.startsWith('Mission control crowd') ? [cand('wikimedia', U.kontrol), cand('wikimedia', U.f)]
        : q.startsWith('Apollo title') ? [cand('wikipedia', U.e, { width: 300, height: 220, kucuk: true }), cand('wikimedia', U.g, { width: 1400, height: 900 })]
          : []
  ), {
    pickFn: (s) => ({ choice: 1, reason: 'test', namedPersonIsMainSubject: s.name !== 'Gene Kranz' }),
  });
  const [p, crowd, title, again] = r.script.scenes;
  assert.deepEqual([p.imgW, p.imgH], [900, 1200]);
  assert.deepEqual(p.focus, [0.5, 0.3], 'portrait pushes toward the face');
  assert.equal(p.name, 'Vecihi Hürkuş');
  assert.ok(crowd.archived, 'crowd photo is still used');
  assert.equal(crowd.name, undefined, 'name card removed: the person is not the main subject');
  assert.equal(crowd.focus, undefined, 'landscape photo keeps the default framing');
  assert.match(r.credits['scene-2'].url, /Apollo_G/, 'the 300px scan never becomes a full-screen title');
  assert.ok(again.archived && again.image !== crowd.image);
  assert.equal(r.calls.search.filter((q) => q === 'Mission control crowd 1970').length, 1, 'identical searches are asked once');
  const prompt = r.calls.pick.find((c) => /Young/.test(c.search));
  assert.deepEqual(prompt.sizes[0], [900, 1200], 'pixel size is shown to the picker');
});

// ---------- NASA lisansı ----------

test('NASA images are public domain unless a copyright or third-party credit is named', () => {
  const sayfa = 'https://images.nasa.gov/details/S70-1';
  const usable = (d) => permissionUsable({ provider: 'nasa', sayfa, ...media.nasaLisans(d) });
  const own = { center: 'JSC', title: 'Apollo 13 crew', description: 'The Apollo 13 crew after splashdown.', photographer: 'NASA' };
  assert.match(media.nasaLisans(own).lisans, /^Public domain/);
  assert.equal(usable(own), true);
  assert.equal(usable({ ...own, description: 'A SpaceX Falcon 9 rocket lifts off. Photo Credit: NASA/Joel Kowsky' }), true, 'SpaceX as the subject is fine');
  assert.equal(usable({ ...own, description: 'Photo courtesy of NASA.' }), true);
  assert.equal(usable({ ...own, secondary_creator: 'NASA, ESA, CSA, STScI' }), false);
  assert.equal(usable({ ...own, description: 'Launch. Image credit: SpaceX' }), false);
  assert.equal(usable({ ...own, description: '© 2020 Getty Images' }), false);
  assert.equal(usable({ ...own, description: 'Image courtesy of the Smithsonian Institution.' }), false);
  assert.equal(usable({ ...own, center: undefined }), false, 'no NASA center, no claim');
});

// ---------- LoC 403 / hata sınıfı ----------

test('only transient errors mark an archive search as failed; LoC 403 closes LoC for the session', async () => {
  assert.equal(media.geciciSaglayiciHatasi(new Error('HTTP 403')), false);
  assert.equal(media.geciciSaglayiciHatasi(new Error('HTTP 404')), false);
  assert.equal(media.geciciSaglayiciHatasi(new Error('HTTP 429')), true);
  assert.equal(media.geciciSaglayiciHatasi(new Error('HTTP 503')), true);
  assert.equal(media.geciciSaglayiciHatasi(new TypeError('fetch failed')), true);
  assert.equal(media.geciciSaglayiciHatasi(new SyntaxError('Unexpected token <')), false);

  media._kapaliKaynaklariSifirla();
  const hosts = [];
  const eski = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const host = new URL(url).host;
    hosts.push(host);
    if (host === 'www.loc.gov') return new Response('<html>Just a moment</html>', { status: 403 });
    if (host === 'collectionapi.metmuseum.org') return new Response('{}', { status: 404 });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const hs = { n: 0 };
    await media.searchQuery('Titanic lifeboats 1912', 'image', 'photo', true, false, hs);
    assert.equal(hs.n, 0, '403/404 are answers, not failures');
    assert.deepEqual(media.kapaliSaglayicilar().map((k) => k.ad), ['loc']);
    hosts.length = 0;
    const hs2 = { n: 0 };
    await media.searchQuery('Titanic bridge 1912', 'image', 'photo', true, false, hs2);
    assert.ok(!hosts.includes('www.loc.gov'), 'LoC is not asked again this session');
    assert.equal(hs2.n, 0);
  } finally {
    globalThis.fetch = eski;
    media._kapaliKaynaklariSifirla();
  }
});

// ---------- hareketli görüntü (media: "video") ----------

// Sentetik klipler: sesli (çıktıda ses olmamalı), 25 fps (çıktı 30 fps olmalı).
const makeClip = (name, src, secs = 6, size = '640x360') => {
  const f = path.join(IMG, name);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${src}=size=${size}:rate=25`, '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', String(secs), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f]);
  return f;
};
const CLIP_A = makeClip('clip-a.mp4', 'testsrc2');
const CLIP_B = makeClip('clip-b.mp4', 'smptehdbars');
const CLIP_C = makeClip('clip-c.mp4', 'rgbtestsrc');
const CLIP_LONG = makeClip('clip-long.mp4', 'testsrc', 60, '320x180');
const V = {
  a: 'https://videos.pexels.com/video-files/111/111-hd_1920_1080_30fps.mp4',
  aSd: 'https://videos.pexels.com/video-files/111/111-sd_960_540_25fps.mp4', // aynı klip, başka dosya
  b: 'https://archive.org/download/1947-newsreel/1947-newsreel.mp4',
  c: 'https://cdn.pixabay.com/video/2015/08/10/283-135881214_large.mp4',
  dikey: 'https://videos.pexels.com/video-files/222/222-hd_1080_1920_30fps.mp4',
  uzun: 'https://archive.org/download/1929-crash/1929-crash.mp4',
  thumbA: 'https://images.pexels.com/videos/111/pictures/preview-0.jpg',
  thumbB: 'https://archive.org/services/img/1947-newsreel',
  thumbC: 'https://i.vimeocdn.com/video/283_295x166.jpg',
  thumbDikey: 'https://images.pexels.com/videos/222/pictures/preview-0.jpg',
};
for (const [u, f] of [[V.a, CLIP_A], [V.aSd, CLIP_A], [V.b, CLIP_B], [V.c, CLIP_C], [V.dikey, CLIP_C], [V.uzun, CLIP_LONG],
  [V.thumbA, NASA], [V.thumbB, KONTROL], [V.thumbC, G], [V.thumbDikey, F]]) CONTENT.set(media.photoKey(u), f);
const vcand = (provider, url, thumb, extra = {}) => ({
  provider, type: 'video', url, thumb, width: 1920, height: 1080, duration: 6,
  eser: `${provider} clip`, lisans: provider === 'pexels' ? 'Pexels License' : provider === 'pixabay' ? 'Pixabay Content License' : 'Public domain',
  sayfa: `https://example.org/${provider}/${media.photoKey(url).replace(/\W+/g, '-')}`, ...extra,
});
const clipA = (extra) => vcand('pexels', V.a, V.thumbA, { sayfa: 'https://www.pexels.com/video/runway-111/', ...extra });
const clipASd = (extra) => vcand('pexels', V.aSd, V.thumbA, { sayfa: 'https://www.pexels.com/video/runway-111/', width: 960, height: 540, ...extra });
const clipB = (extra) => vcand('archive', V.b, V.thumbB, { sayfa: 'https://archive.org/details/1947-newsreel', ...extra });
const clipC = (extra) => vcand('pixabay', V.c, V.thumbC, { sayfa: 'https://pixabay.com/videos/id-283/', ...extra });
const vscene = (search, say, extra = {}) => photo(search, say, { media: 'video', ...extra });
/** ffmpeg'in dosya hakkında söyledikleri (ffmpeg -i 1 ile çıkar; execFileSync atardı). */
const probe = (f) => spawnSync(FFMPEG, ['-hide_banner', '-i', f], { encoding: 'utf8' }).stderr;

test('media:"video" prefers footage: clip transcoded (H.264, 30 fps, no audio), still in image, credits like photos; photo scenes stay photo-first', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'airliner takeoff runway';
  const scenes = [vscene(q, 'Uçak kalkıyor.'), photo(q, 'Aynı arama, fotoğraf sahnesi.')];
  const r = await runArchive(dir, scenes, { [q]: [cand('wikimedia', U.kontrol), clipA(), cand('wikimedia', U.e)] });
  const [v, p] = r.script.scenes;
  assert.match(v.video, /^build\/t\/clip-[0-9a-f]+\.mp4$/);
  assert.equal(v.videoStart, 0);
  assert.ok(Math.abs(v.videoDur - 6) < 0.3, `videoDur ${v.videoDur}`);
  assert.deepEqual([v.videoW, v.videoH], [640, 360]);
  assert.ok(v.archived);
  assert.match(v.image, /^build\/t\/clip-[0-9a-f]+\.jpg$/, 'a still of the clip is the scene image');
  assert.deepEqual([v.imgW, v.imgH], [640, 360]);
  const info = probe(path.join(dir, 'public', v.video));
  assert.match(info, /Video: h264/);
  assert.match(info, /yuv420p/);
  assert.match(info, /\b30 fps\b/);
  assert.doesNotMatch(info, /Audio:/, 'no audio track');
  const vPick = r.calls.pick.find((c) => c.video);
  assert.ok(vPick, 'the picker was told these are video clips');
  assert.equal(vPick.n, 1, 'only footage is offered for the video scene');
  // Fotoğraf sahnesi (media yok) video adayını görmez, fotoğraf alır.
  assert.ok(p.archived && !p.video);
  assert.match(p.image, /arch-/);
  assert.ok(r.calls.pick.filter((c) => !c.video).every((c) => c.n === 2), 'photo picks see only photos');
  const cr = r.credits['scene-0'];
  assert.equal(cr.provider, 'pexels');
  assert.equal(cr.lisans, 'Pexels License');
  assert.equal(cr.url, V.a);
  assert.equal(cr.file, v.video);
  assert.equal(cr.type, 'video');
  assert.match(cr.modifications, /ses kaldırıldı/);
  for (const k of ['dhash', 'videoStart', 'kaynakAn', 'kaynakSure', 'namedMain']) assert.ok(!(k in cr), `${k} stays out of the credits`);
});

test('no suitable clip: the scene falls back to the photo search (then AI), and the clean "no clip" decision is cached', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const s0 = vscene('Gene Kranz mission control', 'Kranz masanın başında.');
  const s1 = vscene('Apollo 13 recovery ship', 'Kurtarma gemisi bekliyor.');
  const lists = {
    'Gene Kranz mission control': [clipB(), cand('wikimedia', U.kranzUtm)],   // klip var ama uygun değil
    'Apollo 13 recovery ship': [cand('nasa', U.nasa, { thumb: U.nasaThumb })], // hiç klip yok
  };
  const r = await runArchive(dir, [s0, s1], lists, {
    pickFn: (s, titles, video) => (video ? { choice: 0, reason: 'yanlış dönem', namedPersonIsMainSubject: true, segment: 1 } : { choice: 1, reason: 'ok', namedPersonIsMainSubject: true }),
  });
  const [a, b] = r.script.scenes;
  assert.ok(!a.video && a.archived && /Gene_Kranz/.test(r.credits['scene-0'].url), 'rejected clip → photo');
  assert.ok(!b.video && b.archived && r.credits['scene-1'].provider === 'nasa', 'no clip → photo');
  assert.ok(r.logs.some((l) => /Uygun hareketli görüntü yok/.test(l)));
  const c = cacheOf(dir);
  assert.deepEqual(c[`v-${keyOf(s0)}`], { none: true, v: 1 });
  assert.equal(r.calls.pick.filter((x) => x.video).length, 1, 'the clip-less scene never reached the picker for footage');

  // Hiç fotoğraf da yoksa sahne AI'a kalır (image boş, archived yok).
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const r2 = await runArchive(dir2, [vscene('Nothing anywhere', 'Hiçbir şey.')], {});
  assert.ok(!r2.script.scenes[0].video && !r2.script.scenes[0].archived && !r2.script.scenes[0].image);
});

test('resume reuses the cached clip: no search, no pick, no download; a deleted clip is re-cut from its source without asking again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'airliner takeoff runway';
  const scenes = [vscene(q, 'Uçak kalkıyor.')];
  const lists = { [q]: [clipA(), clipC()] };
  const r1 = await runArchive(dir, scenes, lists);
  const first = r1.script.scenes[0];
  assert.ok(first.video);
  const r2 = await runArchive(dir, scenes, lists);
  assert.equal(r2.calls.search.length, 0, 'no search on resume');
  assert.equal(r2.calls.pick.length, 0, 'no paid pick on resume');
  assert.equal(r2.calls.download.length, 0, 'no download on resume');
  assert.deepEqual(r2.script.scenes[0], first);
  assert.deepEqual(r2.credits, r1.credits);
  // Klasör temizlendi: aynı klip, aynı bölüm yeniden kesilir; seçici yeniden çağrılmaz.
  fs.rmSync(path.join(dir, 'public', first.video));
  const r3 = await runArchive(dir, scenes, lists);
  assert.equal(r3.calls.pick.length, 0);
  assert.deepEqual(r3.calls.download, [V.a]);
  assert.equal(r3.script.scenes[0].video, first.video);
  assert.ok(fs.existsSync(path.join(dir, 'public', first.video)));
  // "Uygun klip yok" kararı da ödenmez: fotoğraf yoluna doğrudan geçilir.
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const s = [vscene('Gene Kranz mission control', 'Kranz.')];
  const l2 = { 'Gene Kranz mission control': [clipB(), cand('wikimedia', U.kranzUtm)] };
  const no = (x, t, video) => (video ? { choice: 0, reason: 'x', namedPersonIsMainSubject: true, segment: 1 } : { choice: 1, reason: 'ok', namedPersonIsMainSubject: true });
  await runArchive(dir2, s, l2, { pickFn: no });
  const again = await runArchive(dir2, s, l2, { pickFn: no });
  assert.equal(again.calls.pick.length, 0);
  assert.equal(again.calls.videoSearch, undefined, 'the footage search is not repeated');
  assert.ok(again.script.scenes[0].archived && !again.script.scenes[0].video);
});

test('one clip is never used twice in a video: same file, another rendition of it (same page), parallel workers or an old cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  // Her sahnenin listesi aynı klibin BAŞKA bir dosyasıyla başlıyor; dikey klip hiç önerilmez.
  const scenes = Array.from({ length: 3 }, (_, i) => vscene(`Runway${i} takeoff footage clip`, `Pist ${i}.`));
  const dikey = vcand('pexels', V.dikey, V.thumbDikey, { width: 1080, height: 1920 });
  const lists = (q) => {
    const i = Number(q.match(/^Runway(\d)/)[1]);
    const ilk = [clipA(), clipASd(), clipA()][i];
    return [dikey, ilk, ...(i % 2 ? [clipC(), clipB()] : [clipB(), clipC()])];
  };
  const r = await runArchive(dir, scenes, lists);
  const vids = r.script.scenes.map((s) => s.video);
  assert.ok(vids.every(Boolean), `every scene got a clip: ${vids}`);
  assert.equal(new Set(vids).size, 3);
  const pages = Object.values(r.credits).map((c) => c.sayfa);
  assert.equal(new Set(pages).size, 3, `a clip appears once: ${pages.join(', ')}`);
  assert.equal(pages.filter((p) => /runway-111/.test(p)).length, 1);
  assert.ok(Object.values(r.credits).every((c) => c.url !== V.dikey), 'vertical footage is never used');
  assert.ok(r.calls.pick.every((c) => c.sizes.every(([w, h]) => w >= h)), 'vertical footage is never offered');

  // Eski önbellek aynı klibi iki sahneye yazmışsa ilki tutar, ikincisi yeniden aranır.
  const c = cacheOf(dir);
  const [k0, k1] = [scenes[0], scenes[1]].map((s) => `v-${keyOf(s)}`);
  c[k1] = { ...c[k0] };
  fs.writeFileSync(path.join(dir, 'docu-archive.json'), JSON.stringify(c));
  const r2 = await runArchive(dir, scenes.slice(0, 2), lists);
  assert.notEqual(r2.credits['scene-0'].sayfa, r2.credits['scene-1'].sayfa);
  assert.ok(r2.logs.some((l) => /Aynı klip önbellekte iki sahneye/.test(l)));
});

test('a long clip is shown as a frame grid; the picked frame sets where the scene starts inside a ~40 s cut', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'Wall Street crowd 1929 newsreel';
  const uzun = vcand('archive', V.uzun, V.thumbB, { duration: 60, width: 320, height: 180, sayfa: 'https://archive.org/details/1929-crash' });
  const r = await runArchive(dir, [vscene(q, 'Kalabalık borsanın önünde.')], { [q]: [uzun] }, {
    pickFn: () => ({ choice: 1, reason: 'kalabalık 3. karede', namedPersonIsMainSubject: true, segment: 3 }),
    // ffmpeg ızgara karelerini "uzaktaki" dosyadan okur: testte yerel kopyası.
    deps: { input: (u) => CONTENT.get(media.photoKey(u)) || u },
  });
  const p = r.calls.pick[0];
  assert.deepEqual(p.video.grids, [4]);
  assert.deepEqual(p.video.durations, [60]);
  const s = r.script.scenes[0];
  const an = arch.izgaraAnlari(60, 4)[2];
  const w = arch.klipPenceresi(an, 60);
  assert.equal(s.videoStart, w.videoStart);
  assert.equal(s.videoStart, 2, 'a little lead-in before the chosen moment');
  assert.ok(Math.abs(s.videoDur - w.t) < 0.3, `kept ${s.videoDur}s of ${w.t}s`);
  assert.equal(cacheOf(dir)[`v-${keyOf(s)}`].kaynakAn, an);
});

test('engine side (produce.mjs): footage scenes are probed, get a still, and a missing clip falls back without AI for scenes that keep a picture', async () => {
  const { prepareSceneVideos, audioScene, parseVideoInfo } = await import('../docu-engine/lib/produce.mjs');
  const PUBLIC = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-pub-'));
  const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-cache-'));
  fs.mkdirSync(path.join(PUBLIC, 'build/t'), { recursive: true });
  fs.mkdirSync(path.join(CACHE, 'build/t'), { recursive: true });
  fs.copyFileSync(CLIP_A, path.join(PUBLIC, 'build/t/a.mp4'));
  fs.copyFileSync(CLIP_B, path.join(CACHE, 'build/t/b.mp4'));
  fs.copyFileSync(KONTROL, path.join(PUBLIC, 'build/t/c.jpg'));
  const ff = (args) => execFileSync(FFMPEG, args);
  const ffOut = (args) => { const r = spawnSync(FFMPEG, args, { encoding: 'utf8' }); return (r.stderr ?? '') + (r.stdout ?? ''); };
  const script = { scenes: [
    { type: 'photo', video: 'build/t/a.mp4', videoStart: 99, imagePrompt: 'x' },       // alanlar eksik, still yok
    { type: 'photo', video: 'build/t/b.mp4', videoDur: 6, videoW: 640, videoH: 360 },   // yalnız ortak önbellekte
    { type: 'photo', video: 'build/t/gone.mp4', image: 'build/t/c.jpg', archived: true }, // klip kayıp, still var
  ] };
  const logs = [];
  const kept = prepareSceneVideos(script, { PUBLIC, CACHE, BUILD: 'build/t', ff, ffOut, log: (m) => logs.push(m) });
  assert.equal(kept, 2);
  const [a, b, c] = script.scenes;
  assert.ok(Math.abs(a.videoDur - 6) < 0.3 && a.videoW === 640 && a.videoH === 360, JSON.stringify(a));
  assert.equal(a.videoStart, +(a.videoDur - 0.5).toFixed(2), 'start clamped inside the clip');
  assert.match(a.image, /^build\/t\/vstill-[0-9a-f]+\.jpg$/);
  assert.ok(fs.statSync(path.join(PUBLIC, a.image)).size > 0, 'a still exists, so no AI picture is made for it');
  assert.ok(fs.existsSync(path.join(PUBLIC, 'build/t/b.mp4')), 'clip published from the shared cache');
  assert.ok(b.image);
  assert.equal(c.video, undefined);
  assert.equal(c.image, 'build/t/c.jpg', 'a lost clip keeps its still');
  assert.ok(logs.some((l) => /klibi kullanılamıyor/.test(l)));
  // Klip yalnız görüntüyü değiştirir: ses anahtarı klip alanlarından etkilenmez.
  assert.deepEqual(audioScene({ ...a, video: 'x.mp4', videoStart: 3 }), audioScene(a));
  assert.deepEqual(parseVideoInfo('Duration: 00:00:06.00, start\n Stream #0:0: Video: h264, yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 30 fps'), { dur: 6, w: 1920, h: 1080 });
});

test('montage and collage frames with media:"video" get their own clip; the engine lines clips[] up with images[]', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const scenes = [
    { type: 'montage', say: 'Açılış.', dur: 4, imagePrompts: [
      { prompt: 'a', source: 'stock', media: 'video', search: 'runway takeoff clip' },
      { prompt: 'b', source: 'archive', search: 'Gene Kranz mission control' },  // fotoğraf karesi
      'c düz AI karesi',
    ] },
    photo('Mission control crowd 1970', 'Kontrol odası.', { imagePrompts: [
      { prompt: 'd', source: 'archive', media: 'video', search: '1947 newsreel crash' },
      { prompt: 'e', source: 'archive', search: 'Apollo title backdrop' },         // kolaj ek fotoğrafı: aranmaz (eskisi gibi AI)
    ] }),
  ];
  const r = await runArchive(dir, scenes, {
    'runway takeoff clip': [clipA()],
    'Gene Kranz mission control': [cand('wikimedia', U.kranzUtm)],
    'Mission control crowd 1970': [cand('wikimedia', U.kontrol)],
    '1947 newsreel crash': [clipC()], // (clipB'nin önizlemesi kontrol odası fotoğrafının kopyası: dHash eler)
    'Apollo title backdrop': [cand('wikimedia', U.g)],
  });
  const [m, p] = r.script.scenes;
  const [f0, f1, f2] = m.imagePrompts;
  assert.match(f0.video, /clip-.*\.mp4$/);
  assert.ok(f0.image && f0.videoDur > 0 && f0.videoW === 640);
  assert.ok(f1.image && !f1.video, 'a photo frame stays a photo');
  assert.equal(f2, 'c düz AI karesi');
  assert.ok(p.archived && !p.video, 'the scene itself is photo-first');
  assert.ok(p.imagePrompts[0].video, 'its footage extra got a clip');
  assert.ok(!p.imagePrompts[1].image, 'photo extras of non-montage scenes are not searched (unchanged)');
  assert.ok(!r.calls.search.includes('Apollo title backdrop'));
  assert.ok(Object.values(r.credits).some((c) => c.type === 'video' && c.url === V.c));

  const { prepareSceneVideos, clipOf } = await import('../docu-engine/lib/produce.mjs');
  const ff = (args) => execFileSync(FFMPEG, args);
  const ffOut = (args) => { const x = spawnSync(FFMPEG, args, { encoding: 'utf8' }); return (x.stderr ?? '') + (x.stdout ?? ''); };
  const PUBLIC = path.join(dir, 'public');
  delete f0.videoW; // eksik alan motor tarafında ölçülür
  assert.equal(prepareSceneVideos({ scenes: [m, p] }, { PUBLIC, CACHE: PUBLIC, BUILD: 'build/t', ff, ffOut }), 2);
  assert.equal(f0.videoW, 640);
  assert.deepEqual(clipOf(f0, f0.image), { video: f0.video, videoStart: f0.videoStart, videoDur: f0.videoDur, videoW: 640, videoH: 360, image: f0.image });
  assert.equal(clipOf(f1, f1.image), null);
  assert.equal(clipOf('düz', 'x.jpg'), null);
});

test('window and probe helpers', () => {
  assert.deepEqual(arch.klipPenceresi(0, 6), { ss: 0, t: 6, videoStart: 0 });
  assert.deepEqual(arch.klipPenceresi(100, 443), { ss: 98, t: 40, videoStart: 2 });
  assert.deepEqual(arch.klipPenceresi(1, 0), { ss: 0, t: 40, videoStart: 1 });
  // MP4 girdi tarafında doğru atlar; Ogg/WebM önden girip fazlasını çözerek atar (ara kare çöpü yok).
  assert.deepEqual(arch.atlamaArg('https://x.org/a.mp4', 30), { girdi: ['-ss', '30'], cikti: [] });
  assert.deepEqual(arch.atlamaArg('https://x.org/a.ogv?utm=1', 30), { girdi: ['-ss', '22'], cikti: ['-ss', '8'] });
  assert.deepEqual(arch.atlamaArg('https://x.org/a.webm', 3), { girdi: [], cikti: ['-ss', '3'] });
  assert.deepEqual(arch.atlamaArg('https://x.org/a.webm', 0), { girdi: [], cikti: [] });
  assert.equal(arch.varsayilanAn(20), 0);
  assert.equal(arch.varsayilanAn(443.68), 30);
  assert.equal(arch.iaLisans('http://creativecommons.org/licenses/publicdomain/'), 'Public domain');
  assert.equal(arch.iaLisans('http://creativecommons.org/publicdomain/mark/1.0/'), 'Public domain');
  assert.equal(arch.iaLisans('https://creativecommons.org/licenses/by-nc/4.0/'), 'CC BY-NC 4.0');
  assert.equal(permissionUsable({ provider: 'archive', lisans: arch.iaLisans('https://creativecommons.org/licenses/by-nc/4.0/'), sayfa: 'https://archive.org/details/x' }), false);
  const i = arch.ffBilgiCoz('  Duration: 00:07:23.58, start: 0.000000\n  Stream #0:0[0x1](und): Video: mpeg2video (Main), yuv420p(tv, top first), 720x480 [SAR 8:9 DAR 4:3], 29.97 fps');
  assert.deepEqual(i, { dur: 443.58, w: 640, h: 480 });
});

// ---------- dönem hatası (Cooper QA: Ryanair/Jetstar logolu jetler, gökdelenli yatak odası, 1971) ----------

test('period rules: a pre-1990 story gets hard rejects for liveries, modern jets, cars, screens and glass skylines', () => {
  assert.equal(arch.donemYili('1971 (anlatım 1971–2016 arası)'), 1971);
  assert.equal(arch.donemYili(''), null);
  const eski = arch.donemSatirlari('1971 (anlatım 1971–2016 arası)').join('\n');
  for (const k of ['KESİN RET', 'Ryanair', 'Jetstar', 'winglet', 'A320', 'modern araba', 'LED', 'gökdelen', 'yatak odası']) assert.ok(eski.includes(k), k);
  const yeni = arch.donemSatirlari('2008').join('\n');
  assert.ok(yeni.includes('HİKÂYENİN DÖNEMİ: 2008'));
  assert.ok(!yeni.includes('KESİN RET'), 'a modern story keeps the soft rule only');
  assert.deepEqual(arch.donemSatirlari(''), []);
  for (const q of ['Boeing 727 takeoff 1970s film', 'passengers leaving airliner in rain', 'fuel truck on airport tarmac at night', 'city skyline at night', 'modern bedroom window']) assert.ok(arch.modernRiskli(q), q);
  for (const q of ['misty lake at dawn still water', 'dark fir forest in rain aerial', 'counting stacks of dollar bills hands']) assert.ok(!arch.modernRiskli(q), q);
});

test('period rules: pre-1500 stories are dated (1453 was silently undated) and pre-industrial ones get the photo/ship/costume rejects', () => {
  assert.equal(arch.donemYili('1453 (Bizans ve Osmanlı, 15. yüzyıl)'), 1453);
  assert.equal(arch.donemYili('1204'), 1204);
  assert.equal(arch.donemYili('44 BC'), -44);
  assert.equal(arch.donemYili('MÖ 331 (Gaugamela)'), -331);
  assert.equal(arch.donemYili('2008'), 2008);
  assert.equal(arch.hikayeDonemi({ scenes: [{ say: 'Constantinople, 1453.' }, { search: 'siege of Constantinople 1453 painting' }, { type: 'counter', to: 1453, year: true }] }), '1453');
  const ortacag = arch.donemSatirlari('1453 (Bizans ve Osmanlı)').join('\n');
  for (const k of ['KESİN RET', 'SANAYİ VE FOTOĞRAF ÖNCESİ', 'cruise', 'REPLİKA', 'Paskalya', 'tropik']) assert.ok(ortacag.includes(k), k);
  assert.ok(!arch.donemSatirlari('1971').join('\n').includes('SANAYİ VE FOTOĞRAF ÖNCESİ'), 'a 1971 story keeps its period photos');
  assert.deepEqual(arch.sanayiOncesiSatirlari(1912), []);
});

test('period sources: pre-1990 vehicle/aircraft/city queries put archive footage and photos before stock sites, stock scenes included', () => {
  const list = [
    { provider: 'pexels', url: 'p1' }, { provider: 'pixabay', url: 'x1' }, { provider: 'mixkit', url: 'm1' },
    { provider: 'archive', url: 'a1' }, { provider: 'wikimedia', url: 'w1' }, { provider: 'pexels', url: 'p2' },
  ];
  const order = (l) => l.map((c) => c.url).join(',');
  assert.match(order(arch.klipSirala(list, 'stock')), /^(p1|x1|m1)/, 'a modern (or unknown-era) stock scene: stock sites first');
  assert.match(order(arch.klipSirala(list, 'stock', { eski: true, riskli: false })), /^(p1|x1|m1)/, 'a forest is timeless: stock stays first');
  const old = order(arch.klipSirala(list, 'stock', { eski: true, riskli: true }));
  assert.match(old, /^(a1|w1),(a1|w1),/, `1971 + an airliner: archive first (${old})`);
  const photos = arch.arsivOnce(list, { eski: true, riskli: true }).map((c) => c.provider);
  assert.deepEqual(photos.slice(0, 2), ['archive', 'wikimedia']);
  assert.deepEqual(arch.arsivOnce(list, { eski: false, riskli: true }), list, 'unchanged outside the rule');
});

test('a 1971 stock scene of a jet: archive candidates are shown first and the full picker model is used (no cheap stock model)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'jet airliner taking off runway';
  const scenes = [
    { type: 'counter', to: 1971, year: true, dur: 3, say: 'November, nineteen seventy-one.' },
    { type: 'photo', source: 'stock', search: q, say: 'The jet lifts off into the rain.', dur: 4, imagePrompt: 'x', image: '' },
  ];
  const seen = [];
  const out = await arch.resolveArchive({ id: 't', scenes }, {
    dir, publicDir: path.join(dir, 'public'), buildPrefix: 'build/t',
    settings: { ffmpegPath: FFMPEG }, usage: {}, logFn: () => {},
    deps: {
      search: async (s) => (s === q ? [cand('pexels', U.e), cand('pixabay', U.g), cand('wikimedia', U.f)] : []),
      pick: async (s, thumbs, { titles, settings }) => {
        seen.push({ titles, settings });
        return { choice: 1, reason: 'test', namedPersonIsMainSubject: true };
      },
      download,
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].titles[0], 'Apollo_F.jpg', `the Commons photo is offered first (${seen[0].titles})`);
  assert.equal(seen[0].settings.claudeVisionModel, undefined, 'no Haiku downgrade for a 1971 stock pick');
  assert.equal(seen[0].settings.openaiVisionModel, undefined, 'no cheap OpenAI model either');
  assert.match(seen[0].settings._donem, /^1971/);
  assert.ok(out.script.scenes[1].archived);
});

// ---------- seçici hafızası: aynı karar iki kez ödenmez ----------

/** Kaynak hatası (429) veren arama: "uygun yok" kararı kesin sayılmaz, eskiden her geçişte yeniden ödeniyordu. */
async function runFlaky(dir, scenes, { photos = {}, clips = {}, pickFn, failSearch = true, failFull = () => false } = {}) {
  const calls = { pick: [], download: [] };
  const logs = [];
  const out = await arch.resolveArchive({ id: 't', scenes }, {
    dir, publicDir: path.join(dir, 'public'), buildPrefix: 'build/t',
    settings: { ffmpegPath: FFMPEG }, usage: {}, logFn: (m) => logs.push(m),
    deps: {
      search: async (q, wantType, kind, sadece, firsat, hs) => {
        if (failSearch && hs) hs.n++; // bir sağlayıcı geçici hata verdi
        return structuredClone((wantType === 'video' ? clips[q] : photos[q]) || []);
      },
      pick: async (s, thumbs, { titles, video }) => {
        calls.pick.push({ search: s.search, titles, n: thumbs.length, video: !!video });
        return pickFn(s, titles, video);
      },
      download: async (url, dest, o) => {
        calls.download.push(url);
        if (o?.timeoutMs === 60000 && failFull(url)) throw Error('HTTP 503');
        return download(url, dest, o);
      },
    },
  });
  return { ...out, calls, logs };
}
const none = () => ({ choice: 0, reason: 'dönem dışı', namedPersonIsMainSubject: true, segment: 1 });

test('a "no suitable photo" verdict is not re-paid: provider errors keep it from the final cache, but the judged candidates are never shown again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'Black Tuesday 1929 newsreel';
  assert.equal(arch.simplerQuery(q), 'Black Tuesday');
  const s = photo(q, 'The market falls.');
  const photos = { [q]: [cand('wikimedia', U.e), cand('wikimedia', U.f)], 'Black Tuesday': [cand('wikimedia', U.f), cand('wikimedia', U.e)] };
  const r1 = await runFlaky(dir, [s], { photos, pickFn: none });
  assert.equal(r1.calls.pick.length, 1, 'the simplified query brings the same two photos: not asked twice in one run');
  assert.ok(!r1.script.scenes[0].archived);
  const c1 = cacheOf(dir);
  assert.equal(c1[keyOf(s)], undefined, 'a provider error still keeps the scene from the final "none" cache');
  assert.deepEqual(Object.keys(c1[`m-${keyOf(s)}`].bad).sort(), [media.photoKey(U.e), media.photoKey(U.f)].sort());
  // Devam / dönem denetimi / QA sonrası yeni geçiş: aynı adaylar → model çağrılmaz, küçük resim de indirilmez.
  const r2 = await runFlaky(dir, [s], { photos, pickFn: none });
  assert.equal(r2.calls.pick.length, 0, 'no paid pick for candidates already judged');
  assert.equal(r2.calls.download.length, 0, 'not even the thumbnails');
  assert.ok(r2.logs.some((l) => /Arşiv seçici: \d+ karar kayıttan/.test(l)), r2.logs.join('\n'));
  // Temiz geçiş (kaynak hatası yok): karar kesinleşir.
  await runFlaky(dir, [s], { photos, pickFn: none, failSearch: false });
  assert.deepEqual(cacheOf(dir)[keyOf(s)], { none: true, v: 5 });
  // Kaynak yeni bir aday getirirse yalnızca O gösterilir.
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  await runFlaky(dir2, [s], { photos, pickFn: none });
  const more = { ...photos, [q]: [...photos[q], cand('wikimedia', U.g)] };
  const r3 = await runFlaky(dir2, [s], { photos: more, pickFn: () => ({ choice: 1, reason: 'ok', namedPersonIsMainSubject: true }) });
  assert.equal(r3.calls.pick.length, 1);
  assert.deepEqual(r3.calls.pick[0].titles, ['Apollo_G.jpg'], 'only the new candidate is judged');
  assert.equal(r3.credits['scene-0'].url, U.g);
});

test('a "no suitable clip" verdict is not re-paid either: the next pass skips the judged clips (and their preview downloads)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'Wall Street crowd 1929 film';
  const s = vscene(q, 'Kalabalık bekliyor.');
  const clips = { [q]: [clipB(), clipC()], 'Wall Street': [clipC(), clipB()] };
  const r1 = await runFlaky(dir, [s], { clips, pickFn: none });
  assert.equal(r1.calls.pick.filter((p) => p.video).length, 1);
  assert.ok(!r1.script.scenes[0].video);
  assert.equal(cacheOf(dir)[`v-${keyOf(s)}`], undefined, 'provider error: not a final "no clip"');
  const r2 = await runFlaky(dir, [s], { clips, pickFn: none });
  assert.equal(r2.calls.pick.length, 0);
  assert.equal(r2.calls.download.length, 0, 'no preview downloads for clips already judged');
});

test('a pick whose download failed is not asked again: the same candidate set reuses the verdict', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const q = 'Mission Control 1970';
  const s = photo(q, 'Salon sessiz.');
  const photos = { [q]: [cand('wikimedia', U.kontrol), cand('wikimedia', U.e)] };
  const one = () => ({ choice: 1, reason: 'doğru salon', namedPersonIsMainSubject: true });
  let fail = true;
  const r1 = await runFlaky(dir, [s], { photos, pickFn: one, failSearch: false, failFull: () => fail });
  assert.equal(r1.calls.pick.length, 1);
  assert.ok(!r1.script.scenes[0].archived, 'the full-size download failed this time');
  assert.equal(cacheOf(dir)[keyOf(s)], undefined, 'a failure is not a verdict');
  fail = false;
  const r2 = await runFlaky(dir, [s], { photos, pickFn: one, failSearch: false });
  assert.equal(r2.calls.pick.length, 0, 'the earlier verdict for the same candidates is reused');
  assert.equal(r2.credits['scene-0'].url, U.kontrol);
  assert.equal(r2.credits['scene-0'].neden, 'doğru salon');
});

test('forgetCachedPick: a rejected pick is dropped and its source (clip: file + page) joins the scene "not suitable" list', () => {
  const cache = {
    abc: { url: U.e, sayfa: 'https://commons.wikimedia.org/wiki/File:E.jpg', file: 'build/t/arch-abc.jpg' },
    'v-abc': { url: V.a, sayfa: 'https://www.pexels.com/video/runway-111/', video: 'build/t/clip-abc.mp4' },
    'm-abc': { v: 5, d: '1970', bad: {}, sets: { k: { c: 'x', at: Date.now() } } },
  };
  assert.equal(arch.forgetCachedPick(cache, 'abc', 1000), true);
  assert.equal(arch.forgetCachedPick(cache, 'v-abc', 1000), true);
  assert.equal(arch.forgetCachedPick(cache, 'nope'), false);
  assert.ok(!('abc' in cache) && !('v-abc' in cache));
  assert.deepEqual(cache['m-abc'].bad, { [media.photoKey(U.e)]: 1000 }, 'photo: only the file (pages can be shared)');
  assert.deepEqual(cache['m-abc'].sets, {}, 'earlier positive verdicts are forgotten');
  assert.deepEqual(Object.keys(cache['m-v-abc'].bad).sort(), [media.photoKey(V.a), `sayfa:${media.photoKey('https://www.pexels.com/video/runway-111/')}`].sort());
});

test('pre-industrial story: stock sites only for timeless shots (sea, sky, fire); people, cities, ships, walls come from the archive or AI', async () => {
  const A = await import('../src/pipeline/docu-archive.js');
  const c = [{ provider: 'pexels' }, { provider: 'wikimedia' }, { provider: 'unsplash' }, { provider: 'mixkit' }, { provider: 'openverse' }];
  const keep = (s, y) => A.sanayiOncesiAdaylar(c, s, y).map((x) => x.provider);
  assert.deepEqual(keep({ search: 'Theodosian walls at dawn' }, 1453), ['wikimedia', 'openverse']);
  assert.deepEqual(keep({ search: 'harbour with ships' }, 1453), ['wikimedia', 'openverse']);
  assert.equal(keep({ search: 'stormy sea waves at night' }, 1453).length, 5, '"at" is not the Turkish word for horse');
  assert.equal(keep({ search: 'candle flame in darkness' }, 1453).length, 5);
  assert.equal(keep({ search: 'new york street' }, 1929).length, 5, 'after 1850 the rule does not apply');
});

test('scene eras: a story from 1338 to today judges each scene by its own time, not one median year', () => {
  const scenes = [
    { chapter: 0, say: 'This October a technician died.', search: 'Irkutsk institute winter' },
    { chapter: 0, say: 'Sixty staff were sealed inside.' },
    { chapter: 1, say: 'Caffa.', search: 'siege of Caffa 1346' },
    { chapter: 1, say: 'Europe.', search: 'Black Death 1348 manuscript' },
    { chapter: 1, say: 'The ships came.' },
    { chapter: 2, say: 'Sverdlovsk.', search: 'Sverdlovsk 1979' },
    { chapter: 2, say: 'Yeltsin admitted it.', search: 'Yeltsin 1992' },
    { chapter: 2, say: 'A reporter asked again.', search: 'Moscow press 2024' },
    { chapter: 3, say: 'So what do we know?' },
    { chapter: 3, say: 'In 1979 it was told tainted meat.', search: 'Soviet laboratory 1979' },
    ...Array.from({ length: 8 }, () => ({ chapter: 3, say: 'An open file.' })),
  ];
  const r = arch.sceneEras({ scenes }, { now: 2026 });
  assert.deepEqual(r.scenes.map((s) => s.era), ['2026', '2026', '1346', '1348', '1348', '1979', '1992', '2024', '2026', '1979', ...Array(8).fill('2026')]);
  // A narrow story keeps the single story era; a countdown keeps its items' own years.
  const narrow = { scenes: [{ chapter: 0, search: 'Apollo 13 1970' }, { chapter: 1, say: 'Houston.' }] };
  assert.equal(arch.sceneEras(narrow, { now: 2026 }), narrow);
  const ranking = { format: 'ranking', scenes };
  assert.equal(arch.sceneEras(ranking, { now: 2026 }), ranking);
  // A news explainer: chapters with no year are today.
  assert.equal(arch.sceneEras({ scenes: [{ chapter: 0, say: 'Today.' }] }, { now: 2026, news: true }).scenes[0].era, '2026');
});

test('a name card aims the camera at the face the picker reports (Yom Kippur: Sadat cropped to the top of his head)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arsiv-'));
  const scenes = [photo('Anwar Sadat 1971 speech', 'Sadat wanted the Sinai back.', { name: 'Anwar Sadat', role: 'President of Egypt' })];
  const r = await runArchive(dir, scenes, () => [cand('wikimedia', U.kontrol, { width: 1470, height: 1163 })], {
    pickFn: () => ({ choice: 1, reason: 'test', namedPersonIsMainSubject: true, faceX: 0.48, faceY: 0.66 }),
  });
  assert.deepEqual(r.script.scenes[0].focus, [0.48, 0.66]);
  assert.equal(r.script.scenes[0].name, 'Anwar Sadat');
  assert.deepEqual(arch.yuzOf({ faceX: 2, faceY: 0.5 }), null, 'an impossible position is ignored');
});
