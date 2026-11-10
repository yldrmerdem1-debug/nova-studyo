// KONU KİMLİĞİ (Sinematik Belgesel) — "topic bible"
//
// Sanat yönetmeni "bu video nasıl görünmeli" der; konu kimliği "bu KONU hangi görsel dili
// konuşur" der. LEMMiNO'nun Kryptos videosu baştan sona şifre tablolarıyla, MagnatesMedia'nın
// Rockefeller'ı petrol ve ateşle konuşur. Her video kendi kalıbını alır, bütün video tek ruhla
// bağlanır:
//   - motif (motorun src/topic motif sistemlerinden biri): cipher | telegraph | ticker |
//     telemetry | electric | case-file | expedition | siege — bölüm kartı, geçiş (wipe), yazı
//     sahnelerinin altındaki doku ve imza cihazı (explainer / ui-card) bu dilde çizilir;
//     motifin oynattığı jetonlar (CQD, SOS, "U.S. STEEL 205", "22.5 HOURS") ANLATIMDAN alınır.
//   - sunum: arşiv fotoğrafları videonun her yerinde aynı biçimde (lightbox | print |
//     film-frame | framed), haritalar tek stilde (satellite | paper | grid).
//   - tipografi (başlık/gövde yazı yüzü + yazı stili ailesi), palet vurguları, seçici renk
//     (selective: siyah-beyaz + konunun TEK rengi), açılış türü tercihi.
//   - explainers: anlatılan mekanizmanın adım adım çizimi (yalnızca anlatımdaki olgular).
//   - uiCards: gerçek arayüz kartları (sıralama, form, teletype, defter) — satırlar anlatımdan.
//   - sahne başına metafor ikonları: yalnızca somut satırlarda (nesne, kurum, para, yer).
//
// Opus 5.5 ile tek çağrı (senaryo özetine göre iş klasöründe önbellek). Anahtar/kredi yoksa
// BELİRLEYİCİ yedek: tür + anahtar kelimelerle motif, anlatımdan jetonlar, kalıp tarifleriyle
// açıklayıcılar. İncil senaryoya iki yerde uygulanır:
//   1) betik düzeyi `script.topic` (arşivden ÖNCE, sanat yönetmeni görsün; sahneler değişmez →
//      arşiv anahtarı/docKey aynı kalır),
//   2) sahne alanları (icons/present/wipe, explainer/ui-card dönüşümleri) ARŞİVDEN SONRA
//      (applyTopicPlan) — resim seçimi ve maliyet etkilenmez.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { callJSON } from "../llm.js";
import { readJson, writeJson, ROOT } from "../util.js";
import { stripTags, estSceneSeconds } from "./docu-script.js";
import { LONG_CARD_SEC } from "./docu-edit-director.js";
import { GRADES, DESAT_GRADES, baseGradeOk } from "./docu-art-director.js";

export const TOPIC_VERSION = "topic-bible-1";
export const TOPIC_MODEL = "claude-opus-5-5";

/* ================================================================ sözleşme (motorla ORTAK) */

export const MOTIF_IDS = ["cipher", "telegraph", "ticker", "telemetry", "electric", "case-file", "expedition", "siege"];
export const PHOTO_PRESENTS = ["lightbox", "print", "film-frame", "framed", "clean"];
export const MAP_STYLES = ["satellite", "paper", "grid"];
export const EXPLAINER_KINDS = ["sequence", "cycle", "compare", "mechanism"];
export const UI_KINDS = ["ranking", "terminal", "form", "ledger", "phone"];
export const OPENING_KINDS = ["headlines", "timestamps", "cold-open", "evidence", "map-dive", "quote"];
export const FONT_KEYS = ["anton", "inter", "oswald", "plexMono", "cinzel", "crimson", "bebas", "courier", "exo", "playfair", "lora", "oldstandard", "fraktur", "dmserif", "spacegrotesk", "archivo", "jetbrains"];
export const TEXT_STYLES = ["box", "underline", "marker", "outline", "stack", "serif", "typewriter", "cutout", "glitch", "lower-third", "neon", "stamp"];
/** Yazı dili: 'motif' = satırlar konunun kendi dilinde (src/topic/caption.tsx); jenerik stil yalnızca son çare. */
export const CAPTION_STYLES = ["motif", ...TEXT_STYLES];

/** Motorun paketlediği ikonlar (docu-engine/src/topic/icons-data.ts — test kimlikleri karşılaştırır). */
export const ICON_IDS = ["ship", "sailboat", "anchor", "lifebuoy", "iceberg", "snowflake", "antenna", "radio", "broadcast", "binoculars", "rocket", "flare", "sparkles",
  "building-bank", "cash", "coin", "currency-dollar", "pig-money", "chart-line", "trending-down", "trending-up", "building-factory", "car", "building-skyscraper", "news", "gavel", "lock",
  "plane", "parachute", "bomb", "briefcase", "ticket", "smoking", "fingerprint", "dna", "microscope", "map", "search", "shovel", "flame", "tent", "mountain", "compass", "camera", "temperature",
  "radioactive", "skull", "tree", "shoe", "satellite", "planet", "antenna-bars-5", "radar", "disc", "music", "heartbeat", "brain", "sun", "cpu", "battery", "bulb", "world", "telescope", "bolt", "engine",
  "building-broadcast-tower", "feather", "trophy", "certificate", "bed", "sword", "shield", "crown", "building-castle", "flag", "moon", "bell", "hourglass", "clock", "calendar", "users", "ladder",
  "wave-sine", "ripple", "wifi", "mail", "file-text", "folder", "keyboard", "id-badge", "eye", "receipt", "scale", "gauge", "arrow-big-down-lines", "coins", "report-money", "home", "building-arch",
  "building-church", "ghost", "axe", "route", "snowman", "wind", "cloud-storm", "circuit-resistor", "circuit-battery", "circuit-motor", "magnet", "atom", "headphones", "microphone", "phone",
  "stars", "meteor", "building-fortress", "key", "door", "stairs", "campfire", "bone", "droplet", "tower", "building-lighthouse", "scissors", "hammer", "pick", "wheel", "train", "truck", "alarm",
  "alert-triangle", "cross", "grave", "candle", "trees", "swords", "horse", "heart", "heart-broken", "book", "notebook", "pencil", "writing", "signature", "file-certificate", "code", "binary",
  "globe", "map-pin", "route-2", "chart-bar", "chart-candle", "percentage", "cash-banknote", "wallet", "moneybag", "businessplan", "spy", "mask", "zoom-question", "question-mark", "photo",
  "movie", "speakerphone", "ear", "thermometer", "plug", "power", "typography", "letter-case", "world-longitude", "cut", "man", "woman", "school", "tie", "shirt", "shovel-pitchforks"];

/**
 * Motif kartları: anahtar kelimeler (ağırlıklı), tür önceliği ve konunun bütün videoya
 * yayılan kararları. Renk/yüz seçimleri motorun motif paletiyle uyumlu.
 *
 * RENK (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026 — son 7 videoda ortalama parlaklık 52-75,
 * doygunluk 2,5-7,5; 8 motifin 6'sı 'selective' tabanla geliyordu ve sanat yönetmeni onu her bölüme bağlıyordu):
 * grade videonun RENKLİ tabanıdır (color/warm/cool/teal-orange/kodachrome); soldurucu ton (selective = siyah-beyaz
 * + konunun TEK rengi, mono…) yalnızca accentGrade — sanat yönetmeninin TEK vurgu bölümünde.
 */
export const MOTIF_SPECS = {
  cipher: {
    keywords: { cipher: 4, ciphers: 4, encrypted: 4, decrypt: 4, decrypted: 4, cryptogram: 4, kryptos: 5, enigma: 4, codebreaker: 4, codebreakers: 4, ciphertext: 5, plaintext: 5, cryptographer: 4, alphabet: 2, code: 1.2, codes: 1.2, letters: 0.5, zodiac: 2 },
    genres: {}, photo: "lightbox", map: "satellite", headline: "spacegrotesk", body: "jetbrains",
    textStyles: ["typewriter", "underline", "outline", "lower-third", "box"], grade: "color", accentGrade: "mono", keepHue: 40,
    accent: "#f2b33d", accent2: "#4fd1c5", backdrops: ["era", "texture", "solid", "related"], eraTexture: "newsprint", opening: "quote", wipeEvery: 1,
    icons: ["key", "lock", "letter-case", "typography", "binary", "code", "search", "eye", "map-pin", "file-text", "building-bank", "world", "spy", "zoom-question"],
    variants: [],
  },
  telegraph: {
    keywords: { wireless: 3, telegram: 2, telegrams: 2, telegraph: 3, morse: 3, radio: 1.6, "radio operator": 2, operator: 1, operators: 1, signal: 1, cqd: 5, sos: 5, marconi: 3, "distress call": 3, distress: 1.5, headphones: 2, radioed: 2, transmitter: 1, warnings: 0.8 },
    genres: { documentary: 1.5 }, photo: "lightbox", map: "paper", headline: "oldstandard",
    textStyles: ["typewriter", "serif", "underline", "lower-third", "stamp"], grade: "warm", accentGrade: "selective", keepHue: 32,
    accent: "#ffb547", accent2: "#e2563b", backdrops: ["era", "related", "paper"], eraTexture: "newsprint", opening: "timestamps",
    icons: ["ship", "iceberg", "antenna", "radio", "broadcast", "binoculars", "lifebuoy", "flare", "bell", "clock", "users", "mail", "anchor", "snowflake", "temperature", "compass", "music", "heart-broken", "news", "gavel"],
    variants: ["cobalt-brief", "cinema-teal", "kraft-archive"],
  },
  ticker: {
    keywords: { stock: 2, stocks: 2, market: 1.5, dow: 3, shares: 2, broker: 2, brokers: 2, margin: 3, "wall street": 3, ticker: 3, exchange: 1.5, investors: 1.5, prices: 1, crash: 1.5, banks: 1, bank: 0.8, bankers: 1.5, depression: 1.5 },
    genres: { finance: 3 }, photo: "print", map: "grid", headline: "oswald",
    textStyles: ["stamp", "stack", "serif", "underline", "lower-third", "box"], grade: "color", accentGrade: "selective", keepHue: 0,
    accent: "#e8423a", accent2: "#3fbf73", backdrops: ["era", "related", "paper"], eraTexture: "ledger", opening: "headlines",
    icons: ["building-bank", "cash", "coin", "currency-dollar", "pig-money", "chart-line", "trending-down", "trending-up", "building-factory", "car", "building-skyscraper", "news", "gavel", "lock", "users", "report-money", "moneybag", "scale", "home", "receipt"],
    variants: ["salmon-paper", "wall-street-gold", "clean-white-editorial", "money-red"],
  },
  telemetry: {
    keywords: { spacecraft: 3, voyager: 3, nasa: 3, probe: 2, probes: 2, orbit: 1.5, planet: 1.5, planets: 1.5, jupiter: 2, saturn: 2, uranus: 2, neptune: 2, launch: 1, antenna: 1.5, antennas: 1.5, "light-day": 3, interstellar: 3, telemetry: 4, signal: 0.8, command: 1, kilometers: 0.5 },
    genres: { science: 3 }, photo: "framed", map: "grid", headline: "spacegrotesk",
    textStyles: ["lower-third", "outline", "underline", "serif", "box"], grade: "cool", accentGrade: "mono", keepHue: 45,
    accent: "#e8b64c", accent2: "#63d0ff", backdrops: ["related", "gradient", "blueprint"], eraTexture: "film", opening: "cold-open",
    icons: ["satellite", "planet", "rocket", "antenna", "radar", "disc", "music", "heartbeat", "brain", "sun", "cpu", "battery", "bulb", "world", "telescope", "stars", "meteor", "wave-sine", "clock", "calendar", "users", "map-pin", "binary"],
    variants: ["retro-nasa", "deep-space-cyan", "blueprint-lab"],
  },
  electric: {
    keywords: { electricity: 3, electric: 2, current: 2, "alternating current": 4, "direct current": 4, coil: 3, motor: 2, dynamos: 2, patent: 2, patents: 2, lightning: 2, sparks: 1.5, spark: 1.5, inventor: 2, tesla: 3, edison: 2, westinghouse: 2, wireless: 1, power: 1, lamps: 1 },
    genres: { inspire: 1.5 }, photo: "lightbox", map: "paper", headline: "playfair",
    textStyles: ["serif", "underline", "outline", "lower-third", "stamp"], grade: "teal-orange", accentGrade: "selective", keepHue: 215,
    accent: "#8fb7ff", accent2: "#ffcf6b", backdrops: ["related", "era", "gradient"], eraTexture: "film", opening: "quote",
    icons: ["bolt", "bulb", "engine", "circuit-motor", "magnet", "building-broadcast-tower", "antenna", "cash", "coin", "certificate", "trophy", "flame", "wave-sine", "plug", "power", "building-factory", "feather", "skull", "ship", "world", "bed", "droplet"],
    variants: ["blue-hour", "monochrome-portrait", "golden-hour"],
  },
  "case-file": {
    keywords: { fbi: 3, hijack: 3, hijacked: 3, hijacker: 3, hijacking: 3, ransom: 3, suspect: 2, suspects: 2, evidence: 2, investigation: 2, fingerprints: 2, "serial numbers": 3, serial: 1.5, agent: 1.5, case: 1, dna: 2, parachute: 1.5, parachutes: 1.5 },
    genres: { crime: 3 }, photo: "print", map: "satellite", headline: "oswald",
    textStyles: ["typewriter", "stamp", "marker", "lower-third", "underline"], grade: "cool", accentGrade: "selective", keepHue: 50,
    accent: "#f2c318", accent2: "#c8102e", backdrops: ["era", "related", "paper"], eraTexture: "newsprint", opening: "evidence",
    icons: ["plane", "parachute", "bomb", "briefcase", "cash", "ticket", "smoking", "fingerprint", "dna", "microscope", "map", "search", "shovel", "id-badge", "file-text", "folder", "lock", "eye", "spy", "zoom-question", "stairs", "clock", "news"],
    variants: ["evidence-yellow", "cold-blue-case", "newsprint-paper"],
  },
  expedition: {
    keywords: { expedition: 3, tent: 3, snow: 2, ski: 2, skis: 2, skiers: 2, mountain: 2, pass: 1, hikers: 3, hiking: 2, route: 1, avalanche: 3, ravine: 2, cedar: 2, frost: 2, footprints: 2, searchers: 2, slope: 2, summit: 2, slab: 2 },
    genres: { horror: 1.5 }, photo: "film-frame", map: "satellite", headline: "bebas",
    textStyles: ["typewriter", "serif", "outline", "lower-third", "underline"], grade: "cool", accentGrade: "selective", keepHue: 25,
    accent: "#ff8a3d", accent2: "#9fd3ef", backdrops: ["related", "era", "gradient"], eraTexture: "film", opening: "evidence",
    icons: ["tent", "mountain", "snowflake", "temperature", "compass", "camera", "skull", "tree", "shoe", "campfire", "flame", "map", "route", "radioactive", "wind", "cloud-storm", "file-text", "search", "users", "moon", "notebook", "alert-triangle", "meteor"],
    variants: ["cyanotype-cold", "daguerreotype", "bone-white-ritual"],
  },
  siege: {
    keywords: { siege: 3, walls: 2, sultan: 3, emperor: 2, cannon: 3, cannons: 3, army: 1.5, fleet: 1.5, chain: 1.5, galleys: 2, janissaries: 3, conquest: 2, conquered: 2, fortress: 2, besieged: 3, defenders: 2, constantinople: 3, byzantium: 3, ottoman: 2 },
    genres: { epic: 3 }, photo: "print", map: "paper", headline: "cinzel",
    textStyles: ["serif", "stamp", "outline", "lower-third", "stack"], grade: "warm", accentGrade: "selective", keepHue: 355,
    accent: "#b8322a", accent2: "#d4a64a", backdrops: ["related", "paper", "texture"], eraTexture: "film", opening: "map-dive",
    icons: ["sword", "swords", "shield", "crown", "building-castle", "building-fortress", "flag", "moon", "flame", "bomb", "ship", "sailboat", "anchor", "horse", "building-church", "users", "hourglass", "bell", "book", "axe", "ladder", "cross"],
    variants: ["war-map-sepia", "bronze-gold", "blood-and-iron"],
  },
};

