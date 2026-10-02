// Stres kareleri: her kurgu stilinde (7) en riskli sahneleri tek kare olarak render eder.
//   node scripts/stress-stills.mjs <çıktı klasörü> [stiller] [--quick]
// Ücretli API çağırmaz: görseller ffmpeg ile üretilir, ses yok (kelime zamanları sahte).
// Riskli olanlar: uzun slam kelimeleri, ₺ + 2.400.000 sayacı, yıl sayacı (1453),
// yükselen/düşen grafik, bölüm kartı, dikey 600x900 ve küçük 480x360 arşiv görseli,
// montaj kanca kelimesi, gazete manşeti (uzun/kısa, fotoğraflı/fotoğrafsız, Kiril) ve altı harita bölgesinin
// hepsi (her stilde iki harita), kurgu aygıtları (delil panosu, belge yakınlaştırma, zaman çizelgesi,
// bölünmüş ekran, alıntı kartı, dondur-işaretle; uzun metinlerle). Her stil için bir de kontak sayfası (sheet-<stil>.jpg) yazılır.
//   --src <klasör>: kompozisyonu src/ yerine bu klasörden, ayrı bir pakete derler (paylaşılan
//   build/bundle'a ve süren bir render'a dokunmadan geliştirme).
//   --locale en-US: İngilizce senaryo (ekran yazıları İngilizce, 'i' içeren kelimeler: Airline, Hijacking, Titanic;
//   harita etiketleri, bölüm kartı, sayaç birimleri, isim kartları İngilizce kurallarla). Varsayılan tr-TR.
//   --only <tip,tip>: yalnızca bu tiplerdeki sahnelerin karelerini render eder (ör. headline,map;
//   board,document,timeline,split,quote,annotate = aygıtlar).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR, ensureBundle } from '../lib/produce.mjs';
import { placeTimeline } from '../src/timeline.js';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const srcArg = flag('--src');
const only = flag('--only')?.split(',');
const LOCALE = flag('--locale') ?? 'tr-TR';
const EN = !/^tr/i.test(LOCALE);
const [outDir, genreArg = 'documentary,crime,epic,science,inspire,finance,horror'] = args.filter((a, i) => !a.startsWith('--') && !['--src', '--only', '--locale'].includes(args[i - 1]));
if (!outDir) {
  console.error('kullanım: node scripts/stress-stills.mjs <çıktı klasörü> [stiller] [--quick]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const FPS = 30;
// Below-normal priority (Chrome inherits it on Windows): the PC stays responsive, a production render keeps its CPU.
try {
  os.setPriority(process.pid, 10);
} catch {}
/** Infographic key frames (src/infographics/timing.js; from --src when given) for picking the risky frames. */
const INFO = await import(pathToFileURL(join(srcArg ? resolve(srcArg) : join(ENGINE_DIR, 'src'), 'infographics', 'timing.js')).href).catch(() => null);
const require = createRequire(join(ENGINE_DIR, '..', 'package.json'));
const ff = require('ffmpeg-static');

/* ------------------------------------------------------------ test pictures */

const site = join(os.tmpdir(), 'docu-stress-site');
rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, 'public', 'img'), { recursive: true });

/**
 * Pictures that make cropping visible: a frame border (is the edge cut?), a
 * "head" disc near the top (does a portrait keep the face?) and a grid.
 */
function makeImage(name, w, h, hue) {
  const out = join(site, 'public', 'img', name);
  const head = Math.round(Math.min(w, h) * 0.16);
  const vf = [
    `hue=h=${hue}`,
    `drawbox=x=0:y=0:w=iw:h=ih:color=red@1:t=${Math.max(6, Math.round(w / 80))}`,
    `drawgrid=w=iw/6:h=ih/6:t=2:c=white@0.35`,
    `drawbox=x=${Math.round(w / 2 - head / 2)}:y=${Math.round(h * 0.22)}:w=${head}:h=${head}:color=yellow@0.9:t=fill`,
  ].join(',');
  const r = spawnSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:d=1`, '-frames:v', '1', '-vf', vf, '-q:v', '3', out]);
  if (r.status !== 0) throw new Error(`ffmpeg ${name}: ${r.stderr}`);
  return `img/${name}`;
}
const LAND = makeImage('land.jpg', 1536, 1024, 20);
const LAND2 = makeImage('land2.jpg', 1536, 1024, 200);
const PORTRAIT = makeImage('portrait.jpg', 600, 900, 90);
const SMALL = makeImage('small.jpg', 480, 360, 300);

/** A 4 s test clip with the same border / head disc, for the freeze & mark on footage. */
function makeClip(name, w, h, hue) {
  const out = join(site, 'public', 'img', name);
  const head = Math.round(Math.min(w, h) * 0.16);
  const vf = [
    `hue=h=${hue}`,
    `drawbox=x=0:y=0:w=iw:h=ih:color=red@1:t=${Math.max(6, Math.round(w / 80))}`,
    `drawgrid=w=iw/6:h=ih/6:t=2:c=white@0.35`,
    `drawbox=x=${Math.round(w / 2 - head / 2)}:y=${Math.round(h * 0.22)}:w=${head}:h=${head}:color=yellow@0.9:t=fill`,
  ].join(',');
  const r = spawnSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:d=4:r=30`, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out]);
  if (r.status !== 0) throw new Error(`ffmpeg ${name}: ${r.stderr}`);
  return `img/${name}`;
}
const CLIP = makeClip('clip.mp4', 1280, 720, 140);
const CLIP_STILL = makeImage('clipstill.jpg', 1280, 720, 140);

/* ----------------------------------------------------------- the script */

/** Fake word timings: one word every `step` seconds after `lead`. */
function said(text, lead = 0.3, step = 0.32) {
  const words = text.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean);
  return { say: text, wordTimes: words.map((word, i) => ({ word, t: +(lead + i * step).toFixed(2) })), voiceDur: +(lead + words.length * step + 0.2).toFixed(2) };
}

