// YEDEK GÖRSEL CÜMLEYİ GÖSTERİR (Kartal Yuvası 20261024-950730 — 25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: OpenAI kredisi bitmişti (job.log 04:52:06-09 ve 05:05:49-51: beş kez "Shorts: yeni görsel üretilemedi
//   (OpenAI Images HTTP 429 (credit_balance_exhausted) — OpenAI kredisi bitti)"; her cümlede yeniden istendi). Yeni
//   görsel çıkmayan cümleye arşivin en yüksek puanlı boştaki görseli sırayla verildi, cümleye bakılmadan:
//   - "The road climbs 800 meters through five tunnels" -> clip-045ac295cad9 ("Large wooden pyre or bonfire", q5)
//   - "Then came an elevator shaft, cut 124 meters"    -> arch-71a28f504e0d (Bundesarchiv Martin Bormann portresi, q5)
//   - "Mussolini gave it a marble fireplace"            -> img-dba35e9f89a5 ("Burnt-out stone village ruins", q5)
//   - Short 2: "Galeazzo Ciano came up as a guest"     -> Bormann portresi (yanlış kişi), şömine cümlesi -> şenlik ateşi.
// Kural: boştaki görsel cümlenin ve newPrompt'un kelimeleriyle seçilir (açıklama 2, üstündeki anlatım 1), cümlenin
// anmadığı kişinin portresi asla; uyan yoksa önceki cümlenin görseli sürer. Kredi bitince kalan cümlelere yeni görsel
// istenmez. Ağ YOK; newPicture taklit.
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { spareFor } = await import("../src/pipeline/docu-shorts-pictures.js");
const { fillBeatPictures } = await import("../src/pipeline/docu-shorts.js");

// shorts/pictures.json'daki tanımlar (Kartal Yuvası), kalite sırasıyla — eski kod bu sırayla dağıtıyordu.
const pic = (rel, what, quality, extra = {}) => ({ rel: `build/20261024-950730/${rel}`, kind: "still", source: "real", what, quality, textHeavy: false, ...extra });
const bonfire = pic("clip-045ac295cad9.mp4", "Large wooden pyre or bonfire burning at night, flames and sparks rising against a black sky", 5, { kind: "clip", say: "So crews weren't arriving at a fire just starting." });
const bormann = pic("arch-71a28f504e0d.jpg", "Black-and-white studio portrait of a man in a military-style uniform with an eagle-and-wreath collar insignia.", 5, { say: "Martin Bormann ordered it in the summer of 1937, and the Nazi party paid for it." });
const ruins = pic("img-dba35e9f89a5.jpg", "Burnt-out stone village ruins in smoke and mist with a steep mountain behind; a small figure stands among the rubble.", 5, { source: "ai", say: "The Kehlsteinhaus was spared from Allied bombing." });
const fireplace = pic("src/src-63a35afdef.mp4", "Stone fireplace with iron grate behind a rope barrier in a display area; colour video still of an exhibit replica.", 2, { kind: "clip", say: "Its showpiece room had an Italian marble fireplace, a gift from Benito Mussolini." });
const tunnel = pic("img-18720b41749a.jpg", "Dark stone tunnel portal on a foggy mountain road, with a serpentine road curving below", 4, { source: "ai" });
const spares = () => [bonfire, bormann, ruins, tunnel, fireplace];

test("Kartal: the spare picture is the one that shows the sentence, never the highest-rated one in order", () => {
  const marble = { say: "It was built to impress guests, and Mussolini gave it a marble fireplace.", newPrompt: "Grand stone-walled mountain lodge room with an Italian marble fireplace" };
  assert.equal(spareFor(marble, spares())?.rel, fireplace.rel, "the q2 fireplace clip, not the q5 bonfire");
  const road = { say: "The road climbs 800 meters through five tunnels, and cost 30 million Reichsmarks alone.", newPrompt: "1930s black-and-white photo style, narrow mountain road with a stone tunnel portal" };
  assert.equal(spareFor(road, spares())?.rel, tunnel.rel);
});

test("Kartal Short 2: a portrait only for the person the sentence names (Ciano never gets Bormann)", () => {
  const ciano = { say: "In 1939, Mussolini's foreign minister, Galeazzo Ciano, came up as a guest.", person: "Galeazzo Ciano", newPrompt: "Black-and-white 1939 scene, men in long coats seen from behind walking. An anonymous figure seen from behind or in silhouette, no recognisable face" };
  assert.notEqual(spareFor(ciano, spares())?.rel, bormann.rel);
  assert.equal(spareFor(ciano, [bormann, bonfire]), null, "nothing related: null, the beat keeps the previous beat's picture");
  // Without the planner's person, the sentence's own capitalised names decide.
  assert.equal(spareFor({ say: "In 1939, Mussolini's foreign minister, Galeazzo Ciano, came up." }, [bormann]), null);
  const his = { say: "Martin Bormann ordered it in 1937 as a gift for Hitler's fiftieth birthday.", person: "Martin Bormann" };
  assert.equal(spareFor(his, spares())?.rel, bormann.rel, "his own portrait is fine");
});

