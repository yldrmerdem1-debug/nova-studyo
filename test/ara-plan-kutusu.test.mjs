// ARA PLAN KUTUSU (Hastings, Ekim 2026): görseller ChatGPT kutusundan gelirken ara planlar seslendirmeden SONRA
// planlanıyordu; 6 ara plan görseli kutuya yazıldı ama istenmedi, render onlarsız sürdü — kancada üç 5-7 sn'lik kare
// kesilmeden kaldı. Artık aynı satırlar tahmini sürelerle ilk listeye girer; sesten sonra eksik kalan olursa render bekler.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planInserts, insertPicturesAhead, estimateVoiceDur } from "../docu-engine/lib/inserts.mjs";

const wt = (say, step = 0.38) => say.split(/\s+/).map((w, k) => ({ word: w, t: +(k * step).toFixed(2) }));
const line = (say, extra = {}) => ({ type: "photo", image: "x.jpg", energy: 3, imagePrompt: "A ridge in mist", say, ...extra });

test("the narration's pace: ~2.6 words a second, delivery tags not counted", () => {
  assert.equal(estimateVoiceDur({ say: "[firmly] One two three four five six seven eight nine ten eleven twelve thirteen." }), 5);
  assert.equal(estimateVoiceDur({ say: "" }), 0);
});

test("the hook's long lines get their cutaway pictures BEFORE the voice, with the very prompts the real plan uses", () => {
  const hook = [
    line("On top, the English. Shields locked edge to edge along the ridge, a wall of wood and iron."),
    line("Below them, the Normans. Archers, foot soldiers, knights on horses waiting for the signal."),
    line("Nine."),
  ];
  const ahead = insertPicturesAhead({ scenes: hook });
  assert.deepEqual(ahead.map((p) => p.i), [0, 1], "the two long hook lines, not the one-word line");
  // after the voice: the same lines, timed
  const voiced = hook.map((s) => ({ ...s, voiceDur: estimateVoiceDur(s), wordTimes: wt(s.say) }));
  const plan = planInserts({ scenes: voiced });
  for (const p of plan) {
    const a = ahead.find((x) => x.i === p.i);
    assert.ok(a, `line ${p.i} was asked for ahead`);
    for (const pr of p.prompts) assert.ok(a.prompts.includes(pr), "same prompt → the inbox picture is found");
  }
});

test("a line already voiced keeps its real length; nothing is asked for a person's portrait line", () => {
  const scenes = [line("A short one.", { voiceDur: 9, wordTimes: wt("a b c d e f g h i j k l m n o p q r s t") }), line("The king of England stood alone on the ridge that morning.", { name: "Harold" })];
  const ahead = insertPicturesAhead({ scenes });
  assert.deepEqual(ahead.map((p) => p.i), [0]);
  assert.equal(ahead[0].prompts.length, 2, "a 9 s line: two cutaways");
});

test("the engine asks for them with the first inbox list and stops after the voice if one is still missing", () => {
  const src = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");
  const ahead = src.indexOf("insertPicturesAhead(script)");
  const firstStop = src.indexOf("görsel ChatGPT'den bekleniyor");
  assert.ok(ahead > 0 && ahead < firstStop, "planned before the first inbox stop");
  assert.match(src, /ara plan görseli ChatGPT'den bekleniyor/);
});

test("a line estimated near the 2-cutaway length gets both pictures ahead; the engine lists every missing cutaway at once", async () => {
  const { insertPicturesAhead, AHEAD_TWO_SEC } = await import("../docu-engine/lib/inserts.mjs");
  assert.equal(AHEAD_TWO_SEC, 4.5);
  const say = "If the pact applies, Yemen becomes Ankara's and Islamabad's problem too. If not, it stays Riyadh's.";
  const ahead = insertPicturesAhead({ scenes: [line(say)] });
  assert.equal(ahead[0].prompts.length, 2, "a ~6.5 s estimate asks for both");
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");
  assert.match(src, /if \(!file\) \{ if \(MANUAL\) continue; break; \}/);
});