function script(genre) {
  if (EN) return scriptEn(genre);
  const scenes = [
    { type: 'montage', mood: 'tension', images: [LAND, PORTRAIT, SMALL, LAND2, LAND], text: 'Bir gecede herkes KAYBOLDU', dur: 4, chapter: 0, ...said('Bir gecede herkes... kayboldu.') },
    { type: 'title', mood: 'curious', kicker: 'İstanbul · 1453', title: 'Kayıp Hazinenin Peşinde: İmparatorluğun Son Gecesi', image: LAND, imgW: 1536, imgH: 1024, dur: 5, chapter: 0, ...said('Bu, bir imparatorluğun son gecesinin hikâyesi.') },
    { type: 'title', chapterCard: true, chapterNo: 2, title: 'YÜKSELİŞ VE ÇÖKÜŞÜN UZUN YILLARI', image: LAND2, imgW: 1536, imgH: 1024, dur: 2.8, chapter: 1 },
    { type: 'slam', mood: 'dread', word: 'KAYBOLDULAR', sub: '1.178 kişi · tek gece', image: LAND, imgW: 1536, imgH: 1024, dur: 4, chapter: 1, ...said('Ve sonra hepsi bir anda kayboldular.') },
    { type: 'slam', mood: 'reveal', word: 'DOLANDIRILDILAR', sub: 'Yatırımcıların hepsi', image: PORTRAIT, imgW: 600, imgH: 900, dur: 4, chapter: 1, ...said('Gerçek çok basitti: hepsi dolandırıldılar.') },
    { type: 'counter', mood: 'tension', to: 2400000, prefix: '₺', label: 'KAYBOLAN TOPLAM SERVET', dur: 4.5, chapter: 1, ...said('Toplam iki milyon dört yüz bin lira buharlaştı.') },
    { type: 'counter', mood: 'triumph', to: 1453, year: true, label: "KONSTANTİNOPOLİS'İN FETHİ", dur: 4.5, chapter: 1, ...said('Bin dört yüz elli üç yılında şehir düştü.') },
    { type: 'chart', mood: 'triumph', points: [12, 18, 25, 40, 65, 110, 240], prefix: '$', title: 'Hisse fiyatı yedi yılda yirmi katına çıktı', from: '1995', to: '2001', dur: 5, chapter: 1, ...said('Hisse fiyatı yedi yılda yirmi katına çıktı.') },
    { type: 'chart', mood: 'dread', points: [90, 84, 70, 40, 12, 0.3], prefix: '$', title: 'Ve tek bir yılda sıfıra indi', from: 'Ocak 2001', to: 'Aralık 2001', dur: 5, chapter: 1, ...said('Ve tek bir yılda neredeyse sıfıra indi.') },
    { type: 'photo', mood: 'calm', image: PORTRAIT, imgW: 600, imgH: 900, focus: [0.5, 0.3], name: 'Fatih Sultan Mehmed', role: 'Osmanlı Padişahı · 1432–1481', dur: 5, chapter: 1, ...said('Genç padişah yirmi bir yaşındaydı.') },
    { type: 'photo', mood: 'sad', image: SMALL, imgW: 480, imgH: 360, caption: 'Surların önündeki son fotoğraf, 1890 civarı', dur: 5, chapter: 1, ...said('Geriye yalnızca bu bulanık fotoğraf kaldı.') },
    { type: 'words', mood: 'curious', text: 'Kimse hazinenin nereye gittiğini bilmiyordu', keyword: 'hazinenin', image: SMALL, imgW: 480, imgH: 360, dur: 4.5, chapter: 1, ...said('Kimse hazinenin nereye gittiğini bilmiyordu.') },
    { type: 'photo', mood: 'reveal', image: LAND2, imgW: 1536, imgH: 1024, images: [PORTRAIT, SMALL], dur: 5.5, chapter: 1, ...said('Ta ki arşivde üç belge ortaya çıkana kadar.') },
    ...news(genre),
    ...maps(genre),
    ...devices(genre),
    ...infographics(genre),
  ];
  return { id: `stress-${genre}`, title: 'Stres testi', genre, locale: 'tr-TR', chapters: ['Giriş', 'Yükseliş ve Çöküş'], scenes };
}

/**
 * The English run (--locale en-US): the same risky shapes with English words
 * that carry an "i" (Airline, Hijacking, Titanic): Turkish case rules would
 * print them as AİRLİNE, and word matching would miss "I" against "i".
 */
function scriptEn(genre) {
  const scenes = [
    { type: 'montage', mood: 'tension', images: [LAND, PORTRAIT, SMALL, LAND2, LAND], text: 'In one night the Airline lost EVERYTHING', dur: 4, chapter: 0, ...said('In one night the airline lost everything.') },
    { type: 'title', mood: 'curious', kicker: 'Seattle · 1971', title: 'The Hijacking of Flight 305: The Man Who Vanished', image: LAND, imgW: 1536, imgH: 1024, dur: 5, chapter: 0, ...said('This is the story of the only unsolved hijacking in American history.') },
    { type: 'title', chapterCard: true, chapterNo: 2, kicker: 'CHAPTER 2', title: 'THE LONG NIGHT OF THE TITANIC', image: LAND2, imgW: 1536, imgH: 1024, dur: 2.8, chapter: 1 },
    { type: 'slam', mood: 'dread', word: 'HIJACKING', sub: '36 passengers · one night', image: LAND, imgW: 1536, imgH: 1024, dur: 4, chapter: 1, ...said('And then it became a hijacking.') },
    { type: 'slam', mood: 'reveal', word: 'Titanic', sub: 'Invincible, they said', image: PORTRAIT, imgW: 600, imgH: 900, dur: 4, chapter: 1, ...said('They called it the unsinkable TITANIC.') },
    { type: 'counter', mood: 'tension', to: 200000, prefix: '$', suffix: ' in ransom', label: 'IN TWENTY-DOLLAR BILLS', dur: 4.5, chapter: 1, ...said('Two hundred thousand dollars in twenty dollar bills.') },
    { type: 'counter', mood: 'triumph', to: 1517, label: 'LIVES LOST IN THE ATLANTIC', dur: 4.5, chapter: 1, ...said('Fifteen hundred and seventeen lives were lost.') },
    { type: 'counter', mood: 'triumph', to: 1912, year: true, label: 'THE MAIDEN VOYAGE', dur: 4.5, chapter: 1, ...said('It was nineteen twelve, the maiden voyage.') },
    { type: 'chart', mood: 'dread', points: [90, 84, 70, 40, 12, 0.3], prefix: '$', title: 'Airline shares in a single year', from: 'January 2001', to: 'December 2001', dur: 5, chapter: 1, ...said('Airline shares fell to almost nothing in a single year.') },
    { type: 'photo', mood: 'calm', image: PORTRAIT, imgW: 600, imgH: 900, focus: [0.5, 0.3], name: 'Florence Schaffner', role: 'Flight Attendant · Northwest Orient Airlines', dur: 5, chapter: 1, ...said('Florence Schaffner was sitting in the jump seat.') },
    { type: 'photo', mood: 'sad', image: SMALL, imgW: 480, imgH: 360, caption: 'The last photograph of the ship, April 1912', dur: 5, chapter: 1, ...said('Only this blurry photograph survives.') },
    { type: 'words', mood: 'curious', text: 'I still think the Airline knew', keyword: 'Airline', image: SMALL, imgW: 480, imgH: 360, dur: 4.5, chapter: 1, ...said('I still think the AIRLINE knew.') },
    { type: 'photo', mood: 'reveal', image: LAND2, imgW: 1536, imgH: 1024, images: [PORTRAIT, SMALL], dur: 5.5, chapter: 1, ...said('Until three files surfaced in the archive.') },
    { type: 'words', mood: 'curious', text: 'Nobody knew where the hijacker went', keyword: 'hijacker', dur: 4.5, chapter: 1, ...said('Nobody knew where the HIJACKER went.') },
    ...news(genre),
    ...maps(genre),
    ...devices(genre),
    ...infographics(genre),
  ];
  return { id: `stress-en-${genre}`, title: 'Stress test', genre, locale: LOCALE, chapters: ['Intro', 'Rise and Fall'], scenes };
}

