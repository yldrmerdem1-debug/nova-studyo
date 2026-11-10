// YAZI YÜZÜN ÜSTÜNE BİNMEZ, AD BAŞKASININ RESMİNE YAZILMAZ (26 Ekim 2026 işleri; kare incelemesi 27 Ekim).
//
// ÖLÇÜLEN KUSURLAR:
//  - Lula (haber, 20261026-29db03): 0:13'te kancanın başlığı "HOW BRAZIL REALLY VOTED" Lula'nın resmî portresinde ağzının
//    üstündeydi (engine-script sahne 2, arch-55d80b1f357a.jpg, künye "Foto oficial de Luiz Inácio Lula da Silva (ombros)…");
//    4:17'de "52" anahtar kelimesi Flávio Bolsonaro'nun yüzünün ortasında (sahne 43, arch-f3c3015de285.jpg, künye
//    "Entrevistas Diversas - Senador Flávio Bolsonaro (PL-RJ)"). Ön izleme kapısı başlığı altı turun altısında da
//    "text_on_face" buldu; her turda aynı "other-style"ı verdi (on-izleme/rapor-tur-1…6.json) — yazı ortada kaldı.
//  - Çernobil (tarih, 20261026-24122a): 0:54'te "Their names were Oleksiy Ananenko…" satırının (sahne 12, words, bg prev,
//    anahtar kelime "Ananenko") dev "ANANENKO"su önceki sahnenin AI kontrol odası resmindeki başka adamların üstündeydi.
//    Kapı "wrong_face" buldu (rapor-tur-1.json), düzeltmesi satırın AI istemine not yazmaktı (plan.ai [12]) — satır önceki
//    karenin resmini taşıyordu, istemi hiç kullanılmadı; render sonrası denetim aynı kusuru yine buldu (qa.json).
// KURAL: yüzlü resmin üstündeki büyük yazı alt üçte bire iner (textAt; motor looks/text.tsx band); ekrandaki ad yalnızca o
// kişiyi gerçekten gösteren gerçek resimde durur, değilse isim kartı kişinin fotoğrafına taşınır ya da yazı kalkar; kapı
// "text_on_face"e önce "text-low", "wrong_face"te başkasının resmindeki ada "drop-name" verir, denenmiş basamağı tekrarlamaz.
// Ağ, ücretli çağrı, render ve ffmpeg YOK: kurallar saf fonksiyonlar, motorun yerleşimi esbuild ile vekilli derlenir.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-yuz-yazi-home-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const A = await import("../src/pipeline/docu-archive.js");
const P = await import("../src/pipeline/docu-preview.js");
const G = await import("../src/pipeline/docu-design-gate.js");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const clone = (x) => structuredClone(x);

/* ---------------------------------------------------------------- Lula: yazı yüzde */

// Yönetmenin senaryosundaki kişiler (docu-script.json: sahne 3 ve 4'ün isim kartları — 4'ünkü arşivde silindi).
const LULA_PEOPLE = A.peopleNames({ scenes: [
  { type: "photo", say: "He won Sunday's runoff, held on 25 October.", name: "Luiz Inácio Lula da Silva" },
  { type: "photo", say: "His opponent was Senator Flávio Bolsonaro, of the PL, Jair Bolsonaro's eldest son.", name: "Flávio Bolsonaro" },
] });
const LULA = [
  { type: "title", say: "Yet the official national count says Luiz Inácio Lula da Silva just won a fourth term.", title: "How Brazil Really Voted", source: "archive", search: "Lula da Silva Brasília Planalto Palace", image: "build/j/arch-55d80b1f357a.jpg", archived: true, imgW: 1812, imgH: 2378, textStyle: "stack" },
  { type: "words", say: "[firmly] On 20 October, Real Time Big Data had Flávio ahead, 52 to 48.", text: "On 20 October, Real Time Big Data had Flávio ahead, 52 to 48.", keyword: "52", textMode: "key", textStyle: "motif", source: "archive", search: "Flávio Bolsonaro runoff campaign October 2026", image: "build/j/arch-f3c3015de285.jpg", archived: true },
  // Manzara: yazı yerinde kalır.
  { type: "photo", say: "The palace stood quiet.", imagePrompt: "Wide shot of the modernist presidential palace in Brasília at dusk, ramp and columns lit, empty forecourt" },
  { type: "words", say: "farm belt", text: "farm belt", textMode: "key", keyword: "farm", bg: "prev" },
  // İstem yüzü bilerek saklıyor / yalnızca parmak yakın çekimi: yüz yok.
  { type: "slam", say: "A motorcycle came down.", word: "motorcycle", imagePrompt: "Night shot of a narrow mountain road, a single motorcycle headlamp, no faces" },
  { type: "words", say: "Every vote counted.", text: "Every vote counted.", keyword: "vote", textMode: "key", imagePrompt: "Close-up of a voter's finger pressing the keypad of a Brazilian electronic voting machine" },
  // Seçicinin yüz konumu karenin altında: yazı üst banda.
  { type: "title", say: "The crowd.", title: "The Last Count", image: "build/j/arch-low.jpg", archived: true },
  // Derinlik katmanlı resim: motor yazıyı kişinin boş tarafına zaten koyar.
  { type: "words", say: "He spoke.", text: "He spoke.", textMode: "key", keyword: "spoke", image: "build/j/arch-layer.jpg", archived: true, layers: { box: [0.4, 0.1, 0.7, 1], bg: "a", fg: "b" } },
];
const LULA_CREDITS = {
  "scene-0": { file: "build/j/arch-55d80b1f357a.jpg", provider: "wikipedia", eser: "Foto oficial de Luiz Inácio Lula da Silva (ombros) denoise (cropped).jpg" },
  "scene-1": { file: "build/j/arch-f3c3015de285.jpg", provider: "wikimedia", eser: "Entrevistas Diversas - Senador Flávio Bolsonaro (PL-RJ) (54611269923)" },
  "scene-6": { file: "build/j/arch-low.jpg", provider: "wikimedia", eser: "Crowd at the count", face: [0.5, 0.7] },
  "scene-7": { file: "build/j/arch-layer.jpg", provider: "wikimedia", eser: "Portrait of a man" },
};