/** Somut anlatım sözcüğü → ikon (yalnızca videonun ikon setindekiler kullanılır). */
const ICON_WORDS = [
  [/\b(ship|ships|liner|steamer|vessel|titanic|carpathia|californian)\b/i, "ship"],
  [/\b(galley|galleys|fleet|sail|sails|sailing)\b/i, "sailboat"],
  [/\b(lifeboat|lifeboats|collapsibles)\b/i, "lifebuoy"],
  [/\b(iceberg|icebergs|berg)\b/i, "iceberg"],
  [/\b(ice|freezing|frozen|degrees|minus)\b/i, "temperature"],
  [/\b(radio|wireless|transmitter|antenna|antennas|dish|dishes)\b/i, "antenna"],
  [/\b(telegram|telegrams|message|messages|letter|letters|mail|note)\b/i, "mail"],
  [/\b(signal|signals|distress call|calls|calling)\b/i, "broadcast"],
  [/\b(binoculars)\b/i, "binoculars"],
  [/\b(rockets?|flares?)\b/i, "flare"],
  [/\b(bell|bells)\b/i, "bell"],
  [/\b(music|band|song|musicians|melody|record)\b/i, "music"],
  [/\b(lights|lamps|lamp|bulb|bulbs)\b/i, "bulb"],
  [/\b(fire|burn|burned|flames|burning)\b/i, "flame"],
  [/\b(bomb|dynamite|explosive|exploded|explodes)\b/i, "bomb"],
  [/\b(money|dollars|cash|ransom|bills|fortune)\b/i, "cash"],
  [/\b(cents|coins?)\b/i, "coin"],
  [/\b(banks?|bankers?|vault)\b/i, "building-bank"],
  [/\b(stocks?|market|shares|prices|dow)\b/i, "chart-line"],
  [/\b(crash|crashes|plunges?|drops?|collapsed?|collapses)\b/i, "trending-down"],
  [/\b(factory|factories|plants?|lines)\b/i, "building-factory"],
  [/\b(cars?|truck)\b/i, "car"],
  [/\b(skyscrapers?)\b/i, "building-skyscraper"],
  [/\b(newspapers?|papers|reporters?|press|headline)\b/i, "news"],
  [/\b(senate|prosecutor|court|ruling|verdict|inquiry|trial)\b/i, "gavel"],
  [/\b(handcuffs|prison|arrested|convict|sing sing)\b/i, "lock"],
  [/\b(plane|jet|aircraft|airline|airport|fighter jets?)\b/i, "plane"],
  [/\b(parachutes?|chutes?)\b/i, "parachute"],
  [/\b(briefcase|knapsack|bag)\b/i, "briefcase"],
  [/\b(ticket)\b/i, "ticket"],
  [/\b(cigarettes?|smokes|smoking)\b/i, "smoking"],
  [/\b(fingerprints?)\b/i, "fingerprint"],
  [/\b(dna)\b/i, "dna"],
  [/\b(microscope|particles|titanium)\b/i, "microscope"],
  [/\b(search|searched|searchers|manhunt|comb)\b/i, "search"],
  [/\b(sand|digs?|dug|digging)\b/i, "shovel"],
  [/\b(tent)\b/i, "tent"],
  [/\b(mountain|slope|summit|pass)\b/i, "mountain"],
  [/\b(snow|snowpack)\b/i, "snowflake"],
  [/\b(camera|cameras|photos?|photographing|film)\b/i, "camera"],
  [/\b(radiation|nuclear|radioactive|plutonium)\b/i, "radioactive"],
  [/\b(cedar|forest|branches|trees?)\b/i, "tree"],
  [/\b(footprints|boots|socks|boot|loafers)\b/i, "shoe"],
  [/\b(spacecraft|voyager|probe)\b/i, "satellite"],
  [/\b(planets?|jupiter|saturn|uranus|neptune|titan|io)\b/i, "planet"],
  [/\b(heartbeat|heart)\b/i, "heartbeat"],
  [/\b(brain)\b/i, "brain"],
  [/\b(sun|sunlight|sunbeam)\b/i, "sun"],
  [/\b(chip|computer|memory|software)\b/i, "cpu"],
  [/\b(watts|power|heaters?)\b/i, "battery"],
  [/\b(earth|world|globe)\b/i, "world"],
  [/\b(electricity|current|lightning|spark|sparks)\b/i, "bolt"],
  [/\b(motor|engines?|dynamos?|generator|machine|machines)\b/i, "engine"],
  [/\b(coil|coils|magnetic)\b/i, "magnet"],
  [/\b(tower)\b/i, "building-broadcast-tower"],
  [/\b(pigeons?)\b/i, "feather"],
  [/\b(medal|award|prize|celebration)\b/i, "trophy"],
  [/\b(patents?|patented)\b/i, "certificate"],
  [/\b(hotel|room|bed)\b/i, "bed"],
  [/\b(sword|swords|janissaries)\b/i, "swords"],
  [/\b(defenders|defend|shield)\b/i, "shield"],
  [/\b(emperor|sultan|king|throne|crown|caesar)\b/i, "crown"],
  [/\b(walls?|fortress|towers)\b/i, "building-castle"],
  [/\b(flag|banner)\b/i, "flag"],
  [/\b(moon)\b/i, "moon"],
  [/\b(cannons?|guns?|cannon fire)\b/i, "bomb"],
  [/\b(horse|oxen)\b/i, "horse"],
  [/\b(church|churches|hagia sophia|mosque|dome)\b/i, "building-church"],
  [/\b(prayed|prayer|icon|god)\b/i, "cross"],
  [/\b(books?|scholars|diary|diaries|notes)\b/i, "book"],
  [/\b(compass|bearing)\b/i, "compass"],
  [/\b(wind|winds)\b/i, "wind"],
  [/\b(fireball|spheres|lights in the sky)\b/i, "meteor"],
  [/\b(stairs|stairway)\b/i, "stairs"],
  [/\b(fbi|agent|agents)\b/i, "id-badge"],
  [/\b(suspects?)\b/i, "spy"],
  [/\b(passengers|crowd|families|people|soldiers|volunteers)\b/i, "users"],
  [/\b(clock|minutes|hours|midnight)\b/i, "clock"],
  [/\b(map|route|routes)\b/i, "map"],
  [/\b(binary|ones and zeros|data)\b/i, "binary"],
  [/\b(telescope)\b/i, "telescope"],
  [/\b(stars|star)\b/i, "stars"],
  [/\b(home|homes|house)\b/i, "home"],
  [/\b(tariffs?|scale)\b/i, "scale"],
];
/** Kurum adları → isim etiketi (fırça darbesi) + ikon. Yalnızca anlatımda geçen ad. */
const ORG_RE = /\b(FBI|NASA|JPL|Jet Propulsion Laboratory|White Star(?: Line)?|Marconi|Westinghouse|House of Morgan|Bank of United States|Seattle First National Bank|Creditanstalt|Edison Machine Works|Northwest(?: Orient)?|Ural Polytechnic Institute|Cornell)\b/;
const ORG_ICON = { FBI: "id-badge", NASA: "rocket", JPL: "satellite", "Jet Propulsion Laboratory": "satellite", "White Star": "ship", "White Star Line": "ship", Marconi: "antenna", Westinghouse: "bolt", "House of Morgan": "building-bank", "Bank of United States": "building-bank", "Seattle First National Bank": "building-bank", Creditanstalt: "building-bank", "Edison Machine Works": "building-factory", Northwest: "plane", "Northwest Orient": "plane", "Ural Polytechnic Institute": "school", Cornell: "school" };

/* ================================================================ yardımcılar */