/**
 * Two front pages per style: a long English headline with a photo, deck and
 * translation, and one without a photo that is short, Turkish or Cyrillic.
 */
function news(genre) {
  const long = {
    type: 'headline', mood: 'reveal', paper: 'THE NEW YORK TIMES', date: 'APRIL 16, 1912',
    headline: 'TITANIC SINKS FOUR HOURS AFTER HITTING ICEBERG', sub: 'MORE THAN 700 RESCUED BY CARPATHIA; OVER 1,500 LOST',
    translation: 'Titanik, buzdağına çarptıktan dört saat sonra battı', image: LAND, imgW: 1536, imgH: 1024, caption: 'The liner leaving Southampton',
    dur: 5, chapter: 1, ...said('Ve dünya tek bir şey soruyordu: bu nasıl oldu?'),
  };
  const other = {
    horror: { paper: 'ЛЕНИНСКИЙ ПУТЬ', date: '1990', headline: 'ТАЙНА ОГНЕННЫХ ШАРОВ', translation: 'Ateş toplarının sırrı' },
    finance: { paper: 'THE WALL STREET JOURNAL', date: 'OCTOBER 30, 1929', headline: 'STOCKS COLLAPSE IN 16,000,000-SHARE DAY', sub: 'RECORD TRADING SWAMPS THE TICKER' },
    crime: { paper: 'THE OREGONIAN', date: 'NOVEMBER 25, 1971', headline: 'HIJACKER BAILS OUT WITH $200,000', translation: 'Korsan 200.000 dolarla atladı' },
    epic: { paper: 'CUMHURİYET', date: '29 MAYIS 1953', headline: 'FETHİN 500. YILI' },
    science: { paper: 'THE WASHINGTON POST', date: 'AUGUST 26, 1989', headline: 'VOYAGER REACHES NEPTUNE' },
    inspire: { paper: 'NEW YORK HERALD', date: 'MARCH 14, 1895', headline: "TESLA'S LABORATORY BURNED", sub: '"I AM IN TOO MUCH GRIEF TO TALK"' },
    documentary: { paper: 'CUMHURİYET', date: '16 NİSAN 1912', headline: 'TİTANİK BATTI' },
  }[genre];
  return [long, { type: 'headline', mood: 'dread', dur: 4.5, chapter: 1, ...other, ...said('Ertesi sabah bu cümle bütün gazetelerdeydi.') }];
}

const REGION_ORDER = ['north-atlantic', 'bosphorus', 'urals', 'wall-street', 'solar-system', 'pacific-northwest'];
const MAP_SAMPLES = {
  'pacific-northwest': {
    points: [{ label: 'Seattle', x: 0.4259, y: 0.1734 }, { label: 'Portland', x: 0.4138, y: 0.329 }, { label: 'Reno', x: 0.5079, y: 0.8121 }],
    route: [0, 2], title: '305 sefer sayılı uçuş · 24 Kasım 1971',
  },
  bosphorus: {
    points: [{ label: 'Konstantinopolis', x: 0.4205, y: 0.7308 }, { label: 'Galata', x: 0.4117, y: 0.69 }],
    route: [0, 1], line: 'barrier', focus: 0, title: 'Haliç zinciri · 1453',
  },
  'north-atlantic': {
    points: [
      { label: 'Southampton', x: 0.8543, y: 0.4583 }, { label: 'Cherbourg', x: 0.852, y: 0.4958 }, { label: 'Queenstown', x: 0.7793, y: 0.4301 },
      { label: 'Batış noktası', x: 0.3266, y: 0.7313 }, { label: 'New York', x: 0.0652, y: 0.7619 },
    ],
    route: [0, 1, 2, 3], focus: 3, title: '10-15 Nisan 1912',
  },
  urals: {
    points: [
      { label: 'İvdel', x: 0.5633, y: 0.8111 }, { label: 'Vijay', x: 0.5482, y: 0.5167 }, { label: 'İkinci Kuzey', x: 0.4804, y: 0.3611 },
      { label: 'Holat Siyahl', x: 0.4187, y: 0.22 }, { label: 'Otorten', x: 0.4111, y: 0.1578 },
    ],
    route: [0, 1, 2, 3], focus: 3, title: 'Ocak–Şubat 1959',
  },
  'wall-street': {
    points: [{ label: 'New York Borsası', x: 0.278, y: 0.558 }, { label: 'Morgan binası', x: 0.3975, y: 0.53 }, { label: 'Federal Hall', x: 0.4075, y: 0.4025 }],
    focus: 1, title: '24 Ekim 1929',
  },
  'solar-system': {
    points: [
      { label: 'Dünya', x: 0.1101, y: 0.5476 }, { label: 'Jüpiter', x: 0.2166, y: 0.4826 }, { label: 'Satürn', x: 0.3366, y: 0.4754 },
      { label: 'Uranüs', x: 0.5031, y: 0.4931 }, { label: 'Neptün', x: 0.6888, y: 0.5428 },
    ],
    route: [0, 1, 2, 3, 4], title: 'Voyager 2 · 1977–1989',
  },
};
/** Two maps per style, walking the regions so a full run draws all six at least twice. */
const MAP_EN = {
  'pacific-northwest': { title: 'Flight 305 · November 24, 1971' },
  bosphorus: { points: [{ label: 'Constantinople', x: 0.4205, y: 0.7308 }, { label: 'Galata', x: 0.4117, y: 0.69 }], title: 'The Golden Horn chain · 1453' },
  'north-atlantic': { title: 'April 10-15, 1912', labelsFrom: { 3: 'Sinking site' } },
  urals: { title: 'January–February 1959', labelsFrom: { 0: 'Ivdel', 1: 'Vizhay', 2: 'Second Northern', 3: 'Kholat Syakhl' } },
  'wall-street': { title: 'October 24, 1929', labelsFrom: { 0: 'New York Stock Exchange', 1: 'Morgan building' } },
  'solar-system': {
    points: [
      { label: 'Earth', x: 0.1101, y: 0.5476 }, { label: 'Jupiter', x: 0.2166, y: 0.4826 }, { label: 'Saturn', x: 0.3366, y: 0.4754 },
      { label: 'Uranus', x: 0.5031, y: 0.4931 }, { label: 'Neptune', x: 0.6888, y: 0.5428 },
    ],
  },
};
function mapSample(region) {
  const base = MAP_SAMPLES[region];
  if (!EN) return base;
  const { labelsFrom, ...en } = MAP_EN[region] ?? {};
  const points = en.points ?? base.points.map((p, i) => (labelsFrom?.[i] ? { ...p, label: labelsFrom[i] } : p));
  return { ...base, ...en, points };
}
function maps(genre) {
  const gi = ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror'].indexOf(genre);
  return [0, 1].map((k) => {
    const region = REGION_ORDER[(gi * 2 + k) % REGION_ORDER.length];
    return { type: 'map', mood: 'curious', region, ...mapSample(region), dur: 5, chapter: 1, ...said(EN ? 'The route is drawn step by step as the camera moves in.' : 'Rota haritada adım adım çiziliyor ve kamera yaklaşıyor.') };
  });
}

