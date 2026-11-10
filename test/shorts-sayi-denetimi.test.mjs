// SHORT'UN SAYILARI ANLATIMIN SAYILARIDIR (Kartal Yuvası 20261024-950730 — Short 1, 25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: research.md:111/161 ve uzun anlatım "That road alone cost 30 million Reichsmarks." / "Hitler visited
//   the house on at least 14 documented occasions." / "Fourteen is the documented minimum" diyor. Short 1
//   (short-202610250452.json) "yet he visited it only fourteen times" ile açıldı, "a guest house he visited fourteen
//   times" ile bitti; başlığı "Why Hitler's Eagle's Nest Cost 30 Million Reichsmarks for 14 Visits", kapağı
//   "30 MILLION / REICHSMARKS. / 14 VISITS." — niteleyici düştü, yolun maliyeti evin maliyeti oldu ("0 fact slips"
//   hedefi kaçtı). docu-shorts*.js Short'un sayılarına hiç bakmıyordu. Short 2 ("at least fourteen documented
//   occasions") doğruydu.
// Kural: planlayıcıya kural yazılır; planın her satırındaki her sayı (rakam ya da yazı) anlatımda geçmeli, anlatım onu
//   niteliyorsa (at least, about, documented…) satır da nitelemeli, "X alone" ise satır X'i anmalı. Bulunursa TEK onarım
//   çağrısı; uymayan onarım alınmaz.
// Ayrıca (aynı iş, 04:51:29 / 05:05:14): planlayıcı her Short'ta 3500 token sınırına takılıp büyük isteği iki kez
//   ödedi -> 6000.
// Ağ YOK; llm taklit.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { CLAIM_RULE, checkShortClaims, planPictureTeaser, shortClaimLint } = await import("../src/pipeline/docu-shorts-pictures.js");

// subs.srt'den (son deneme), cümleler altyazı satırlarına bölünmüş hâliyle birleşir.
const cues = [
  "It climbs 800 meters in 6.5 kilometers,", "more than twice the Eiffel Tower's height,", "through five tunnels and one hairpin bend.",
  "That road alone cost 30 million Reichsmarks.", "The house on top was finished in", "just 13 months.", "But the speed had a price.", "The work killed twelve.",
  "Hitler visited the house on at least", "14 documented occasions.", "Fourteen is the documented minimum, the visits", "someone actually wrote down.",
  "Martin Bormann ordered it in the summer of 1937.",
].map((t, i) => ({ s: i, e: i + 1, t }));
const narration = cues.map((c) => c.t).join(" ");
const ids = (flags) => flags.map((f) => f.id);

test("Kartal Short 1: the dropped qualifier and the road's cost made the house's are flagged; the right lines pass", () => {
  const flags = shortClaimLint({
    narration,
    lines: [
      { id: "title", text: "Why Hitler's Eagle's Nest Cost 30 Million Reichsmarks for 14 Visits" },
      { id: "cover", text: "30 MILLION / REICHSMARKS. / 14 VISITS." },
      { id: "beat 1", text: "Hitler's Eagle's Nest cost 30 million Reichsmarks to reach, yet he visited it only fourteen times." },
      { id: "beat 4", text: "The road climbs 800 meters through five tunnels, and cost 30 million Reichsmarks alone." },
      { id: "beat 6", text: "The house itself took thirteen months, and the work killed twelve people." },
      { id: "beat 7", text: "Reportedly afraid of heights, Hitler went up only fourteen documented times." },
      { id: "beat 11", text: "That's what 30 million Reichsmarks bought: a guest house he visited fourteen times." },
      { id: "short 2", text: "Hitler visited on at least fourteen documented occasions, and reportedly feared heights." },
      { id: "plus", text: "14+ VISITS." },
      { id: "year", text: "Martin Bormann ordered it in 1937 as a gift." },
    ],
  });
  assert.deepEqual(ids(flags), ["title", "cover", "beat 1", "beat 11"]);
  const title = flags[0].problems.map((p) => p.problem).join(" | ");
  assert.match(title, /30 Million: the narration gives it to the road \("That road alone cost 30 million Reichsmarks\."\)/);
  assert.match(title, /14: the narration hedges it \("Hitler visited the house on at least 14 documented occasions\."\)/);
  assert.match(flags[2].problems.map((p) => p.number).join(","), /fourteen/);
});

