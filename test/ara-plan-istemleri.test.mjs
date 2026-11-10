// ARA PLAN İSTEMİ SATIRIN KENDİ RESMİNDEN GELİR; TUTULAN KAREYE VE ADIYLA GERÇEK FOTOĞRAFA AI ARA PLAN KESİLMEZ.
//
// ÖLÇÜLEN KUSUR (24-25 Ekim 2026, 2009 denizaltı çarpışması, 20261024-373aaf): gorsel-kutusu/needed.json #55-#65 ara
// plan kareleri. #55 "Extreme wide underwater silhouette ... no detail visible" + "A closer view of the same moment:
// faces, hands and detail"; #56/#57 boş Atlantik + "faces, hands" / "smoke and distance" (hikâyede yangın yok);
// #58/#59 doğrudan anlatım cümlesiyle başlıyor ("While France spoke, the British boat was still in the Atlantic,
// damaged.. A closer view…") — AI tavanı o satırın istemini almıştı, satır önceki kareyi tutuyordu (bg prev) ve yine
// de 2 yeni AI karesi istendi; #64/#65 Bugaled Breizh'in gerçek Commons fotoğrafının (File:Bugaled Breizh.JPG) üstüne
// AI "battered fishing trawler" ara planları.
//
// Kural: görünüşler yalnızca uzaklık ve açı söyler (yüz/el/duman yok); resim satırın kendi istem/aramasından, ön izleme
// kapısının kestiği tutulan satırda tuttuğu kareden gelir — yalnızca anlatımdan asla. Tutulan satır (bg prev/next) ve
// adıyla gerçek fotoğraf (commons) ön izleme istemedikçe (cutaway) ara plan almaz.
import test from "node:test";
import assert from "node:assert/strict";
import { insertable, insertPromptsFor, planInserts, insertPicturesAhead } from "../docu-engine/lib/inserts.mjs";

const wt = (say, dur) => {
  const w = say.split(/\s+/);
  return w.map((word, k) => ({ word, t: +((k * dur) / w.length).toFixed(2) }));
};
const NO_EXTRA = /faces|hands|smoke/i;

test("görünüşler resmin içinde olmayanı eklemez: sualtı silueti 'faces, hands', boş deniz 'smoke' almaz", () => {
  const p = insertPromptsFor({ imagePrompt: "Extreme wide underwater silhouette of two hulls, no detail visible", say: "Neither boat heard the other." }, 2);
  assert.equal(p.length, 2);
  for (const x of p) assert.ok(!NO_EXTRA.test(x), x);
  assert.match(p[0], /^Extreme wide underwater silhouette of two hulls, no detail visible\. A closer view of the same moment/);
  assert.match(p[1], /A wider view of the same moment/);
  assert.match(p[0], /The moment: "Neither boat heard the other\."$/);
});

test("görsel tarifi olmayan satıra anlatımdan ara plan istemi kurulmaz; arama varsa o kullanılır", () => {
  assert.deepEqual(insertPromptsFor({ say: "While France spoke, the British boat was still in the Atlantic, damaged." }, 2), []);
  const s = insertPromptsFor({ search: "Bugaled Breizh trawler Brittany", say: "x" }, 1);
  assert.match(s[0], /^Bugaled Breizh trawler Brittany\. /);
});

test("tutulan kare (bg prev/next) ve adıyla gerçek fotoğraf ön izleme istemedikçe kesilmez", () => {
  const say = "While France spoke, the British boat was still in the Atlantic, damaged.";
  const held = { type: "words", textMode: "key", bg: "prev", heldBg: true, image: "a.jpg", say, voiceDur: 5, pace: "quick", energy: 5 };
  assert.equal(insertable(held), false, "AI tavanının aldığı resim ara planla geri gelmez");
  assert.equal(insertable({ ...held, bg: "next" }), false);
  assert.equal(insertable({ ...held, cutaway: true }), true, "ön izleme kapısının kestiği tutulan kare kesilir");
  const trawler = { type: "photo", image: "cm.jpg", archived: true, commons: "File:Bugaled Breizh.JPG", say: "He linked the collision to the Bugaled Breizh, a French trawler that sank in 2004.", voiceDur: 5, energy: 5, pace: "rapid" };
  assert.equal(insertable(trawler), false, "gerçek teknenin fotoğrafına AI benzeri kesilmez");
  assert.equal(insertable({ ...trawler, archived: false }), true, "Commons alınamadı, resim AI ise ara plan serbest");
  assert.equal(insertable({ ...trawler, commons: undefined }), true, "adıyla istenmemiş arşiv fotoğrafı eskisi gibi kesilir");
});

