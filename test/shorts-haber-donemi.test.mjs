// HABER SHORT'U BUGÜNDE GEÇER (Kartal Yuvası 20261024-950730 — 25 Ekim 2026, docuFormat "news").
//
// ÖLÇÜLEN KUSUR: job.log 04:51:00 ve 05:04:46 "Shorts: 68 günümüz görseli 1952 hikâyesinden çıkarıldı". 23 Ekim 2026
//   yangını anlatan haber, senaryoda era olmadığı için anlatımın ortanca yılıyla (1952) "1952 hikâyesi" sayıldı:
//   shorts/pictures.json'daki 92 görselin 68'i (yangın, polis, bugünkü Kehlsteinhaus, "Red Marble Fireplace" YouTube
//   klibi src-63a35afdef) katalog dışı kaldı; planlayıcıya "no present-day photos" dendi. Uzun videonun sahne dönemleri
//   (sceneEras: haber bölümleri 2026) hiç okunmadı. İki Short da tarih açısına düştü, eksik görseller için şenlik ateşi
//   ve Bormann portresi tekrar kullanıldı.
// Kural: haber Short'u tek tarihî yılla yargılanmaz (year null, planlayıcıya dönem satırı gitmez); görsel, uzun videoda
// gösterildiği en geç sahnenin dönemini taşır ve o dönem hikâye yılını yalnızca genişletir. Tarih işi, era'sız: eskisi gibi.
// Ağ YOK; llm taklit.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const P = await import("../src/pipeline/docu-shorts-pictures.js");

/** A job folder with a props file and the picture files (pictureAssets only checks that they exist). */
function jobWith(scenes) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-haber-donemi-"));
  fs.mkdirSync(path.join(jobDir, "docu", "public", "build", "j", "src"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "docu", "j.props.json"), JSON.stringify({ script: { scenes } }));
  for (const s of scenes) for (const rel of [s.image, s.video].filter(Boolean)) fs.writeFileSync(path.join(jobDir, "docu", "public", rel), "x");
  return jobDir;
}

test("Kartal: every picture carries the era of the latest line the long video showed it under", () => {
  const jobDir = jobWith([
    { say: "In 1937 Bormann ordered the house.", era: "1937", image: "build/j/arch-a.jpg" },
    { say: "On Friday night, 23 October 2026, it burned.", era: "2026", image: "build/j/cm-b.jpg" },
    { say: "It had stood up there since the late 1930s.", era: "1938", image: "build/j/cm-b.jpg" },
    { say: "Its showpiece room had an Italian marble fireplace.", era: "2026", image: "build/j/src/src-63a35afdef.jpg", video: "build/j/src/src-63a35afdef.mp4" },
    { say: "A line with no era.", image: "build/j/img-c.jpg" },
  ]);
  const byRel = Object.fromEntries(P.pictureAssets(jobDir).map((a) => [a.rel.split("/").pop(), a]));
  assert.equal(byRel["arch-a.jpg"].era, "1937");
  assert.equal(byRel["cm-b.jpg"].era, "2026", "shown again under an older line: the later era stays");
  assert.equal(byRel["src-63a35afdef.mp4"].era, "2026");
  assert.equal(byRel["img-c.jpg"].era, undefined);
  fs.rmSync(jobDir, { recursive: true, force: true });
});

test("a picture's own era widens the story year, never narrows it; a news Short (year null) keeps every picture", () => {
  const fire = { what: "Colour photo of firefighters at the burning Kehlsteinhaus at night", modern: true, era: "2026" };
  const today = { what: "Modern angular concrete building with a long glass window", modern: true, era: "1952" };
  const old = { what: "Black-and-white photo of Bormann, 1937", modern: false, era: "1937" };
  const plain = { what: "Modern colour photo of the house", modern: true };
  assert.equal(P.fitsPeriod(fire, 1952), true, "shown under a 2026 line in the long video");
  assert.equal(P.fitsPeriod(today, 1952), false, "a 1952 line, a 1952 story: as before");
  assert.equal(P.fitsPeriod(today, null), true, "news: an older scene era never takes a present-day picture out (eras are guesses)");
  assert.equal(P.fitsPeriod(old, 1952), true);
  assert.equal(P.fitsPeriod(plain, 1952), false, "no era: the old periodFit");
  assert.equal(P.fitsPeriod(plain, null), true);
  assert.equal(P.periodFit(fire, 1952), false, "periodFit itself is unchanged");
});

test("Kartal: the news planner sees the present-day pictures and is not told 'no present-day photos'", async () => {
  const pic = (id, what, extra = {}) => ({ id, rel: `build/j/${id}.jpg`, kind: "still", source: "real", quality: 4, textHeavy: false, what, ...extra });
  const catalog = [
    pic("p1", "Colour photo of the Kehlsteinhaus burning at night", { modern: true, era: "2026" }),
    pic("p2", "Stone fireplace behind a rope barrier, colour video still", { modern: true, era: "2026" }),
    pic("p3", "Black-and-white photo of the house under construction, 1938", { era: "1938" }),
    pic("p4", "Modern colour photo of police tape on a mountain road", { modern: true }),
  ];
  let prompt = "";
  const logs = [];
  const llm = async ({ user }) => {
    prompt = user;
    return {
      hook: "THE EAGLE'S NEST BURNED", title: "t", description: "d", hashtags: [], cover: [],
      opening: { say: "The Eagle's Nest burned in Bavaria on October 23.", words: [], pictures: ["p1"], pattern: "result", screen: "" },
      beats: ["p2", "p3", "p4"].map((p) => ({ say: `Line over ${p}.`, picture: p, newPrompt: "", person: "", figure: "", figureWord: "" })),
    };
  };
  await P.planPictureTeaser({ cues: [{ t: "It burned on Friday." }], title: "Eagle's Nest", catalog, year: null, llm, logFn: (m) => logs.push(m) });
  for (const id of ["p1", "p2", "p3", "p4"]) assert.match(prompt, new RegExp(`${id} · `));
  assert.doesNotMatch(prompt, /no present-day photos/);
  assert.ok(!logs.some((m) => /günümüz görseli/.test(m)));
  // A history Short (a year, no eras) keeps the old rule.
  await P.planPictureTeaser({ cues: [{ t: "It burned on Friday." }], title: "Eagle's Nest", catalog: catalog.map(({ era, ...a }) => a), year: 1952, llm, logFn: (m) => logs.push(m) });
  assert.doesNotMatch(prompt, /p1 · |p2 · |p4 · /);
  assert.match(prompt, /story's time \(1952\): no present-day photos/);
  assert.ok(logs.some((m) => /3 günümüz görseli 1952 hikâyesinden çıkarıldı/.test(m)));
});

test("makePictureTeaser judges a news job by no single year, and spares by the same rule (source)", () => {
  const src = fs.readFileSync(new URL("../src/pipeline/docu-shorts.js", import.meta.url), "utf8");
  assert.match(src, /const year = job\.docuFormat === "news" \? null : storyYear\(jobDir\);/);
  assert.match(src, /fitsPeriod\(a, year\)/);
  assert.doesNotMatch(src, /periodFit\(a, year\)/, "every caller goes through fitsPeriod");
});
