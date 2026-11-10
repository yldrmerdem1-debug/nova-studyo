// MÜZİK: YAS SATIRI, BİLİNÇLİ SESSİZLİK VE MÜZİĞİN KİMLİĞİ (docu-script.js normalizeScenes / enforceGlobalQuotas,
// docu.js musicMeta).
//
// ÖLÇÜLEN KUSUR (27 Ekim 2026, müzik denetimi, 11 video): Çernobil (20261026-24122a) 146 sahnede 0 'sad' taşıdı;
// "Borys Baranov died of a heart attack" (9:28) tension'dı ve In Battery'nin (sad 0) altına düştü. mergeMoodRuns
// 1-2 sahnelik yas anını komşu gerilime katıyordu. 11 videoda duygu dorucunda tek sessizlik vardı (Hastings, Harold'ın
// ölümü); 16 alıntının 15'i kısılmış müziğin altındaydı. Seçici dönemi anlatımdan tahmin etti: Çernobil 1976
// ("RBMK-1000", "Soviet"), Kartal Yuvası haberi 1942 (saksafon teması); hiçbir iş ciddiyet ya da kanal bildirmiyordu.
// Ağ YOK; gerçek iş dosyaları (D:\Nova Studyo\data) yalnızca okunur, yoksa o testler atlanır.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-muzik-yas-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DS = await import("../src/pipeline/docu-script.js");
const { musicMeta, MUSIC_GRAVITIES } = await import("../src/pipeline/docu.js");
const { hikayeDonemi } = await import("../src/pipeline/docu-archive.js");

const BARANOV = "[serious] On 6 April 2005, Borys Baranov died of a heart attack in Kyiv, aged sixty-four.";
const PANAMA = "[firmly] And yet, as of today, no one in Panama has been reported killed.";
const SUB = "[firmly] He confirmed a collision at low speed, no injuries, and damage to both boats.";
const photo = (mood, say, k, extra = {}) => ({ type: "photo", mood, say, dur: 3, imagePrompt: `shot ${k}`, ...extra });
const words = (n, k = 0) => Array.from({ length: n }, (_, j) => `word${k}x${j}`).join(" ") + ".";

test("yas satırı: gerçek ölüm yas, olumsuzlanmış ya da sıfır kayıp değil (ortak GRIEF / NOT_GRIEF)", () => {
  assert.equal(DS.griefLine(BARANOV), true);
  assert.equal(DS.griefLine(PANAMA), false, "no one … killed: kayıp yok");
  assert.equal(DS.griefLine(SUB), false, "no injuries: kayıp yok");
  assert.equal(DS.griefLine("[quiet, tense] More than fifty thousand people died."), true);
  assert.equal(DS.griefLine("Thirty deaths, and none of them were the men from the basement."), true);
  // Olumsuzlama yalnızca kendi cümlesini düşürür; bütün metne bakan tüketicinin yas dediği her satır burada da yas.
  assert.equal(DS.griefLine("No one was hurt in the first blast. Two days later, three men died."), true);
  assert.equal(DS.griefLine("Two men — not three — died."), true);
  assert.equal(DS.griefLine("Nobody was killed and the crew walked away."), false);
  assert.equal(DS.griefLine("The deadline passed and the deadly serious talks went on."), false, "deadline/deadly yas değil");
  assert.equal(DS.GRIEF.test("they lost their lives at sea"), true);
  assert.equal(DS.NOT_GRIEF.test("without a single casualty"), true);
});

test("normalizeScenes: yas satırı 'sad' + grief olur, ötekiler dokunulmaz", () => {
  const scenes = [
    photo("tension", `[serious] ${words(12, 1)}`, 1),
    photo("tension", BARANOV, 2),
    photo("tension", `[serious] ${words(12, 3)}`, 3),
    photo("tension", PANAMA, 4),
    photo("tension", SUB, 5),
    photo("tension", `[serious] ${words(12, 6)}`, 6),
  ];
  DS.normalizeScenes(scenes, { lang: "en", genre: "epic" });
  assert.equal(scenes[1].mood, "sad");
  assert.equal(scenes[1].grief, true);
  for (const k of [0, 2, 3, 4, 5]) assert.equal(scenes[k].grief, undefined, `sahne ${k} yas değil`);
  assert.equal(scenes[3].mood, "tension");
  assert.equal(scenes[4].mood, "tension");
  // cleanScene (bölümler birleşirken) grief'i taşır.
  assert.equal(DS.cleanScene(scenes[1], 4).grief, true);
});