/*
 * Edit devices (src/devices): an evidence board, a document zoom, a timeline,
 * a split screen, a quote card and a freeze & mark on a photo — per style,
 * rotating through their variants so a full run covers every kind: all five
 * document kinds plus a scan, horizontal and vertical timelines, versus and
 * before/after, quotes with and without a portrait, boards of 3 to 9 prints
 * (pictures by `fromScene`, counted in the script AS WRITTEN — the chapter card at
 * index 2 is skipped, as the pipeline inserts those: 1 = LAND title, 8 = portrait,
 * 9 = small scan, 11 = LAND2), marks on a full-bleed still, a contained portrait, a collage
 * print and footage. Long texts on purpose: nothing may leave its box.
 */
const GENRE_ORDER = ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror'];
function devices(genre) {
  const gi = GENRE_ORDER.indexOf(genre);
  const odd = gi % 2 === 1;
  const base = { dur: 6, chapter: 1 };

  const boards = [
    {
      title: 'Kayıp hazinenin izinde: şüpheliler ve bağlantılar',
      items: [
        { fromScene: 8, label: 'Fatih Sultan Mehmed', note: 'Son gece surlardaydı — tanıklar doğruluyor' },
        { fromScene: 11, label: 'Liman deposu', note: 'Anahtar kayıp' },
        { fromScene: 9, label: 'Bulanık fotoğraf, 1890' },
        { label: 'Kimliği belirsiz tüccar', note: 'Venedik kayıtlarında adı geçiyor' },
        { fromScene: 1, label: 'Surların önü' },
        { image: LAND2, imgW: 1536, imgH: 1024, label: 'İkinci depo: gizli geçit ve tünel girişi' },
      ],
      links: [[0, 1], [1, 3], [3, 5], [2, 4], [0, 4]],
      focus: 3,
    },
    {
      title: 'Suspects',
      items: [
        { fromScene: 8, label: 'The Mayor' },
        { label: 'Unknown caller' },
        { fromScene: 11, label: 'Warehouse on Pier 9' },
      ],
      focus: 1,
    },
    {
      items: Array.from({ length: 9 }, (_, i) => ({
        ...(i % 3 === 2 ? {} : { fromScene: [8, 11, 9, 1][i % 4] }),
        label: ['Ayşe', 'Liman müdürü Mehmet Kaptanoğlu', 'Tanık', 'Kasa', 'Rıhtım', 'Anonim mektup ve imzasız ihbar', 'Gümrük', 'Depo', 'Gece bekçisi'][i],
      })),
      links: [[0, 4], [4, 8], [1, 5], [2, 6], [3, 7], [0, 8]],
      focus: 4,
    },
  ];
  const board = { type: 'board', mood: 'tension', ...boards[gi % 3], ...base, dur: 7, ...said('Tüm ipuçları aynı panoda birleşiyor ve bir isim öne çıkıyor.') };

  const docs = {
    documentary: {
      doc: { kind: 'letter', heading: 'OSMANLI BANKASI — GALATA ŞUBESİ', lines: ['Sayın Müdür Bey,', 'Dün gece saat on bir sularında kasa dairesinin kapısı açık bulunmuştur. Bekçinin ifadesine göre içeride kimse görülmemiştir.', 'Kayıp miktarının iki milyon dört yüz bin lira olduğu tahmin edilmektedir; defterler mühürlenmiştir.', 'Konunun gizli tutulmasını rica ederim.', 'Saygılarımla, İ. Hakkı'] },
      highlight: 'iki milyon dört yüz bin lira', redact: ['İ. Hakkı'], stamp: true,
    },
    crime: {
      doc: { kind: 'fbi-teletype', heading: 'FBI SEATTLE  11/25/71  URGENT', lines: ['TO DIRECTOR AND SACS PORTLAND, LAS VEGAS', 'FROM SAC SEATTLE', 'UNSUB, AKA DAN COOPER, AIRCRAFT PIRACY, NORTHWEST ORIENT AIRLINES FLIGHT 305.', 'SUBJECT PARACHUTED FROM REAR STAIRS WITH TWO HUNDRED THOUSAND DOLLARS IN TWENTY DOLLAR BILLS.', 'DESCRIBED AS WHITE MALE, MID FORTIES, DARK SUNGLASSES, BLACK TIE.', 'INFORMANT JOHN RATAZCZAK ADVISED SEARCH OF LEWIS RIVER AREA NEGATIVE.', 'END'] },
      highlight: 'two hundred thousand dollars', redact: ['JOHN RATAZCZAK', 'LEWIS RIVER'], stamp: 'CONFIDENTIAL',
    },
    epic: {
      doc: { kind: 'telegram', heading: 'TELGRAF', lines: ['ŞEHİR DÜŞTÜ STOP SURLAR AŞILDI STOP', 'İMPARATOR KAYIP STOP LİMAN ZİNCİRİ KIRILDI STOP', 'TAKVİYE GÖNDERMEYİN STOP HER ŞEY BİTTİ'] },
      highlight: 'İMPARATOR KAYIP', stamp: 'ACİL',
    },
    science: {
      doc: { kind: 'report', heading: 'MISSION REPORT — VOYAGER 2 NEPTUNE ENCOUNTER', lines: Array.from({ length: 14 }, (_, i) => (i === 11 ? 'At 03:56 UT the spacecraft passed 4,950 km above the north pole of Neptune, the closest approach of the entire mission.' : `Item ${i + 1}. Telemetry from the imaging subsystem remained nominal throughout the sequence; all frames were returned to the Deep Space Network without loss.`)) },
      highlight: 'closest approach of the entire mission', redact: ['4,950 km'],
    },
    inspire: {
      doc: { kind: 'telegram', heading: 'WESTERN UNION', lines: ['LABORATORY DESTROYED BY FIRE THIS MORNING STOP', 'ALL NOTES AND MACHINES LOST STOP', 'WILL BEGIN AGAIN TOMORROW STOP DO NOT WORRY'] },
      highlight: 'WILL BEGIN AGAIN TOMORROW',
    },
    finance: {
      doc: { kind: 'ledger', heading: 'Günlük Defter — Ekim 1929', lines: ['24 Ekim | Satış — US Steel hisseleri | 12.400', '25 Ekim | Kredi faizi | 1.150', '28 Ekim | Satış — General Electric (tamamı) | 48.900', '29 Ekim | Teminat açığı, hesap kapatıldı | 102.000', '30 Ekim | Kalan nakit | 312'] },
      highlight: 'Teminat açığı', redact: ['Kredi faizi'],
    },
    horror: { image: PORTRAIT, imgW: 600, imgH: 900, stamp: true },
  }[genre];
  const document = { type: 'document', mood: 'reveal', ...docs, ...base, dur: 7, ...said('Belgede tek bir cümle her şeyi değiştiriyordu.') };

  const tlH = {
    events: [
      { year: 1914, label: 'Savaş başlıyor' },
      { year: 1918, label: 'Ateşkes ve imparatorluğun sonu' },
      { year: 1923, label: 'Cumhuriyet ilan ediliyor' },
      { year: 1929, label: 'Büyük Buhran bütün dünyayı sarsıyor ve ihracat çöküyor' },
      { year: 1938, label: 'Bir dönemin sonu' },
    ],
    focus: 3, span: [1910, 1940], title: 'Otuz yıl',
  };
  const tlV = {
    events: [
      { year: '1492', label: 'Columbus reaches the Caribbean' },
      { year: '1519', label: 'Magellan sets sail' },
      { year: '1588', label: 'The Armada is lost in storms off Ireland' },
      { year: '1620', label: 'Mayflower' },
      { year: '1776', label: 'Declaration of Independence signed in Philadelphia' },
      { year: '1803', label: 'Louisiana Purchase doubles the size of the young republic overnight' },
      { year: '1865', label: 'Civil War ends' },
      { year: '1969', label: 'Apollo 11' },
    ],
    focus: 5, title: 'Four centuries',
  };
  const timeline = { type: 'timeline', mood: 'curious', ...(odd ? tlV : tlH), ...base, ...said('Olaylar zaman çizelgesinde tek tek beliriyor.') };
  // Cooper QA (scene 121): three events, focus on the last, a 3.2 s shot — the first label hung off the
  // left edge on the held shot ("971", "ember night"). Odd genres force it vertical: both orientations.
  const tlShort = {
    type: 'timeline', mood: 'curious', dur: 3.2, chapter: 1,
    events: [
      { year: 1971, label: 'Cooper jumps on a November night' },
      { year: 1974, label: 'Money washes ashore after this' },
      { year: 1980, label: 'Brian Ingram finds the bills' },
    ],
    ...(odd ? { orient: 'vertical' } : {}),
    ...said("So the money didn't hit the water... on a November night.", 0.1, 0.3),
  };

  const split = odd
    ? { type: 'split', mood: 'reveal', mode: 'before-after', left: { fromScene: 1 }, right: { image: LAND2, imgW: 1536, imgH: 1024 }, ...base, ...said('Aynı sokak, yüz yıl sonra tanınmaz halde.') }
    : { type: 'split', mood: 'tension', mode: 'versus', left: { fromScene: 8, label: 'Fatih Sultan Mehmed' }, right: { image: LAND, imgW: 1536, imgH: 1024, label: 'XI. Konstantinos Palaiologos' }, ...base, ...said('İki hükümdar, tek bir şehir için karşı karşıya.') };

  const qLong = 'Bu şehri ya ben alacağım ya da şehir beni alacak; ama hiçbir güç beni bu surların önünden geri döndüremeyecek, ne kış ne açlık ne de ordunun korkusu.';
  const qShort = 'The truth will come out.';
  const quote = gi % 2 === 0
    ? { type: 'quote', mood: 'reveal', quote: qLong, who: 'Fatih Sultan Mehmed', when: 'Kuşatmanın 40. günü, 1453', fromScene: 8, ...base, dur: 8, ...said(`Kuşatmanın kırkıncı gününde şöyle dedi: ${qLong}`, 0.3, 0.26) }
    : { type: 'quote', mood: 'sad', quote: qShort, who: 'Unknown informant', when: '1971', ...base, ...said(`A letter arrived with one line. ${qShort}`) };

  // Freeze & mark: the yellow head disc sits at (0.5, 0.30) of every test picture (0.273 on the portrait); r is a fraction of the picture's width.
  const marks = {
    documentary: { image: LAND2, imgW: 1536, imgH: 1024, annotate: { x: 0.5, y: 0.3, label: 'Kapının üstündeki işaret: aynı sembol' } },
    crime: { image: PORTRAIT, imgW: 600, imgH: 900, annotate: { x: 0.5, y: 0.273, r: 0.13, label: 'Same tie clip', arrow: 'down' } },
    epic: { image: PORTRAIT, imgW: 600, imgH: 900, annotate: { x: 0.5, y: 0.273, r: 0.12, label: 'Mührün izi', arrow: 'left' } },
    science: { image: CLIP_STILL, imgW: 1280, imgH: 720, video: CLIP, videoStart: 0, videoDur: 4, videoW: 1280, videoH: 720, annotate: { at: 2.2, x: 0.5, y: 0.3, label: 'Signal source' } },
    inspire: { image: LAND, imgW: 1536, imgH: 1024, images: [PORTRAIT], annotate: { x: 0.5, y: 0.3, label: 'Laboratuvarın ilk hali, yangından önceki son kare' } },
    finance: { image: LAND, imgW: 1536, imgH: 1024, annotate: { x: 0.5, y: 0.3, r: 0.07, label: 'Ticker: -38%', arrow: 'right' } },
    horror: { image: LAND2, imgW: 1536, imgH: 1024, annotate: { x: 0.5, y: 0.3, label: 'Pencerede biri var', arrow: 'up' } },
  }[genre];
  const mark = { type: 'photo', mood: 'dread', ...marks, ...base, ...said('Karede ilk bakışta kimsenin fark etmediği bir ayrıntı var.') };

  return [board, document, timeline, tlShort, split, quote, mark];
}