test("Lula: başlık Lula'nın portresinde, '52' Flávio'nun yüzünde → alt üçte bir; manzara, yüzsüz istem, parmak yakın çekimi, derinlik katmanı değişmez", () => {
  const scenes = clone(LULA);
  const logs = [];
  const rep = A.faceSafeText(scenes, { credits: LULA_CREDITS, people: LULA_PEOPLE, logFn: (m) => logs.push(m) });
  assert.deepEqual(scenes.map((s) => s.textAt ?? "-"), ["low", "low", "-", "-", "-", "-", "top", "-"]);
  assert.deepEqual([rep.low, rep.top], [2, 1]);
  assert.match(logs.join("\n"), /Yazı yüzden iniyor: 3 sahnede/);
  // Ad kuralı bu sahnelere dokunmaz: "52" ad değil, başlık ad kuralının dışında.
  assert.deepEqual(scenes.map((s) => s.textMode ?? "-"), LULA.map((s) => s.textMode ?? "-"));
  // Kurala ikinci kez girmek bir şey değiştirmez (finishEngineDocu her planda uygular).
  const again = clone(scenes);
  A.faceSafeText(again, { credits: LULA_CREDITS, people: LULA_PEOPLE });
  assert.deepEqual(again, scenes);
});

test("yüz bilgisi: isim kartı ve seçicinin yüz konumu, künyede senaryonun kişisi, insan tarifi; uzak çekim ve 'no faces' değil", () => {
  assert.deepEqual(A.pictureFace({ type: "photo", name: "X Y", archived: true, focus: [0.4, 0.3] }, null), { at: [0.4, 0.3] });
  assert.deepEqual(A.pictureFace({ type: "photo", archived: true }, { face: [0.5, 0.35] }), { at: [0.5, 0.35] });
  assert.ok(A.pictureFace({ type: "photo", archived: true }, { eser: "Foto oficial de Luiz Inácio Lula da Silva" }, LULA_PEOPLE));
  assert.ok(A.pictureFace({ type: "photo", imagePrompt: "Medium shot of Soviet nuclear plant engineers in white coats at a control panel" }, null), "Çernobil sahne 11");
  assert.ok(A.pictureFace({ type: "photo", imagePrompt: "Medium portrait of the man, a weathered Soviet shift supervisor", cast: ["baranov"] }, null));
  assert.equal(A.pictureFace({ type: "photo", imagePrompt: "Wide aerial shot of the reactor hall and cooling pond at dawn" }, null), null);
  assert.equal(A.pictureFace({ type: "photo", imagePrompt: "Silhouette of an older man by a window, two younger men in shadow", cast: ["madoff"] }, null), null, "silüet: yüz görünmüyor");
  assert.equal(A.pictureFace({ type: "photo", imagePrompt: "High angle of rows of empty plastic chairs in a school hallway, nobody present" }, null), null);
  assert.equal(A.pictureFace({ type: "photo", layers: { box: [0, 0, 1, 1] }, name: "X Y" }, null), null, "derinlik katmanı: motor yerleştirir");
});

/* ---------------------------------------------------------------- Çernobil: ad başkasının resminde */

const CHERNOBYL_DIRECTED = {
  cast: { ananenko_young: "Soviet mechanical engineer", baranov: "shift supervisor", firefighter: "a fireman" },
  scenes: [
    { type: "photo", say: "On 6 May 1986, according to Ananenko, the order came down a telephone line.", name: "Oleksiy Ananenko" },
    { type: "photo", say: "Borys Baranov was the shift supervisor.", name: "Borys Baranov" },
    { type: "photo", say: "Valeriy Bespalov went too.", name: "Valeriy Bespalov" },
    { type: "quote", say: "I was ordered to go there, so I went.", who: "Oleksiy Ananenko" },
    { type: "quote", say: "No comment.", who: "SEC Office of Inspector General" },
    { type: "quote", say: "We will rebuild.", who: "Bartl Wimmer, Zweckverband Bergerlebnis Berchtesgaden" },
    { type: "photo", say: "A firefighter climbed the roof. Then the firefighters came down." },
  ],
};

test("kişiler: isim kartları, kişi adı olan alıntı sahipleri ve anlatımda büyük harfle geçen cast; kurum ve 'firefighter' değil", () => {
  const people = A.peopleNames(CHERNOBYL_DIRECTED);
  assert.deepEqual(people.map((p) => p.ad), ["Oleksiy Ananenko", "Borys Baranov", "Valeriy Bespalov", "Bartl Wimmer"]);
  assert.deepEqual(people[0].parcalar, ["oleksiy", "ananenko"]);
  assert.deepEqual(A.namesIn("ANANENKO", people).map((p) => p.ad), ["Oleksiy Ananenko"]);
  // Commons künyesi Kiril ve başka harf çevirisiyle: aynı kişi.
  assert.deepEqual(A.namesIn("Ананенко Олексій Михайлович (cropped).jpg", people).map((p) => p.ad), ["Oleksiy Ananenko"]);
  assert.deepEqual(A.namesIn("Борис Баранов, 1986", people).map((p) => p.ad), ["Borys Baranov"]);
  assert.equal(A.namesIn("Seventy-two hours later", people).length, 0);
});

// engine-script.json'un kısaltılmış hâli (sahne 11-12 ve sonraki ad sahneleri).
const CH_SCENES = [
  { type: "photo", say: "They weren't soldiers or divers. They were plant engineers.", source: "archive", search: "Chernobyl nuclear plant engineers control room", imagePrompt: "Medium shot of Soviet nuclear plant engineers in white coats at a control panel of dials and switches, 1980s, harsh fluorescent light", caption: "Plant staff, not divers" },
  { type: "words", say: "Their names were Oleksiy Ananenko, Valeriy Bespalov and Borys Baranov.", text: "Oleksiy Ananenko, Valeriy Bespalov and Borys Baranov", keyword: "Ananenko", bg: "prev", textMode: "key", textStyle: "motif" },
  { type: "photo", say: "On 6 May 1986, according to Ananenko, the order came down a telephone line.", source: "archive", search: "Oleksiy Ananenko Chernobyl engineer", name: "Oleksiy Ananenko", image: "build/j/arch-4ff13f535523.jpg", archived: true },
  { type: "words", say: "Ananenko asked for one more pair of hands.", text: "Ananenko asked for one more pair of hands", keyword: "Ananenko", bg: "prev", textMode: "key" },
  { type: "words", say: "Years later, Ananenko put it simply.", text: "Ananenko put it simply", keyword: "Ananenko", textMode: "key", image: "build/j/arch-kyiv.jpg", archived: true },
  // AI'a düşmüş Baranov sahnesinde isim kartı kalmış (eski kayıt): kişinin gerçek fotoğrafına taşınır.
  { type: "photo", say: "Borys Baranov was the shift supervisor.", name: "Borys Baranov", role: "Shift supervisor", imagePrompt: "Medium portrait of a weathered Soviet shift supervisor", cast: ["baranov"] },
  { type: "slam", say: "Bespalov went too.", word: "BESPALOV", imagePrompt: "Medium shot of two men in waders in a flooded corridor" },
  { type: "photo", say: "Baranov, years later.", image: "build/j/arch-baranov.jpg", archived: true },
  { type: "photo", say: "The plant in 1986.", image: "build/j/arch-plant.jpg", archived: true, caption: "Ananenko's unit, 1986" },
];
const CH_CREDITS = {
  "scene-2": { file: "build/j/arch-4ff13f535523.jpg", provider: "wikipedia", eser: "Ананенко Олексій Михайлович (cropped).jpg", face: [0.5, 0.37] },
  "scene-4": { file: "build/j/arch-kyiv.jpg", provider: "wikimedia", eser: "Oleksiy Ananenko in Kyiv, 2019" },
  "scene-7": { file: "build/j/arch-baranov.jpg", provider: "wikimedia", eser: "Борис Баранов (1940–2005)" },
  "scene-8": { file: "build/j/arch-plant.jpg", provider: "openverse", eser: "Chernobyl Nuclear Power Plant Unit 4 (02710161)" },
};