test("mergeMoodRuns yas anını komşu gerilime katmaz; kilitsizken katıyordu (eski kusur)", () => {
  // Bir bölüm: uzun gerilim koşuları arasında tek sahnelik (~5 sn) yas anı, üstelik 4'ten çok duygu değişimi.
  const chapter = () => [
    photo("tension", `[serious] ${words(30, 1)}`, 1),
    photo("tension", `[serious] ${words(30, 2)}`, 2),
    photo("curious", `[curious] ${words(8, 3)}`, 3),
    photo("tension", `[serious] ${words(30, 4)}`, 4),
    photo("tension", BARANOV, 5),
    photo("tension", `[serious] ${words(30, 6)}`, 6),
    photo("reveal", `[slowly] ${words(8, 7)}`, 7),
    photo("tension", `[serious] ${words(30, 8)}`, 8),
    photo("calm", `[warm] ${words(8, 9)}`, 9),
    photo("tension", `[serious] ${words(30, 10)}`, 10),
  ];
  const old = chapter();
  old[4].mood = "sad";
  DS.mergeMoodRuns(old, { lang: "en", locked: (s, i) => !!s.silence || i === 0 });
  assert.equal(old[4].mood, "tension", "kilitsiz: 5 sn'lik yas anı gerilime katılıyordu");

  const now = chapter();
  DS.normalizeScenes(now, { lang: "en", genre: "epic", first: true });
  assert.equal(now[4].mood, "sad", "yas satırı birleştirmeden sonra da sad");
  assert.equal(now[4].grief, true);
  const runs = [];
  now.forEach((s) => { if (!runs.length || runs.at(-1) !== s.mood) runs.push(s.mood); });
  assert.ok(runs.length - 1 <= 4 + 2, `kilitli yas anı dışında birleştirme sürüyor: ${runs.join(">")}`);
  assert.ok(!now.some((s, i) => i !== 4 && s.grief), "yalnızca yas satırı kilitli");
});

/** 80 sahne × 10 sn = 800 sn (~13 dk), tek bölüm: sahne i, i×10 sn'de başlar. */
function film() {
  const scenes = Array.from({ length: 80 }, (_, i) => ({ chapter: 0, type: "photo", mood: "tension", say: "[serious] A short line here.", dur: 10, imagePrompt: `p${i}` }));
  const grief = (i, say) => Object.assign(scenes[i], { mood: "sad", grief: true, say });
  grief(2, "[serious] More than a hundred people died."); //               20 sn: kanca, sessizlik almaz
  grief(20, "[serious] By evening, Harald Hardrada was dead."); //          200 sn
  grief(26, "[serious] And Tostig, Harold's own brother, died beside him."); // 260 sn
  grief(50, "[serious] The work killed twelve."); //                       500 sn
  grief(40, "[serious] The legend of their deaths was about to begin."); // 400 sn: efsane, sessizlik almaz
  Object.assign(scenes[62], { type: "quote", say: "[quietly] Years later he put it simply: I was ordered to go there, so I went.", quote: "I was ordered to go there, so I went.", who: "Oleksiy Ananenko" }); // 620 sn
  Object.assign(scenes[66], { type: "quote", say: "[firmly] He says the damage is certainly in the millions.", quote: "the damage is certainly in the millions", who: "Bartl Wimmer" }); // 660 sn: resmî açıklama
  Object.assign(scenes[70], { mood: "sad", silence: true }); //            700 sn: yazarın sad sessizliği
  Object.assign(scenes[79], { mood: "calm", silence: true, say: "[softly] This was the Eagle's Nest." }); // 790 sn: kapanış
  return scenes;
}
const silentAt = (scenes) => scenes.map((s, i) => (s.silence ? i : -1)).filter((i) => i >= 0);