test("gerçek kanca: tavanın aldığı tutulan satır ve Commons satırı plandan çıkar, kendi resmi olan satır kalır", () => {
  // 20261024-373aaf engine-script sahne 13/14/138 sırası (14 burada tavanın istemini aldığı hâliyle, önceki kareyi tutuyor).
  const scenes = [
    { type: "photo", image: "ocean.jpg", archived: true, say: "And did anything change afterward?", imagePrompt: "Empty overcast ocean seen from high above", energy: 5, pace: "rapid", mood: "tension" },
    { type: "words", textMode: "key", bg: "prev", heldBg: true, image: "ocean.jpg", say: "While France spoke, the British boat was still in the Atlantic, damaged.", energy: 5, pace: "rapid", mood: "reveal" },
    { type: "words", textMode: "key", image: "ai-sub.jpg", say: "No sound to hear. No route to check. No warning.", imagePrompt: "Wide underwater silhouette of a lone long submarine hull moving slowly through dark blue water", energy: 5, pace: "rapid", mood: "dread" },
    { type: "words", textMode: "key", image: "cm.jpg", archived: true, commons: "File:Bugaled Breizh.JPG", say: "He linked the collision to the Bugaled Breizh, a French trawler that sank in 2004.", imagePrompt: "Medium shot of a battered fishing trawler hull resting in a grey harbour", energy: 5, pace: "rapid", mood: "reveal" },
  ].map((s) => ({ ...s, voiceDur: 5, wordTimes: wt(s.say, 5) }));
  const plan = planInserts({ scenes });
  assert.deepEqual(plan.map((p) => p.i), [0, 2]);
  for (const p of plan) for (const x of p.prompts) assert.ok(!NO_EXTRA.test(x) && !/^While France spoke/.test(x), x);
  const ahead = insertPicturesAhead({ scenes: scenes.map(({ voiceDur, wordTimes, ...s }) => s) });
  assert.ok(ahead.every((p) => p.prompts.length), "boş istem listesi kutuya gitmez");
  assert.ok(!ahead.some((p) => p.i === 1 || p.i === 3));
});

test("ön izlemenin kestiği tutulan satır, tuttuğu karenin tarifini kullanır (France kancası: önceki kareyi taşıyan anahtar kelime)", () => {
  const say0 = "This is Paris on Saturday night in the worst unrest for years";
  const say1 = "exactly what the curfews cover";
  const scenes = [
    { type: "photo", image: "a.jpg", archived: true, search: "Paris riot night street", say: say0, pace: "hold", energy: 1, voiceDur: 6.2 },
    { type: "words", textMode: "key", bg: "prev", heldBg: true, image: "a.jpg", say: say1, voiceDur: 3.3, cutaway: true },
  ].map((s) => ({ ...s, wordTimes: wt(s.say, s.voiceDur) }));
  const plan = planInserts({ scenes });
  const held = plan.find((p) => p.i === 1);
  assert.ok(held, JSON.stringify(plan));
  assert.match(held.prompts[0], /^Paris riot night street\. A closer view of the same moment/);
  assert.match(held.prompts[0], /The moment: "exactly what the curfews cover"$/);
  // Tuttuğu karenin de tarifi yoksa ara plan yok: anlatımdan istem kurulmaz, kutuya boş istek gitmez.
  const bare = scenes.map(({ search, ...s }) => s);
  assert.ok(!planInserts({ scenes: bare }).some((p) => p.i === 1));
  assert.ok(insertable(bare[1]), "satır kesilebilir; eksik olan yalnızca tarif");
  assert.ok(!insertPicturesAhead({ scenes: bare }).some((p) => p.i === 1));
  // Önündeki kare ödünç (borrowed: istemi tavana gitmiş, resim başka satırın): tarif resmin asıl sahibinden gelir.
  const borrowed = [
    { type: "photo", image: "a.jpg", imagePrompt: "Riot police lines on a Paris boulevard at night", say: say0, pace: "hold", energy: 1, voiceDur: 6.2 },
    { type: "photo", image: "b.jpg", imagePrompt: "Empty square at dawn", say: "Morning came.", pace: "hold", energy: 1, voiceDur: 3 },
    { type: "photo", image: "a.jpg", borrowed: true, say: "Later that night.", pace: "hold", energy: 1, voiceDur: 3 },
    { type: "words", textMode: "key", bg: "prev", heldBg: true, image: "a.jpg", say: say1, voiceDur: 3.3, cutaway: true },
  ].map((s) => ({ ...s, wordTimes: wt(s.say, s.voiceDur) }));
  const fromOwner = planInserts({ scenes: borrowed }).find((p) => p.i === 3);
  assert.ok(fromOwner, JSON.stringify(planInserts({ scenes: borrowed })));
  assert.match(fromOwner.prompts[0], /^Riot police lines on a Paris boulevard at night\. /);
});