test("Çernobil: 'ANANENKO' başka adamların AI resminde → kart yazısız; kendi fotoğrafındaki ad kalır; kart kişinin fotoğrafına taşınır", () => {
  const people = A.peopleNames(CHERNOBYL_DIRECTED);
  const scenes = clone(CH_SCENES);
  const logs = [];
  const rep = A.faceSafeText(scenes, { credits: CH_CREDITS, people, logFn: (m) => logs.push(m) });
  // 0:54 kusuru: önceki karenin AI kontrol odası resmi Ananenko değil.
  assert.equal(scenes[1].textMode, "none");
  assert.equal(scenes[1].text, CH_SCENES[1].text, "satır ve anlatım aynı; yalnızca ekrandaki ad kalktı");
  // Ananenko'nun doğrulanmış (seçici yüzü doğruladı, Kiril künye) fotoğrafı: kartı ve üstündeki ad kalır.
  assert.equal(scenes[2].name, "Oleksiy Ananenko");
  assert.equal(scenes[3].textMode, "key", "önceki kare Ananenko'nun kendi fotoğrafı");
  assert.equal(scenes[4].textMode, "key");
  assert.equal(scenes[4].noInserts, true, "doğru kişinin resmindeki adın altına ara plan (başka resim) kesilmez");
  // AI portresindeki Baranov kartı: Kiril künyeli gerçek fotoğrafına (Борис ~ Borys) taşındı.
  assert.equal(scenes[5].name, undefined);
  assert.deepEqual([scenes[7].name, scenes[7].role], ["Borys Baranov", "Shift supervisor"]);
  assert.deepEqual(rep.moved, [{ from: 5, to: 7, ad: "Borys Baranov" }]);
  // Vuruş "BESPALOV" iki yabancının AI resminde: resim kalır, ad kalkar.
  assert.deepEqual([scenes[6].type, scenes[6].textMode, scenes[6].text, scenes[6].word], ["words", "none", "BESPALOV", undefined]);
  // Kişisiz santral fotoğrafındaki ad taşıyan altyazı kalır — kimseyi yanlış tanıtmıyor (inceleme, 27 Ekim 2026); adsız
  // altyazı da kalır.
  assert.equal(scenes[8].caption, "Ananenko's unit, 1986");
  assert.equal(scenes[0].caption, "Plant staff, not divers");
  assert.match(logs.join("\n"), /İsim kartı "Borys Baranov".*taşındı/);
  assert.match(logs.join("\n"), /Ad başka kişinin resminde: sahne 2 yazı kartı/);
});

test("isim kartı: kişinin doğrulanmış fotoğrafı yoksa kalkar; AI modunda (names:false) adlara dokunulmaz", () => {
  const people = A.peopleNames(CHERNOBYL_DIRECTED);
  const scenes = [
    { type: "photo", say: "Valeriy Bespalov went too.", name: "Valeriy Bespalov", bg: "prev" },
    { type: "photo", say: "x", image: "build/j/arch-plant.jpg", archived: true },
  ];
  const lone = clone(scenes);
  const rep = A.faceSafeText(lone, { credits: CH_CREDITS, people });
  assert.equal(lone[0].name, undefined);
  assert.deepEqual(rep.dropped.map((d) => [d.scene, d.what]), [[0, "isim kartı"]]);
  const ai = clone(CH_SCENES);
  A.faceSafeText(ai, { credits: CH_CREDITS, people, names: false });
  assert.equal(ai[1].textMode, "key");
  assert.equal(ai[5].name, "Borys Baranov");
  assert.equal(ai[6].type, "slam");
  assert.equal(ai[6].textAt, "low", "yüz kuralı AI modunda da çalışır");
});

/* ---------------------------------------------------------------- inceleme, 27 Ekim 2026: yanlış alarmlar */