const sayOf = (s) => stripTags(s?.say || "");
const isCard = (s) => s?.type === "title" && s.chapterCard;
const fp = (s) => crypto.createHash("sha1").update(sayOf(s)).digest("hex").slice(0, 10);
const HEX = /^#[0-9a-f]{6}$/i;
const isInt = (v) => Number.isInteger(v);
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const words = (t) => String(t || "").toLowerCase().match(/[a-z0-9çğıöşüâî'’-]+/gi) || [];
const STOP = new Set("the a an of in on at to and or for with by from is was were be been his her their its that this as than it he she they them we you our your but so then not no just only even all every one two into out up down over off about after before when while where who what which how why there here would could should will can had has have did do does said says".split(" "));
const titleCase = (t) => String(t || "").replace(/\s+/g, " ").trim();
const TRAIL = new Set(["the", "a", "an", "of", "to", "in", "on", "into", "and", "or", "for", "with", "by", "at", "from", "that", "his", "her", "their", "its", "per", "up"]);
const upperLabel = (t, max = 40) => {
  let s = titleCase(numberWords(t)).replace(/^[,.;:!?…\-–—\s]+|[,.;:!?…\-–—\s]+$/g, "").replace(/\.{2,}|…/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(and|but|so|then|or)\s+/i, "");
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "");
  // A cut never ends on "THE", "OF", "INTO"...
  let ws = s.split(" ");
  while (ws.length > 1 && TRAIL.has(ws[ws.length - 1].toLowerCase().replace(/[^a-z]/g, ""))) ws = ws.slice(0, -1);
  return ws.join(" ").replace(/[,;:]+$/, "").toUpperCase();
};

/** "two hundred thousand dollars" → "$200,000"; "forty-five hours" → "45 hours" (only 20+; small numbers read better as words). */
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
function numberWords(text) {
  return String(text || "").replace(/\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|and)[\s-]+)*(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion))(\s+dollars)?\b/gi, (m, num, dollars) => {
    const parts = num.toLowerCase().split(/[\s-]+/).filter((w) => w !== "and");
    if (parts[0] === "hundred" || parts[0] === "thousand") return m;
    let total = 0;
    let cur = 0;
    for (const p of parts) {
      if (NUMW[p] !== undefined) cur += NUMW[p];
      else if (p === "hundred") cur = (cur || 1) * 100;
      else if (SCALE[p]) { total += (cur || 1) * SCALE[p]; cur = 0; }
    }
    total += cur;
    if (!dollars && total < 20) return m;
    const n = total >= 1e6 && total % 1e5 === 0 ? `${total / 1e6} million` : total.toLocaleString("en-US");
    return dollars ? "$" + n : n;
  });
}

/* ---------------------------------------------------------------- sayılar */

const NUM = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
/** "eleven thirty-nine PM", "Two-oh-five AM", "Eight-thirteen PM", "Twelve forty-five" → "11:39 PM" … (yalnızca anlatımda geçen saatler). */
export function spokenTimes(text) {
  const out = [];
  const re = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]+(oh[\s-]+(?:one|two|three|four|five|six|seven|eight|nine)|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?)(?:\s*(PM|AM|p\.m\.|a\.m\.))?/gi;
  for (const m of String(text || "").matchAll(re)) {
    const h = NUM[m[1].toLowerCase()];
    const parts = m[2].toLowerCase().split(/[\s-]+/);
    const mm = parts[0] === "oh" ? NUM[parts[1]] : parts.reduce((a, p) => a + (NUM[p] ?? 0), 0);
    if (!Number.isFinite(h) || !Number.isFinite(mm) || mm > 59) continue;
    const ap = m[3] ? (/p/i.test(m[3]) ? " PM" : " AM") : "";
    out.push(`${h}:${String(mm).padStart(2, "0")}${ap}`);
  }
  return out;
}
/** "Flight three-oh-five" → "FLIGHT 305". */
export function spokenRefs(text) {
  const out = [];
  const re = /\b(Flight|Room|Case|Lifeboat|Boat|Gate)\s+((?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s-]*){2,5})/gi;
  for (const m of String(text || "").matchAll(re)) {
    const digits = m[2].toLowerCase().split(/[\s-]+/).filter(Boolean).map((w) => NUM[w]).filter((d) => d !== undefined && d < 10).join("");
    if (digits.length >= 2) out.push(`${m[1].toUpperCase()} ${digits}`);
  }
  return out;
}
/** Bir sayaç sahnesinin anlatıldığı biçim: "$200,000", "22.5", "−30". */
function counterValue(s) {
  const v = Number(s?.to);
  if (!Number.isFinite(v)) return null;
  const year = s.year || (/^(1[5-9]\d\d|20\d\d)$/.test(String(v)) && !s.prefix && !s.suffix);
  const dec = isInt(s.decimals) ? s.decimals : String(v).includes(".") ? String(v).split(".")[1].length : 0;
  const n = year ? String(v) : v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${s.prefix || ""}${n.replace(/^-/, "−")}${s.suffix || ""}`;
}
/** Sayaçlardan konu jetonları: "DOW 381.17", "U.S. STEEL 205", "22.5 HOURS" — değer + etiketin özü. */
function counterTokens(scenes, max = 8) {
  const out = [];
  for (const s of scenes) {
    if (s?.type !== "counter") continue;
    const val = counterValue(s);
    if (!val) continue;
    const label = String(s.label || "").split("·")[0].trim();
    // A named instrument reads like the tape ("DOW 381.17", "U.S. STEEL $205"); anything else as a figure with its unit.
    const name = label.match(/(Dow Jones|Dow|U\.S\. Steel|[A-Z]{2,5})/)?.[0];
    const unitWord = /[a-z]/i.test(String(s.suffix || ""));
    const lab = upperLabel(words(label).filter((w) => !STOP.has(w)).slice(0, 2).join(" "), 20);
    const t = name ? `${name.replace("Dow Jones", "DOW").toUpperCase()} ${val}` : unitWord ? val.toUpperCase() : `${val} ${lab.toUpperCase()}`.trim();
    if (t.length <= 24 && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
/** Anlatımdaki BÜYÜK HARF jetonlar (CQD, SOS, FBI, DNA, AC): yalnızca 2-5 harf. */
function capsTokens(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/\b([A-Z]{2,5})\b/g)) {
    const t = m[1];
    if (["I", "PM", "AM", "TV", "OK", "US", "UK"].includes(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/* ================================================================ bağlam */

const script_chapters = (ctx) => ctx.chapters || [];
function topicContext(script) {
  const scenes = (script.scenes || []).filter((s) => !isCard(s));
  const all = [script.title, ...(script.chapters || []).map((c) => (typeof c === "string" ? c : c?.title)), ...scenes.map((s) => `${sayOf(s)} ${s.text || ""} ${s.word || ""} ${s.label || ""}`)].join(" \n ");
  const ys = [...String(script.era || "").matchAll(/\b(1[0-9]\d\d|20\d\d)\b/g)].map((m) => +m[1]);
  return { scenes, all, chapters: (script.chapters || []).map((c) => (typeof c === "string" ? c : c?.title || "")), lower: all.toLowerCase(), genre: script.genre || "documentary", eraStart: ys.length ? Math.min(...ys) : null, seed: String(script.seedKey || script.id || script.title || "docu") };
}

/** Motif puanları: anahtar kelime sıklığı (log ölçek) + tür önceliği. */
export function motifScores(script) {
  const ctx = topicContext(script);
  const out = {};
  for (const [id, spec] of Object.entries(MOTIF_SPECS)) {
    let sc = 0;
    for (const [kw, w] of Object.entries(spec.keywords)) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\b`, "gi");
      const n = (ctx.all.match(re) || []).length;
      if (n) sc += w * (1 + Math.log2(n));
    }
    sc += (spec.genres[ctx.genre] || 0) * 4;
    out[id] = +sc.toFixed(2);
  }
  return out;
}
export function pickMotif(script) {
  const sc = motifScores(script);
  return Object.entries(sc).sort((a, b) => b[1] - a[1] || MOTIF_IDS.indexOf(a[0]) - MOTIF_IDS.indexOf(b[0]))[0][0];
}

/* ================================================================ yedek: jetonlar */

function motifTokens(motif, ctx) {
  const { scenes, all } = ctx;
  const caps = capsTokens(scenes.map(sayOf).join(" "));
  const times = spokenTimes(all);
  const refs = spokenRefs(all);
  const counters = counterTokens(scenes);
  const tokens = [];
  const add = (...t) => { for (const x of t) if (x && !tokens.includes(x) && tokens.length < 8) tokens.push(x); };
  const params = {};
  let message;
  switch (motif) {
    case "telegraph": {
      add(...caps.filter((t) => t.length === 3));
      // Anlatımdaki bir telsiz mesajı: telsiz/kulaklık/mesaj geçen sahnede iki noktadan sonraki kısa söz.
      for (const s of scenes) {
        const t = sayOf(s);
        if (!/\b(headphones|radioed|message|telegram|signal|wireless|radio)\b/i.test(t)) continue;
        const m = t.match(/:\s*([^:]{8,60})$/);
        if (m && !/\b(he|she|they|his|her)\b/i.test(m[1].split(/\s+/)[0])) {
          const msg = m[1].replace(/\.{3}/g, ".").trim();
          if (!message || /\bheadphones\b/i.test(t)) message = msg;
          if (/\bheadphones\b/i.test(t)) break;
        }
      }
      if (times.length) params.time = times[0];
      add(...times.slice(0, 2));
      break;
    }
    case "ticker": add(...counters); break;
    case "telemetry": add(...counters); break;
    case "electric": add(...caps.filter((t) => ["AC", "DC"].includes(t)), ...counters); break;
    case "case-file": {
      if (refs.length) params.ref = refs[0];
      const date = scenes.find((s) => s.type === "counter" && counterValue(s) && /^(19|20)\d\d$/.test(String(s.to)));
      if (date) params.date = `${String(date.label || "").toUpperCase()} ${date.to}`.trim();
      add(...refs, ...counters.filter((t) => /[$\d]/.test(t)).slice(0, 5));
      if (times.length) params.time = times[0];
      break;
    }
    case "expedition": add(...counters); break;
    case "siege": add(...counters); break;
    case "cipher": add(...caps, ...counters.slice(0, 3)); break;
  }
  return { tokens, params, message };
}

/* ================================================================ yedek: açıklayıcılar */

const ELIGIBLE_CONVERT = new Set(["words", "photo"]);
/** Bir sahne açıklayıcıya çevrilebilir mi (isim kartı, işaret, cihaz, ilk 2 sahne hariç). */
const convertible = (s, i) => !!s && i >= 2 && ELIGIBLE_CONVERT.has(s.type) && !s.name && !s.annotate && !isCard(s) && !(s.type === "photo" && s.images?.length);
/** Sahneden kısa bir adım etiketi: yazı sahnesinin metni, iki noktadan sonrası ya da ilk yan cümle. */
const OPENER = /^(remember|so|and|but|then|all night|hours later|minutes later|days later|that night|meanwhile|finally|first|next|now|in march|in july|near dawn)\b[,.…:]*\s*/i;
function stepLabel(s, max = 34, cause = null) {
  const say = sayOf(s);
  const colon = say.match(/:\s*([^:]{3,60})$/);
  if (colon && colon[1].split(/\s+/).length <= 7) return upperLabel(colon[1], max);
  // Clauses; the one carrying the mechanism's verb wins, else the one with most content words.
  let clauses = say.split(/(?<=[.!?…])\s+|,\s+|\.\.\.\s*|;\s*/).map((c) => c.trim()).filter(Boolean);
  clauses = clauses.map((c) => { let x = c; for (let k = 0; k < 3; k++) x = x.replace(OPENER, ""); return x; }).filter((c) => c.split(/\s+/).length >= 2);
  const content = (c) => words(c).filter((w) => !STOP.has(w)).length;
  const pick = (cause && clauses.find((c) => cause.test(c))) || [...clauses].sort((a, b) => content(b) - content(a))[0];
  if (pick && pick.split(/\s+/).length <= 7) return upperLabel(pick, max);
  if (s.type === "words" && s.text && String(s.text).split(/\s+/).length <= 7) return upperLabel(s.text, max);
  if (pick) return upperLabel(pick, max);
  return upperLabel(words(say).filter((w) => !STOP.has(w)).slice(0, 4).join(" "), max);
}
/** A count word in the script ("three men", "three decisions") naming n things: the explainer's title. */
function countTitle(ctx, n) {
  const w = ["", "", "two", "three", "four", "five"][n];
  if (!w) return undefined;
  const m = ctx.all.match(new RegExp(`\\b${w} (men|decisions|choices|warnings|mistakes|clues|waves|steps|questions|signals|reasons|names)\\b`, "i"));
  return m ? m[0].toUpperCase() : undefined;
}
const firstContent = (label) => words(label).find((w) => !STOP.has(w) && w.length >= 3) || undefined;

