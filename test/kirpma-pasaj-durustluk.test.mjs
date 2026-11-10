// KOD KIRPMASI PASAJI SİLMEZ, DÜRÜSTLÜK KAYDINI VE BÖLÜNMÜŞ CÜMLEYİ KESMEZ (25 Ekim 2026 gözden geçirme).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 20261024-373aaf / 20261020-37f9d2 / 20261024-950730 / 20261018-8a1eca): uzunluk kuralının
//   kod kırpması (docu-editor-pass.js trimToWords) bu işlerin gerçek docu-script.json'larında 1742 kelimelik tavana
//   denendi (salt okuma). Denizaltı: aktif/pasif sonar anlatımının beş satırı #39-43 art arda düştü ve canlandırma notu
//   #59 "No camera recorded it, so this is a reconstruction…" kesildi; #61 "Like two people edging…" benzetmesinin
//   dayandığı #60 gitti. Fransa isyanları: kanıt kaydı #96 "No independent evidence has been made public…" ve bölünmüş
//   cümlenin yarısı #28 "a fourteen-year-old boy was hit in the face." (#27 harita satırı "…north-west of Paris," yarım
//   kaldı), #36 "…a second target:" düştü. Kartal Yuvası #56 "to clear indications." düştü (#55 yarım cümle). Fransa borcu
//   #131-133 art arda, #128'deki sorunun cevabıyla birlikte gitti. Ayrıca kılavuz ayrıştırıcısı metindeki İLK "N-M
//   minutes"u videonun süresi sanıyordu: "Hook in the first 1-2 minutes. Target 11-13 minutes." 2 dk tavan → 12 dk'lık
//   senaryo uzun video tabanına kırpılırdı.
// 2. gözden geçirme (25 Ekim 2026): vuruş ve tema cümleleri olgusuz diye ilk kesilenlerdendi — denizaltı #52 "No sound to
//   hear. No route to check. No warning.", #106 "Undetectable is the whole job description of a missile submarine.";
//   Fransa borcu #109 "…the answer landed. No downgrade." "yeni olgu yok" diye düşüyordu. Editörün çıkarmak isteyip
//   çıkarma sınırına takılan satırları da kodun kırpması hiç görmüyordu.
// Ağ YOK, model YOK: saf işlevler.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kirpma-pasaj-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const DS = await import("../src/pipeline/docu-script.js");
const P = await import("../src/pipeline/docu-editor-pass.js");

/** Her biri yeni bir yıl ve sayı taşıyan dolgu satırı (tier 3 — en son kırpılır). */
const fact = (ch, k) => `In ${1950 + ch * 20 + k} the harbour log at Brest counted ${ch * 100 + k + 3} ships.`;
/** Kanca bölümü (korunur), test satırları ortada, son bölüm (korunur). */
function script(middle) {
  const sc = [];
  const add = (chapter, say, type = "photo") => sc.push({ type, chapter, say: `[serious] ${say}`, dur: 3 });
  for (let k = 0; k < 14; k++) add(0, fact(0, k));
  middle.forEach((lines, c) => {
    add(c + 1, fact(c + 1, 0));
    for (const l of lines) add(c + 1, typeof l === "string" ? l : l.say, l.type);
    add(c + 1, fact(c + 1, 1));
  });
  const last = middle.length + 1;
  add(last, fact(last, 0));
  add(last, fact(last, 1));
  return sc;
}
const clean = (s) => DS.stripTags(s.say);
const offered = (scenes) => new Set(P.trimCandidates(scenes).map((c) => clean(scenes[c.scene])));

const HONEST = [
  "No camera recorded it, so this is a reconstruction, built only from what was later reported.", // 373aaf #59
  "No independent evidence has been made public tying the destruction to the ultra-left.", // 37f9d2 #96
  "A protester there lost a hand. An investigation has been opened, and the cause has not been established.", // 37f9d2 #76
  "Reuters reported it; it has not been confirmed.", // growth-lessons honestyLines
  "The Houthis deny it.", // growth-lessons honestyLines
  "And that is the part we still don't know.",
];