// Gerçek iş verisi: Bakker 20261006-af567d engine-script sahne 9-10, Hastings 20261010-989df5 sahne 64-65 (künyesiyle).
test("ad yalnızca başkasını gösteren resimden kalkar: kişisiz AI istemi ve kişisiz stok/Commons başlığı yazıyı korur", () => {
  const bakkerPeople = A.peopleNames({ scenes: [
    { type: "photo", say: "Jim Bakker was born in Muskegon.", name: "Jim Bakker" },
    { type: "photo", say: "She sang on the air.", name: "Tammy Faye Bakker" },
  ] });
  const bakker = [
    { type: "photo", say: "Jim Bakker was born in Muskegon, Michigan, on January second, 1940.", source: "ai", imagePrompt: "A snowy small-town Michigan street in the 1940s, wooden houses, a church steeple, a lake grey in the distance, soft winter light" },
    { type: "words", say: "At a Bible college in Minneapolis, he met a young singer named Tammy Faye LaValley.", text: "a young singer named Tammy Faye LaValley", keyword: "Tammy", textMode: "full", textStyle: "motif", bg: "prev" },
  ];
  let scenes = clone(bakker);
  let rep = A.faceSafeText(scenes, { people: bakkerPeople });
  assert.equal(scenes[1].textMode, "full", "Bakker sahne 11: 'Tammy' karlı sokakta kimseyi yanlış tanıtmıyor");
  assert.deepEqual(rep.dropped, []);
  const hastingsPeople = A.peopleNames({ scenes: [
    { type: "photo", say: "Harold Godwinson was crowned.", name: "Harold Godwinson" },
    { type: "photo", say: "Harald Hardrada sailed.", name: "Harald Hardrada" },
    { type: "words", say: "Just not where Harold had been waiting." },
  ] });
  const hastings = [
    { type: "photo", say: "Within days, the invasion he had waited for did come.", source: "stock", search: "sea horizon dawn", imagePrompt: "Far on the horizon at dawn, a long line of dark sails across a cold sea", image: "build/j/clip-3d16c829ec00.jpg", video: "build/j/clip-3d16c829ec00.mp4", archived: true },
    { type: "words", say: "Just not where Harold had been waiting.", text: "not where Harold had been waiting", keyword: "Harold", textMode: "full", textStyle: "motif", bg: "prev" },
  ];
  const sea = { "scene-0": { file: "build/j/clip-3d16c829ec00.mp4", provider: "mixkit", eser: "view of the horizon in the sea while a sailboat" } };
  scenes = clone(hastings);
  A.faceSafeText(scenes, { credits: sea, people: hastingsPeople });
  assert.equal(scenes[1].textMode, "full", "Hastings sahne 66: 'Harold' denizin stok görüntüsünde kalır");
  // Aynı satır: künyesi bilinmeyen arşiv resminde, başka adamları gösteren AI resminde ve başkasının derinlik katmanlı
  // portresinde ad kalkar.
  const under = (pic, credits = {}) => {
    const sc = [{ ...clone(hastings[0]), image: undefined, video: undefined, archived: undefined, source: "ai", ...pic }, clone(hastings[1])];
    A.faceSafeText(sc, { credits, people: hastingsPeople });
    return sc[1].textMode;
  };
  assert.equal(under({ image: "build/j/arch-x.jpg", archived: true, source: "archive" }, { "scene-0": { file: "build/j/arch-x.jpg", provider: "wikimedia" } }), "none", "künyesiz arşiv resmi: ne gösterdiği bilinmiyor");
  assert.equal(under({ imagePrompt: "Medium shot of two soldiers in mail armour on a beach, grey dawn" }), "none", "AI resminde başka adamlar");
  assert.equal(under({ image: "build/j/arch-l.jpg", archived: true, source: "archive", layers: { box: [0.3, 0.1, 0.7, 1], bg: "a", fg: "b" } }, { "scene-0": { file: "build/j/arch-l.jpg", provider: "wikimedia", eser: "Portrait of William the Conqueror" } }), "none", "derinlik katmanı yerleşimi değiştirir, kimliği değil");
  assert.equal(under({ imagePrompt: "Wide shot of an empty shingle beach at dawn, no people" }), "full");
});

test("ad eşleşmesi: ortak ilk ad başka kişi değil, künyede soyadı gerekir (ilk adıyla anılan kişi hariç); unvan ve sıradan sözcük ad parçası değil", () => {
  // Macaristan 20261011-a5d8bf: parlamento fotoğrafının stok etiketi "imre steind(l)" (binanın mimarı) Imre Nagy sayılıyordu.
  const hu = A.peopleNames({ scenes: [
    { type: "photo", say: "Prime Minister Imre Nagy spoke from the balcony.", name: "Imre Nagy" },
    { type: "photo", say: "The actor Imre Sinkovits read the poem.", name: "Imre Sinkovits" },
  ] });
  assert.deepEqual(A.namesIn("Imre Nagy portrait.jpg", hu).map((p) => p.ad), ["Imre Nagy"]);
  assert.deepEqual(A.namesIn("Sinkovits Imre (cropped).jpg", hu).map((p) => p.ad), ["Imre Sinkovits"]);
  assert.equal(A.namesIn("IMRE", hu).length, 2, "ekranda yalnızca ilk ad: ikisi de olabilir");
  assert.deepEqual(A.namesIn("kossuth square, hungarian parliament building, parliament, imre steind", hu, { kunye: true }), []);
  assert.equal(A.pictureFace({ type: "photo", archived: true }, { eser: "kossuth square, hungarian parliament building, parliament, imre steind" }, hu), null);
  assert.ok(A.pictureFace({ type: "photo", archived: true }, { eser: "Nagy Imre fortepan 74229" }, hu), "Macar ad sırası: soyadı var");
  // Hastings: anlatım "Harold"u tek başına söylüyor — künyedeki "Harold" odur. John G. Trump (Tesla) öyle değil.
  const ha = A.peopleNames({ scenes: [{ type: "photo", say: "Harold Godwinson was crowned.", name: "Harold Godwinson" }, { type: "words", say: "Just not where Harold had been waiting." }] });
  assert.equal(ha[0].ilkAd, true);
  assert.deepEqual(A.namesIn("Bayeux Tapestry scene57 Harold death.jpg", ha, { kunye: true }).map((p) => p.ad), ["Harold Godwinson"]);
  const jt = A.peopleNames({ scenes: [{ type: "photo", say: "John G. Trump examined the papers.", name: "John G. Trump" }] });
  assert.equal(jt[0].ilkAd, undefined);
  assert.equal(A.namesIn("John Cunning - Manhattan Skyline, 1934", jt, { kunye: true }).length, 0);
  // Çernobil: "Boris Shcherbina" kartı Borys Baranov'u saymaz (iskelet borys ~ boris) — Baranov'un AI resmindeki kartı
  // "zaten var" diye silinmez, gerçek fotoğrafına taşınır.
  const ch = A.peopleNames({ scenes: [
    { type: "photo", say: "Boris Shcherbina led the commission.", name: "Boris Shcherbina" },
    { type: "photo", say: "Borys Baranov was the shift supervisor.", name: "Borys Baranov" },
  ] });
  assert.deepEqual(A.namesIn("Boris Shcherbina", ch).map((p) => p.ad), ["Boris Shcherbina"]);
  assert.deepEqual(A.namesIn("Борис Баранов, 1986", ch).map((p) => p.ad), ["Borys Baranov"]);
  const cards = [
    { type: "photo", say: "Boris Shcherbina led the commission.", name: "Boris Shcherbina", image: "build/j/sh.jpg", archived: true },
    { type: "photo", say: "Borys Baranov was the shift supervisor.", name: "Borys Baranov", imagePrompt: "Medium portrait of a weathered Soviet shift supervisor", cast: ["baranov"] },
    { type: "photo", say: "Baranov, years later.", image: "build/j/arch-baranov.jpg", archived: true },
  ];
  const rep = A.faceSafeText(cards, { credits: { "scene-0": { file: "build/j/sh.jpg", eser: "Shcherbina basreliefe", face: [0.46, 0.37] }, "scene-2": { file: "build/j/arch-baranov.jpg", eser: "Борис Баранов (1940–2005)" } }, people: ch });
  assert.deepEqual(rep.moved, [{ from: 1, to: 2, ad: "Borys Baranov" }]);
  assert.equal(cards[0].name, "Boris Shcherbina");
  // Unvan ve sıradan sözcük (produce.mjs NAME_STOP): "Judge Robert Potter" (Bakker) "judge" değil, "Bill Clinton" "bill" değil.
  const bk = A.peopleNames({ scenes: [{ type: "photo", say: "x", name: "Judge Robert Potter" }, { type: "quote", say: "y", who: "Bill Clinton" }] });
  assert.deepEqual(bk.map((p) => p.parcalar), [["robert", "potter"], ["clinton"]]);
  assert.equal(A.namesIn("JUDGE", bk).length + A.namesIn("BILL", bk).length + A.namesIn("WILL", bk).length, 0);
});