/**
 * Kalıp tarifleri (motif + anlatım kalıbı). Her tarif anlatımdaki SÖZCÜKLERDEN adım üretir;
 * eşleşmezse null. Sıra = öncelik.
 */
function recipeExplainers(motif, ctx) {
  const S = ctx.scenes;
  const out = [];
  const say = (i) => sayOf(S[i]);
  const find = (re, from = 0, to = S.length) => { for (let i = from; i < Math.min(to, S.length); i++) if (re.test(say(i))) return i; return -1; };

  // A) "First the old X, CQD... then a brand-new one: SOS" — sıralı iki jeton (+ ardından gelen telsiz mesajı).
  for (let i = 0; i < S.length; i++) {
    const t = say(i);
    const caps = capsTokens(t).filter((c) => c.length >= 3);
    if (caps.length >= 2 && /\b(first|old)\b/i.test(t) && /\bthen\b/i.test(t)) {
      const det = (tok) => {
        const before = t.slice(0, t.indexOf(tok)).split(/[,.]|\.\.\./).filter((x) => x.trim()).pop() || "";
        return before.replace(/^\s*(first|then)\s+/i, "").replace(/[:\s]+$/, "").trim().toLowerCase() || undefined;
      };
      const steps = caps.slice(0, 2).map((c) => ({ label: c, detail: det(c), at: c, scene: i }));
      const prevI = find(/\bdistress\b/i, Math.max(0, i - 2), i + 1);
      const mi = find(/:\s*[A-Z][^:]{6,60}$/, i + 1, i + 4);
      if (mi > 0 && /\b(headphones|message|radioed|signal)\b/i.test(say(mi)) && convertible(S[mi], mi)) {
        const msg = say(mi).match(/:\s*([^:]+)$/)[1].replace(/\.\.\./g, ".").trim();
        const parts = msg.split(/(?<=\.)\s+/).filter(Boolean);
        steps.push({ label: upperLabel(parts[0], 26), detail: parts[1]?.replace(/\.$/, "").toLowerCase(), at: firstContent(parts[0]), scene: mi });
      }
      if (convertible(S[i], i) || S[i].type === "words") out.push({ kind: "sequence", title: prevI >= 0 ? "DISTRESS CALL" : "THE SIGNAL", steps, why: "signal sequence" });
      break;
    }
  }

  // B) "the first / second / third decision" — videoya yayılan bir sıra (her karar kendi sahnesinde).
  const dec = [];
  for (let i = 0; i < S.length; i++) {
    const m = say(i).match(/\b(?:that was )?the (first|second|third|fourth) (decision|choice|mistake|warning|clue|rule)\b[:,]?\s*(.*)$/i);
    if (m && convertible(S[i], i)) dec.push({ i, ord: m[1], noun: m[2], rest: m[3] });
  }
  const ords = new Set(dec.map((d) => d.ord.toLowerCase()));
  if (dec.length >= 2 && ords.size === dec.length) {
    const noun = dec[0].noun.toUpperCase();
    out.push({
      kind: "sequence",
      title: `${["", "", "TWO", "THREE", "FOUR"][dec.length] || ""} ${noun}S`.trim(),
      steps: dec.map((d) => ({ label: upperLabel(d.rest || `${d.ord} ${d.noun}`, 46), detail: `the ${d.ord} ${d.noun.toLowerCase()}`, at: d.ord, scene: d.i })),
      why: "ordinal decisions across the video",
    });
  }

  // C) "in three waves: First the X... Then the Y... Near dawn/Finally ... the Z" — sıralı dalgalar.
  for (let i = 0; i < S.length; i++) {
    if (!/\b(three|four) (waves|stages|steps|phases|attacks)\b/i.test(say(i))) continue;
    const steps = [];
    for (let k = i + 1; k < Math.min(S.length, i + 6) && steps.length < 4; k++) {
      const t = say(k);
      const m = t.match(/^(first|then|next|finally|near dawn|at last)\b[^,:.]*?(?:[,:]\s*|\s+)(?:the\s+)?([^,.]+?)(?:[,.]|$)/i);
      const after = t.match(/:\s*(?:the\s+)?([^:.]{3,40})\.?$/i)?.[1];
      if (m || after) {
        const lab = after || m[2];
        steps.push({ label: upperLabel(lab, 28), detail: (m?.[1] || "").toLowerCase() || undefined, at: firstContent(lab), scene: k });
      }

    }
    if (steps.length >= 2) {
      const n = say(i).match(/\b(three|four) (waves|stages|steps|phases|attacks)\b/i);
      out.push({ kind: "sequence", title: `${n[1]} ${n[2]}`.toUpperCase(), steps, why: "announced waves" });
      break;
    }
  }

  // D) Kendini besleyen döngü: "margin call ... sells your stock ... prices down, and more calls" (borsa).
  const mi = find(/\bmargin call\b/i);
  if (mi >= 0) {
    const steps = [];
    const t0 = say(mi);
    const fall = t0.match(/\bif ([^,]{3,30}),/i);
    if (fall) steps.push({ label: upperLabel(fall[1], 22), at: firstContent(fall[1]), scene: mi });
    steps.push({ label: "MARGIN CALL", detail: (t0.match(/(broker demands [^:.]+)/i) || [])[1]?.toLowerCase(), at: "margin", scene: mi });
    const ni = find(/\bsells your stock|\bsells\b/i, mi + 1, mi + 3);
    if (ni > 0) {
      const t1 = say(ni);
      steps.push({ label: "BROKER SELLS", detail: (t1.match(/(can't pay\?)/i) || [])[1]?.toLowerCase(), at: "sells", scene: ni });
      const dn = t1.match(/((?:the selling )?pushes prices down)/i);
      if (dn) steps.push({ label: upperLabel(dn[1], 32), at: "pushes", scene: ni });
      const more = t1.match(/(more calls go out)/i);
      if (more) steps.push({ label: upperLabel(more[1], 24), at: "calls", scene: ni });
    }
    if (steps.length >= 3 && steps.every((s) => convertible(S[s.scene], s.scene))) out.push({ kind: /more calls|again/i.test(S.slice(mi, mi + 3).map(sayOf).join(" ")) ? "cycle" : "mechanism", title: "THE MARGIN SPIRAL", steps, why: "self-feeding cycle" });
  }

  // E) Neden-sonuç zinciri: art arda 3-5 sahnede fiziksel bir mekanizma (kar levhası, ağırlık, akım...).
  const CAUSE = /\b(weakens?|piles?|breaks? loose|crashes|pushes|fling|slingshot|gravity|floods?|spills?|pours?|split the code|tucked|sent a command|reply|laid|greased|hauled|strained|dug|rams?|sealed)\b/i;
  for (let i = 2; i < S.length - 3; i++) {
    if (!convertible(S[i], i) || !CAUSE.test(say(i))) continue;
    const run = [i];
    let gap = 0;
    for (let k = i + 1; k < Math.min(S.length, i + 8) && run.length < 5; k++) {
      if (S[k].chapter !== S[i].chapter) break;
      if (!convertible(S[k], k)) { if (++gap > 1) break; continue; }
      if (CAUSE.test(say(k)) || /^(that|all night|hours later|then|and then|by morning)\b/i.test(say(k))) { run.push(k); gap = 0; }
      else break;
    }
    if (run.length >= 3) {
      const steps = run.map((k) => { const l = stepLabel(S[k], 40, CAUSE); return { label: l, at: firstContent(l), scene: k }; });
      const prev = run[0] - 1;
      if (/^(remember|first|it began)/i.test(say(prev)) && convertible(S[prev], prev)) { const l = stepLabel(S[prev], 34, CAUSE); steps.unshift({ label: l, at: firstContent(l), scene: prev }); }
      // The chapter's own title when it names the mechanism ("The Snow Slab", "Ships Over Land").
      const ch = script_chapters(ctx)[S[i].chapter ?? 0];
      const chW = words(ch).filter((w) => !STOP.has(w) && w.length >= 4);
      const title = ch && chW.some((w) => steps.some((st) => words(st.label).some((x) => x.startsWith(w.slice(0, 4))))) ? String(ch).toUpperCase() : undefined;
      out.push({ kind: "mechanism", title, steps: steps.slice(0, 5), why: "causal chain" });
      i = run[run.length - 1];
    }
  }

  // F) Özet listesi: tek cümlede 3+ kısa öğe ("A warning that never reached the bridge. A lookout without binoculars. ...").
  for (let i = Math.floor(S.length * 0.6); i < S.length; i++) {
    const t = say(i);
    const items = t.split(/(?<=[^.][.])\s+/).map((x) => x.replace(/\.$/, "").trim()).filter(Boolean);
    if (items.length >= 3 && items.length <= 5 && items.every((x) => x.split(/\s+/).length >= 3 && x.split(/\s+/).length <= 8 && !/\.\.\./.test(x)) && convertible(S[i], i) && S[i].type === "words") {
      out.push({ kind: "sequence", title: countTitle(ctx, items.length), steps: items.map((x) => ({ label: upperLabel(x, 44), at: firstContent(x), scene: i })), why: "summary list" });
      break;
    }
  }

  // H) Envanter: "Left behind: a black clip-on tie..." ve ardından gelen sahnelerde sayılan öğeler.
  for (let i = 2; i < S.length - 2; i++) {
    const m = say(i).match(/^(left behind|inside|among them|the evidence|on board|in the bag|what they found)\s*:\s*(.+)$/i);
    if (!m || !convertible(S[i], i)) continue;
    const steps = [{ label: upperLabel(m[2].split(/,\s*with\b/)[0], 34), at: firstContent(m[2]), scene: i }];
    for (let k = i + 1; k < Math.min(S.length, i + 4) && steps.length < 5; k++) {
      if (!convertible(S[k], k)) break;
      const parts = say(k).split(/(?<=[^.][.])\s+/).map((x) => x.replace(/\.$/, "").trim()).filter((x) => x && x.split(/\s+/).length <= 9);
      if (!parts.length || /\b(he|she|they|we)\b/i.test(parts[0].split(/\s+/).slice(0, 2).join(" "))) break;
      for (const p of parts.slice(0, 2)) steps.push({ label: upperLabel(p.replace(/^(and only|and|only)\s+/i, ""), 34), at: firstContent(p), scene: k });
    }
    if (steps.length >= 3) { out.push({ kind: "sequence", title: upperLabel(m[1], 20), steps: steps.slice(0, 5), why: "inventory" }); break; }
  }

  // G) Karşılaştırma: "X backed direct current ... alternating current" / "A could go where B couldn't".
  for (let ci = find(/\bdirect current\b.*\balternating current\b/i); ci >= 0; ci = find(/\bdirect current\b.*\balternating current\b/i, ci + 1)) {
    const ai = find(/\bAC could go where DC couldn't|\bAC\b.*\bDC\b/i, ci, ci + 4);
    if (ai > 0 && convertible(S[ai], ai) && convertible(S[ci], ci)) {
      const who = say(ci).match(/^(\w+) backed direct current/i)?.[1];
      out.push({
        kind: "compare",
        title: "THE WAR OF THE CURRENTS",
        steps: [
          { label: who ? `${who.toUpperCase()} · DC` : "DIRECT CURRENT", at: "direct", scene: ci },
          { label: "ALTERNATING · AC", at: "alternating", scene: ci },
          { label: "CALLED IT DEADLY", detail: "the attack on AC", at: "deadly", scene: ci },
          { label: upperLabel(say(ai).match(/:\s*([^:]+)$/)?.[1] || "MILES AWAY", 20), detail: "where DC couldn't go", at: "miles", scene: ai },
        ],
        why: "two systems compared",
      });
      break;
    }
  }
  return out;
}

/** Bir açıklayıcının sahne aralığı: adımların sahneleri (dönüştürülecekler). */
function explainerScenes(ex) {
  return [...new Set(ex.steps.map((s) => s.scene))].sort((a, b) => a - b);
}

/** Yedek açıklayıcılar: tarifler, sonra en çok 3 (her bölümde en çok 1), birbirinden uzak. */
function pickExplainers(motif, ctx, max = 3) {
  const cands = recipeExplainers(motif, ctx).filter((e) => e.steps.length >= 2 && e.steps.length <= 6);
  const out = [];
  const used = new Set();
  for (const e of cands) {
    const sc = explainerScenes(e);
    if (sc.some((i) => used.has(i))) continue;
    // Tek bölüme sığan açıklayıcılar aynı bölümde ikinciyi almaz (uzun sıralar bölümler boyu yayılabilir).
    const chs = new Set(sc.map((i) => ctx.scenes[i].chapter ?? 0));
    if (chs.size === 1 && out.some((o) => { const oc = new Set(explainerScenes(o).map((i) => ctx.scenes[i].chapter ?? 0)); return oc.size === 1 && [...oc][0] === [...chs][0]; })) continue;
    sc.forEach((i) => used.add(i));
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/* ================================================================ yedek: arayüz kartları */

function pickUiCards(motif, ctx, taken) {
  const S = ctx.scenes;
  const out = [];
  const say = (i) => sayOf(S[i]);
  const free = (i) => convertible(S[i], i) && !taken.has(i);
  // 1) Aynı ölçünün art arda değerleri (Dow 381 → 294 → 41): defter kartı, en sonuncusu vurgulu.
  const series = new Map();
  S.forEach((s, i) => {
    if (s.type !== "counter" || !counterValue(s)) return;
    const [lab, when] = String(s.label || "").split("·").map((x) => x.trim());
    if (!when) return;
    const k = lab.toLowerCase();
    if (!series.has(k)) series.set(k, []);
    series.get(k).push({ i, when, val: counterValue(s), lab });
  });
  for (const [, list] of series) {
    if (list.length < 3) continue;
    const last = list[list.length - 1];
    // Son değerden sonraki ilk dönüştürülebilir sahne (o bölüm içinde) kartı taşır.
    let host = -1;
    for (let k = last.i + 1; k < Math.min(S.length, last.i + 3); k++) if (free(k) && S[k].chapter === S[last.i].chapter) { host = k; break; }
    if (host < 0) continue;
    out.push({ scene: host, kind: motif === "telemetry" ? "terminal" : "ledger", title: list[0].lab.toUpperCase(), rows: list.map((x) => ({ label: x.when.toUpperCase(), value: x.val })), highlight: list.length - 1, why: "one figure across time" });
    break;
  }
  // 2) Talep/mesaj formu: "lists his demands" ardından 2-3 talep (fidye, paraşüt, yakıt).
  const di = S.findIndex((s) => /\b(demands|lists his demands|conditions?)\b/i.test(sayOf(s)));
  if (di >= 0) {
    const rows = [];
    let host = -1;
    for (let k = di + 1; k < Math.min(S.length, di + 5); k++) {
      const t = say(k);
      if (/\b(dollars|parachutes|fuel|trucks|knapsack)\b/i.test(t)) {
        rows.push({ label: upperLabel(t.replace(/^(and\s+)?by [a-z]+ (pm|am),?\s*/i, "").replace(/^and\s+/i, ""), 44) });
        if (host < 0 && free(k)) host = k;
      }
    }
    const by = S.slice(di, di + 4).map(sayOf).join(" ").match(/\bby ([a-z]+) (PM|AM)\b/i);
    if (rows.length >= 2 && host >= 0) out.push({ scene: host, kind: motif === "case-file" ? "terminal" : "form", title: "DEMANDS", ...(by ? { sub: `BY ${numberWords(by[1]).toUpperCase()} ${by[2].toUpperCase()}` } : {}), rows, highlight: 0, why: "the demands as a teletype" });
  }
  // 3) Telsiz uyarısı: "sent another warning" + sonraki sahnedeki mesaj → telgraf formu.
  if (motif === "telegraph") {
    const wi = S.findIndex((s, i) => /\bsent another warning\b/i.test(sayOf(s)) && i + 1 < S.length);
    if (wi >= 0 && free(wi + 1)) {
      const from = say(wi).match(/the ([A-Z][a-z]+) sent/)?.[1];
      const msg = say(wi + 1).replace(/\.$/, "");
      const time = say(wi).match(/around ([a-z]+ (?:PM|AM))/i)?.[1];
      const parts = msg.split(/:\s*/).filter(Boolean);
      const rows = [from ? { label: "FROM", value: from.toUpperCase() } : null, time ? { label: "TIME", value: time.toUpperCase() } : null, ...parts.map((p) => ({ label: upperLabel(p, 44) }))].filter(Boolean);
      out.push({ scene: wi + 1, kind: "form", title: "ICE WARNING", rows, highlight: rows.length - 1, why: "the warning as a message form" });
    }
  }
  return out.filter((c) => c.rows.length >= 2);
}

/* ================================================================ yedek: ikonlar ve geçişler */

/** Sahne başına metafor ikonları: yalnızca somut adlar, setteki ikonlar; seyrek ve dağınık. */
function pickIcons(spec, ctx, taken) {
  const S = ctx.scenes;
  const set = new Set(spec.icons);
  const out = {};
  let last = -9;
  let count = 0;
  const use = {};
  const cap = Math.max(6, Math.round(S.length / 8));
  S.forEach((s, i) => {
    if (count >= cap || taken.has(i) || i < 2) return;
    if (!["photo", "words"].includes(s.type) || s.annotate || s.images?.length || s.bg === "prev" || (s.type === "words" && !(s.media === "video" || s.imagePrompt || s.search || s.source))) return;
    if (i - last < 3) return;
    const t = sayOf(s);
    const found = [];
    const org = t.match(ORG_RE);
    if (org && ORG_ICON[org[1]]) found.push({ id: ORG_ICON[org[1]], at: org[1].split(/\s+/)[0], label: org[1].length <= 22 ? org[1] : undefined, tether: true });
    for (const [re, id] of ICON_WORDS) {
      if (!set.has(id) || found.some((f) => f.id === id)) continue;
      const m = t.match(re);
      if (m) found.push({ id, at: m[1] || m[0] });
      if (found.length >= 4) break;
    }
    found.sort((a, b) => (use[a.id] || 0) - (use[b.id] || 0));
    for (let k = found.length - 1; k >= 0; k--) if ((use[found[k].id] || 0) >= 3 && !found[k].label) found.splice(k, 1);
    if (!found.length) return;
    // Seyreklik: aday sahnelerin yaklaşık yarısı (tohumlu), isimli portrelere öncelik.
    if (!s.name && hash01(`${ctx.seed}|icon|${i}`) > 0.55) return;
    const n = found.length >= 2 && hash01(`${ctx.seed}|two|${i}`) < 0.45 ? 2 : 1;
    const fx = Array.isArray(s.focus) ? s.focus[0] : null;
    const side = fx !== null && fx > 0.55 ? "left" : fx !== null && fx < 0.45 ? "right" : hash01(`${ctx.seed}|side|${i}`) < 0.5 ? "left" : "right";
    out[i] = found.slice(0, n).map((f, k) => ({ id: f.id, side: n === 2 && k === 1 ? (side === "left" ? "right" : "left") : side, glow: true, at: f.at, ...(f.label ? { label: f.label } : {}), ...(f.tether ? { tether: true } : {}) }));
    for (const x of out[i]) use[x.id] = (use[x.id] || 0) + 1;
    last = i;
    count++;
  });
  return out;
}

/** Motif geçişleri: her bölümün ilk sahnesi + birkaç dönüm noktası (ifşa), en çok bölüm+4. */
function pickWipes(ctx, taken) {
  const S = ctx.scenes;
  const out = [];
  S.forEach((s, i) => {
    if (i === 0 || taken.has(i)) return;
    if ((s.chapter ?? 0) !== (S[i - 1].chapter ?? 0)) out.push(i);
  });
  const nCh = out.length;
  let extra = 0;
  S.forEach((s, i) => {
    if (extra >= 4 || i < 3 || out.includes(i) || taken.has(i)) return;
    if (s.mood === "reveal" && S[i - 1]?.mood !== "reveal" && s.type !== "slam" && out.every((j) => Math.abs(j - i) > 12)) { out.push(i); extra++; }
  });
  return out.sort((a, b) => a - b).slice(0, nCh + 4);
}

/* ================================================================ renk politikası */

/**
 * Konunun taban ve vurgu derecelendirmesi (GRADES listesiyle doğrulanır). Taban renk ailesinden olmalı (renk
 * fotoğrafı öncesi hikâyede — eraStart < 1940 — sepya da olur: arşiv zaten tek renk); modelin önerdiği soldurucu
 * taban (selective/mono/duotone/bleach…) accentGrade'e taşınır, taban motifin renkli tonuna döner.
 * Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: luma 52-56, doygunluk 2,5-6.
 */
export function topicGrades(raw, spec = {}, eraStart = null) {
  const valid = (g) => typeof g === "string" && GRADES.includes(g);
  const specBase = valid(spec.grade) && baseGradeOk(spec.grade, eraStart) ? spec.grade : "color";
  let grade = valid(raw?.grade) ? raw.grade : specBase;
  let accentGrade = valid(raw?.accentGrade) ? raw.accentGrade : valid(spec.accentGrade) ? spec.accentGrade : null;
  if (!baseGradeOk(grade, eraStart)) {
    if (DESAT_GRADES.has(grade)) accentGrade = grade;
    grade = specBase;
  }
  if (accentGrade === grade) accentGrade = valid(spec.accentGrade) && spec.accentGrade !== grade ? spec.accentGrade : null;
  return { grade, ...(accentGrade ? { accentGrade } : {}) };
}

/* ================================================================ yedek incil */

/**
 * BELİRLEYİCİ yedek incil (kredi yok / anahtar yok / model hatası): tür + anahtar kelimelerle
 * motif; anlatımdan jetonlar; kalıp tarifleriyle açıklayıcılar; somut satırlara ikonlar.
 */
export function fallbackBible(script) {
  const ctx = topicContext(script);
  const motif = pickMotif(script);
  const spec = MOTIF_SPECS[motif];
  const { tokens, params, message } = motifTokens(motif, ctx);
  const explainers = pickExplainers(motif, ctx);
  const taken = new Set(explainers.flatMap(explainerScenes));
  const uiCards = pickUiCards(motif, ctx, taken);
  for (const c of uiCards) taken.add(c.scene);
  const icons = pickIcons(spec, ctx, taken);
  const wipes = pickWipes(ctx, taken);
  // Taban renkli (motif kartının grade'i), soldurucu ton yalnızca vurgu (accentGrade) — normalizeBible doğrular.
  return normalizeBible({
    motif,
    tokens,
    message,
    params,
    signatureDevice: explainers.length ? "explainer" : uiCards.length ? "ui-card" : "chapter-card",
    iconSet: spec.icons.filter((id) => Object.values(icons).some((l) => l.some((x) => x.id === id))).concat(spec.icons).filter((x, k, a) => a.indexOf(x) === k).slice(0, 16),
    presentation: { photo: spec.photo, map: spec.map },
    typography: { headline: spec.headline, body: spec.body, textStyles: spec.textStyles, caption: "motif" },
    palette: { accent: spec.accent, accent2: spec.accent2 },
    grade: spec.grade,
    accentGrade: spec.accentGrade,
    keepHue: spec.keepHue,
    backdrops: spec.backdrops,
    eraTexture: spec.eraTexture,
    variants: spec.variants,
    opening: spec.opening,
    explainers: explainers.map((e) => ({ kind: e.kind, title: e.title, steps: e.steps, why: e.why })),
    uiCards,
    scenes: Object.entries(icons).map(([i, list]) => ({ i: +i, icons: list })),
    wipes,
    why: `fallback: motif ${motif} (${Object.entries(motifScores(script)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ")})`,
  }, script);
}

/* ================================================================ doğrulama */

/** Bir metnin (adım/satır) anlatımda dayanağı var mı: içerik sözcüklerinden en az biri senaryoda geçmeli. */
function grounded(text, corpus) {
  const ws = words(text).filter((w) => !STOP.has(w) && w.length >= 3);
  const nums = String(text).match(/\d[\d.,]*/g) || [];
  if (!ws.length && !nums.length) return true;
  return ws.some((w) => corpus.includes(w.replace(/'s$/, ""))) || nums.some((n) => corpus.includes(n.replace(/,/g, "")) || corpus.includes(n));
}

/**
 * Modelin (ya da yedeğin) incilini sözleşmeye göre onarır: bilinmeyen motif → anahtar kelime
 * seçimi; ikon/yüz/stil kimlikleri motorun listelerinden; adım/satır/jeton anlatıma dayanmalı;
 * sahne indisleri geçerli ve dönüştürülebilir olmalı; açıklayıcı ve kartlar çakışmamalı.
 */
/** Cut at a word boundary (never mid-word); a trailing 'to/of/and…' left dangling is dropped too. */
export function wordCut(t, max) {
  // A stub the model left (France, Oct 2026: "FROM A HOT CLASSROOM TO A BURNING CITY H" — 40 characters, the word cut
  // in the model's own output): a lone trailing letter that is not 'a'/'I' is dropped, with any dangling 'to/of…'.
  let s = String(t || "").replace(/\s+/g, " ").trim();
  if (/\s(?![aAI]$)\p{L}$/u.test(s)) s = s.replace(/\s+\p{L}$/u, "").replace(/\s+(?:to|of|and|or|the|a|an|in|on|at|for|by|with|from)$/i, "");
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  if (!/\s/.test(head)) return s.split(" ")[0];
  let cut = head.replace(/\s+\S*$/, "");
  cut = cut.replace(/[\s,;:–—-]+$/, "").replace(/\s+(?:to|of|and|or|the|a|an|in|on|at|for|by|with|from)$/i, "");
  return cut;
}

export const EXPLAINER_MAX = 3;
export const EXPLAINER_SCENES = 5;
export const EXPLAINER_SPAN = 6;
export const EXPLAINER_TOTAL = 10;
/** An explainer's steps kept to one moment: at most EXPLAINER_SCENES distinct scenes within EXPLAINER_SPAN scenes. */
export function keepExplainerWindow(steps = []) {
  // A board that returns at most 3 times is a deliberate callback (Tesla's "three decisions", each on its own scene
  // across the video); a longer one must stay on one moment.
  if (new Set(steps.map((st) => st.scene)).size <= 3) return steps;
  const out = [];
  const seen = new Set();
  for (const st of steps) {
    if (out.length && st.scene - out[0].scene > EXPLAINER_SPAN) break;
    if (!seen.has(st.scene) && seen.size >= EXPLAINER_SCENES) break;
    seen.add(st.scene);
    out.push(st);
  }
  return out;
}

export function normalizeBible(raw, script) {
  const ctx = topicContext(script);
  const S = ctx.scenes;
  const corpus = `${ctx.lower} ${S.map((s) => counterValue(s) || "").join(" ")}`.replace(/,/g, "");
  const motif = MOTIF_IDS.includes(raw?.motif) ? raw.motif : pickMotif(script);
  const spec = MOTIF_SPECS[motif];
  const notes = [];
  // Fransa videosu (21 Ekim 2026, izleyici notu): "…BURNING CITY H", "eleven at night to six i" — sınır kelimenin ortasından
  // kesiyordu. Artık kelime sınırında kesilir (tek uzun kelime olduğu gibi kalır), sondaki bağlaç/edat düşer.
  const str = (v, max = 60) => (typeof v === "string" && v.trim() ? wordCut(v.trim(), max) : undefined);
  const tokens = (Array.isArray(raw?.tokens) ? raw.tokens : []).map((t) => str(t, 24)).filter(Boolean).filter((t) => grounded(t, corpus)).slice(0, 8);
  const params = {};
  for (const [k, v] of Object.entries(raw?.params && typeof raw.params === "object" ? raw.params : {})) {
    const s = str(String(v ?? ""), 40);
    if (s && /^[a-z]{2,12}$/i.test(k) && grounded(s, corpus)) params[k] = s;
  }
  const message = str(raw?.message, 80) && grounded(raw.message, corpus) ? str(raw.message, 80) : undefined;
  const pres = raw?.presentation || {};
  const photo = PHOTO_PRESENTS.includes(pres.photo) ? pres.photo : spec.photo;
  const map = MAP_STYLES.includes(pres.map) ? pres.map : spec.map;
  const ty = raw?.typography || {};
  const headline = FONT_KEYS.includes(ty.headline) ? ty.headline : spec.headline;
  const body = FONT_KEYS.includes(ty.body) ? ty.body : spec.body;
  const textStyles = [...new Set((Array.isArray(ty.textStyles) ? ty.textStyles : []).filter((x) => TEXT_STYLES.includes(x)))];
  const pal = raw?.palette || {};
  const accent = HEX.test(pal.accent || "") ? pal.accent.toLowerCase() : spec.accent;
  const accent2 = HEX.test(pal.accent2 || "") ? pal.accent2.toLowerCase() : spec.accent2;
  const keepHue = Number.isFinite(raw?.keepHue) ? ((Math.round(raw.keepHue) % 360) + 360) % 360 : spec.keepHue;
  // Taban renkli, soldurucu öneri vurguya (topicGrades) — eskiden her geçerli biçimli dize taban oluyordu.
  const { grade, accentGrade } = topicGrades(raw, spec, ctx.eraStart);
  const iconSet = [...new Set((Array.isArray(raw?.iconSet) ? raw.iconSet : spec.icons).filter((x) => ICON_IDS.includes(x)))].slice(0, 24);
  const opening = OPENING_KINDS.includes(raw?.opening) ? raw.opening : spec.opening;

  // Açıklayıcılar: sahne indisleri geçerli + dönüştürülebilir, adımlar anlatımda, çakışma yok.
  const used = new Set();
  const explainerScenes = new Set();
  const explainers = [];
  for (const e of Array.isArray(raw?.explainers) ? raw.explainers : []) {
    const kind = EXPLAINER_KINDS.includes(e?.kind) ? e.kind : "sequence";
    let steps = (Array.isArray(e?.steps) ? e.steps : [])
      .map((s) => ({ label: str(s?.label, 48), detail: str(s?.detail, 60), at: str(s?.at, 24), ...(ICON_IDS.includes(s?.icon) ? { icon: s.icon } : {}), scene: isInt(s?.scene) ? s.scene : isInt(e?.from) ? e.from : null }))
      .filter((s) => s.label && s.scene !== null && s.scene >= 0 && s.scene < S.length);
    const bad = steps.filter((s) => !grounded(`${s.label} ${s.detail || ""}`, corpus));
    if (bad.length) notes.push(`açıklayıcı adımı anlatımda yok, atıldı: ${bad.map((b) => b.label).join(" / ")}`);
    steps = steps.filter((s) => grounded(`${s.label} ${s.detail || ""}`, corpus));
    // adım sırası sahne sırasıyla uyumlu
    steps = steps.filter((s, k) => k === 0 || s.scene >= steps[k - 1].scene);
    // Tek an, tek tahta (Fransa videosu, 21 Ekim 2026: 4 tahta 19 sahneye yayıldı, ilki 24→57): en çok EXPLAINER_SCENES
    // ayrı sahne, hepsi EXPLAINER_SPAN sahne içinde; videoda toplam en çok EXPLAINER_TOTAL tahta sahnesi.
    steps = keepExplainerWindow(steps);
    const sc = [...new Set(steps.map((s) => s.scene))];
    if (sc.length && explainerScenes.size + sc.length > EXPLAINER_TOTAL) { notes.push(`açıklayıcı "${e?.title || kind}" atıldı: videoda en çok ${EXPLAINER_TOTAL} tahta sahnesi`); continue; }
    if (steps.length < 2 || steps.length > 8) continue;
    if (sc.some((i) => used.has(i) || !convertible(S[i], i))) { notes.push(`açıklayıcı "${e?.title || kind}" dönüştürülemeyen/çakışan sahnede — atıldı`); continue; }
    sc.forEach((i) => { used.add(i); explainerScenes.add(i); });
    explainers.push({ kind, title: str(e?.title, 56)?.toUpperCase(), steps, ...(str(e?.why, 120) ? { why: str(e.why, 120) } : {}) });
    if (explainers.length >= EXPLAINER_MAX) break;
  }
  const uiCards = [];
  for (const c of Array.isArray(raw?.uiCards) ? raw.uiCards : []) {
    if (!isInt(c?.scene) || c.scene < 0 || c.scene >= S.length || used.has(c.scene) || !convertible(S[c.scene], c.scene)) continue;
    const kind = UI_KINDS.includes(c.kind) ? c.kind : "form";
    if (kind === "phone" && !(ctx.eraStart >= 2007)) continue;
    const rows = (Array.isArray(c.rows) ? c.rows : []).map((r) => ({ label: str(r?.label, 48), value: str(r?.value, 34) })).filter((r) => r.label && grounded(`${r.label} ${r.value || ""}`, corpus)).slice(0, 8);
    if (rows.length < 2) continue;
    used.add(c.scene);
    uiCards.push({ scene: c.scene, kind, title: str(c.title, 48)?.toUpperCase(), sub: str(c.sub, 40), rows: rows.map((r) => (r.value ? r : { label: r.label })), ...(isInt(c.highlight) && c.highlight >= 0 && c.highlight < rows.length ? { highlight: c.highlight } : {}) });
    if (uiCards.length >= 2) break;
  }
  // Sahne ikonları: yalnızca fotoğraf/yazı sahneleri, ikon kimliği pakette, sözcük anlatımda.
  const scenes = [];
  for (const e of Array.isArray(raw?.scenes) ? raw.scenes : []) {
    const i = isInt(e?.i) ? e.i : -1;
    const s = S[i];
    if (!s || used.has(i) || !["photo", "words"].includes(s.type) || s.annotate) continue;
    const icons = (Array.isArray(e.icons) ? e.icons : [])
      .filter((x) => ICON_IDS.includes(x?.id))
      .map((x) => ({ id: x.id, side: ["left", "right", "orbit"].includes(x.side) ? x.side : "right", glow: x.glow !== false, ...(str(x.at, 24) && sayOf(s).toLowerCase().includes(String(x.at).toLowerCase()) ? { at: str(x.at, 24) } : {}), ...(str(x.label, 26) && grounded(x.label, corpus) ? { label: str(x.label, 26) } : {}), ...(x.tether ? { tether: true } : {}) }))
      .slice(0, 3);
    if (icons.length) scenes.push({ i, say: fp(s), icons });
  }
  const wipes = [...new Set((Array.isArray(raw?.wipes) ? raw.wipes : []).filter((i) => isInt(i) && i > 0 && i < S.length && !used.has(i)))].sort((a, b) => a - b).slice(0, 14);
  return {
    version: TOPIC_VERSION,
    motif,
    tokens,
    ...(message ? { message } : {}),
    params,
    signatureDevice: ["explainer", "ui-card", "chapter-card"].includes(raw?.signatureDevice) ? raw.signatureDevice : explainers.length ? "explainer" : "chapter-card",
    iconSet,
    presentation: { photo, map },
    typography: { headline, ...(body ? { body } : {}), textStyles: textStyles.length >= 3 ? textStyles.slice(0, 6) : spec.textStyles, caption: CAPTION_STYLES.includes(ty.caption) ? ty.caption : "motif" },
    palette: { accent, accent2 },
    grade,
    ...(accentGrade ? { accentGrade } : {}),
    keepHue,
    backdrops: (Array.isArray(raw?.backdrops) ? raw.backdrops : spec.backdrops).filter((x) => typeof x === "string").slice(0, 4),
    eraTexture: ["newsprint", "film", "ledger"].includes(raw?.eraTexture) ? raw.eraTexture : spec.eraTexture,
    variants: (Array.isArray(raw?.variants) ? raw.variants : spec.variants).filter((x) => typeof x === "string").slice(0, 6),
    opening,
    explainers: explainers.map((e) => ({ ...e, steps: e.steps.map((s) => ({ ...s, say: fp(S[s.scene]) })) })),
    uiCards: uiCards.map((c) => ({ ...c, say: fp(S[c.scene]) })),
    scenes,
    wipes: wipes.map((i) => ({ i, say: fp(S[i]) })),
    why: str(raw?.why, 300),
    ...(notes.length ? { notes } : {}),
  };
}

/* ================================================================ uygulama */

/** Betik düzeyi kimlik (script.topic): motor ve sanat yönetmeni bunu okur. Sahneler değişmez. */
export function topicIdentity(bible, script = null) {
  if (!bible?.motif) return null;
  // Kayıttan gelen eski incilde taban 'selective' olabilir: renk politikası burada da uygulanır (yeni model çağrısı yok).
  const ys = [...String(script?.era || "").matchAll(/\b(1[0-9]\d\d|20\d\d)\b/g)].map((m) => +m[1]);
  const g = topicGrades(bible, MOTIF_SPECS[bible.motif], ys.length ? Math.min(...ys) : null);
  return {
    motif: bible.motif,
    ...(bible.tokens?.length ? { tokens: bible.tokens } : {}),
    ...(bible.message ? { message: bible.message } : {}),
    ...(Object.keys(bible.params || {}).length ? { params: bible.params } : {}),
    photo: bible.presentation?.photo,
    map: bible.presentation?.map,
    headline: bible.typography?.headline,
    ...(bible.typography?.body ? { body: bible.typography.body } : {}),
    accent: bible.palette?.accent,
    accent2: bible.palette?.accent2,
    keepHue: bible.keepHue,
    // Sanat yönetmeni için (motor yok sayar): yazı ailesi, temel renk, zeminler, varyant tercihi, açılış.
    textStyles: bible.typography?.textStyles,
    grade: g.grade,
    ...(g.accentGrade ? { accentGrade: g.accentGrade } : {}),
    backdrops: bible.backdrops,
    eraTexture: bible.eraTexture,
    variants: bible.variants,
    opening: bible.opening,
  };
}

/** Arşiv fotoğrafı mı (sunum uygulanır): kendi durağan resmi olan foto sahnesi; AI/stok değil. */
const presentable = (s) => s?.type === "photo" && !s.video && !s.layers && !s.annotate && !s.images?.length && !s.fullBleed && !!s.image && (s.archived || s.source === "archive") && s.bg !== "prev";

/**
 * İncili ARŞİVDEN SONRA motora giden senaryoya uygular (yeni senaryo döner; girdi değişmez):
 * script.topic, açıklayıcı/kart dönüşümleri (resim alanları silinir: üretim maliyeti yok),
 * sahne ikonları, arşiv fotoğraflarının sunumu, motif geçişleri. Sahne eşleşmesi anlatım
 * parmak iziyle (bölüm kartları eklenmiş olsa da doğru sahne).
 */
export function applyTopicPlan(script, bible, { logFn = () => {} } = {}) {
  if (!bible?.motif || !script?.scenes?.length) return script;
  const scenes = script.scenes.map((s) => s);
  const own = scenes.map((s, i) => (isCard(s) ? null : i)).filter((i) => i !== null);
  const fps = own.map((i) => fp(scenes[i]));
  const at = (k, say) => {
    let j = isInt(k) && fps[k] === say ? k : -1;
    if (j < 0) j = fps.indexOf(say);
    return j < 0 ? -1 : own[j];
  };
  const PICTURE = ["image", "images", "imgW", "imgH", "video", "videoStart", "videoDur", "videoW", "videoH", "imagePrompt", "imagePrompts", "search", "source", "media", "layers", "focus", "crop", "fit", "camera", "grade", "fx", "archived", "credit", "heldBg", "borrowed", "clips", "depth", "caption", "text", "keyword", "textStyle", "backdrop", "bg", "icons", "present", "aiFix"];
  const strip = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !PICTURE.includes(k)));
  const lang = /^en/i.test(script.locale || "") ? "en" : "tr";
  let nEx = 0;
  let nUi = 0;
  let nIc = 0;
  let nPr = 0;
  let nWi = 0;
  let skipped = 0;
  for (const e of bible.explainers || []) {
    const hosts = e.steps.map((s) => at(s.scene, s.say));
    if (hosts.some((h) => h < 0)) { skipped++; continue; }
    // Görselsiz şema uzun bir satırı taşımaz (Irkutsk, Ekim 2026: 28 sn boş karede üç madde): o satır fotoğrafıyla kalır.
    const uzun = [...new Set(hosts)].find((h) => estSceneSeconds(scenes[h], lang) > LONG_CARD_SEC);
    if (uzun !== undefined) { skipped++; logFn(`açıklayıcı şema atlandı: sahne ${uzun} ~${Math.round(estSceneSeconds(scenes[uzun], lang))} sn, görselsiz kart ${LONG_CARD_SEC} sn'den uzun kalmaz`); continue; }
    const steps = e.steps.map(({ label, detail, at: a, icon }) => ({ label, ...(detail ? { detail } : {}), ...(a ? { at: a } : {}), ...(icon ? { icon } : {}) }));
    const uniq = [...new Set(hosts)];
    for (const h of uniq) {
      const from = hosts.indexOf(h);
      const to = hosts.lastIndexOf(h) + 1;
      scenes[h] = { ...strip(scenes[h]), type: "explainer", kind: e.kind, ...(e.title ? { title: e.title } : {}), steps, reveal: [from, to], transition: "cut" };
    }
    nEx++;
  }
  for (const c of bible.uiCards || []) {
    const h = at(c.scene, c.say);
    if (h < 0 || scenes[h].type === "explainer" || estSceneSeconds(scenes[h], lang) > LONG_CARD_SEC) { skipped++; continue; }
    scenes[h] = { ...strip(scenes[h]), type: "ui-card", kind: c.kind, ...(c.title ? { title: c.title } : {}), ...(c.sub ? { sub: c.sub } : {}), rows: c.rows, ...(isInt(c.highlight) ? { highlight: c.highlight } : {}) };
    nUi++;
  }
  for (const e of bible.scenes || []) {
    const h = at(e.i, e.say);
    if (h < 0) { skipped++; continue; }
    const s = scenes[h];
    // Resmi olmayan (dönüştürülmüş, yazı zemini) sahneye ikon yok; resimli foto/yazı sahnesine evet.
    if (!["photo", "words"].includes(s.type) || !(s.image || s.video || s.layers)) continue;
    scenes[h] = { ...s, icons: e.icons.map((x) => ({ ...x })) };
    nIc++;
  }
  const photo = bible.presentation?.photo;
  // FULL-BLEED by default: a landscape picture or clip fills the frame (a cinematic crop round its focus),
  // never a small print in a dark margin. Only portrait/square or small scans are shown as objects —
  // and then always the same way (the bible's presentation) on a purposeful ground.
  let nFb = 0;
  // Presented (print/lightbox/framed) pictures are the exception: at most ~20% of the picture scenes.
  const picScenes = scenes.filter((s) => ["photo", "words", "slam", "title"].includes(s.type) && (s.image || s.video)).length;
  const presentCap = Math.max(1, Math.floor(picScenes * 0.2));
  scenes.forEach((s, i) => {
    if (!["photo", "words", "slam", "title"].includes(s.type) || isCard(s) || s.layers) return;
    const w = Number(s.video ? s.videoW || s.imgW : s.imgW);
    const h = Number(s.video ? s.videoH || s.imgH : s.imgH);
    if (!(w > 0 && h > 0)) return;
    // The engine's full-bleed rule (docu-engine/src/effects/variety.js fullBleedOK): 1.25:1..2.4:1 and
    // covering 1920x1080 needs <= 1.9x (footage 2.05x). Anything smaller is shown whole, not blown up.
    const a = w / h;
    const landscape = a >= 1.25 && a <= 2.4 && Math.max(1920 / w, 1080 / h) <= (s.video ? 2.05 : 1.9);
    if (landscape) {
      scenes[i] = { ...s, fit: "cover", ...(s.type === "photo" && !s.images?.length && !s.annotate ? { fullBleed: true } : {}) };
      nFb++;
    } else if (photo && photo !== "clean" && presentable(s) && !s.icons?.length && nPr < presentCap) {
      scenes[i] = { ...s, present: photo };
      nPr++;
    }
  });
  // CAPTIONS IN THE TOPIC'S LANGUAGE: every full caption line (not the hook/peak accents, not key-only or
  // clean shots) is written in the motif (telegraph log paper, ticker tape, readout...). A concrete line over
  // its picture is SHOWN instead of printed: its icon carries it and the shot stays clean.
  let nCap = 0;
  let nShow = 0;
  const wordsIdx = scenes.map((x, i) => (x.type === "words" ? i : -1)).filter((i) => i >= 0);
  const showCap = Math.floor(wordsIdx.length / 4);
  for (const i of wordsIdx) {
    const x = scenes[i];
    const pictured = !!(x.image || x.video || x.layers);
    if (x.icons?.length && pictured && nShow < showCap && String(x.text || "").split(/\s+/).length <= 9 && !["lyric", "kinetic"].includes(x.textStyle)) {
      scenes[i] = { ...x, textMode: "none" };
      nShow++;
      continue;
    }
    if (bible.typography?.caption !== "motif") continue;
    if (["lyric", "kinetic"].includes(x.textStyle) || x.textMode === "key" || x.textMode === "none") continue;
    scenes[i] = { ...x, textStyle: "motif" };
    nCap++;
  }
  for (const w of bible.wipes || []) {
    const h = at(w.i, w.say);
    if (h < 0 || isCard(scenes[h])) continue;
    scenes[h] = { ...scenes[h], wipe: true, transition: "cut" };
    nWi++;
  }
  const out = { ...script, scenes, topic: topicIdentity(bible) };
  logFn(`Konu kimliği [${bible.motif}]: ${nEx} açıklayıcı, ${nUi} arayüz kartı, ${nIc} ikonlu sahne (${nShow} satır yazısız gösterildi), ${nCap} motif yazısı, ${nFb} tam kadraj, ${nPr} sunumlu arşiv fotoğrafı (${photo}), ${nWi} motif geçişi${skipped ? ` · ${skipped} karar eşleşmedi (senaryo değişmiş)` : ""}`);
  return out;
}

/* ================================================================ LLM */

const STEP_SCHEMA = { type: "object", properties: { label: { type: "string", description: "2-5 words, from the narration" }, detail: { type: "string" }, at: { type: "string", description: "the narration word it lights on" }, icon: { type: "string", enum: ICON_IDS, description: "the THING the step shows (drawn, not written)" }, scene: { type: "integer" } }, required: ["label", "scene"], additionalProperties: false };
export function bibleSchema() {
  return {
    type: "object",
    properties: {
      motif: { type: "string", enum: MOTIF_IDS },
      tokens: { type: "array", items: { type: "string" }, description: "words/codes/figures the motif animates, ONLY from the narration" },
      message: { type: "string" },
      params: { type: "object", additionalProperties: { type: "string" } },
      signatureDevice: { type: "string", enum: ["explainer", "ui-card", "chapter-card"] },
      iconSet: { type: "array", items: { type: "string", enum: ICON_IDS } },
      presentation: { type: "object", properties: { photo: { type: "string", enum: PHOTO_PRESENTS }, map: { type: "string", enum: MAP_STYLES } }, required: ["photo", "map"], additionalProperties: false },
      typography: { type: "object", properties: { headline: { type: "string", enum: FONT_KEYS }, body: { type: "string", enum: FONT_KEYS }, textStyles: { type: "array", items: { type: "string", enum: TEXT_STYLES } }, caption: { type: "string", enum: CAPTION_STYLES, description: "'motif' = captions written in the motif's own language (default); a generic style only as last resort" } }, required: ["headline", "textStyles"], additionalProperties: false },
      palette: { type: "object", properties: { accent: { type: "string" }, accent2: { type: "string" } }, required: ["accent", "accent2"], additionalProperties: false },
      grade: { type: "string", enum: GRADES, description: "the video's BASE photo grade — a colour grade (color, warm, cool, teal-orange, kodachrome; sepia only before 1940)" },
      accentGrade: { type: "string", enum: GRADES, description: "optional desaturating accent (selective, mono…) for ONE chapter only" },
      keepHue: { type: "integer" },
      backdrops: { type: "array", items: { type: "string" } },
      opening: { type: "string", enum: OPENING_KINDS },
      explainers: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: EXPLAINER_KINDS }, title: { type: "string", description: "at most 6 words / 50 characters, whole words" }, steps: { type: "array", items: STEP_SCHEMA }, why: { type: "string" } }, required: ["kind", "steps"], additionalProperties: false } },
      uiCards: { type: "array", items: { type: "object", properties: { scene: { type: "integer" }, kind: { type: "string", enum: UI_KINDS }, title: { type: "string" }, sub: { type: "string" }, rows: { type: "array", items: { type: "object", properties: { label: { type: "string", description: "at most 40 characters, whole words" }, value: { type: "string", description: "at most 30 characters, whole words ('11 pm to 6 am', not 'eleven at night to six in the morning')" } }, required: ["label"], additionalProperties: false } }, highlight: { type: "integer" } }, required: ["scene", "kind", "rows"], additionalProperties: false } },
      scenes: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, icons: { type: "array", items: { type: "object", properties: { id: { type: "string", enum: ICON_IDS }, side: { type: "string", enum: ["left", "right", "orbit"] }, glow: { type: "boolean" }, at: { type: "string" }, label: { type: "string" }, tether: { type: "boolean" } }, required: ["id"], additionalProperties: false } } }, required: ["i", "icons"], additionalProperties: false } },
      wipes: { type: "array", items: { type: "integer" } },
      why: { type: "string" },
    },
    required: ["motif", "presentation", "typography", "palette", "explainers", "scenes"],
    additionalProperties: false,
  };
}

export function biblePrompt(script) {
  const ctx = topicContext(script);
  const S = ctx.scenes;
  const lines = S.map((s, i) => `#${i} [ch${(s.chapter ?? 0) + 1}] ${s.type}${s.name ? ` (name: ${s.name})` : ""}${s.type === "counter" ? ` {${counterValue(s)} ${s.label || ""}}` : ""}${convertible(s, i) ? "" : " {fixed}"} | ${sayOf(s).slice(0, 140)}`).join("\n");
  const fallback = fallbackBible(script);
  const system = [
    "You are the TOPIC DESIGNER of a premium YouTube documentary channel. Study: LEMMiNO's 'The Unbreakable Kryptos Code' speaks the topic's own visual language from start to end (charcoal ground, monospace cipher tableaus animating letter by letter, colour-coded letters showing the decryption step by step, archive photos always on the same glowing lightbox over newsprint, satellite maps with crisp mono labels). MagnatesMedia's 'Rockefeller' visualises every concrete line with a metaphor layer (glowing line icons beside the subject while the narrator names the thing; logos as characters with brush-stroke name tags; selective colour used as an accent: black and white with ONE accent hue tied to the subject, on its darkest chapter).",
    "Your job: give THIS video its own visual identity that binds it from the first to the last frame, while the art director varies looks inside it. You do NOT change narration, order, timing or sources.",
    "",
    "DECIDE:",
    `- motif: the engine's motif system that carries the whole video (${MOTIF_IDS.join(", ")}). It dresses chapter cards, wipes, a quiet texture under text scenes and the signature devices. tokens: words/codes/figures it animates (Morse codes, ticker figures, distances, case numbers) — ONLY taken from the narration. message: a short line it spells out (a radio message, a plaintext) — narration words only. params: time/date/ref strings from the narration.`,
    `- presentation.photo: how EVERY archive still is shown (lightbox | print | film-frame | framed | clean); presentation.map: satellite | paper | grid.`,
    `- typography: headline/body faces (${FONT_KEYS.join(", ")}), the 4-6 text styles of the video and the caption style — consistent with the motif.`,
    `- palette accent/accent2 (#rrggbb), grade (the video's BASE photo grade — always a COLOUR grade: color, warm, cool, teal-orange or kodachrome; sepia only when the story predates 1940 — bright, natural colour photographs; the channel owner found every past video black, dark and identical), accentGrade (optional desaturating accent for ONE chapter only: 'selective' = black and white keeping keepHue in colour — the topic's accent object — or mono), keepHue (0-359), backdrops (preferred text grounds), opening (${OPENING_KINDS.join(", ")}).`,
    `- explainers (1-${EXPLAINER_MAX}): the mechanisms the narrator explains, drawn step by step in the motif's language. Each step: a 2-5 word label taken from the narration, optional detail, the narration word it lights on (at) and the scene index that says it. Scenes marked {fixed} cannot host a step. Use ONLY facts said in the narration. ONE explainer = ONE moment: its steps sit on at most ${EXPLAINER_SCENES} neighbouring lines (within ${EXPLAINER_SPAN} scenes) — several steps may light on words of the same line. Never spread a board across chapters: a viewer note on our France video (Oct 2026) counted the same polaroid board on screen 19 times.`,
    `- uiCards (0-2): real interfaces recreated as tilted cards (ranking | terminal | form | ledger | phone — phone only after 2007). Rows only from the narration; scene = the scene that becomes the card.`,
    `- scenes: per-scene metaphor icons — ONLY on lines that name something concrete (an object, an institution, money, a place); 1-2 icons, side away from the subject, 'at' = the narration word. About 1 in 6 picture scenes; never two in a row. Organisations may get a short brush-tag label (their name as spoken).`,
    `- wipes: scene indices that enter through the motif's wipe (chapter starts and a few turning points, at most chapters + 4).`,
  ].join("\n");
  const user = [
    `Documentary: "${script.title || ""}" · genre ${ctx.genre} · era ${script.era || "unknown"} · ${S.length} scenes`,
    `Chapters: ${(script.chapters || []).map((c, i) => `${i + 1}. ${typeof c === "string" ? c : c?.title}`).join(" · ")}`,
    `Icon ids: ${ICON_IDS.join(" ")}`,
    `A deterministic draft (improve it; keep what is right): motif ${fallback.motif}; explainers ${fallback.explainers.map((e) => `[${e.kind}: ${e.steps.map((s) => `${s.label}@#${s.scene}`).join(" → ")}]`).join(" ")}`,
    "",
    "SCENES (#n [chapter] type | narration):",
    lines,
  ].join("\n");
  return { system, user };
}

/** Senaryo özeti: aynı senaryo için incil bir kez kurulur (yedek de kayıtlı). */
export function topicKey(script, model = TOPIC_MODEL) {
  const scenes = (script.scenes || []).filter((s) => !isCard(s)).map((s) => [s.type, sayOf(s), s.text || "", s.word || "", s.to ?? null, s.label || "", s.chapter ?? 0, s.name || "", s.mood || ""]);
  return crypto.createHash("sha1").update(JSON.stringify([TOPIC_VERSION, model, script.id || "", script.seedKey || "", script.genre, script.era || "", script.title || "", script.chapters || [], scenes])).digest("hex");
}

const noCredit = (e) => /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(String(e?.message || e));

/** Kısa özet (günlük ve rapor). */
export function summarizeBible(b) {
  if (!b) return "konu kimliği yok";
  const ex = (b.explainers || []).map((e) => `${e.kind}${e.title ? ` "${e.title}"` : ""}: ${e.steps.map((s) => s.label).join(" → ")}`);
  return [
    `motif ${b.motif} · jetonlar [${(b.tokens || []).join(", ")}]${b.message ? ` · mesaj "${b.message}"` : ""} · sunum ${b.presentation?.photo}/${b.presentation?.map} · yazı ${b.typography?.headline}${b.typography?.body ? `/${b.typography.body}` : ""} [${(b.typography?.textStyles || []).join(", ")}] · renk ${b.grade}${b.accentGrade ? ` (vurgu ${b.accentGrade}${b.accentGrade === "selective" ? `@${b.keepHue}°` : ""})` : ""} ${b.palette?.accent}/${b.palette?.accent2} · açılış ${b.opening}`,
    ...ex.map((x) => `açıklayıcı ${x}`),
    ...(b.uiCards || []).map((c) => `kart ${c.kind} "${c.title || ""}" #${c.scene}: ${c.rows.map((r) => `${r.label}${r.value ? ` ${r.value}` : ""}`).join(" | ")}`),
    `ikonlu sahne ${b.scenes?.length || 0} · motif geçişi ${b.wipes?.length || 0} · ikon seti [${(b.iconSet || []).slice(0, 10).join(", ")}…]`,
  ];
}

/**
 * KONU KİMLİĞİ. Yeni senaryo (script.topic eklenmiş; sahneler aynı) ve incil döner.
 * @param opts.cacheFile iş klasöründe önbellek (aynı senaryo için yeniden kurulmaz)
 * @param opts.llm test için callJSON yerine; `false` = modeli çağırma (yedek)
 * @returns {{script, bible, mode: 'llm'|'fallback', cached, skipped?}}
 */
export async function topicBible(script, { settings = {}, usage, logFn = () => {}, model, cacheFile = null, llm = callJSON, isCancelled = () => false } = {}) {
  if (!script?.scenes?.length) return { script, bible: null, mode: "none", cached: false };
  const mdl = model || settings.docuTopicModel || settings.docuArtDirectorModel || TOPIC_MODEL;
  const key = topicKey(script, mdl);
  const cached = cacheFile ? readJson(cacheFile, null) : null;
  let bible = null;
  let mode = "fallback";
  let skipped;
  let fromCache = false;
  if (cached?.key === key && cached.bible?.motif) {
    bible = cached.bible;
    mode = cached.mode || "fallback";
    fromCache = true;
  } else {
    if (llm === false) skipped = "disabled";
    else if (!settings.anthropicKey && llm === callJSON) skipped = "no-key";
    else {
      const { system, user } = biblePrompt(script);
      try {
        const res = await llm({ system, user, schema: bibleSchema(), maxTokens: 16000, usage, logFn, model: mdl, isCancelled });
        bible = normalizeBible(res, script);
        mode = "llm";
        // Modelin bıraktığı boşlukları yedek doldurur (açıklayıcısız bir kimlik imza cihazından yoksun kalmasın).
        if (!bible.explainers.length) {
          const fb = fallbackBible({ ...script });
          if (fb.motif === bible.motif) bible = { ...bible, explainers: fb.explainers };
        }
      } catch (e) {
        if (e?.message === "cancelled" || isCancelled()) throw e;
        skipped = noCredit(e) ? "no-credit" : "error";
        logFn(`Konu kimliği modeli kullanılamadı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 160)}) — belirleyici yedek devrede`);
      }
    }
    if (!bible) bible = fallbackBible(script);
    if (cacheFile) writeJson(cacheFile, { key, version: TOPIC_VERSION, model: mdl, mode, savedAt: new Date().toISOString(), bible });
  }
  const out = { ...script, topic: topicIdentity(bible, script) };
  const sum = summarizeBible(bible);
  logFn(`Konu kimliği${fromCache ? " (kayıttan)" : ""} [${mode === "llm" ? "Opus" : "yedek"}]: ${sum[0]}`);
  for (const l of sum.slice(1)) logFn(`  ${l}`);
  for (const n of bible.notes || []) logFn(`  not: ${n}`);
  return { script: out, bible, mode, cached: fromCache, ...(skipped ? { skipped } : {}) };
}

/** Motor klasöründeki ikon listesi (test: sözleşme eşitliği). */
export function engineIconIds(dir = path.join(ROOT, "docu-engine")) {
  const f = path.join(dir, "src", "topic", "icons-data.ts");
  if (!fs.existsSync(f)) return null;
  return [...fs.readFileSync(f, "utf8").matchAll(/(?:^|\{)"([a-z0-9-]+)":\[/gm)].map((m) => m[1]);
}
