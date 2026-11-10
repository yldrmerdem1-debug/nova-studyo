// SHORTS'TA DA YAZI YÜZDE DEĞİL, AD YALNIZCA O KİŞİNİN RESMİNDE (26 Ekim 2026 işleri; kare incelemesi 27 Ekim 2026).
//
// ÖLÇÜLEN KUSURLAR (uzun videonun aynı kusurları 1. turda düzeldi — docu-archive.js faceSafeText; Shorts değişmemişti):
//  - Lula Short 1 (20261026-29db03, short-202610260443): ekran yazısı "LULA: 51.78%" (üst etiket, \an8, 250-470 px)
//    6.4-9.8 sn'de Lula'nın resmî portresinde (arch-55d80b1f357a, baş karenin 0.07-0.51'i) alnının üstündeydi. Aynı
//    Short'ta kanca etiketi 1.85-5.35 sn'de ekran yazısıyla aynı yerde, üst üste basılıydı (iki ayrı katman).
//  - Çernobil Short 2 ve 3 (20261026-24122a, short-202610260833 / -0845): "AND BORYS BARANOV", "ENGINEERS, ANANENKO"
//    altyazıları kontrol odasındaki iki AI adamın (img-e312d23c0d1d) üstündeydi; Ananenko'nun kendi fotoğrafı
//    (arch-4ff13f535523, "Ананенко Олексій Михайлович (cropped).jpg") katalogdaydı.
//  - Shorts'un yeni AI görseli (newVerticalPicture) uzun videonun "sahte gazete yok / adı geçenin yüzü görünmez" kuralından
//    geçmiyordu (Çernobil "NTD THE BLENS" ön sayfası, Madoff'un oğullarının uydurma yüzleri uzun videodaydı).
// KURAL: üst etiket yüzü üst bantta olan resimde yüzün altına iner; kanca etiketi ekran yazısından sonra gelir; ekrandaki ad
// (açılış vuruşu, etiket, altyazı öbeği) yalnızca o kişinin resminde — değilse cümle kişinin kendi fotoğrafına geçer, o da
// yoksa ad yazısı düşer. Tetik soyadıdır: sıradaki İsrail seçim haberinde "Israel's attorney general" kimseyi silmez.
// Ağ, ücretli çağrı, render ve ffmpeg YOK: kurallar saf fonksiyonlar; motorun stillPrompt'u yerelden yüklenir.
// 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, parlaklık 52-56): gizleme eki artık "seen from behind
// or at a distance, face not visible" — "in silhouette" gerçek kişiyi siyah bir figüre çeviriyordu (produce.mjs HIDDEN_FACE).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shorts-yuz-isim-home-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const S = await import("../src/pipeline/docu-shorts.js");
const P = await import("../src/pipeline/docu-shorts-pictures.js");
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/** Word timings as speakTeaser gives them: `at` = character offset in the joined narration, 0.3 s a word from `t0`. */
function wordsOf(sentences, t0 = 0, step = 0.3) {
  const out = [];
  let at = 0;
  let t = t0;
  for (const s of sentences) {
    for (const w of s.split(" ")) {
      out.push({ w, s: +t.toFixed(2), e: +(t + step - 0.02).toFixed(2), at });
      at += w.length + 1;
      t += step;
    }
  }
  return out;
}
const caps = (ass) => ass.split("\n").filter((l) => /,Cap,/.test(l)).map((l) => l.replace(/\{[^}]*\}/g, "").split(",,").pop());
const hooks = (ass) => ass.split("\n").filter((l) => /,Hook,/.test(l));

/* ------------------------------------------------------------------------- Lula: etiket alında */