test("künyedeki unvan yer adıdır: 'King Khalid International Airport', 'general aviation' yüz değil; portre ve AI istemi değişmez", () => {
  // Suudi–Husi 20261011-3c27b1 sahne 2: kanca başlığı havalimanı fotoğrafında alt üçte bire iniyordu.
  const airport = { "scene-0": { file: "build/j/arch-be82611a45e2.jpg", provider: "wikimedia", eser: "King Khalid International Airport, Riyadh Saudi Arabia - panoramio (2)" } };
  const hook = [{ type: "title", title: "Saudi Arabia vs the Houthis", say: "[firmly] This is Saudi Arabia versus the Houthis, and Riyadh's airport is closed.", source: "archive", search: "King Khalid International Airport Riyadh", image: "build/j/arch-be82611a45e2.jpg", archived: true, imagePrompt: "wide shot of a modern desert airport terminal under harsh afternoon sun, empty forecourt" }];
  A.faceSafeText(hook, { credits: airport, people: A.peopleNames({ scenes: [{ type: "photo", say: "x", name: "Donald Trump" }] }) });
  assert.equal(hook[0].textAt, undefined);
  assert.equal(A.pictureFace({ type: "photo", archived: true }, { eser: "General aviation apron at Sanaa airport" }), null);
  assert.ok(A.pictureFace({ type: "photo", archived: true }, { eser: "Portrait of King Harold II" }), "portre sözcüğüyle unvan yüzdür");
  assert.ok(A.pictureFace({ type: "photo", imagePrompt: "A king seated on his throne in a torchlit hall" }, null), "AI istemindeki kral bir kişidir");
});

/* ---------------------------------------------------------------- kapılar */

const fp = G.sceneFp;
const face = (scene, extra = {}) => ({ scene, kind: "text_on_face", severity: "high", detail: "yazı yüzde", fix: "edit-text", ...extra });

test("ön izleme: yüzdeki yazıya önce 'text-low', sonra eski düzeltme, sonra durur — Lula'nın altı turluk 'other-style' döngüsü biter", () => {
  const title = clone(LULA[0]);
  const plan = (tried) => P.previewFixPlan([face(0)], [title], { fp, tried: tried ? new Map([[0, tried]]) : null }).patches.map((p) => p.fix);
  assert.deepEqual(plan(), ["text-low"]);
  assert.deepEqual(plan([{ kind: "text_on_face", fix: "text-low" }]), ["other-style"]);
  assert.deepEqual(plan([{ kind: "text_on_face", fix: "text-low" }, { kind: "text_on_face", fix: "other-style" }]), [], "basamaklar bitti: bildirilir, tur dönmez");
  // Kural zaten indirmişse ilk basamak yazının eski düzeltmesi.
  const lowKey = { ...clone(LULA[1]), textAt: "low" };
  assert.deepEqual(P.previewFixPlan([face(0)], [lowKey], { fp }).patches.map((p) => p.fix), ["clean-picture"]);
  // Taşan yazı eskisi gibi.
  assert.deepEqual(P.previewFixPlan([{ ...face(0), kind: "text_overflow" }], [title], { fp }).patches.map((p) => p.fix), ["other-style"]);
});

test("ön izleme: başkasının resmindeki ada 'drop-name' (AI notu değil); kendi arşiv resmi yeniden seçilir; adsız AI resmi eskisi gibi", () => {
  const people = A.peopleNames(CHERNOBYL_DIRECTED);
  const wrong = (scene) => ({ scene, kind: "wrong_face", severity: "medium", detail: "Ananenko'nun adı onlar olmayan kontrol odası çalışanlarının üzerinde", fix: "review" });
  // Çernobil sahne 12: önceki karenin resmi, satırın kendi imagePrompt'u kullanılmıyor.
  const held = { ...clone(CH_SCENES[1]), imagePrompt: "Medium shot of Soviet nuclear plant engineers at a control panel, different angle" };
  let p = P.previewFixPlan([wrong(0)], [held], { fp, people });
  assert.deepEqual([p.ai.length, p.patches.map((x) => x.fix)], [0, ["drop-name"]]);
  assert.equal(p.patches[0].say, fp(held));
  // Ad bilgisi olmasa da önceki karenin üstündeki yazı kalkar.
  assert.deepEqual(P.previewFixPlan([wrong(0)], [held], { fp }).patches.map((x) => x.fix), ["drop-name"]);
  // Bir kez: sürerse tekrar verilmez.
  assert.deepEqual(P.previewFixPlan([wrong(0)], [held], { fp, people, tried: new Map([[0, [{ kind: "wrong_face", fix: "drop-name" }]]]) }).patches, []);
  // Kendi AI resmindeki ad (vuruş): AI gerçek kişiyi çizemez → ad kalkar.
  p = P.previewFixPlan([wrong(0)], [clone(CH_SCENES[6])], { fp, people });
  assert.deepEqual([p.ai.length, p.patches.map((x) => x.fix)], [0, ["drop-name"]]);
  // Kendi arşiv fotoğrafındaki isim kartı: eskisi gibi yeniden seçim.
  p = P.previewFixPlan([{ ...wrong(0), fix: "repick" }], [clone(CH_SCENES[2])], { fp, people });
  assert.deepEqual([p.repick.map((x) => x.scene), p.patches.length], [[0], 0]);
  // Adsız, kendi AI resmi: istem anlatımla güçlenir (eski yol).
  p = P.previewFixPlan([wrong(0)], [{ type: "photo", say: "A man at a desk.", imagePrompt: "A man at a desk" }], { fp, people });
  assert.deepEqual([p.ai.length, p.patches.length], [1, 0]);
});

