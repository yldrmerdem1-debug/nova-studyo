// ALTYAZIDA YETİM KELİME YOK: CÜMLENİN SON BİR-İKİ KELİMESİ 0,4 SN TEK BAŞINA YANIP SÖNMEZ.
//
// ÖLÇÜLEN KUSUR (24-25 Ekim 2026, teslim edilen altyazi.srt): Kartal Yuvası (20261024-950730) 332 satırın 23'ü,
// Fransa borcu (20261024-48ae2d) 364 satırın 25'i 0,7 sn'den kısa, neredeyse hepsi cümle sonundan kopmuş 1-2 kelime.
// Kartal 5-6: "On Friday night, 23 October 2026, it" (4,08 sn) ardından "burned." 0,40 sn — kancanın vurucu kelimesi;
// sahne 5,256 sn sürüyor, sonraki satır 0,7 sn sonra başlıyor. Fransa: "day.", "vote.", "rate." 0,40'ar sn.
// Sebep (produce.mjs buildSrt): 7 kelimede ileriye bakmadan kesiyor, sahnenin son satırı sesin sonunda bitiyor ve
// yalnızca başlangıç+0,4'e uzatılıyordu.
//
// Kural: yedi kelimelik satır cümlesinin kalan bir-iki kelimesini de alır (en çok SRT_MAX_WORDS); kısa satır, sahne ve
// sonraki satır yer bıraktıkça SRT_MIN_SEC'e uzar. Aynı props senaryolarında ölçüm: <0,7 sn satır 23 → 0 ve 25 → 0.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSrt, placeScenes, SRT_MAX_WORDS, SRT_MIN_SEC } from "../docu-engine/lib/produce.mjs";

const cues = (srt) => srt.trim().split(/\n\n+/).map((b) => {
  const l = b.split("\n");
  const [a, z] = l[1].split(" --> ").map((t) => { const [h, m, r] = t.split(":"); const [s, ms] = r.split(","); return +h * 3600 + +m * 60 + +s + +ms / 1000; });
  return { a, z, text: l.slice(2).join(" ") };
});

// Gerçek kelime zamanları (props.json): Kartal sahne 3 ve 39, Fransa sahne 32.
const BURNED = { dur: 5.256, voiceDur: 4.556, wordTimes: [{ word: "On", t: 0.08 }, { word: "Friday", t: 0.32 }, { word: "night,", t: 0.64 }, { word: "23", t: 1.2 }, { word: "October", t: 1.2 }, { word: "2026,", t: 1.68 }, { word: "it", t: 3.88 }, { word: "burned.", t: 4.16 }] };
const UP = { dur: 5, voiceDur: 4.96, wordTimes: "Four meters is about one traffic lane, and every fire truck on it was heading up.".split(" ").map((word, k) => ({ word, t: [0, 0.24, 0.8, 0.96, 1.36, 1.8, 2.24, 2.64, 2.8, 3.2, 3.56, 3.72, 3.84, 4, 4.24, 4.48][k] })) };
const DAY = { dur: 5, voiceDur: 5.271, wordTimes: "Each one eventually comes due and gets refinanced at whatever rate lenders demand that day.".split(" ").map((word, k) => ({ word, t: [0, 0.32, 0.72, 1.36, 1.72, 1.96, 2.08, 2.32, 3.12, 3.28, 3.8, 4, 4.52, 4.8, 5.24][k] })) };

test("kancanın vurucu kelimesi cümlesiyle kalır: 'burned.' tek başına yanıp sönmez", () => {
  const script = { scenes: [BURNED, { dur: 3, voiceDur: 2.3, wordTimes: [{ word: "By", t: 0 }, { word: "Saturday,", t: 0.3 }, { word: "it", t: 0.9 }, { word: "was", t: 1.1 }, { word: "destroyed.", t: 1.4 }] }] };
  const c = cues(buildSrt(script, placeScenes(script)));
  assert.equal(c[0].text, "On Friday night, 23 October 2026, it burned.");
  assert.ok(c.every((x) => x.text.split(" ").length > 1), c.map((x) => x.text).join(" | "));
  for (let k = 1; k < c.length; k++) assert.ok(c[k].a >= c[k - 1].z - 1e-3, "satırlar üst üste binmez");
});

test("cümle sonundan kopan 'up.' ve 'day.' kendi cümlelerine katılır; hiçbir satır dokuz kelimeyi aşmaz", () => {
  assert.equal(SRT_MAX_WORDS, 9);
  for (const sc of [UP, DAY]) {
    const script = { scenes: [sc] };
    const c = cues(buildSrt(script, placeScenes(script)));
    assert.ok(c.every((x) => x.text.split(" ").length >= 3 && x.text.split(" ").length <= SRT_MAX_WORDS), c.map((x) => x.text).join(" | "));
    assert.equal(c.map((x) => x.text).join(" "), sc.wordTimes.map((w) => w.word).join(" "), "hiçbir kelime düşmez");
  }
});

test("bulgu örneği: 8 kelime 0,5 sn arayla — tek kelimelik satır yok, her satır en az 0,8 sn", () => {
  const words = "On Friday night, 23 October 2026, it burned.".split(" ");
  const wordTimes = words.map((word, k) => ({ word, t: k * 0.5 }));
  const voiceDur = wordTimes.at(-1).t + 0.3;
  const script = { scenes: [{ wordTimes, voiceDur, dur: voiceDur + 0.7 }] };
  const c = cues(buildSrt(script, placeScenes(script)));
  assert.ok(c.every((x) => x.text.split(" ").length > 1));
  assert.ok(c.every((x) => x.z - x.a >= SRT_MIN_SEC - 1e-3), c.map((x) => `${x.text} ${(x.z - x.a).toFixed(2)}`).join(" | "));
});

test("tek kelimelik kısa cümle sahnenin içinde 0,8 sn'ye uzar, sahnenin ve sonraki satırın sınırını geçmez", () => {
  const script = { scenes: [{ dur: 1.2, voiceDur: 0.5, wordTimes: [{ word: "Gone.", t: 0.1 }] }, { dur: 2, voiceDur: 1.5, wordTimes: [{ word: "Then", t: 0 }, { word: "nothing.", t: 0.4 }] }] };
  const placed = placeScenes(script);
  const c = cues(buildSrt(script, placed));
  assert.ok(Math.abs(c[0].z - (0.1 + 1.0)) < 1e-3, `uzadı: ${c[0].z}`);
  assert.ok(c[0].z <= c[1].a + 1e-3 && c[0].z <= (placed[0].from + placed[0].frames) / 30 + 1e-3);
  // Yer yoksa uzamaz: sonraki satır hemen başlıyorsa eski bitiş kalır.
  const tight = { scenes: [{ dur: 0.5, voiceDur: 0.3, wordTimes: [{ word: "Gone.", t: 0.1 }] }, { dur: 2, voiceDur: 1.5, wordTimes: [{ word: "Then", t: 0 }, { word: "nothing.", t: 0.4 }] }] };
  const t = cues(buildSrt(tight, placeScenes(tight)));
  assert.ok(t[0].z <= t[1].a + 1e-3, "üst üste binme yok");
});