/*
 * Infographics (src/infographics): all six types in every style, rotating
 * through their variants — horizontal rows with long labels and columns with
 * short ones, compact billions, a two-slice and a six-slice ring, 3 to 100
 * pictograms of every glyph, a 1:34 and a 1:1,000,000 scale, a chain long
 * enough to fold into two rows and a branching network, a rolled figure with
 * each trend and a typed "1 in 3". One scene per style also carries a light
 * art-director backdrop (paper / blueprint / gradient) and a text style.
 * Numbers and labels are in the narration, so the reveals run on word hits.
 */
function infographics(genre) {
  const gi = GENRE_ORDER.indexOf(genre);
  const v = (k, n) => (gi + k) % n;
  const base = { dur: 5.5, chapter: 1 };
  const E = EN;
  const bars = [
    E
      ? { items: [{ label: 'Cash found on the Columbia River bank in 1980', value: 5800 }, { label: 'Ransom paid by Northwest Orient Airlines', value: 200000 }, { label: 'Reward offered by the airline', value: 25000 }, { label: 'Average salary of an FBI agent', value: 13500 }], unit: '$', highlight: 1, title: 'The money trail of Flight 305', say: 'Only $5,800 was found on the Columbia river bank, from a $200,000 ransom; the airline offered $25,000, while an agent earned $13,500.' }
      : { items: [{ label: '1980\'de nehir kıyısında bulunan para', value: 5800 }, { label: 'Havayolunun ödediği fidye', value: 200000 }, { label: 'Havayolunun koyduğu ödül', value: 25000 }, { label: 'Bir FBI ajanının yıllık maaşı', value: 13500 }], unit: '$', highlight: 1, title: '305 sefer sayılı uçuşun para izi', say: 'Nehir kıyısında yalnızca 5.800 dolar bulundu; fidye 200.000 dolardı, ödül 25.000, bir ajanın maaşı 13.500.' },
    E
      ? { items: [{ label: 'First class', value: 62 }, { label: 'Second class', value: 41 }, { label: 'Third class', value: 25 }], unit: '%', highlight: 2, say: 'In first class 62% survived, in second class 41%, and in third class just 25%.' }
      : { items: [{ label: 'Birinci sınıf', value: 62 }, { label: 'İkinci sınıf', value: 41 }, { label: 'Üçüncü sınıf', value: 25 }], unit: '%', highlight: 2, say: 'Birinci sınıfta yüzde 62, ikincide yüzde 41, üçüncü sınıfta ise yalnızca yüzde 25 kurtuldu.' },
    E
      ? { items: [{ label: 'Crew', value: 885 }, { label: 'Third-class passengers from Ireland, Sweden and Lebanon', value: 709 }, { label: 'Second class', value: 285 }, { label: 'First class', value: 324 }, { label: 'Stowaways', value: 2 }, { label: 'Guarantee group', value: 9 }, { label: 'Musicians', value: 8 }, { label: 'Postal clerks', value: 5 }], unit: ' people', sort: true, highlight: 1, title: 'Who was aboard', say: 'There were 885 crew, 709 in third class, 324 in first, 285 in second, 9 engineers, 8 musicians, 5 postal clerks and 2 stowaways.' }
      : { items: [{ label: 'Mürettebat', value: 885 }, { label: 'İrlanda, İsveç ve Lübnan\'dan üçüncü sınıf yolcular', value: 709 }, { label: 'İkinci sınıf', value: 285 }, { label: 'Birinci sınıf', value: 324 }, { label: 'Kaçak yolcular', value: 2 }, { label: 'Garanti ekibi', value: 9 }, { label: 'Müzisyenler', value: 8 }, { label: 'Posta memurları', value: 5 }], unit: ' kişi', sort: true, highlight: 1, title: 'Gemide kimler vardı', say: 'Gemide 885 mürettebat, üçüncü sınıfta 709, birincide 324, ikincide 285 kişi; 9 mühendis, 8 müzisyen, 5 posta memuru ve 2 kaçak yolcu vardı.' },
    E
      ? { items: [{ label: 'Enron at its peak', value: 63.4e9 }, { label: 'WorldCom', value: 107e9 }, { label: 'Lehman Brothers', value: 691e9 }], unit: '$', highlight: 2, title: 'Largest collapses', say: 'Enron was worth 63.4 billion, WorldCom 107 billion, and Lehman Brothers 691 billion dollars.' }
      : { items: [{ label: 'Zirvedeki Enron', value: 63.4e9 }, { label: 'WorldCom', value: 107e9 }, { label: 'Lehman Brothers', value: 691e9 }], unit: '$', highlight: 2, title: 'En büyük çöküşler', say: 'Enron 63,4 milyar, WorldCom 107 milyar, Lehman Brothers ise 691 milyar dolardı.' },
  ][v(0, 4)];
  const donut = [
    E ? { slices: [{ label: 'Died', value: 1517 }, { label: 'Survived', value: 706 }], highlight: 0, say: 'Of 2,223 people aboard, 1,517 died and only 706 survived.' } : { slices: [{ label: 'Ölen', value: 1517 }, { label: 'Kurtulan', value: 706 }], highlight: 0, say: 'Gemideki 2.223 kişiden 1.517\'si öldü, yalnızca 706\'sı kurtuldu.' },
    E
      ? { slices: [{ label: 'Lost at sea with the ship', value: 1347 }, { label: 'Died in the water within an hour', value: 170 }, { label: 'Rescued by Carpathia', value: 706 }, { label: 'Never boarded at Southampton', value: 100 }, { label: 'Unknown', value: 20 }], highlight: 2, centerLabel: E ? '2,343 tickets' : '2.343 bilet', title: 'Every ticket, accounted for', say: '1,347 went down with the ship, 170 died in the water, 706 were rescued by Carpathia, 100 never boarded and 20 remain unknown.' }
      : { slices: [{ label: 'Gemiyle birlikte batan', value: 1347 }, { label: 'Bir saat içinde suda ölen', value: 170 }, { label: 'Carpathia\'nın kurtardığı', value: 706 }, { label: 'Southampton\'da binmeyen', value: 100 }, { label: 'Bilinmeyen', value: 20 }], highlight: 2, centerLabel: '2.343 bilet', title: 'Her biletin hesabı', say: '1.347 kişi gemiyle battı, 170 kişi suda öldü, Carpathia 706 kişiyi kurtardı, 100 kişi binmedi, 20 kişi bilinmiyor.' },
    E ? { slices: [{ label: 'Oil', value: 31 }, { label: 'Coal', value: 27 }, { label: 'Gas', value: 23 }, { label: 'Hydro', value: 7 }, { label: 'Nuclear', value: 4 }, { label: 'Wind and solar', value: 8 }], title: 'Where the energy comes from', say: 'Oil 31 percent, coal 27, gas 23, wind and solar 8, hydro 7 and nuclear 4.' } : { slices: [{ label: 'Petrol', value: 31 }, { label: 'Kömür', value: 27 }, { label: 'Doğalgaz', value: 23 }, { label: 'Hidro', value: 7 }, { label: 'Nükleer', value: 4 }, { label: 'Rüzgâr ve güneş', value: 8 }], title: 'Enerji nereden geliyor', say: 'Petrol yüzde 31, kömür 27, doğalgaz 23, rüzgâr ve güneş 8, hidro 7, nükleer 4.' },
  ][v(1, 3)];
  const icons = [
    { total: 10, filled: 9, icon: 'person', label: E ? 'passengers in third class never came home' : 'üçüncü sınıf yolcu eve dönmedi', say: E ? 'Nine out of ten passengers in third class never came home.' : 'Üçüncü sınıfta her 10 yolcudan 9\'u eve dönmedi.' },
    { total: 100, filled: 32, icon: 'soldier', label: E ? 'soldiers of the first wave did not survive the landing on the beach' : 'ilk dalga askerden kumsala çıkarmayı sağ atlatamadı', say: E ? '32 of every 100 soldiers in the first wave did not survive the landing.' : 'İlk dalgadaki her 100 askerden 32\'si çıkarmayı atlatamadı.' },
    { total: 3, filled: 1, icon: 'plane', label: E ? 'flights was hijacked' : 'uçuş kaçırıldı', say: E ? 'One in three flights was hijacked that year.' : 'O yıl her 3 uçuştan 1\'i kaçırıldı.' },
    { total: 20, filled: 7, icon: 'ship', label: E ? 'ships sank in the storm' : 'gemi fırtınada battı', say: E ? '7 of the 20 ships sank in the storm.' : '20 gemiden 7\'si fırtınada battı.' },
    { total: 50, filled: 12, icon: 'coin', label: E ? 'coins were forgeries' : 'sikke sahteydi', say: E ? '12 of the 50 coins were forgeries.' : '50 sikkeden 12\'si sahteydi.' },
    { total: 8, filled: 5, icon: 'house', label: E ? 'homes were lost to the flood' : 'ev selde yok oldu', say: E ? '5 of 8 homes were lost to the flood.' : '8 evden 5\'i selde yok oldu.' },
    { total: 30, filled: 28, icon: 'building', label: E ? 'banks in the district failed' : 'banka iflas etti', say: E ? '28 of the 30 banks in the district failed.' : 'Bölgedeki 30 bankadan 28\'i iflas etti.' },
  ];
  const icon = icons[v(2, icons.length)];
  const icon2 = { total: 100, filled: 99, icon: 'bill', label: E ? 'of the ransom bills were never found' : 'fidye banknotu hiç bulunamadı', say: E ? '99 of every 100 ransom bills were never found.' : 'Her 100 fidye banknotundan 99\'u hiç bulunamadı.' };
  const scales = [
    { a: { label: E ? 'found on the riverbank' : 'nehir kıyısında bulunan', value: 5800 }, b: { label: E ? 'ransom' : 'fidye', value: 200000 }, unit: '$', say: E ? 'They found $5,800... of a $200,000 ransom.' : 'Bulunan 5.800 dolardı... fidye ise 200.000 dolar.' },
    { a: { label: E ? 'people who saw the craft' : 'aracı gören kişi', value: 1 }, b: { label: E ? 'people who heard the broadcast' : 'yayını duyan kişi', value: 1000000 }, unit: E ? ' people' : ' kişi', title: E ? 'One witness, a million listeners' : 'Bir tanık, bir milyon dinleyici', say: E ? 'One person saw it. One million heard about it.' : 'Onu 1 kişi gördü. 1.000.000 kişi duydu.' },
    { a: { label: E ? 'lifeboat seats' : 'filika yeri', value: 1178 }, b: { label: E ? 'people aboard' : 'gemideki insan', value: 2223 }, say: E ? 'There were 1,178 lifeboat seats for 2,223 people.' : '2.223 kişi için yalnızca 1.178 filika yeri vardı.' },
  ];
  const scale = scales[v(3, 3)];
  const flows = [
    {
      nodes: [{ id: 'r', label: E ? 'Northwest Orient' : 'Northwest Orient' }, { id: 'b', label: E ? 'Seattle First National Bank' : 'Seattle First National Bank' }, { id: 'c', label: 'Dan Cooper' }, { id: 'w', label: E ? 'Columbia River bank' : 'Columbia Nehri kıyısı' }],
      edges: [['r', 'b', '$200,000'], ['b', 'c', E ? '10,000 bills' : '10.000 banknot'], ['c', 'w', '$5,800']],
      title: E ? 'Follow the money' : 'Parayı takip et',
      say: E ? 'Northwest Orient wired the money to Seattle First National Bank, the bank handed ten thousand bills to Dan Cooper, and $5,800 turned up on the Columbia River bank.' : 'Northwest Orient parayı Seattle First National Bank\'a aktardı, banka banknotları Dan Cooper\'a verdi ve 5.800 dolar Columbia Nehri kıyısında çıktı.',
    },
    {
      nodes: ['Iceberg warning ignored', 'Collision at 11:40', 'Watertight compartments flood', 'Lifeboats launched half empty', 'Distress rockets fired', 'Ship breaks in two', 'Carpathia arrives'].map((l, i) => ({ id: `e${i}`, label: E ? l : ['Buzdağı uyarısı yok sayıldı', 'Saat 23.40\'ta çarpışma', 'Su geçirmez bölmeler doldu', 'Filikalar yarı boş indirildi', 'İmdat fişekleri atıldı', 'Gemi ikiye bölündü', 'Carpathia geldi'][i] })),
      edges: Array.from({ length: 6 }, (_, i) => [`e${i}`, `e${i + 1}`]),
      title: E ? 'Two hours and forty minutes' : 'İki saat kırk dakika',
      say: E ? 'The iceberg warning was ignored, then the collision, the compartments flood, lifeboats launched half empty, rockets fired, the ship breaks in two, and Carpathia arrives.' : 'Uyarı yok sayıldı, çarpışma geldi, bölmeler doldu, filikalar yarı boş indi, fişekler atıldı, gemi bölündü ve Carpathia geldi.',
    },
    {
      nodes: [{ id: 'a', label: E ? 'Offshore shell company in the Cayman Islands' : 'Cayman Adaları\'ndaki paravan şirket' }, { id: 'b', label: E ? 'Swiss account' : 'İsviçre hesabı' }, { id: 'c', label: E ? 'Real estate in London' : 'Londra\'da gayrimenkul' }, { id: 'd', label: E ? 'Art auction' : 'Sanat müzayedesi' }, { id: 'e', label: E ? 'Clean money' : 'Temiz para' }],
      edges: [['a', 'b', '$40M'], ['a', 'd'], ['b', 'c'], ['c', 'e'], ['d', 'e']],
      title: E ? 'How the money was washed' : 'Para nasıl aklandı',
      say: E ? 'From a shell company in the Cayman Islands to a Swiss account, into London real estate and an art auction, until it came out as clean money.' : 'Cayman Adaları\'ndaki paravan şirketten İsviçre hesabına, Londra\'da gayrimenkule ve sanat müzayedesine, sonunda temiz para olarak.',
    },
  ];
  const flow = flows[v(4, 3)];
  const stats = [
    { value: '$5,800', label: E ? 'found on the Columbia River bank' : 'Columbia Nehri kıyısında bulundu', sub: E ? 'Out of $200,000 in twenty-dollar bills — the rest was never seen again.' : '200.000 dolarlık fidyenin geri kalanı bir daha hiç görülmedi.', trend: 'down', say: E ? 'In 1980 a boy found $5,800 on the riverbank.' : '1980\'de bir çocuk nehir kıyısında 5.800 dolar buldu.' },
    { value: '38%', label: E ? 'rise in hijackings in a single year' : 'tek yılda uçak kaçırma artışı', trend: 'up', say: E ? 'Hijackings rose 38% in a single year.' : 'Uçak kaçırmaları tek yılda yüzde 38 arttı.' },
    { value: E ? '1 in 3' : '3\'te 1', label: E ? 'Americans had never flown before 1970' : 'Amerikalı 1970\'ten önce hiç uçmamıştı', sub: E ? 'Flying was still a luxury.' : 'Uçmak hâlâ bir lükstü.', say: E ? 'One in three Americans had never flown.' : 'Her 3 Amerikalıdan 1\'i hiç uçmamıştı.' },
    { value: '₺2.400.000', label: E ? 'vanished overnight' : 'bir gecede buharlaştı', trend: 'down', say: E ? '2,400,000 lira vanished overnight.' : '2.400.000 lira bir gecede buharlaştı.' },
  ];
  const stat = stats[v(5, 4)];
  const mk = (type, o, mood = 'curious') => {
    const { say, ...rest } = o;
    return { type, mood, ...base, ...rest, ...said(say, 0.3, 0.3) };
  };
  // One scene per style on an art-director backdrop with a text style (the look system's fields).
  const lookFx = [
    { backdrop: { kind: 'paper', color: '#efe6d3' }, textStyle: 'box' },
    { backdrop: { kind: 'blueprint', color: '#123a5e', color2: '#d8e8f5' }, textStyle: 'lower-third' },
    { backdrop: { kind: 'gradient', color: '#141821', color2: '#3a86ff' }, textStyle: 'serif' },
  ][gi % 3];
  const lookTarget = ['bars', 'flow', 'donut', 'stat', 'scale', 'icons', 'bars'][gi];
  const out = [mk('bars', bars, 'tension'), mk('donut', donut, 'sad'), mk('icons', icon, 'dread'), mk('scale', scale, 'reveal'), mk('flow', flow, 'tension'), mk('stat', stat, 'reveal')];
  if (gi % 2 === 1) out.push(mk('icons', icon2, 'sad'));
  const t = out.find((s) => s.type === lookTarget);
  if (t) out.push({ ...t, ...lookFx });
  return out;
}