// pictures.json + docu-archive-done.json künyeleri ve props sahneleri, gerçek işten (20261026-29db03).
const LULA_SCRIPT = { scenes: [
  { type: "title", archived: true, search: "Lula da Silva Brasília Planalto Palace", image: "build/l/arch-55d80b1f357a.jpg", imgW: 1812, imgH: 2378, say: "He won Sunday's runoff." },
  { type: "photo", name: "Luiz Inácio Lula da Silva", focus: [0.53, 0.3], archived: true, search: "Lula da Silva portrait 2023 Brasília", image: "build/l/arch-62259a8b5d3b.jpg", depth: true, imgW: 1750, imgH: 2400, say: "Lula won." },
  { type: "photo", name: "Flávio Bolsonaro", archived: true, image: "build/l/arch-f3c3015de285.jpg", say: "His opponent was Senator Flávio Bolsonaro." },
] };
const harvester = { rel: "build/l/arch-376fe97f23e9.jpg", kind: "still", source: "real", srcW: 1880, srcH: 1056, box: { x: 0.39, y: 0.26, w: 0.22, h: 0.22 }, what: "Combine harvester cutting a soybean field from a drone angle, dust cloud rising behind it", credit: { eser: "Aerial view of a combine harvester working in a vast field" } };
const town = { rel: "build/l/arch-6c16f7a8b486.jpg", kind: "still", source: "real", srcW: 730, srcH: 1300, box: { x: 0.23, y: 0.63, w: 0.29, h: 0.12 }, what: "Aerial view at golden hour of a small town of tiled-roof houses beside a dark reservoir", credit: { eser: "Drone shot capturing farmland and townscape in Goiás" } };
const lulaSash = { rel: "build/l/arch-55d80b1f357a.jpg", kind: "still", source: "real", scene: 0, srcW: 1812, srcH: 2378, box: { x: 0, y: 0.05, w: 1, h: 0.95 }, what: "Portrait of a smiling older white-haired, bearded man in a dark blue suit, wearing a green and yellow sash with a gold national emblem, outdoors.", credit: { eser: "Foto oficial de Luiz Inácio Lula da Silva (ombros) denoise (cropped).jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Foto_oficial_de_Luiz_In%C3%A1cio_Lula_da_Silva_(ombros)_denoise_(cropped).jpg" } };
const LULA_PEOPLE = S.shortPeople([LULA_SCRIPT], []);
const lulaScene = (a) => (Number.isInteger(a?.scene) ? LULA_SCRIPT.scenes[a.scene] : null);

test("Lula Short 1: the screen text goes under Lula's face on his portrait, stays on top over the harvester and the town", () => {
  const f = S.shortFace(lulaSash, lulaScene(lulaSash), LULA_PEOPLE);
  assert.ok(f, "the official portrait shows a face (Commons title names Lula, the vision says portrait)");
  const segments = [harvester, town, lulaSash].map((a, k) => S.withFace({ rel: a.rel, srcW: a.srcW, srcH: a.srcH, box: a.box, what: a.what, beat: k }, a, lulaScene(a), LULA_PEOPLE));
  assert.deepEqual(segments.map((g) => !!g.face), [false, false, true]);
  assert.ok(segments[2].faceY < S.FACE_UPPER_Y, `Lula's face lands in the upper band (${segments[2].faceY})`);
  assert.equal(S.labelPlace(segments[2]), S.HOOK_UNDER_FACE_Y);
  assert.equal(S.labelPlace(segments[0]), null, "a harvester keeps the label on top");
  assert.ok(S.HOOK_UNDER_FACE_Y > 1920 * 0.51, "under the chin: the head reaches 0.51 of the frame in this portrait");
  const beats = [
    { say: "Goiás voted 59.", slam: "5966", asset: harvester },
    { say: "percent for Flávio Bolsonaro, yet Lula won Brazil's presidency by about 4.4", asset: town },
    { say: "4 million votes on 25 October.", asset: lulaSash },
    { say: "So how can a state vote that lopsided?", asset: harvester },
  ];
  const cuts = [0, 1.867, 6.4, 9.84, 13];
  const pictures = S.labelPictures({ segments: [...segments, { rel: harvester.rel }], beats, cuts, total: 16, people: LULA_PEOPLE, sceneOf: lulaScene });
  const words = wordsOf(beats.map((b) => b.say), 0.1, 0.45);
  const ass = S.buildTeaserAss({ words, hook: "GOIÁS VOTED FLÁVIO, LULA WON", slams: [{ text: "5966", s: 0.11, e: 1.85, beat: 0 }], hookFor: 3.5, voiceEnd: 15, total: 16, screen: { text: "LULA: 51.78%", s: 0, e: 9.84 }, pictures, people: LULA_PEOPLE });
  const h = hooks(ass);
  assert.ok(h.some((l) => /^Dialogue: 2,0:00:00\.00,0:00:06\.40,Hook,,0,0,0,,\{\\fscx118\\fscy118\}LULA: 51\.78%$/.test(l)), h.join("\n"));
  assert.ok(h.some((l) => /^Dialogue: 2,0:00:06\.40,0:00:09\.84,Hook,,0,0,1066,,\{\\fscx118\\fscy118\\fad\(0,200\)\}LULA: 51\.78%$/.test(l)), "over the portrait: under the face (MarginV, so libass still keeps it clear)");
  // The hook label waits for the screen text: they printed over each other at the top, 1.85-5.35 s.
  const hookLine = h.find((l) => l.startsWith("Dialogue: 1,"));
  assert.match(hookLine, /^Dialogue: 1,0:00:09\.84,0:00:13\.34,Hook,,0,0,0,,\{\\fad\(160,250\)\}GOIÁS VOTED FLÁVIO, LULA WON$/);
  assert.equal(h.filter((l) => l.startsWith("Dialogue: 1,")).length, 1);
  // Nothing else of the old label moved: without pictures the ASS is the old one, word for word.
  const old = S.buildTeaserAss({ words, hook: "GOIÁS VOTED FLÁVIO, LULA WON", slams: [{ text: "5966", s: 0.11, e: 1.85, beat: 0 }], hookFor: 3.5, voiceEnd: 15, total: 16, screen: { text: "LULA: 51.78%", s: 0, e: 9.84 } });
  assert.ok(old.includes("Dialogue: 1,0:00:01.85,0:00:05.35,Hook,,0,0,0,,{\\fad(160,250)}GOIÁS VOTED FLÁVIO, LULA WON"));
  assert.ok(old.includes("Dialogue: 2,0:00:00.00,0:00:09.84,Hook,,0,0,0,,{\\fscx118\\fscy118\\fad(0,200)}LULA: 51.78%"));
});

