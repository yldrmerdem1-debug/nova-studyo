// HASTINGS DERSLERİ (Ekim 2026): Nova'nın yazarı ve kurgu yönetmeni, bir orta çağ hikâyesini İngilizce yazarken
// üç yerde tökezledi — bölüm başına AI tavanı denetlenmiyordu, büyük harfli İngilizce etiketlerde I Türkçe kuralla
// küçülüp "senaryoda yok" sayılıyordu, ve 1100 öncesi yıllar hiç tanınmıyordu.
import test from "node:test";
import assert from "node:assert/strict";
import { validateScenes, AI_PER_VIDEO } from "../src/pipeline/docu-script.js";
import { grounded, yearsIn } from "../src/pipeline/docu-edit-director.js";

const scene = (source) => ({ type: "photo", mood: "tension", say: "A ridge in Sussex, seven miles from Hastings.", dur: 3, source, imagePrompt: "A grassy ridge in mist", ...(source !== "ai" ? { search: "Senlac Hill Battle" } : {}) });

test("AI cap per chapter: an archive chapter with more AI pictures than its share is sent back", () => {
  const aiCap = Math.max(2, Math.ceil(AI_PER_VIDEO / 8) + 1);
  assert.equal(aiCap, 3);
  const heavy = { scenes: [scene("ai"), scene("ai"), scene("ai"), scene("ai"), scene("archive")] };
  const errs = validateScenes(heavy, { archive: true, lang: "en", aiCap });
  assert.ok(errs.some((e) => /4 AI görseli var, en fazla 3/.test(e)), errs.join(" | "));
  const ok = { scenes: [scene("ai"), scene("ai"), scene("archive"), scene("stock"), scene("archive")] };
  assert.ok(!validateScenes(ok, { archive: true, lang: "en", aiCap }).some((e) => /AI görseli/.test(e)));
  assert.ok(!validateScenes(heavy, { archive: true, lang: "en" }).some((e) => /AI görseli/.test(e)), "no cap given, no check (AI-first videos)");
});

test("an English label in capitals with an I is grounded in the narration (WILLIAM, TOSTIG)", () => {
  assert.equal(grounded("WILLIAM", ["in", "normandy", "duke", "william", "said"]), true);
  assert.equal(grounded("TOSTIG", ["tostig", "harold's", "brother"]), true);
  assert.equal(grounded("ISTANBUL", ["istanbul"]), true);
  assert.equal(grounded("NORMANDY", ["paris"]), false);
});

test("medieval years are years: 1064, 1066 and 1086 are found, with 1966 and 2026", () => {
  assert.deepEqual([...yearsIn("Around 1064, Harold. In 1066 the battle; in 1086 the Domesday Book; 1966; October 2026.")], [1064, 1066, 1086, 1966, 2026]);
  assert.deepEqual([...yearsIn("nine hundred and sixty years, 960 of them")], []);
});

test("Shorts narration enforces the video language, and falls back once if the model refuses it (Panama: drift into Spanish)", async () => {
  const { speakTeaser } = await import("../src/pipeline/docu-shorts.js");
  const bodies = [];
  const ok = { ok: true, json: async () => ({ audio_base64: "", alignment: { characters: ["a"], character_start_times_seconds: [0], character_end_times_seconds: [0.1] } }) };
  const fetchImpl = async (_url, o) => {
    const b = JSON.parse(o.body);
    bodies.push(b);
    if (b.language_code && bodies.length === 1) return { ok: false, status: 400, text: async () => "language_code is not supported for this model" };
    return ok;
  };
  await speakTeaser({ text: "In Penonomé.", voiceId: "v", key: "k", fetchImpl });
  assert.equal(bodies[0].language_code, "en");
  assert.equal(bodies[1].language_code, undefined, "asked again without it");
  bodies.length = 0;
  const accept = async (_url, o) => { bodies.push(JSON.parse(o.body)); return ok; };
  await speakTeaser({ text: "In Chitré.", voiceId: "v", key: "k", fetchImpl: accept });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].language_code, "en");
});