/** Frames most likely to break: landings, final values, end states. */
function riskyFrames(sc, p) {
  const end = p.from + p.frames - 4;
  const at = (s) => p.from + Math.min(p.frames - 2, Math.round(s * FPS));
  const list = [];
  switch (sc.type) {
    case 'montage': list.push(at(1.2), end); break;
    case 'title': list.push(sc.chapterCard ? at(0.5) : at(1.2), sc.chapterCard ? at(2.0) : end); break;
    case 'slam': {
      const cl = EN ? 'en-US' : 'tr-TR';
      const w = sc.wordTimes.find((x) => x.word.toLocaleLowerCase(cl).startsWith(sc.word.toLocaleLowerCase(cl).slice(0, 5)));
      const land = w ? at(w.t) : at(1);
      list.push(land + 2, land + 6, end);
      break;
    }
    case 'counter': case 'chart': list.push(at(sc.dur * 0.4), end); break;
    case 'headline': list.push(at(0.7), at(2.1), end); break;
    case 'map': list.push(at(1.0), at(2.6), end); break;
    // Devices: mid-build, the landing, the end state.
    case 'board': list.push(p.from + Math.round(p.frames * 0.3), p.from + Math.round(p.frames * 0.55), end); break;
    case 'document': list.push(p.from + Math.round(p.frames * 0.3) + 9, p.from + Math.round(p.frames * 0.62) + 14, end); break;
    case 'timeline': list.push(at(0.9), p.from + Math.round(p.frames * 0.68) + 8, end); break;
    case 'split': list.push(sc.mode === 'before-after' ? at(0.6) : at(0.25), sc.mode === 'before-after' ? p.from + Math.round(p.frames * 0.3) + 30 : at(1.3), end); break;
    case 'quote': list.push(at(1.2), p.from + Math.round(p.frames * 0.6), end); break;
    // Infographics: mid-reveal, just after the highlight / landing, the end state (src/infographics/timing.js).
    case 'bars': case 'donut': case 'icons': case 'scale': case 'flow': case 'stat': {
      const k = INFO?.infoPlan(sc, p.frames, FPS);
      const L = (fr) => p.from + Math.max(0, Math.min(p.frames - 2, Math.round(fr)));
      if (!k) list.push(p.from + Math.round(p.frames / 2), end);
      else if (k.kind === 'bars') list.push(L(k.grow + k.growDur * 0.35), L((k.hl ?? k.grow + k.growDur) + 12), end);
      else if (k.kind === 'donut') list.push(L((k.starts[0] + k.drawn) / 2), L((k.hl ?? k.drawn) + 14), end);
      else if (k.kind === 'icons') list.push(L((k.fill + k.done) / 2), end);
      else if (k.kind === 'scale') list.push(L(k.zoom - 2), L(k.zoom + k.zoomDur * 0.5), end);
      else if (k.kind === 'flow') list.push(L(k.at[Math.floor(k.at.length / 2)] + 4), end);
      else list.push(L((k.start + k.land) / 2), end);
      break;
    }
    case 'photo':
      if (sc.annotate) {
        const a = Math.round((sc.annotate.at ?? (p.frames / FPS) * 0.4) * FPS);
        list.push(p.from + a - 6, p.from + a + 26, end);
        break;
      }
      list.push(at(0.8), p.from + Math.round(p.frames / 2), end);
      break;
    default: list.push(at(0.8), p.from + Math.round(p.frames / 2), end);
  }
  return quick ? [list.at(-1)] : [...new Set(list)];
}