test("honesty and evidence lines are never offered for the code's cut; plain commentary still is", () => {
  const plain = "And the quiet story kept on moving all through the long and grey year.";
  const scenes = script([HONEST.flatMap((h) => ["The night was cold and the sea was rough.", h]), [plain, "The harbour waited for the morning."]]);
  const o = offered(scenes);
  for (const h of HONEST) assert.ok(!o.has(h), h);
  assert.ok(o.has(plain), "fact-free commentary stays a candidate");
});

test("a sentence split over two scenes: neither half is offered, a whole sentence next to them is", () => {
  const scenes = script([
    [
      "Police were sent to break up blockades, and teenagers began to be detained.",
      { type: "map", say: "Then, at the end of September, in Val-d'Oise, north-west of Paris," }, // 37f9d2 #27-28
      "a fourteen-year-old boy was hit in the face.",
      "Reports say it was a tear gas grenade.",
      "For many students, the anger now had a second target:", // 37f9d2 #36-37
      "not just the classrooms, but the police at the gates.",
      "France has seen a police injury spark far bigger unrest before.",
      "In less than a day, the official wording went from subject of the investigation", // 950730 #55-56
      "to clear indications.",
      "The morning wording placed a man on a road.",
    ],
  ]);
  const o = offered(scenes);
  for (const half of ["a fourteen-year-old boy was hit in the face.", "For many students, the anger now had a second target:", "not just the classrooms, but the police at the gates.", "In less than a day, the official wording went from subject of the investigation", "to clear indications."]) assert.ok(!o.has(half), half);
  assert.ok(o.has("France has seen a police injury spark far bigger unrest before."));
  // Kırpma ne kadar derin olursa olsun yarım cümle bırakmaz.
  const cut = P.trimToWords(scenes, 1, { minWords: 0 });
  const left = scenes.map(clean);
  assert.ok(cut.dropped.length > 0);
  for (let i = 0; i < left.length - 1; i++) if (!/[.!?…]["”’)]*$/u.test(left[i])) assert.equal(left[i + 1], { "Then, at the end of September, in Val-d'Oise, north-west of Paris,": "a fourteen-year-old boy was hit in the face.", "For many students, the anger now had a second target:": "not just the classrooms, but the police at the gates.", "In less than a day, the official wording went from subject of the investigation": "to clear indications." }[left[i]], left[i]);
});

// 373aaf #36-46: the active/passive sonar explanation.
const SONAR = [
  "A submarine on a deterrent patrol does something strange for a warship.",
  "Vanguard and Le Triomphant both carried active sonar, which sends out a ping and listens for the echo.",
  "Like a torch in a dark room, it lights everything and reveals whoever holds it.",
  "For a missile submarine, being found defeats the whole point.",
  "So on operational patrol, these boats never switch the torch on.",
  "They listen with passive sonar only, hearing what others emit and transmitting nothing.",
  "That catches a noisy trawler easily, but not something built to make no noise.",
  "And Vanguard and Le Triomphant, each carrying sixteen ballistic missiles, were built above all to be silent.",
  "Both boats were submerged, and both were moving at very low speed.", // 373aaf #60-61
  "Like two people edging through a pitch-black house, each holding their breath.",
  "The Daily Telegraph reported that the crew saw nothing and heard nothing beforehand.",
];

test("a deep cut thins a passage, never deletes it: no two neighbouring lines go, an analogy keeps the line it leans on", () => {
  const scenes = script([SONAR, [fact(9, 1), fact(9, 2), fact(9, 3), fact(9, 4)]]);
  const before = scenes.map(clean);
  const total = scenes.reduce((n, s) => n + DS.countWords(s.say), 0);
  const cut = P.trimToWords(scenes, total - 120, { minWords: 0 });
  const gone = cut.dropped.map((d) => d.scene).sort((a, b) => a - b);
  assert.ok(gone.length >= 4, JSON.stringify(cut.dropped));
  for (let k = 1; k < gone.length; k++) assert.ok(gone[k] - gone[k - 1] > 1, `#${gone[k - 1]} and #${gone[k]} are neighbours`);
  const kept = new Set(scenes.map(clean));
  assert.ok(SONAR.filter((l) => kept.has(l)).length >= Math.ceil(SONAR.length / 2), "the passage keeps at least half its lines");
  assert.ok(kept.has(SONAR[8]) || !kept.has(SONAR[9]), "the analogy never loses the line it leans on");
  assert.ok(kept.has(SONAR[1]), "'Like a torch…' leans on the active-sonar line");
  assert.equal(scenes.length, before.length - gone.length);
});

/* ---------------------------------------------------------------- the editor's floor in a normal script */
const targetOf = (o) => Number(/toplam (\d+) kelime anlatım/.exec(o.user)?.[1] || 100);
/** sure-tavani-kirpma'daki sahte modelin kısası: bölümler tam hedefte, son okuma `drop(user)` satırlarını çıkarır. */
function fakeModel(drop) {
  return async (o) => {
    if (o.schema?.properties?.edits) return { edits: drop(o.user).map((scene) => ({ scene, action: "drop", kind: "retold", reason: "tekrar" })) };
    if (o.schema?.properties?.patches) return { verdict: "", promise: "", patches: [] };
    if (!o.schema?.properties?.scenes) {
      const n = Number(o.user.match(/TAM (\d+) bölüm/)[1]);
      return {
        title: "Sahte Belgesel", genre: "documentary", visualStyle: "Grainy film photograph.", centralQuestion: "Neden?", stakes: "Her şey.", promise: "Cevabı göreceğiz.", hookWord: "anahtar",
        openLoops: [{ text: "Kim?", setupChapter: 1, payoffChapter: n }, { text: "Nasıl?", setupChapter: 2, payoffChapter: n }],
        cast: [{ key: "hasan_usta", description: "a man in his 40s" }],
        chapters: Array.from({ length: n }, (_, i) => ({ title: `Bölüm ${i + 1}`, goal: "g", covers: [`olgu ${i}`], hookIn: "h", turn: "t", cliffhanger: "c", intensity: i === 0 ? 5 : 2, midpoint: i === 2 })),
      };
    }
    const i = Number(o.user.match(/BÖLÜM (\d+)\/\d+/)[1]) - 1;
    const scenes = i === 0
      ? [{ type: "montage", mood: "tension", say: "[whispers] Bir anahtar... bir dolap.", dur: 4, imagePrompts: [1, 2, 3, 4, 5].map((k) => ({ prompt: `macro ${k}`, cast: [] })), text: "anahtar dolap", source: "ai" },
        { type: "title", mood: "tension", say: "[curious] Kilitli dolabın hikâyesi.", dur: 3, title: "Kilitli Dolap", kicker: "Bir", imagePrompt: "the man at the door", cast: ["hasan_usta"], source: "ai" }]
      : [];
    let left = targetOf(o) - scenes.reduce((n, s) => n + DS.countWords(s.say), 0);
    for (let k = 0; left > 0; k++) {
      const n = Math.min(10, left);
      scenes.push({ type: "photo", mood: "tension", say: `[serious] ${Array.from({ length: n }, (_, j) => `kelime${j}`).join(" ")}.`, dur: 3, imagePrompt: `chapter ${i} unique shot number ${k}`, source: "ai" });
      left -= n;
    }
    return { scenes };
  };
}

test("normal case: a 10-minute script on its plan keeps the editor's old floor (90% of the plan); its drops go through", async () => {
  const job = { id: "j-floor", topic: "Kilitli dolap", durationPreset: "uzunformat", language: "tr", docuSource: "ai" };
  const plan = DS.docuPlan(job);
  // The long-video floor of a 10-minute request is its own plan: as the editor's floor it blocked every drop.
  assert.equal(DS.lengthLimits(job, plan).minWords, plan.words);
  const logs = [];
  const drop = (user) => [...user.matchAll(/^#(\d+) \[[^\]]+\] \[photo\] \(bölüm 3\)/gm)].map((m) => +m[1]).filter((_, k) => k === 2 || k === 5);
  const script = await DS.runDocuScript(job, "araştırma", {}, (m) => logs.push(m), { llm: fakeModel(drop), hookDir: process.env.NOVA_HOME });
  assert.ok(!logs.some((m) => /^Senaryo uzun/.test(m)), "not over the cap");
  assert.ok(logs.some((m) => /^Son okuma: 2 düzeltme —/.test(m)), logs.join("\n"));
  assert.ok(script.stats.actualWords < plan.words && script.stats.actualWords >= Math.round(plan.words * 0.9), `${script.stats.actualWords}`);
});

test("guidance: a part's length (first minutes, per chapter, the hook) is not the video's cap", () => {
  assert.deepEqual(DS.guidanceMinutes("Hook in the first 1-2 minutes. Target 11-13 minutes."), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("Bölüm başına 2-3 dakika, toplam 11-13 dakika"), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("Opening: 1-2 minutes, then 10-12 minutes of story"), { min: 10, max: 12 });
  for (const g of ["Chapters of 2-3 minutes each", "2-3 minutes per chapter", "keep the hook under 1 min", "her bölüm en çok 2 dk"]) assert.equal(DS.guidanceMinutes(g), null, g);
  // The real guidances are read as before.
  assert.deepEqual(DS.guidanceMinutes("News explainer; target 11-13 minutes"), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("Each chapter gets a chart, target 11-13 minutes total"), { min: 11, max: 13 });
  // France with a per-chapter range: the plan's cap (no cut on plan), not the 1,700-word floor.
  const france = { language: "en", durationPreset: "detayli", guidance: "Finance explainer, 2-3 minutes per chapter." };
  const lim = DS.lengthLimits(france, DS.docuPlan(france));
  assert.equal(lim.from, "plan");
  assert.ok(lim.maxWords >= DS.docuPlan(france).words, JSON.stringify(lim));
});

/* ---------------------------------------------------------------- punch and thesis lines; the editor's marks */
const PUNCHES = [
  "No sound to hear. No route to check. No warning.", // 373aaf #52
  "Undetectable is the whole job description of a missile submarine.", // 373aaf #106
  "But undetectable was not the defence. It was the cause.", // 373aaf #107
  "Like a torch in a dark room, it lights everything and reveals whoever holds it.", // 373aaf #39
  "The replies read like a bank statement blacked out except for the balance.", // 373aaf #131
  "But that's a scale, not a bill. Nobody gets an invoice in the post.", // 48ae2d #23
  "Then, late that Friday night, the answer landed. No downgrade.", // 48ae2d #109 (a fact line: "Friday")
  "So crews weren't arriving at a fire just starting. They were arriving at a building already lost.", // 950730 #19
  "Being on that road was a fact. Being responsible for the fire was something else entirely.", // 950730 #49
  "Finding mines is slow work, closer to archaeology than combat.", // 8a1eca #66
  "A sonar can report what it saw, not what it missed.", // 8a1eca #76
  "Every quote, every freight rate and every barrel is now waiting on the same opening bell.", // 8a1eca #140
  "It's less one match on dry grass than several fires lit at once.", // 37f9d2 #137
];
const PLAIN = [
  "Then he asked viewers to think about the size of the ocean.", // 373aaf #103
  "Above, the press would later say, there was heavy sea and darkness.", // 373aaf #55
  "But the government's account of the violence is not the only one.", // 37f9d2 #95
  "Unions claimed more than 800,000.", // a quantity, not a comparison
  "And here's where it gets uncomfortable.", // template bridge: no punch protection
];

test("punch and thesis lines are never the code's own pick (fact-free or not); plain commentary and bridges still are", () => {
  const scenes = script([PUNCHES.flatMap((p) => ["The night was cold and the sea was rough.", p]), PLAIN.flatMap((p) => ["The harbour waited for the morning.", p])]);
  const o = offered(scenes);
  for (const p of PUNCHES) assert.ok(!o.has(p), p);
  for (const p of PLAIN) assert.ok(o.has(p), p);
  // A cut as deep as it goes leaves every one of them.
  P.trimToWords(scenes, 1, { minWords: 0 });
  const left = new Set(scenes.map(clean));
  for (const p of PUNCHES) assert.ok(left.has(p), p);
});

test("the editor's marked lines (prefer) go first, flagged marked; a marked punch line still stays", () => {
  const plain = "And the quiet story kept on moving all through the long and grey year.";
  const ships = "In 1999 the harbour log at Brest counted 77 ships.";
  const mk = () => script([[plain, "The harbour waited for the morning.", ships, "The night was cold and the sea was rough.", PUNCHES[0], "The tide turned slowly that night."]]);
  const total = (sc) => sc.reduce((n, s) => n + DS.countWords(s.say), 0);
  // No marks: a fact-free line goes (the longest fact-free run first), never the new fact.
  const a = mk();
  const own = P.trimToWords(a, total(a) - 5, { minWords: 0 }).dropped;
  assert.equal(own.length, 1);
  assert.ok(own[0].say !== ships && !own[0].marked, JSON.stringify(own));
  // The editor wanted the new-fact line gone: it goes first, even though the code ranks it last.
  const b = mk();
  const cut = P.trimToWords(b, total(b) - 5, { minWords: 0, prefer: [b.find((s) => clean(s) === ships)] });
  assert.deepEqual(cut.dropped.map((d) => [d.say, d.marked]), [[ships, true]]);
  assert.ok(b.some((s) => clean(s) === plain) && b.some((s) => clean(s) === own[0].say));
  // A marked punch line is still not the code's to cut: the code's own pick goes instead.
  const c = mk();
  const cut2 = P.trimToWords(c, total(c) - 5, { minWords: 0, prefer: [c.find((s) => clean(s) === PUNCHES[0])] });
  assert.deepEqual(cut2.dropped.map((d) => d.say), own.map((d) => d.say));
  assert.ok(c.some((s) => clean(s) === PUNCHES[0]));
});

test("editorialPass hands back the drops it could not apply (over the drop cap or the word floor) as scene objects", async () => {
  const lines = (n) => Array.from({ length: n }, (_, k) => ({ type: "photo", chapter: Math.floor(k / 8), say: `[serious] ${fact(1, k)}`, dur: 3 }));
  const scenes = lines(40);
  const drops = Array.from({ length: 30 }, (_, k) => ({ scene: 2 + k, action: "drop", kind: "retold", reason: "uzunluk" }));
  const want = drops.map((d) => scenes[d.scene]);
  const out = await P.editorialPass({ scenes, research: "r", job: { language: "en" }, llm: async () => ({ edits: drops }), minWords: 0, maxWords: 100 });
  assert.equal(out.applied.length, 25);
  assert.deepEqual(out.spare, want.slice(25), "the five over the 25-drop cap, still in the script");
  assert.ok(out.spare.every((s) => scenes.includes(s)));
  assert.ok(out.rejected.every((e) => e.spare === true && /en çok 25 çıkarma/.test(e.why)));
  // A drop refused as a protection (the opening, an audience ask) is not a mark.
  const s2 = lines(20);
  const out2 = await P.editorialPass({ scenes: s2, research: "r", job: { language: "en" }, llm: async () => ({ edits: [{ scene: 0, action: "drop", kind: "retold", reason: "x" }] }) });
  assert.deepEqual(out2.spare, []);
});