test("sessizlik bütçesi: ceil(dk/5), ≥120 sn arayla; yas > yazarın anı > tanıklık alıntısı > kapanış", () => {
  const scenes = film();
  const notes = DS.enforceGlobalQuotas(scenes, { minutes: 13, lang: "en" });
  const kept = silentAt(scenes);
  assert.equal(kept.length, Math.ceil(13 / DS.SILENCE_EVERY_MIN), `13 dk → 3 sessizlik: ${kept}`);
  assert.deepEqual(kept, [26, 50, 70], "yas satırları (somut, ad/sayı) + yazarın sad sessizliği");
  for (let a = 0; a < kept.length; a++) for (let b = a + 1; b < kept.length; b++) {
    assert.ok(Math.abs(kept[a] - kept[b]) * 10 >= DS.SILENCE_GAP_SEC, `${kept[a]} ve ${kept[b]} en az 120 sn arayla`);
  }
  assert.ok(!scenes[2].silence, "kancanın ilk 60 sn'si müziksiz kalmaz");
  assert.ok(!scenes[40].silence, "efsane anlatan satır yas (sad) kalır ama sessizlik almaz");
  assert.ok(!scenes[79].silence, "bütçe doluysa kapanış satırı sessizliği bırakılır");
  assert.ok(notes.some((n) => /yas\/alıntı satırında müzik susuyor/.test(n)), notes.join("; "));
  assert.ok(notes.some((n) => /sessizlik kaldırıldı/.test(n)), notes.join("; "));
});

test("sessizlik: tanıklık alıntısı kapanıştan önce gelir; resmî açıklama hiç sessizlik almaz", () => {
  const scenes = film();
  for (const i of [20, 26, 50]) { delete scenes[i].grief; scenes[i].say = "[serious] A short line here."; scenes[i].mood = "tension"; }
  delete scenes[70].silence;
  DS.enforceGlobalQuotas(scenes, { minutes: 13, lang: "en" });
  assert.ok(scenes[62].silence, "birinci ağızdan alıntı sessizlik alır");
  assert.ok(!scenes[66].silence, "resmî açıklama (damage … in the millions) sessizlik almaz");
  assert.ok(scenes[79].silence, "aday azsa kapanış satırının sessizliği kalır");
  assert.deepEqual(silentAt(scenes), [62, 79]);
});

test("sessizlik: yazarın yas satırına koyduğu sessizlik somut satırlardan önce gelir (Hastings, Harold'ın ölümü)", () => {
  const scenes = film();
  Object.assign(scenes[56], { mood: "sad", grief: true, silence: true, say: "[slowly] By dusk the king was dead, and his army broke." }); // 560 sn
  DS.enforceGlobalQuotas(scenes, { minutes: 13, lang: "en" });
  assert.ok(scenes[56].silence, "yazarın seçtiği yas anı korunur");
  assert.ok(!scenes[50].silence, "ona 60 sn yakın somut yas satırı geri çekilir");
});

test("musicMeta: dönem, biçim, müzik kanalı, ciddiyet", () => {
  // Haber: işin açıldığı yıl, anlatımın arka plan yılı değil (Kartal Yuvası 1952/1942 sayıldı).
  const news = musicMeta({ docuFormat: "news", createdAt: "2026-10-24T17:08:59.502Z" }, {}, { era: "1952 (anlatım 1936–2026 arası)" });
  assert.deepEqual(news, { musicEra: "2026", format: "news", musicChannel: "news", musicGravity: "serious" });
  // Tarih: dönem denetiminin yılı.
  assert.deepEqual(musicMeta({ docuGenre: "epic" }, {}, { era: "1986 (anlatım 1000–2025 arası)" }), { musicEra: "1986", musicChannel: "history", musicGravity: "serious" });
  // Kanal sesiyle: stil seçilmemiş iş de kanalını sesinden bilir (ayarlar docuStyleVoices).
  const sv = { docuStyleVoices: { epic: "HIST", news: "NEWS", finance: "FIN" } };
  assert.equal(musicMeta({ elevenVoiceId: "FIN" }, sv, { era: "2008" }).musicChannel, "finance");
  assert.equal(musicMeta({ elevenVoiceId: "HIST" }, sv, { era: "1066" }).musicChannel, "history");
  assert.equal(musicMeta({ docuGenre: "finance" }, {}, {}).musicChannel, "finance");
  assert.equal(musicMeta({}, {}, { genre: "epic" }).musicChannel, "history", "senaryonun stili epic");
  assert.equal(musicMeta({}, {}, { genre: "science" }).musicChannel, "docu");
  // Geri sayım: tek ana olay yok, dönem yazılmaz; biçimi ezilmez (çağıran yalnızca boş alanı doldurur).
  const rank = musicMeta({ docuFormat: "ranking", docuGenre: "epic" }, {}, { era: "1912", format: "ranking" });
  assert.equal(rank.musicEra, undefined);
  assert.equal(rank.format, undefined);
  assert.equal(rank.musicChannel, "docu");
  // Elle verilmiş dönem korunur; MÖ yılı; yıl yoksa sahne dönemlerinin süreyle ağırlıklı en yaygını.
  assert.equal(musicMeta({ docuFormat: "news" }, {}, { explicit: "1971 (Lufthansa 649)" }).musicEra, "1971 (Lufthansa 649)");
  assert.equal(musicMeta({}, {}, { era: "44 BC" }).musicEra, "44 BC");
  const scenes = [
    { era: "1348", say: "The ships came into Messina with the dead and the dying at their oars, and the city closed its gates far too late." },
    { era: "2026", say: "A lab today." },
    { era: "1348", say: "By spring it was in Florence." },
  ];
  assert.equal(musicMeta({}, {}, { era: "", scenes }).musicEra, "1348");
  assert.equal(musicMeta({}, {}, { era: "", scenes: [] }).musicEra, undefined);
  // Ciddiyet: iş > ayar > 'serious'; tanınmayan değer ciddi.
  assert.deepEqual(MUSIC_GRAVITIES, ["serious", "grave", "open"]);
  assert.equal(musicMeta({}, {}, {}).musicGravity, "serious");
  assert.equal(musicMeta({ musicGravity: "grave" }, { docuMusicGravity: "open" }, {}).musicGravity, "grave");
  assert.equal(musicMeta({}, { docuMusicGravity: "open" }, {}).musicGravity, "open");
  assert.equal(musicMeta({ musicGravity: "party" }, {}, {}).musicGravity, "serious");
  // script.channel köşe damgasının görünen adıdır (ChannelBug): müzik kanalı ona yazılmaz.
  assert.ok(!("channel" in musicMeta({ docuFormat: "news" }, {}, {})));
  // script.era de yazılmaz: görünüm (eraStart, tarama deseni, eski haber çerçevesi) ve kalite denetimi onu okur.
  assert.ok(!("era" in musicMeta({ docuGenre: "epic" }, {}, { era: "1066" })));
});