test("an opening fragment keeps its fallback: the best real picture, even when nothing is related", () => {
  assert.equal(spareFor({ say: "Zero beds." }, [ruins, bonfire], { opening: true })?.rel, bonfire.rel, "real over AI");
  assert.equal(spareFor({ say: "One road.", slam: "ROAD" }, [ruins, tunnel], { opening: true })?.rel, tunnel.rel, "only AI spare: the related one, not the q5");
  assert.equal(spareFor({ say: "Zero beds." }, [ruins, bonfire]), null, "a later beat: nothing related, nothing taken");
});

test("Kartal: after an empty OpenAI balance no beat asks for a new picture again; each gets the spare that shows it", async () => {
  let calls = 0;
  const newPicture = async () => {
    calls++;
    throw Object.assign(new Error("OpenAI Images HTTP 429 (credit_balance_exhausted) — OpenAI kredisi bitti"), { status: 429, quota: true });
  };
  const logs = [];
  const beats = [
    { say: "Hitler's Eagle's Nest sits on a mountain.", slam: "MOUNTAIN", asset: bormann },
    { say: "The road climbs 800 meters through five tunnels.", newPrompt: "narrow mountain road with a stone tunnel portal" },
    { say: "It was built to impress guests, and Mussolini gave it a marble fireplace.", newPrompt: "Grand stone-walled mountain lodge room with an Italian marble fireplace" },
    { say: "In 1939, Galeazzo Ciano came up as a guest.", person: "Galeazzo Ciano", newPrompt: "men in long coats walking" },
  ];
  await fillBeatPictures({ beats, catalog: spares(), settings: { openaiKey: "test" }, dir: path.join(os.tmpdir(), "nova-yedek-yok"), newPicture, logFn: (m) => logs.push(m) });
  assert.equal(calls, 1, "one failed call, not one per beat");
  assert.equal(beats[1].asset?.rel, tunnel.rel);
  assert.equal(beats[2].asset?.rel, fireplace.rel);
  assert.equal(beats[3].asset, undefined, "no related spare: the previous beat's picture follows (makePictureTeaser)");
  assert.ok(logs.some((m) => /kredisi bitti — kalan cümlelere yeni görsel istenmiyor/.test(m)));
  // A rate limit is not an empty balance: the next beat still asks.
  let tries = 0;
  const busy = async () => {
    tries++;
    throw Object.assign(new Error("OpenAI Images HTTP 429 (rate_limit_exceeded)"), { status: 429 });
  };
  await fillBeatPictures({ beats: [{ say: "a road", newPrompt: "road" }, { say: "a fireplace", newPrompt: "fireplace" }], catalog: spares(), settings: { openaiKey: "test" }, dir: os.tmpdir(), newPicture: busy });
  assert.equal(tries, 2);
});

test("review: the first beat and a beat after someone else's portrait get a spare, they never follow a picture that may not show them", async () => {
  const lake = pic("lake.jpg", "A mountain lake under low clouds", 3);
  const page = pic("page.jpg", "A typed document page", 5, { textHeavy: true });
  // Beat 0 has no picture before it: nothing related still gives the best fair spare, never catalog[0] (a text page).
  const first = [{ say: "Zero beds were ever slept in.", newPrompt: "an empty bedroom" }, { say: "Then the war came.", asset: tunnel }];
  await fillBeatPictures({ beats: first, catalog: [page, lake], settings: {}, dir: os.tmpdir() });
  assert.equal(first[0].asset?.rel, lake.rel);
  // Bormann's portrait before "Galeazzo Ciano came up": his face does not follow under Ciano's sentence.
  const after = [
    { say: "Martin Bormann ordered it in 1937.", person: "Martin Bormann", asset: bormann },
    { say: "In 1939, Galeazzo Ciano came up as a guest.", person: "Galeazzo Ciano", newPrompt: "men in long coats walking" },
  ];
  await fillBeatPictures({ beats: after, catalog: [bormann, lake], settings: {}, dir: os.tmpdir() });
  assert.equal(after[1].asset?.rel, lake.rel);
  // A picture that may show the sentence still follows when nothing is related (Short 2's Ciano after the fireplace).
  const kept = [{ say: "Its marble fireplace.", asset: fireplace }, { say: "In 1939, Galeazzo Ciano came up as a guest.", person: "Galeazzo Ciano" }];
  await fillBeatPictures({ beats: kept, catalog: [fireplace, lake], settings: {}, dir: os.tmpdir() });
  assert.equal(kept[1].asset, undefined);
});