test("ön izleme (inceleme, 27 Ekim 2026): adsız yazıya 'drop-name' yok; AI notundaki anlatımda gerçek ad 'the person'", () => {
  const people = A.peopleNames(CHERNOBYL_DIRECTED);
  const wrong = { scene: 0, kind: "wrong_face", severity: "medium", detail: "anlatım Ananenko diyor, karede başka adamlar", fix: "review" };
  // Önceki karenin üstündeki adsız anahtar kelime: kalkması yanlış yüzü düzeltmez; AI notu da (istemi kullanılmıyor).
  const heldNoName = { type: "words", say: "The water was rising.", text: "The water was rising", keyword: "rising", textMode: "key", bg: "prev", imagePrompt: "Medium shot of engineers in a flooded corridor" };
  const p = P.previewFixPlan([wrong], [heldNoName], { fp, people });
  assert.deepEqual([p.patches.length, p.ai.length, p.repick.length], [0, 0, 0]);
  assert.deepEqual(P.previewFixPlan([wrong], [heldNoName], { fp }).patches.map((x) => x.fix), ["drop-name"], "kişiler bilinmiyorsa eski yol");
  // Lula 20261026-29db03 sahne 4: AI notu anlatımı istemin sonuna ekler — gerçek ad görüntü modeline gitmez.
  const lula = { type: "photo", say: "His opponent was Senator Flávio Bolsonaro, of the PL, Jair Bolsonaro's eldest son.", source: "archive", imagePrompt: "Medium shot of a middle-aged man in a suit speaking in a parliamentary chamber, soft overhead light" };
  const script = { cast: {}, scenes: [{ type: "photo", say: "On 25 October, Brazil re-elected Luiz Inácio Lula da Silva.", name: "Luiz Inácio Lula da Silva" }, lula] };
  const names = P.realNames(script);
  for (const n of ["Luiz Inácio Lula da Silva", "Flávio Bolsonaro"]) assert.ok(names.includes(n), `${n}: ${names}`);
  const mismatch = { scene: 0, kind: "mismatch", severity: "medium", detail: "x", fix: "review" };
  const ai = P.previewFixPlan([mismatch], [lula], { fp, names }).ai;
  assert.equal(ai[0].note, "it must plainly show what the narration says: His opponent was the person, of the PL, the person's eldest son.");
  assert.equal(P.aiNote({ say: "[warm] Lula, about to turn 81, followed the count in a São Paulo hotel." }, names), "it must plainly show what the narration says: The person, about to turn 81, followed the count in a São Paulo hotel.");
  assert.equal(P.aiNote({ say: "Turnout climbed to 80.79 percent." }, names), "it must plainly show what the narration says: Turnout climbed to 80.79 percent.", "adsız anlatım aynen (önbellek anahtarı)");
  // Bozuk kare notu da; ad listesi yoksa eskisi gibi.
  const broken = P.previewFixPlan([{ ...mismatch, kind: "broken", severity: "high" }], [{ ...lula, source: "ai" }], { fp, names }).ai;
  assert.doesNotMatch(broken[0].note, /Bolsonaro|Flávio/);
  assert.match(P.aiNote(lula), /Senator Flávio Bolsonaro/);
  // Cast anahtarı ve unvan: "Madoff" → the person; "Brazil's President Lula" → "Brazil's President the person".
  assert.equal(A.hideNames("On December 10, 2008, Madoff told his sons, Mark and Andrew, the truth.", ["madoff", "Mark", "Andrew"]), "On December 10, 2008, the person told his sons, the person and the person, the truth.");
  assert.equal(A.hideNames("Brazil's President Lula spoke on Monday.", names), "Brazil's President the person spoke on Monday.");
  assert.equal(A.hideNames("Israel's attorney general opened the file.", ["Benjamin Netanyahu", "Yair Golan"]), "Israel's attorney general opened the file.");
});