test("docu.js: müzik kimliği yalnızca motora giden senaryoya, son hazırlıkta yazılır (yönetmen anahtarları değişmez)", () => {
  const d = fs.readFileSync(path.join(ROOT, "src", "pipeline", "docu.js"), "utf8");
  const fin = d.slice(d.indexOf("const finishEngineDocu = async"), d.indexOf("engineDocu = await finishEngineDocu(engineDocu, credits, { report: true });"));
  assert.ok(fin.includes("musicMeta(job, settings, { era: hikayeDonemi(ed), explicit: ed.era, scenes: ed.scenes, format: ed.format, genre: ed.genre })"), "son hazırlık musicMeta'yı çağırır");
  assert.ok(/if \(ed\[k\] == null \|\| ed\[k\] === ""\) ed\[k\] = v;/.test(fin), "elle verilmiş alan ezilmez; musicEra yamada da aynı yılla yazılır (görünüm okumaz)");
  assert.ok(fin.indexOf("musicMeta(") < fin.lastIndexOf("return ed;"));
  // docu (docu-script.json) ve directed'e yazılmaz: yönetmenlerin kayıt anahtarı script.era taşır.
  assert.equal((d.match(/musicMeta\(/g) || []).length, 2, "tanım + tek çağrı");
});

const JOBS = "D:/Nova Studyo/data/jobs";
const readJob = (id) => {
  const f = (p) => path.join(JOBS, id, p);
  if (!fs.existsSync(f("job.json")) || !fs.existsSync(f(`docu/engine-script.json`))) return null;
  const job = JSON.parse(fs.readFileSync(f("job.json"), "utf8"));
  const engine = JSON.parse(fs.readFileSync(f("docu/engine-script.json"), "utf8"));
  return { job, engine, settings: { docuStyleVoices: job.settingsSnapshot?.docuStyleVoices } };
};
const metaOf = ({ job, engine, settings }) => musicMeta(job, settings, { era: hikayeDonemi(engine), explicit: engine.era, scenes: engine.scenes, format: engine.format, genre: engine.genre });

const haveChernobyl = fs.existsSync(path.join(JOBS, "20261026-24122a", "docu", "engine-script.json"));
test("gerçek işler: Çernobil 1986 tarih, Kartal Yuvası ve Lula 2026 haber, Hastings 1066 tarih", { skip: !haveChernobyl && "iş dosyaları bu makinede yok" }, () => {
  const want = {
    "20261026-24122a": { era: "1986", musicChannel: "history", format: undefined },
    "20261024-950730": { era: "2026", musicChannel: "news", format: "news" },
    "20261026-29db03": { era: "2026", musicChannel: "news", format: "news" },
    "20261010-989df5": { era: "1066", musicChannel: "history", format: undefined },
    "20261024-48ae2d": { era: "2026", musicChannel: "finance", format: undefined },
  };
  for (const [id, w] of Object.entries(want)) {
    const j = readJob(id);
    if (!j) continue;
    const m = metaOf(j);
    assert.equal(m.musicEra, w.era, `${id} dönem`);
    assert.equal(m.musicChannel, w.musicChannel, `${id} kanal`);
    assert.equal(m.format, w.format, `${id} biçim`);
    assert.equal(m.musicGravity, "serious", `${id} ciddiyet`);
  }
});

test("gerçek iş (Çernobil): yas satırları, sessizlik seçimi ve alanların motora/props'a geçişi", { skip: !haveChernobyl && "iş dosyaları bu makinede yok" }, () => {
  const dir = path.join(JOBS, "20261026-24122a");
  const docu = JSON.parse(fs.readFileSync(path.join(dir, "docu-script.json"), "utf8"));
  const baranov = docu.scenes.findIndex((s) => /Borys Baranov died of a heart attack/.test(s.say));
  assert.ok(baranov >= 0);
  assert.equal(DS.griefLine(docu.scenes[baranov].say), true);
  // Bölüm bölüm normalize (yazımdaki gibi): Baranov satırı sad + grief, birleştirmeden sağ çıkar.
  const scenes = structuredClone(docu.scenes);
  const byCh = new Map();
  for (const s of scenes) byCh.set(s.chapter, [...(byCh.get(s.chapter) || []), s]);
  for (const [c, list] of byCh) DS.normalizeScenes(list, { lang: "en", genre: "epic", first: c === 0 });
  assert.equal(scenes[baranov].mood, "sad");
  assert.equal(scenes[baranov].grief, true);
  assert.ok(scenes.filter((s) => s.mood === "sad").length >= 5, "Çernobil artık 0 değil, ölüm satırları sad");
  // Video geneli sessizlik: efsane satırları değil, gerçek ölüm/tanıklık satırları.
  const bible = JSON.parse(fs.readFileSync(path.join(dir, "docu-bible.json"), "utf8"))?.value;
  DS.enforceGlobalQuotas(scenes, { minutes: DS.estimateDocuSeconds({ scenes }, "en") / 60, lang: "en", intensity: (bible?.chapters || []).map((c) => c.intensity) });
  const silent = scenes.filter((s) => s.silence).map((s) => DS.stripTags(s.say));
  assert.ok(silent.length >= 2 && silent.length <= 3, silent.join(" | "));
  assert.ok(silent.every((t) => !/legend|invented/i.test(t)), `efsane satırı sessizlik almaz: ${silent.join(" | ")}`);
  assert.ok(silent.some((t) => /Thirty deaths|Baranov died|two killed/.test(t)), silent.join(" | "));
  // Alan geçişi: docu-script → engine-script → props; motor sahne alanlarını süzmez (grief de era gibi geçer). Motorun
  // düşürdükleri yalnızca kendi dönüşümleri: üretilen görselin istemi, yazının dönüştüğü sahnenin metin alanları.
  const engine = JSON.parse(fs.readFileSync(path.join(dir, "docu", "engine-script.json"), "utf8"));
  const bySayDocu = new Map(docu.scenes.map((s) => [s.say, s]));
  for (const s of engine.scenes) if (bySayDocu.get(s.say)?.era) assert.equal(s.era, bySayDocu.get(s.say).era, "sahne dönemi motora geçer");
  const propsFile = path.join(dir, "docu", "20261026-24122a.props.json");
  if (!fs.existsSync(propsFile)) return;
  const props = JSON.parse(fs.readFileSync(propsFile, "utf8")).script;
  const bySay = new Map(props.scenes.map((s) => [s.say, s]));
  const ENGINE_OWN = new Set(["imagePrompt", "text", "keyword", "textStyle", "textMode"]);
  for (const s of engine.scenes) {
    const p = bySay.get(s.say);
    if (!p) continue;
    for (const k of Object.keys(s)) assert.ok(k in p || ENGINE_OWN.has(k), `props sahnesi '${k}' alanını taşır`);
    if (s.era) assert.equal(p.era, s.era);
  }
  for (const k of Object.keys(engine)) assert.ok(k in props, `props üst alanı '${k}' taşır (musicEra, format, musicChannel, musicGravity da geçer)`);
});