test("numbers in words and digits are the same number; one the narration never says is flagged; small counts are not judged, a year is only looked up", () => {
  const said = "Microsoft kept thirty-five point eight billion of it as profit. More than half a million came. It rose to at least one hundred and eighty-five thousand dollars. Italy paid about 4.5%. In 1066 the king died.";
  const flags = shortClaimLint({
    narration: said,
    lines: [
      { id: "a", text: "Microsoft kept $35.8 billion as profit." },
      { id: "b", text: "More than 500,000 came." },
      { id: "c", text: "Cover rose to at least $185,000." },
      { id: "d", text: "Italy paid about 4.5 percent." },
      { id: "e", text: "The crash broke the world in 60 seconds." },
      { id: "f", text: "Microsoft booked thirty-five billion dollars." },
      { id: "g", text: "One in five is lost; two words." },
      { id: "h", text: "In 1067 the king died." },
      { id: "i", text: "Italy paid 4.5%." },
      { id: "j", text: "Here is what happened in 1066." },
    ],
  });
  assert.deepEqual(ids(flags), ["e", "f", "h", "i"]);
  assert.match(flags[0].problems[0].problem, /never says this number/);
});

test("checkShortClaims: one repair call for the flagged lines, fixes that fit are taken, the rest is logged", async () => {
  const calls = [];
  const llm = async (req) => {
    calls.push(req);
    return {
      lines: [
        { id: "title", text: "Why Hitler's Eagle's Nest Road Alone Cost 30 Million Reichsmarks" },
        { id: "cover", text: "ROAD ALONE / 30 MILLION. / 14+ VISITS." },
        // keeps "fourteen" (the slammed word) and the hedge
        { id: "beat 1", text: "The road alone to Hitler's Eagle's Nest cost 30 million Reichsmarks, yet he went up at least fourteen documented times." },
        // a fix that drops the slammed word is not taken
        { id: "beat 3", text: "That's what the 30 million Reichsmarks road alone bought: at least 14 documented visits." },
      ],
    };
  };
  const plan = {
    title: "Why Hitler's Eagle's Nest Cost 30 Million Reichsmarks for 14 Visits",
    hook: "HITLER'S EAGLE'S NEST",
    cover: ["30 MILLION", "REICHSMARKS.", "14 VISITS."],
    beats: [
      { say: "Hitler's Eagle's Nest cost 30 million Reichsmarks to reach, yet he visited it only fourteen times.", slam: "FOURTEEN" },
      { say: "The road climbs 800 meters through five tunnels, and cost 30 million Reichsmarks alone." },
      { say: "That's what 30 million Reichsmarks bought: a guest house he visited fourteen times.", slam: "FOURTEEN" },
    ],
  };
  const logs = [];
  const r = await checkShortClaims({ plan, cues, llm, logFn: (m) => logs.push(m) });
  assert.equal(calls.length, 1, "one repair call");
  assert.ok(calls[0].maxTokens <= 2000, "a small request, not the planner's");
  assert.match(calls[0].user, /beat 1: "Hitler's Eagle's Nest cost 30 million/);
  assert.match(calls[0].user, /That road alone cost 30 million Reichsmarks\./);
  assert.match(calls[0].user, /keep the word "fourteen"/);
  assert.equal(r.fixed, 3);
  assert.equal(plan.title, "Why Hitler's Eagle's Nest Road Alone Cost 30 Million Reichsmarks");
  assert.deepEqual(plan.cover, ["ROAD ALONE", "30 MILLION.", "14+ VISITS."]);
  assert.match(plan.beats[0].say, /at least fourteen documented times/);
  assert.equal(plan.beats[2].say, "That's what 30 million Reichsmarks bought: a guest house he visited fourteen times.", "lost its slammed word: kept as it was");
  assert.ok(logs.some((m) => /UYARI: Shorts sayısı anlatımdan farklı kaldı — beat 3/.test(m)));
});

test("checkShortClaims: a clean plan costs nothing; a failed repair never fails the Short", async () => {
  let calls = 0;
  const clean = { title: "Why Hitler Visited the Eagle's Nest at Least 14 Times", cover: ["14+ VISITS"], beats: [{ say: "Hitler visited on at least fourteen documented occasions." }] };
  await checkShortClaims({ plan: clean, cues, llm: async () => { calls++; return {}; } });
  assert.equal(calls, 0);
  const bad = { title: "Cost 30 Million for 14 Visits", beats: [{ say: "He went up only fourteen times." }] };
  const r = await checkShortClaims({ plan: bad, cues, llm: async () => { throw new Error("Anthropic HTTP 529"); } });
  assert.equal(r.fixed, 0);
  assert.equal(bad.title, "Cost 30 Million for 14 Visits");
});

test("the planner is told the number rule and has room for the whole plan (6000 tokens, not 3500)", async () => {
  let req = null;
  const pic = (id) => ({ id, rel: `${id}.jpg`, kind: "still", source: "real", quality: 4, textHeavy: false, what: `Photo ${id}` });
  await planPictureTeaser({
    cues: [{ t: "story" }], title: "T", catalog: ["p1", "p2", "p3", "p4"].map(pic),
    llm: async (r) => {
      req = r;
      return { hook: "H", title: "t", description: "d", hashtags: [], cover: [], opening: { say: "A plain opening sentence.", words: [], pictures: ["p1"], pattern: "result", screen: "" }, beats: ["p2", "p3", "p4"].map((p) => ({ say: `Line ${p}.`, picture: p, newPrompt: "", person: "", figure: "", figureWord: "" })) };
    },
  });
  assert.ok(req.maxTokens >= 5000, `maxTokens ${req.maxTokens}`);
  assert.ok(req.user.includes(CLAIM_RULE));
  assert.match(CLAIM_RULE, /at least 14 documented visits' never becomes 'only 14 visits'/);
});

test("review: a fixed beat drops a big figure whose number it no longer says; a day of the month is a date, not a hedged amount", async () => {
  const plan = {
    beats: [
      { say: "The crash broke the market in 60 seconds.", figure: "60 SECONDS", figureWord: "60" },
      { say: "Hitler visited it only fourteen times.", figure: "14", figureWord: "fourteen" },
    ],
  };
  const llm = async () => ({ lines: [
    { id: "beat 1", text: "The crash broke the market in 13 months." },
    { id: "beat 2", text: "Hitler visited it on at least fourteen documented occasions." },
  ] });
  await checkShortClaims({ plan, cues, llm });
  assert.equal(plan.beats[0].say, "The crash broke the market in 13 months.");
  assert.equal(plan.beats[0].figure, "", "'60 SECONDS' would be printed over '13 months'");
  assert.equal(plan.beats[1].figure, "14", "the number is still said: the figure stays");
  // "On 23 October, officials confirmed the fire": the 23 is a day, nothing hedges it; a wrong day is still flagged.
  const said = "On 23 October, officials confirmed the fire. It burned for hours.";
  assert.deepEqual(shortClaimLint({ narration: said, lines: [{ id: "a", text: "It burned in Bavaria on October 23." }] }), []);
  assert.deepEqual(ids(shortClaimLint({ narration: said, lines: [{ id: "b", text: "It burned on October 24." }] })), ["b"]);
});