// İnceleme, 27 Ekim 2026 (2. tur): gerçek işlerin anlatımında hideNames ve sıradaki İsrail 2026 seçim videosu.
test("AI notu: cümle sınırı, kısaltma, tireli ad, cast anahtarı; ülke adı (Israel Katz) kişinin ad parçası değil", () => {
  // Suudi–Husi 20261011-3c27b1 sahne 12 / 169: cümle sonu dizinin sonudur.
  const husi = ["Donald Trump", "Turki al-Maliki", "Khalid"];
  assert.equal(A.hideNames("He asked for American strikes on the Houthis. Trump declined.", husi), "He asked for American strikes on the Houthis. The person declined.");
  assert.equal(A.hideNames("No reopening date for King Khalid. No word on the Turkey–Pakistan pact.", husi), "No reopening date for the person. No word on the Turkey–Pakistan pact.");
  // Sahne 76: "al-" önekli soyadı adın parçası ("the person al-Maliki" adın yarısını bırakıyordu).
  assert.equal(A.hideNames("Coalition spokesman Turki al-Maliki gave the opening figures.", husi), "Coalition spokesman the person gave the opening figures.");
  // Baş harf ve unvan kısaltması cümle bitirmez.
  assert.equal(A.hideNames("In 2008, Bernard L. Madoff confessed.", ["Bernard L. Madoff"]), "In 2008, the person confessed.");
  assert.equal(A.hideNames("Mr. Netanyahu spoke. Dr. Smith listened.", ["Benjamin Netanyahu"]), "The person spoke. Dr. Smith listened.");
  // Tireli ad: "Ben-Gvir", "Baharav-Miara" hiç eşleşmiyordu; "Ben-Gurion" Ben-Gvir değildir.
  const israel = ["Itamar Ben-Gvir", "Gali Baharav-Miara", "Benjamin Netanyahu", "Israel Katz", "Yair Golan"];
  assert.equal(A.hideNames("Ben-Gvir threatened to quit. Ben-Gurion Airport stayed open.", israel), "The person threatened to quit. Ben-Gurion Airport stayed open.");
  assert.equal(A.hideNames("Attorney General Baharav-Miara refused.", israel), "The person refused.");
  // Ülke adı Katz'ın ad parçası değil: "Israel" ülke olarak kalır, "Defense Minister Israel Katz" bütünüyle "the person".
  assert.equal(A.hideNames("Defense Minister Israel Katz ordered the strike. Israel held its breath.", israel), "The person ordered the strike. Israel held its breath.");
  assert.equal(A.hideNames("On Tuesday, Israel votes again. The IDF stayed in Gaza.", israel), "On Tuesday, Israel votes again. The IDF stayed in Gaza.");
  // IMF 20261015-3c14ff: cast anahtarı "imf_chief" her "IMF"yi "the person" yapıyordu; kısaltma ad değildir.
  assert.equal(A.hideNames("The IMF traced $1.4 trillion to a handful of AI deals.", ["imf_chief", "Kristalina Georgieva"]), "The IMF traced $1.4 trillion to a handful of AI deals.");
  assert.equal(A.hideNames("That is not an Israel Katz decision.", israel), "That is not a person decision.");
  // realNames cast anahtarını almaz (Macaristan 20261011-a5d8bf "student": "College Students" → "College the person");
  // anahtarın ad sözcüğü peopleNames'ten gelir.
  const hu = { cast: { nagy: "x", student: "y" }, realCast: ["nagy", "student", "Imre Nagy"], scenes: [{ type: "photo", say: "Nagy spoke. The Union of Hungarian University and College Students marched." }] };
  const huNames = P.realNames(hu);
  assert.ok(!huNames.includes("student") && huNames.includes("Imre Nagy"), JSON.stringify(huNames));
  assert.equal(P.aiNote(hu.scenes[0], huNames), "it must plainly show what the narration says: The person spoke. The Union of Hungarian University and College Students marched.");
  // Arşiv tarafı: "Israel Katz" isim kartı "ISRAEL" vuruşunu Katz'ın adı yapmaz; "israeli_voter" cast anahtarı kişi değil.
  const people = A.peopleNames({ cast: { israeli_voter: "Israeli woman in her thirties" }, scenes: [
    { type: "photo", say: "Defense Minister Israel Katz ordered the strike.", name: "Israel Katz" },
    { type: "slam", say: "Israel is split down the middle.", word: "ISRAEL" },
    { type: "photo", say: "Israeli voters queued for hours." },
  ] });
  assert.deepEqual(people.map((p) => [p.ad, p.parcalar]), [["Israel Katz", ["katz"]]]);
  assert.deepEqual(A.namesIn("ISRAEL", people), []);
  assert.deepEqual(A.namesIn("Israel Defense Forces soldiers 2023.jpg", people, { kunye: true }), []);
});

test("düzeltmeler: 'text-low' yazıyı indirir (derinlik katmanında değil), 'drop-name' adı kaldırır; kapı karesi textAt'i taşır", () => {
  assert.equal(G.applyFix(clone(LULA[0]), "text-low").textAt, "low");
  assert.equal(G.applyFix({ type: "slam", word: "X", image: "a.jpg" }, "text-low").textAt, "low");
  assert.equal(G.applyFix(clone(LULA[7]), "text-low").textAt, undefined);
  assert.equal(G.applyFix({ type: "photo", image: "a.jpg" }, "text-low").textAt, undefined);
  const photo = G.applyFix({ type: "photo", image: "a.jpg", name: "Borys Baranov", role: "r", caption: "c" }, "drop-name");
  assert.deepEqual([photo.name, photo.role, photo.caption, photo.image], [undefined, undefined, undefined, "a.jpg"]);
  assert.equal(G.applyFix(clone(CH_SCENES[1]), "drop-name").textMode, "none");
  const slam = G.applyFix(clone(CH_SCENES[6]), "drop-name");
  assert.deepEqual([slam.type, slam.textMode, slam.text, slam.word, slam.imagePrompt], ["words", "none", "BESPALOV", undefined, CH_SCENES[6].imagePrompt]);
  assert.ok(G.GATE_FIXES.includes("text-low") && G.GATE_FIXES.includes("drop-name"), "tasarım kapısının modeli de seçebilir");
  assert.match(G.gatePrompt({ title: "t" }, []).user, /text-low[^\n]*face/);
  // Kapının çizdiği senaryo şimdiki görünüm kararlarını (textAt dahil) taşır.
  const props = { scenes: [{ ...clone(LULA[0]), wordTimes: [], voiceDur: 3 }] };
  const eng = { scenes: [{ ...clone(LULA[0]), textAt: "low" }] };
  assert.equal(G.stillScript(props, eng).scenes[0].textAt, "low");
  // Patch kayıtları parmak iziyle uygulanır.
  const ed = G.applyGatePatches({ scenes: [clone(LULA[0])] }, [{ say: fp(LULA[0]), fix: "text-low" }]);
  assert.equal(ed.scenes[0].textAt, "low");
});

/* ---------------------------------------------------------------- motor ve bağlantı */

const SRC = fileURLToPath(new URL("../docu-engine/src/", import.meta.url));
const esbuild = createRequire(new URL("../docu-engine/package.json", import.meta.url))("esbuild");
// Gerçek: yazı stilleri ve motif altyazısının yerleşimi. Çizen her şey (remotion, react, fontlar, renk) vekil: modül
// düzeyindeki çağrılar (Easing.out(Easing.exp)) için her ad çağrılabilir, her alanı da yine vekil.
const REAL = new Set(["./looks/text.tsx", "./topic/caption.tsx"]);
const NAMES = ["jsx", "jsxs", "Fragment", "AbsoluteFill", "Easing", "interpolate", "random", "useCurrentFrame", "useVideoConfig", "spring", "FONT", "textLocale", "textWidth", "alpha", "contrast", "isLight", "lum", "mix", "readable", "ELITE", "morse", "MorseRow", "morseWidth", "motifPalette"];
const STUB = [
  "const deep = () => new Proxy(function () { return deep(); }, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : deep()) });",
  "export default deep();",
  `export const ${NAMES.map((n) => `${n} = deep()`).join(", ")};`,
  "export const LETTERBOX = 0.1, h01 = () => 0.3;",
].join("\n");
const built = await esbuild.build({
  stdin: { contents: "export { band, BAND_H, BAND_SLAM } from './looks/text.tsx'; export { captionPlace } from './topic/caption.tsx';", resolveDir: SRC, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (a.kind === "entry-point" || REAL.has(a.path) ? undefined : { path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
    },
  }],
});
const E = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

