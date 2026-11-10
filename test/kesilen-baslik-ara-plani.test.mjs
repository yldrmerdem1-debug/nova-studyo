// KESİLEN BAŞLIK ARA PLAN ALIR — motorun seçimi (lib/inserts.mjs insertable) çizilen yerle (scenes.tsx PlainTitle) aynı.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): kancadaki bölüm kartı olmayan başlık
// ("It Burned Down in One Night", 6,2 sn, arşiv resmi üstünde) dört ön izleme turunda da "yavaş kanca" diye raporlandı.
// Başlık bileşeni artık ara planları çiziyor (resim var, derinlik katmanı yok), ama insertable() 'title' satırını hiç
// seçmiyordu: kapı satırı işaretlese (s.cutaway) bile ara plan resmi üretilmez, ekranda aynı kare kalırdı. Kural:
// kapının kestiği düz başlık ara plan alır; bölüm kartı ve sıralama kartı almaz (ara plan çizmezler — resimleri boşa
// ödenirdi); işaretsiz başlık eskisi gibi tek resim. Statik + saf fonksiyon kontrolü; render, ffmpeg ve ağ YOK.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { insertable, planInserts, insertPicturesAhead } from "../docu-engine/lib/inserts.mjs";

const TITLE_SAY = "By the end, you'll know what happened on the mountain on Friday night, and what was truly lost.";
// Motora giden senaryodaki kanca başlığı (sahne 6, indeks 5): arşiv resmi, stok araması, ses 5,76 sn.
const TITLE5 = {
  type: "title", say: TITLE_SAY, title: "It Burned Down in One Night", image: "build/j/arch-15e5efeaa971.jpg",
  textStyle: "typewriter", source: "stock", search: "smoke mountain fog", archived: true, dur: 6, voiceDur: 5.76,
  wordTimes: [
    { word: "By", t: 0.1 }, { word: "the", t: 0.25 }, { word: "end,", t: 0.4 }, { word: "you'll", t: 0.7 }, { word: "know", t: 0.95 },
    { word: "what", t: 1.2 }, { word: "happened", t: 1.45 }, { word: "on", t: 1.9 }, { word: "the", t: 2.0 }, { word: "mountain", t: 2.2 },
    { word: "on", t: 2.75 }, { word: "Friday", t: 2.9 }, { word: "night,", t: 3.35 }, { word: "and", t: 3.9 }, { word: "what", t: 4.1 },
    { word: "was", t: 4.3 }, { word: "truly", t: 4.5 }, { word: "lost.", t: 5.0 },
  ],
};
const CUT = { ...TITLE5, cutaway: true };

test("kapının kestiği düz başlık ara plan alır; işaretsiz başlık tek resim kalır", () => {
  assert.equal(insertable(CUT), true);
  assert.equal(insertable(TITLE5), false, "işaretsiz başlık eskisi gibi kesilmez (bilinçli tasarım)");
  assert.equal(insertable({ ...CUT, noInserts: true }), false, "ara planı yanlış bulunan satır kesilmez");
});

test("bölüm kartı, sıralama kartı ve PlainTitle'ın çizmediği başlık ara plan almaz", () => {
  assert.equal(insertable({ ...CUT, chapterCard: true }), false, "bölüm kartı ara plan çizmez");
  assert.equal(insertable({ ...CUT, rankCard: true }), false, "sıralama kartı ara plan çizmez");
  // PlainTitle yalnızca resim varken ve derinlik katmanı yokken çizer; klip zaten hareket eder.
  assert.equal(insertable({ ...CUT, image: undefined }), false);
  assert.equal(insertable({ ...CUT, layers: { fg: "l1.png" } }), false);
  assert.equal(insertable({ ...CUT, video: "v.mp4" }), false);
  assert.equal(insertable({ ...CUT, voiceDur: 2 }), false, "zorunlu kesimin alt sınırı (FORCED_MIN_SEC) başlıkta da geçerli");
});

test("planda ve ChatGPT kutusu listesinde başlık satırı var; tarifsiz başlığa resim istenmez", () => {
  const script = { scenes: [{ type: "photo", say: "a", image: "a.jpg", dur: 3, voiceDur: 2.6 }, CUT] };
  const plan = planInserts(script);
  assert.deepEqual(plan.map((p) => [p.i, p.at.length]), [[1, 1]]);
  assert.ok(plan[0].at[0] > 0.8 && plan[0].at[0] < 5.76 - 0.6, "kesim konuşulan bir sözde");
  assert.match(plan[0].prompts[0], /^smoke mountain fog\. /, "tarif satırın kendi aramasından");
  assert.deepEqual(insertPicturesAhead(script).map((p) => p.i), [1]);
  const bare = { scenes: [script.scenes[0], { ...CUT, source: undefined, search: undefined }] };
  assert.deepEqual(planInserts(bare), [], "anlatımdan resim tarifi yapılmaz");
  assert.deepEqual(insertPicturesAhead(bare), []);
});

test("motorun başlık seçimi çizilen yerle aynı: düz başlık PlainTitle'a gider ve ara planı orada çizilir", () => {
  const scenes = fs.readFileSync(new URL("../docu-engine/src/scenes.tsx", import.meta.url), "utf8");
  // Title: sıralama kartı → RankTitle, bölüm kartı → TopicChapterCard, gerisi PlainTitle (insertable'ın dışladıkları).
  assert.match(scenes, /props\.scene\.rankCard \? <RankTitle \{\.\.\.props\} \/> : props\.scene\.chapterCard \? <TopicChapterCard \{\.\.\.props\} \/> : <PlainTitle \{\.\.\.props\} \/>/);
  const plain = scenes.slice(scenes.indexOf("const PlainTitle"), scenes.indexOf("const ChapterCard"));
  assert.match(plain, /scene\.image && !scene\.layers && scene\.inserts\?\.length \? \(/, "resim + katmansız başlıkta (insertable'ın koşulu)");
  assert.match(plain, /<InsertShots scene=\{scene\}/);
  const cards = scenes.slice(scenes.indexOf("const RankTitle"), scenes.indexOf("const PlainTitle")) + scenes.slice(scenes.indexOf("const ChapterCard"), scenes.indexOf("/* ======", scenes.indexOf("const ChapterCard")));
  assert.ok(cards.length > 0 && !cards.includes("InsertShots"), "bölüm/sıralama kartı ara plan çizmez — insertable onları seçmemeli");
});