/* ------------------------------------------------------------- render */

/**
 * With --src the composition is bundled from that folder into a private
 * bundle (cached on the folder's content), so work in progress never touches
 * build/bundle, which a running render may be using.
 */
async function devBundle(dir) {
  const h = createHash('sha1');
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p)).update(readFileSync(p));
    }
  };
  walk(dir);
  const out = join(os.tmpdir(), `docu-stress-bundle-${h.digest('hex').slice(0, 12)}`);
  if (existsSync(join(out, 'index.html'))) return out;
  console.log('› geliştirme paketi derleniyor:', dir);
  const { bundle } = await import('@remotion/bundler');
  const emptyPublic = join(os.tmpdir(), 'docu-stress-empty-public');
  mkdirSync(emptyPublic, { recursive: true });
  await bundle({ entryPoint: join(dir, 'index.ts'), outDir: out, publicDir: emptyPublic });
  return out;
}
const bundle = srcArg ? await devBundle(resolve(srcArg)) : await ensureBundle((m) => console.log('›', m));
for (const f of readdirSync(bundle)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundle, f), join(site, f), { recursive: true });
for (const d of ['fx', 'sfx', 'fonts']) if (existsSync(join(ENGINE_DIR, 'public', d))) cpSync(join(ENGINE_DIR, 'public', d), join(site, 'public', d), { recursive: true });