test("a moved label never jumps at every cut, steps aside for a figure said there, and never flashes for under a second", () => {
  const P1 = [
    { s: 0, e: 6.07, y: S.HOOK_UNDER_FACE_Y }, // rally crowd, faces high
    { s: 6.07, e: 7.2, y: S.HOOK_UNDER_FACE_Y }, // a man in a crowd
    { s: 7.2, e: 8.07, y: null }, // 0.9 s voting machine
    { s: 8.07, e: 12, y: S.HOOK_UNDER_FACE_Y }, // a family watching TV
  ];
  assert.deepEqual(S.labelPieces(0, 8.07, "FLÁVIO 50.46%", { pictures: P1 }), [{ s: 0, e: 8.07, y: S.HOOK_UNDER_FACE_Y }], "Lula Short 3: one place, no top-down-top-down");
  // A mid-frame slam on a short top picture keeps the label up there (a second or more: no flash).
  const P2 = [{ s: 0, e: 6, y: S.HOOK_UNDER_FACE_Y }, { s: 6, e: 7.1, y: null }, { s: 7.1, e: 12, y: S.HOOK_UNDER_FACE_Y }];
  assert.equal(S.labelPieces(0, 12, "X", { pictures: P2 }).length, 1);
  assert.deepEqual(S.labelPieces(0, 12, "X", { pictures: P2, slams: [{ s: 6, e: 7, low: false }] }).map((p) => p.y), [S.HOOK_UNDER_FACE_Y, null, S.HOOK_UNDER_FACE_Y]);
  assert.equal(S.labelPieces(0, 12, "X", { pictures: P2, slams: [{ s: 6, e: 7, low: true }] }).length, 1, "a lower-third slam leaves the place free");
  // The figure "26.30%" lands at 8.88 s: the label (8.07-8.88, 0.8 s) would only flash before it — left out.
  assert.deepEqual(S.labelPieces(8.07, 11.57, "BRAZIL'S ELECTION NIGHT FLIP", { pictures: P1, figures: [{ s: 8.88, e: 10.68 }] }), []);
  assert.deepEqual(S.labelPieces(8.07, 13, "X", { pictures: P1.slice(3).concat({ s: 12, e: 20, y: null }), figures: [{ s: 8.88, e: 10.68 }] }).map((p) => [p.s, p.e, p.y]), [[10.68, 13, S.HOOK_UNDER_FACE_Y]], "after the figure, down to the end (its last second on the next picture is no jump of its own)");
  // A sliver before a cut (1.85 s, cut at 1.867 s) is no jump of its own.
  assert.deepEqual(S.labelPieces(1.85, 5.35, "X", { pictures: [{ s: 0, e: 1.867, y: S.HOOK_UNDER_FACE_Y }, { s: 1.867, e: 6, y: null }] }), [{ s: 1.85, e: 5.35, y: null }]);
});