test("motor: yüzden inen blok alt üçte birde ve en çok karenin üçte biri; motif altyazısı yüzlü portrede üstte değil", () => {
  const g = { letterbox: false };
  const low = E.band("low", g, "center");
  assert.deepEqual([low.justifyContent, low.alignItems], ["flex-end", "center"]);
  assert.match(low.padding, /^0 0px \d+px 0px$/);
  const bottom = Number(low.padding.split(" ")[2].replace("px", ""));
  // Blok alt kenardan yukarı en çok BAND_H: üst kenarı karenin yarısından aşağıda (yüzler üst yarıda).
  assert.ok(1080 - bottom - E.BAND_H > 1080 * 0.5, `blok ${1080 - bottom - E.BAND_H}px'ten başlıyor`);
  assert.ok(E.BAND_SLAM < 260, "bantta vuruş bir boy küçük");
  assert.equal(E.band("top", g, "flex-start", 170).justifyContent, "flex-start");
  // Odaksız portrede altyazı eskiden "üst üçte bir"e gidiyordu; yüzlü resimde (textAt) alt banda.
  assert.equal(E.captionPlace({ type: "words" }, true, "s").band, "top");
  assert.equal(E.captionPlace({ type: "words", textAt: "low" }, true, "s").band, "bottom");
  assert.equal(E.captionPlace({ type: "words", textAt: "low", focus: [0.5, 0.8] }, true, "s").band, "bottom");
  const layered = { type: "words", layers: { box: [0.1, 0.1, 0.4, 0.9] } };
  assert.deepEqual(E.captionPlace({ ...layered, textAt: "low" }, true, "s"), E.captionPlace(layered, true, "s"), "derinlik kutusu: kendi kuralı");
  // Letterbox: blok çubuğun üstünde kalır.
  assert.ok(Number(E.band("low", { letterbox: true }, "center").padding.split(" ")[2].replace("px", "")) >= 0.1 * 1080 + 80);
});

test("bağlantı: sahneler textAt'i yazı stillerine verir, Nova kuralı her planda uygular ve kapıya kişileri verir", () => {
  const scenes = read("docu-engine/src/scenes.tsx");
  assert.ok(scenes.includes("const faceBand = ("), "scenes.tsx faceBand");
  assert.ok(scenes.includes("<StyledSlam ctx={textCtx(look, genre, scene.kicker, faceBand(scene))}"), "anahtar kelime kartı");
  assert.ok(scenes.includes("<StyledSlam ctx={textCtx(look, genre, undefined, at)}"), "vuruş");
  assert.ok(scenes.includes("<StyledTitle ctx={textCtx(look, genre, undefined, at)}"), "başlık");
  assert.ok(scenes.includes("ctx={textCtx(look, genre, scene.kicker, faceBand(scene))}"), "yazı kartı");
  assert.match(read("docu-engine/src/types.ts"), /textAt\?: 'low' \| 'top';/);
  const docu = read("src/pipeline/docu.js");
  const finish = docu.slice(docu.indexOf("const finishEngineDocu = async"), docu.indexOf("engineDocu = await finishEngineDocu(engineDocu, credits, { report: true })"));
  assert.ok(finish.includes("faceSafeText(ed.scenes, { credits: cr, people: peopleNames(directed)"), "son hazırlık kuralı uygular");
  assert.ok(finish.indexOf("applyPreviewPatches(ed, pv.patches") < finish.indexOf("faceSafeText("), "kapının yamalarından sonra");
  // Yama render (inceleme, 27 Ekim 2026): kuralla çizilmiş videoda kural aynen yeniden uygulanır — atlansaydı korunacak
  // parçalar eşleşmez, yeniden çizilir ve yazı yüze geri dönerdi; kuraldan önceki (bayraksız) eski videoya dokunulmaz.
  assert.ok(finish.includes("if (!patching || job.docuFaceSafe) {"), "yama render kuralla çizilmiş videoda kuralı yeniden uygular");
  assert.ok(finish.includes("if (!patching && !job.docuFaceSafe) { updateJob(jobId, { docuFaceSafe: true }); job.docuFaceSafe = true; }"), "ilk normal hazırlık işi işaretler");
  assert.ok(/previewGate\(\{[\s\S]{0,400}people: peopleNames\(directed\)/.test(docu), "kapı yönetmenin kişilerini alır");
  // İnceleme, 27 Ekim 2026: kural resmi değiştiren adımlardan sonra (kapanışın açılış fotoğrafına dönüşü); kapı ve
  // "AI'a düşen arşiv sahnesi" notu gerçek adları "the person" yapar.
  assert.ok(finish.indexOf("bookendClosing(ed, cr)") > 0 && finish.indexOf("bookendClosing(ed, cr)") < finish.indexOf("faceSafeText("), "kapanışın yeni resminden sonra");
  assert.ok(/previewGate\(\{[\s\S]{0,500}names: realNames\(directed\)/.test(docu), "kapı gerçek adları alır");
  assert.ok(docu.includes("allAi[at] = aiNote(engineDocu.scenes[f.scene], realNames(directed))"), "AI'a düşen arşiv sahnesinin notu");
  assert.ok(!docu.includes("it must plainly show what the narration says"), "anlatımı isteme docu.js kendisi eklemez");
});

test("denetim istemleri (inceleme, 27 Ekim 2026): yerin fotoğrafındaki ad wrong_face değil; anahtar kelime yazı görünen her modda söylenir", () => {
  // Hastings: Battle Abbey üstünde "WHERE HAROLD FELL" (doğru gerçek fotoğraf) "bir bina" sayılıp yeniden seçilebilirdi.
  const gate = G.gatePrompt({ title: "t" }, []).user;
  assert.doesNotMatch(gate, /a building/);
  assert.match(gate, /not that person \(other people, an AI-drawn stranger\)/);
  const qa = read("src/pipeline/docu-qa.js");
  assert.doesNotMatch(qa, /yabancılar, bir bina/);
  assert.match(qa, /İnsan göstermeyen bir yerin fotoğrafındaki ad \(ör\. Battle Abbey üstünde 'WHERE HAROLD FELL'\) wrong_face değildir/);
  // Çernobil sahne 12 textMode "full"dü: ipucu yalnızca "key"de adı söylüyordu.
  assert.match(qa, /s\.type === "words" && s\.textMode !== "none" && s\.keyword \? ` \(ekrandaki söz:/);
  assert.match(read("src/pipeline/docu-design-gate.js"), /s\.type === "words" && s\.textMode !== "none" && s\.keyword \? `key word/);
});