const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } });
try {
  for (const genre of genreArg.split(',')) {
    const s = script(genre);
    const placed = placeTimeline(s.scenes, FPS, []);
    const props = { script: s };
    const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser });
    const shots = [];
    for (const [i, sc] of s.scenes.entries()) {
      // `annotate` in --only selects photo scenes that carry a freeze & mark.
      if (only && !only.includes(sc.type) && !(sc.annotate && only.includes('annotate'))) continue;
      for (const f of riskyFrames(sc, placed[i])) {
        const name = `${genre}-${String(i).padStart(2, '0')}-${sc.chapterCard ? 'chapter' : sc.annotate ? 'annotate' : sc.backdrop ? `${sc.type}-look` : sc.type}-${String(f).padStart(5, '0')}.png`;
        await renderStill({ composition, serveUrl: site, inputProps: props, frame: f, output: join(outDir, name), imageFormat: 'png', puppeteerInstance: browser });
        shots.push(join(outDir, name));
      }
    }
    // Kontak sayfası: 4 sütun, 480x270 küçük kareler, üzerinde dosya adı yok — sıra dosya adlarıyla aynı.
    const cols = 4;
    const rows = Math.ceil(shots.length / cols);
    const list = join(outDir, `.list-${genre}.txt`);
    writeFileSync(list, shots.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    spawnSync(ff, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:270,tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, `sheet-${genre}.jpg`)]);
    rmSync(list, { force: true });
    console.log(`stil hazır: ${genre} (${shots.length} kare)`);
  }
} finally {
  await browser.close({ silent: true });
}