/* ----------------------------------------------------------- Çernobil: ad başkasının yüzünde */

const CH_SCRIPT = { scenes: [
  { type: "photo", name: "Oleksiy Ananenko", archived: true, image: "build/c/arch-4ff13f535523.jpg", say: "Their names were Oleksiy Ananenko, Valeriy Bespalov and Borys Baranov." },
  { type: "photo", name: "Borys Baranov", say: "Baranov lived until 2005." },
  { type: "photo", name: "Valeriy Bespalov", say: "Bespalov was a senior engineer." },
  { type: "photo", name: "Valery Legasov", archived: true, image: "build/c/arch-144c1faa633d.jpg", say: "Valery Legasov led the commission." },
] };
const CH_PEOPLE = S.shortPeople([CH_SCRIPT], ["Oleksiy Ananenko"]);
const chScene = (a) => (Number.isInteger(a?.scene) ? CH_SCRIPT.scenes[a.scene] : null);
const aiMen = { rel: "build/c/img-e312d23c0d1d.jpg", kind: "still", source: "ai", srcW: 1536, srcH: 1024, box: { x: 0, y: 0.25, w: 0.7, h: 0.7 }, what: "Two white-coated men in caps at a crowded control panel, one in glasses in the foreground, another writing", prompt: "Two Soviet engineers at the control panel of reactor 4, 1986" };
const ananenko = { rel: "build/c/arch-4ff13f535523.jpg", kind: "still", source: "real", scene: 0, srcW: 1842, srcH: 2458, quality: 3, modern: true, box: { x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, what: "Studio-style portrait of a middle-aged man with short dark hair and a dark jacket", credit: { eser: "Ананенко Олексій Михайлович (cropped).jpg", face: [0.5, 0.37] } };
const legasov = { rel: "build/c/arch-144c1faa633d.jpg", kind: "still", source: "real", scene: 3, srcW: 1200, srcH: 1600, quality: 4, box: { x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, what: "Black-and-white photo of a man in glasses and a peaked cap", credit: { eser: "Valery Legasov — IAEA 02790039 (5612537521).jpg", face: [0.53, 0.45] } };
const WHO = "So who were they? Plant engineers Oleksiy Ananenko, Valeriy Bespalov and Borys Baranov.";

test("Chernobyl Short 2: no name caption over the two AI men; their own photo when the catalogue has it", () => {
  assert.equal(S.shortIdentity(aiMen), "", "an AI picture is nobody by name");
  assert.ok(S.nameFace(aiMen), "two men at 'a crowded control panel' are faces, not a crowd");
  const opener = { say: "The Chernobyl suicide divers did not die within days.", slam: "NOT", asset: { rel: "build/c/cm-ff47cd524386.jpg", source: "real", what: "Black-and-white aerial view of the destroyed reactor building" } };
  const next = { say: "They wore wetsuits and carried lamps.", asset: { rel: "build/c/img-bc939537ca7f.jpg", source: "ai", what: "Three men in gas masks wading through water in a dim concrete tunnel" } };
  const run = (catalog) => {
    const beats = [opener, { say: WHO, person: "Oleksiy Ananenko", asset: aiMen }, next].map((b) => ({ ...b }));
    const logs = [];
    const rep = S.namesOnOwnPictures(beats, { catalog, people: CH_PEOPLE, sceneOf: chScene, year: 1986, logFn: (m) => logs.push(m) });
    const words = wordsOf(beats.map((b) => b.say), 0.1, 0.3);
    const cuts = [0, words[9].s, words[9 + WHO.split(" ").length].s];
    const segments = beats.map((b, k) => S.withFace({ rel: b.asset.rel, what: b.asset.what, srcW: b.asset.srcW, srcH: b.asset.srcH, box: b.asset.box, beat: k }, b.asset, chScene(b.asset), CH_PEOPLE));
    const pictures = S.labelPictures({ segments, beats, cuts, total: 20, people: CH_PEOPLE, sceneOf: chScene });
    const ass = S.buildTeaserAss({ words, hook: "CHERNOBYL'S SUICIDE DIVERS MYTH", slams: [{ text: "NOT", s: 1, e: cuts[1], beat: 0 }], hookFor: 3.5, voiceEnd: 19, total: 20, pictures, people: CH_PEOPLE, logFn: (m) => logs.push(m) });
    return { beats, rep, captions: caps(ass).join(" | "), logs };
  };
  // No photo of them: the names leave the captions, the rest stays; the narrator says them.
  const none = run([aiMen]);
  assert.equal(none.beats[1].asset, aiMen);
  assert.match(none.captions, /SO WHO WERE THEY\?/);
  assert.doesNotMatch(none.captions, /BARANOV|BESPALOV|ANANENKO|OLEKSIY/, none.captions);
  assert.ok(none.logs.some((m) => /altyazı öbeği adı başkasının yüzünde/.test(m)));
  // Ananenko's own Commons photo (Cyrillic title, later colour portrait): the sentence moves onto it — his name stays,
  // Bespalov's and Baranov's still leave (they are not on his photo). Legasov's photo is never taken for "Valeriy".
  const own = run([aiMen, legasov, ananenko]);
  assert.equal(own.beats[1].asset, ananenko);
  assert.deepEqual(own.rep.swapped.map((x) => x.who), ["Oleksiy Ananenko"]);
  assert.match(own.captions, /OLEKSIY/);
  assert.doesNotMatch(own.captions, /BARANOV|BESPALOV/, own.captions);
  assert.ok(own.logs.some((m) => /kendi fotoğrafına geçti \(arch-4ff13f535523\.jpg\)/.test(m)));
});

test("an opening slam naming someone over another face: their photo, else the slam goes", () => {
  const beats = () => [{ say: "Ananenko walked into the flooded basement first.", slam: "ANANENKO", asset: aiMen }, { say: "Nobody asked for volunteers.", asset: aiMen }];
  const a = beats();
  const rep = S.namesOnOwnPictures(a, { catalog: [aiMen], people: CH_PEOPLE, sceneOf: chScene });
  assert.equal(a[0].slam, "", "no photo of Ananenko: the slam is dropped");
  assert.deepEqual(rep.slams, [{ beat: 0, slam: "ANANENKO" }]);
  const b = beats();
  S.namesOnOwnPictures(b, { catalog: [aiMen, ananenko], people: CH_PEOPLE, sceneOf: chScene });
  assert.equal(b[0].asset, ananenko);
  assert.equal(b[0].slam, "ANANENKO", "on his own photo the slam stays");
  // A face-less picture under a name is nobody mislabelled: nothing changes.
  const c = [{ say: "Ananenko walked into the flooded basement first.", slam: "ANANENKO", asset: { rel: "x/arch-valve.jpg", source: "real", what: "Close-up of a rusted cast-iron valve wheel on a pipe" } }];
  S.namesOnOwnPictures(c, { catalog: [ananenko], people: CH_PEOPLE, sceneOf: chScene });
  assert.equal(c[0].slam, "ANANENKO");
  assert.equal(c[0].asset.rel, "x/arch-valve.jpg");
});

/* -------------------------------------------- sıradaki İsrail seçim haberi: yanlış alarm yok */

const IL_PEOPLE = S.shortPeople([{ scenes: [
  { type: "photo", name: "Benjamin Netanyahu" }, { type: "photo", name: "Yair Golan" }, { type: "photo", name: "Yair Lapid" }, { type: "photo", name: "Israel Katz" },
] }], []);
const netanyahu = { rel: "x/cm-netanyahu.jpg", source: "real", what: "Portrait of a grey-haired man in a dark suit at a podium", name: "Benjamin Netanyahu 2023" };
const lapid = { rel: "x/cm-lapid.jpg", source: "real", what: "Portrait of a man in a white shirt speaking", name: "Yair Lapid 2022" };

test("Israel election: a country is no first name, a surname is; a crowd is nobody", () => {
  assert.deepEqual(S.namedBy("Israel's attorney general warned the cabinet.", IL_PEOPLE), [], "Israel Katz is named by Katz only");
  assert.deepEqual(S.namedBy("ISRAEL VOTES AGAIN", IL_PEOPLE), []);
  assert.deepEqual(S.namedBy("Katz said no.", IL_PEOPLE).map((p) => p.ad), ["Israel Katz"]);
  // The planner's `person` counts as a full name only: "Houthis" is a group, never a name to hide.
  assert.deepEqual(S.shortPeople([], ["Houthis", "Yahya Saree", ""]).map((p) => p.ad), ["Yahya Saree"]);
  // Shared first name: "Yair Golan" over Lapid's photo is a name over someone else; "Yair Lapid" there is right.
  const golan = S.namedBy("Yair Golan leads the Democrats.", IL_PEOPLE);
  assert.deepEqual(S.notOnPicture("YAIR GOLAN LEADS", S.shortIdentity(lapid), golan).map((p) => p.ad), ["Yair Golan"]);
  assert.deepEqual(S.notOnPicture("YAIR LAPID LEADS", S.shortIdentity(lapid), S.namedBy("Yair Lapid leads.", IL_PEOPLE)), []);
  // Captions: the country stays over Netanyahu's photo, Golan's name does not.
  const beats = [{ say: "Israel's attorney general warned the cabinet on Sunday.", asset: netanyahu }, { say: "Then Yair Golan answered him on live television.", asset: lapid }];
  const words = wordsOf(beats.map((b) => b.say), 0.1, 0.4);
  const cuts = [0, words[8].s];
  const segments = beats.map((b) => S.withFace({ rel: b.asset.rel, what: b.asset.what }, b.asset, null, IL_PEOPLE));
  const pictures = S.labelPictures({ segments, beats, cuts, total: 10, people: IL_PEOPLE });
  const ass = S.buildTeaserAss({ words, hook: "NETANYAHU'S LAST ELECTION?", hookFor: 3.5, voiceEnd: 9, total: 10, pictures, people: IL_PEOPLE });
  const c = caps(ass).join(" | ");
  assert.match(c, /ISRAEL'S/);
  assert.doesNotMatch(c, /GOLAN/);
  // The label naming Netanyahu shows over his photo (under the face) and not over Lapid's.
  const h = hooks(ass);
  assert.deepEqual(h, ["Dialogue: 1,0:00:00.00,0:00:03.30,Hook,,0,0,1066,,{\\fad(160,0)}NETANYAHU'S LAST ELECTION?"]);
  // A rally crowd is nobody in particular: a name caption over it stays.
  const rally = { rel: "x/arch-rally.jpg", source: "real", what: "Night crowd at a rally, hands raised, holding flags", credit: { eser: "Supporters at a night rally waving flags" } };
  assert.ok(S.shortFace(rally), "for placement the crowd's faces count");
  assert.equal(S.nameFace(rally), false, "for a name it is no one's face");
  assert.equal(S.nameFace({ rel: "x/a.jpg", source: "real", what: "A man speaking to supporters at a rally" }), true, "one man at a rally is a face");
});

// İNCELEME (27 Ekim 2026): yer adındaki soyadı, aynı soyadlı aile, birleşik dosya adı — yanlış resim ya da gizlenen doğru ad.
test("review: the Golan Heights is no Yair Golan, Netanyahu is never Sara Netanyahu's photo, Irvingfisher.jpg is Irving Fisher", () => {
  const people = S.shortPeople([{ scenes: [
    { type: "photo", name: "Benjamin Netanyahu" }, { type: "photo", name: "Yair Golan" }, { type: "photo", name: "Yair Lapid" }, { type: "photo", name: "Sara Netanyahu" },
  ] }], []);
  assert.deepEqual(S.namedBy("Israel annexed the Golan Heights in 1981.", people), []);
  assert.deepEqual(S.namedBy("THE GOLAN HEIGHTS", people), []);
  assert.deepEqual(S.namedBy("The city gates opened at dawn.", S.shortPeople([{ scenes: [{ type: "photo", name: "Robert Gates" }] }], [])), [], "a lower-case word is no name");
  assert.deepEqual(S.namedBy("Golan told the rally he would win.", people).map((p) => p.ad), ["Yair Golan"]);
  const soldiers = { rel: "x/img-soldiers.jpg", source: "ai", what: "Two Israeli soldiers in helmets on a ridge, one looking at the camera" };
  const golan = { rel: "x/cm-golan.jpg", source: "real", quality: 4, srcW: 1200, srcH: 1600, what: "Portrait of a grey-haired man in a dark suit", name: "Yair Golan 2023" };
  const bibi = { rel: "x/cm-bibi.jpg", source: "real", quality: 3, srcW: 1200, srcH: 1600, what: "Portrait of a grey-haired man at a podium", name: "Benjamin Netanyahu 2023" };
  const sara = { rel: "x/cm-sara.jpg", source: "real", quality: 5, srcW: 1200, srcH: 1600, what: "Portrait of a blonde woman smiling", name: "Sara Netanyahu 2019" };
  const lapid = { rel: "x/cm-lapid.jpg", source: "real", quality: 4, srcW: 1200, srcH: 1600, what: "Portrait of a man in a white shirt speaking", name: "Yair Lapid 2022" };
  const beats = [
    { say: "Israel annexed the Golan Heights in 1981.", slam: "GOLAN", asset: soldiers },
    { say: "Israeli troops dug in on the Golan.", asset: soldiers },
    { say: "Netanyahu answered on live television.", person: "Benjamin Netanyahu", asset: lapid },
  ];
  const rep = S.namesOnOwnPictures(beats, { catalog: [soldiers, golan, bibi, sara, lapid], people });
  assert.deepEqual(beats.map((b) => b.asset.rel), ["x/img-soldiers.jpg", "x/img-soldiers.jpg", "x/cm-bibi.jpg"], "a place keeps its picture; the man's own photo, never his wife's");
  assert.equal(beats[0].slam, "GOLAN");
  assert.deepEqual(rep.swapped.map((x) => x.who), ["Benjamin Netanyahu"]);
  // Crash of 1929 (20260930-70cef2): his own portrait under a run-together Commons name stays, and so does his name.
  const fpeople = S.shortPeople([{ scenes: [{ type: "photo", name: "Irving Fisher" }] }], []);
  const solo = { rel: "x/arch-95a8fdc500e5.jpg", source: "real", what: "Smiling elderly man with white mustache and goatee, light suit and tie", credit: { eser: "Irvingfisher.jpg" } };
  const withSon = { rel: "x/arch-368a25c1ba6e.jpg", source: "real", quality: 5, what: "Two smiling men in suits", credit: { eser: "Prof. Irving Fisher of Yale, & son Irving - photo. by Bain News Service" } };
  const fb = [{ say: "Economist Irving Fisher answers: stocks have reached a permanently high plateau.", asset: solo }];
  S.namesOnOwnPictures(fb, { catalog: [solo, withSon], people: fpeople });
  assert.equal(fb[0].asset, solo);
  assert.deepEqual(S.notOnPicture("ECONOMIST IRVING FISHER ANSWERS", S.shortIdentity(solo), fpeople), []);
});

test("review: a figure said under a face takes the label's place for a while, never the label away (no 1 s flash, no vanished label)", () => {
  // Constantinople Short (20261002-508aca): the label 4.92-8.42 under a face, the figure "1,123" 5.59-7.39 there — the label
  // kept 1.03 s and popped in after the figure. Lula Short 3 (20261026-29db03): the label lost all of its 3.5 s.
  const pictures = [{ s: 0, e: 4.5, y: null, face: false, identity: "", named: [] }, { s: 4.5, e: 14, y: S.HOOK_UNDER_FACE_Y, face: true, identity: "", named: [] }];
  const words = wordsOf(["A chain. A cannon. And a sultan of twenty-one.", "For eleven hundred and twenty-three years no army had ever broken through the walls of the city at all."], 0.2, 0.32);
  const ass = S.buildTeaserAss({ words, hook: "SHIPS THAT CROSSED A HILL", slams: [{ text: "TWENTY-ONE", s: 4, e: 4.92, beat: 0 }], figures: [{ text: "1,123", s: 5.59, e: 7.39 }], hookFor: 3.5, voiceEnd: 13, total: 16, pictures, people: [] });
  const h = hooks(ass).filter((l) => l.startsWith("Dialogue: 1,"));
  assert.deepEqual(h, ["Dialogue: 1,0:00:07.39,0:00:10.89,Hook,,0,0,1066,,{\\fad(160,250)}SHIPS THAT CROSSED A HILL"], h.join("\n"));
});

test("lowOverFaces also takes the long video's face rule (a Commons title naming one of the story's people)", () => {
  const a = { rel: "x/cm-1.jpg", source: "real", what: "Black and white photo of a stage with a microphone", name: "Jim Bakker 1977" };
  const people = S.shortPeople([{ scenes: [{ type: "photo", name: "Jim Bakker" }] }], []);
  const g = S.withFace({ rel: a.rel, what: a.what }, a, null, people);
  assert.equal(g.face, true);
  assert.deepEqual(S.lowOverFaces([{ text: "BAKKER", s: 0, e: 1, beat: 0 }], [g], [{}]).map((m) => !!m.low), [true]);
  assert.equal(S.shortFace({ rel: "x/img-1.jpg", source: "ai", generated: true, what: "Empty hotel corridor, no people" }), null);
});

/* ------------------------------------------------------- yeni dikey AI görseli: motorun kuralı */

test("a new vertical picture asks the engine's still prompt: no fake newspaper, a named person's face hidden, the rest word for word", async () => {
  const tabloid = await P.verticalPicturePrompt("Close-up of a 1980s tabloid front page on a newsstand, bold black headline type blurred", { style: "Era-accurate scene of 1986." });
  assert.match(tabloid, /^Close-up of a stack of folded 1980s newspapers on a newsstand, the print out of focus, no readable text, no masthead/);
  assert.doesNotMatch(tabloid, /front page|headline type/);
  const sons = await P.verticalPicturePrompt("Medium shot of two men in their forties in business suits standing in a Manhattan office corridor, serious faces", { named: ["Mark Madoff"] });
  assert.match(sons, /seen from behind or at a distance, face not visible/);
  assert.doesNotMatch(sons, /serious faces/);
  const plain = "Soviet-era apartment block courtyard in Kyiv at dusk, warm lit windows, bare trees, 1980s film photo";
  assert.equal(await P.verticalPicturePrompt(plain, { style: "Era-accurate scene of 1986.", named: ["Borys Baranov"] }),
    `${plain}. Era-accurate scene of 1986. Vertical 9:16 composition, the subject large in the frame, cinematic natural light, photographic detail, no text, no captions, no borders.`, "nobody shown, nothing printed: the request as before");
  // fillBeatPictures hands the sentence's real people (surname-named and the planner's person) to the picture maker.
  const got = [];
  const beats = [{ say: "Borys Baranov died of a heart attack in Kyiv in 2005.", newPrompt: plain }, { say: "Nobody was there.", newPrompt: "an empty street", person: "Oleksiy Ananenko" }];
  await S.fillBeatPictures({ beats, catalog: [], settings: { openaiKey: "test" }, dir: os.tmpdir(), people: CH_PEOPLE, newPicture: async (o) => { got.push(o.named); return path.join(os.tmpdir(), "x.jpg"); } });
  assert.deepEqual(got, [["Borys Baranov"], ["Oleksiy Ananenko"]]);
});

test("wiring: makePictureTeaser runs the name rule and hands the pictures to the ASS; the engine is loaded at run time", () => {
  const src = read("src/pipeline/docu-shorts.js");
  assert.match(src, /import \{ adNorm, namesIn, peopleNames, pictureFace \} from "\.\/docu-archive\.js";/);
  assert.match(src, /const people = shortPeople\(\[filmScript, writerScript\], plan\.beats\.map\(\(b\) => b\.person\)\);/);
  // 29 Ekim 2026: çağrı arşivin siyah-beyazlığını da taşır (mono, archiveIsMono) — yeni görsel ancak o zaman siyah-beyaz.
  assert.match(src, /fillBeatPictures\(\{ beats: plan\.beats, catalog, year, settings, genre: job\.docuGenre, mono, dir, newPicture, people, logFn \}\)/);
  assert.match(src, /const nameFixes = namesOnOwnPictures\(plan\.beats, \{ catalog, people, sceneOf, year, logFn \}\);/);
  assert.match(src, /return withFace\(g, a, sceneOf\(a\), people\);/);
  assert.match(src, /const pictures = labelPictures\(\{ segments, beats: plan\.beats, cuts: cutsAt, total, people, sceneOf, underHook \}\);/);
  assert.match(src, /buildTeaserAss\(\{ words, hook: plan\.hook, slams, figures, hookFor: 3\.5, voiceEnd: voiceEnd \+ 0\.45, total, look, screen, pictures, people, logFn \}\)/);
  // The slams are taken after the name rule (a dropped slam is gone from the timing too).
  assert.ok(src.indexOf("namesOnOwnPictures(plan.beats") < src.indexOf("lowOverFaces(snapSlams(slamTimes(plan.beats"));
  const pics = read("src/pipeline/docu-shorts-pictures.js");
  assert.match(pics, /const full = await verticalPicturePrompt\(prompt, \{ style, named \}\);/);
  assert.doesNotMatch(pics, /^import[^;]*docu-engine/m, "never a static import of the engine: it lives outside app.asar");
  assert.match(pics, /process\.resourcesPath && path\.join\(process\.resourcesPath, "docu-engine", "lib", "produce\.mjs"\)/);
});
