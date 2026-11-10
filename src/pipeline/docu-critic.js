// UZUN VİDEO ELEŞTİRMENİ — zaman çizelgesi katmanı (ücretsiz, kare kaçırmaz).
//
// Kanal sahibi (Ekim 2026): "Nova benden iyi çıkarmalı". Bakker'ı şaheser yapan şey, v1'i kare kare izleyip
// v2'de düzeltmekti (15-30 sn bekleyen kareler, kararan klip, kaybolan görsel). Bu katman o bakışın ölçülebilen
// yarısı: render edilen senaryo + motorun kendi yerleşimi (docu-engine/src/timeline.js) üzerinden, piksele
// bakmadan, her sahnenin her saniyesini kontrol eder. Görme katmanı (docu-qa.js, Opus) gözle görülenleri bulur;
// ikisinin bulguları aynı qa.json'a girer.
//
//   too_short      video 10 dk altı (8 dk altında ara reklam konmaz)
//   hook_slow      ilk 30 sn'de bir kare 5 sn'den uzun kesilmeden duruyor (büyük kanallar 1,5-3 sn'de keser)
//   hook_not_real  video gerçek görselle açılmıyor (ilk kare AI/stok, ama videoda gerçek görsel var)
//   long_hold      aynı durağan kare 15 sn'den uzun ekranda (önceki-kare zinciri dahil)
//   cta            beğeni/abone çağrısı yok, birden fazla, ya da kancadan sonraki pencerenin (8-90 sn) dışında; kapanışta yorum sorusu yok
//   end_screen     son 20 sn'de yazılı kart (YouTube bitiş ekranı öğeleri üstüne biner)
//   ai_share       ilk 2 dakikada görsellerin yarıdan fazlası AI (izleyici güveni, "AI içerik" etiketi)
//   text_flash     0,8 sn'den kısa görünen yazı sahnesi (göz okuyamaz, "bir şey gelip kayboluyor")
import { sceneRows } from "./docu-qa.js";

export const CRITIC = {
  minSec: 600,
  shortHighSec: 480,
  hookWindowSec: 30,
  hookStillSec: 5,
  longHoldSec: 15,
  // 19 Ekim 2026 (kanal sahibi): üçlü çağrı kancadan hemen sonra — ilk 8 sn kancanındır, 90 sn sonrası geç.
  ctaFromSec: 8,
  ctaToSec: 90,
  // 20 Ekim 2026 derin inceleme: kancadan sonraki çağrı izleyicinin atladığı yer — kısa kalmalı (≤20 kelime ≈ 8 sn).
  ctaMaxSec: 8.5,
  endScreenSec: 20,
  aiWindowSec: 120,
  aiShareMax: 0.5,
  flashSec: 0.8,
};

const PICTURE_TYPES = new Set(["photo", "words", "slam", "title", "headline", "document", "quote", "montage"]);
const TEXT_CARDS = new Set(["stat", "board", "quote", "document", "timeline", "map", "split", "explainer", "ui-card", "chart", "bars", "donut", "scale", "flow", "icons", "counter", "headline"]);
const TEXT_SCENES = new Set(["words", "slam", "headline", "quote"]);
const isCard = (s) => s?.type === "title" && s.chapterCard;
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const ownPicture = (s) => (s.bg === "prev" || s.heldBg ? null : s.video ? `v:${s.video}` : s.image || null);
export const isRealPicture = (s) => !!s?.archived || s?.source === "archive";
export const isAiPicture = (s) => !isRealPicture(s) && (s?.source === "ai" || /(^|\/)(img|i2v|kling|new)-/.test(String(s?.image || s?.video || "")));

/**
 * Durağan çekimler: aynı resim (kendi resmi ya da önceki kareyi taşıyan sahneler) art arda, ara plan (inserts)
 * gelene kadar. Klip hareket eder, kart/grafik çekimi böler. → [{file, start, end, rows:[row…]}]
 */
export function stillShots(rows) {
  const out = [];
  let cur = null;
  const close = (at) => {
    if (cur) out.push({ ...cur, end: at ?? cur.end });
    cur = null;
  };
  for (const x of rows) {
    const s = x.s;
    if (isCard(s) || !PICTURE_TYPES.has(s.type)) { close(x.start); continue; }
    const own = ownPicture(s);
    if (own?.startsWith("v:")) { close(x.start); continue; }
    if (own && own !== cur?.file) { close(x.start); cur = { file: own, start: x.start, end: x.end, rows: [x] }; }
    else if (cur) { cur.end = x.end; cur.rows.push(x); }
    else continue;
    // Ara plan bir kesimdir: ondan sonrası (sahne sonuna kadar) başka bir resim.
    const cuts = (s.inserts || []).map((i) => Number(i?.at)).filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
    cuts.forEach((c, k) => {
      close(x.start + c);
      cur = { file: `${own || "insert"}#${k}`, start: x.start + c, end: x.end, rows: [x] };
    });
    if (cuts.length) close(x.end);
  }
  close();
  return out.map((sh) => ({ ...sh, sec: +(sh.end - sh.start).toFixed(2) }));
}

/**
 * @param script  render edilen senaryo (props: bölüm kartları ve ara planlar dahil)
 * @param placed  motor yerleşimi [{from, frames}] (yoksa yaklaşık)
 * @returns issues [{scene, time, kind, severity, detail, fix, source: "timeline"}] — docu-qa.js biçiminde
 */
export function critiqueTimeline(script, placed = null, { fps = 30, cfg = CRITIC, sensitive = false } = {}) {
  const rows = sceneRows(script, placed, fps);
  const total = rows.at(-1)?.end || 0;
  const out = [];
  const add = (row, kind, severity, detail, fix = "review", time = row?.start ?? 0) =>
    out.push({ scene: row?.scene ?? null, time: +Number(time).toFixed(2), kind, severity, detail, fix, source: "timeline" });
  if (!rows.length) return out;

  if (total < cfg.minSec) add(rows[0], "too_short", total < cfg.shortHighSec ? "high" : "medium", `Video ${clock(total)}: 10 dk altında (8 dk altında ara reklam da konamaz)`);

  const shots = stillShots(rows);
  for (const sh of shots) {
    const first = sh.rows[0];
    if (sh.start < cfg.hookWindowSec && sh.sec > cfg.hookStillSec) {
      add(first, "hook_slow", sh.sec > cfg.longHoldSec ? "high" : "medium", `Kancada aynı kare ${sh.sec.toFixed(1).replace(".", ",")} sn kesilmeden duruyor (büyük kanallar 1,5-3 sn'de keser)`, "insert", sh.start);
    } else if (sh.sec > cfg.longHoldSec) {
      const sc = [...new Set(sh.rows.map((r) => r.scene).filter((v) => v !== null))];
      // Kapanışın son görüntüsü bilerek durabilir (son 30 sn): yalnızca not edilir.
      const closing = sh.end > total - 30;
      add(first, "long_hold", closing ? "low" : sh.sec > cfg.longHoldSec * 1.6 ? "high" : "medium", `Aynı kare ${Math.round(sh.sec)} sn ekranda (sahne ${sc.map((v) => v + 1).join(", ")})`, "insert", sh.start);
    }
  }

  // Video gerçek görselle açılmalı: ilk görselli satır AI/stoksa ve videoda gerçek görsel varsa.
  const pictured = rows.filter((x) => !isCard(x.s) && PICTURE_TYPES.has(x.s.type) && ownPicture(x.s));
  const opener = pictured[0];
  if (opener && opener.start < 10 && !isRealPicture(opener.s) && pictured.some((x) => isRealPicture(x.s))) {
    add(opener, "hook_not_real", "medium", `Video ${isAiPicture(opener.s) ? "AI" : "stok"} görselle açılıyor; videoda konunun gerçek görselleri var — ilk kare hikâyenin kendisi olmalı`);
  }

  // İlk 2 dakikada AI oranı.
  const early = pictured.filter((x) => x.start < cfg.aiWindowSec);
  const ai = early.filter((x) => isAiPicture(x.s));
  if (early.length >= 4 && ai.length / early.length > cfg.aiShareMax) {
    add(ai[0], "ai_share", "medium", `İlk 2 dakikada görsellerin %${Math.round((100 * ai.length) / early.length)}'i AI (${ai.length}/${early.length}); gerçek görsel önce`);
  }

  // Tek izleyici çağrısı (docu-rhetoric.js markCtaScenes), kancadan hemen sonra (8-90 sn); kapanışta yorum sorusu.
  const likes = rows.filter((x) => x.s.cta === "like");
  // Hassas konuda (salgın, felaket, toplu ölüm — docu-rhetoric.js sensitiveTopic) beğeni ricası bilerek yok.
  if (!likes.length) { if (!sensitive) add(rows[0], "cta", "low", "Beğeni/abone çağrısı yok"); }
  else if (likes.length > 1) add(likes[1], "cta", "medium", `Beğeni/abone çağrısı ${likes.length} kez (tek kez olmalı)`);
  else {
    const at = likes[0].start;
    if (at < cfg.ctaFromSec || at > cfg.ctaToSec) add(likes[0], "cta", "low", `Beğeni/abone/yorum çağrısı ${Math.round(at)}. saniyede (kancadan hemen sonra, ${cfg.ctaFromSec}-${cfg.ctaToSec} sn arası olmalı)`);
    const len = likes[0].end - likes[0].start;
    if (len > cfg.ctaMaxSec) add(likes[0], "cta", "low", `Beğeni/abone/yorum çağrısı ${len.toFixed(1).replace(".", ",")} sn sürüyor (en çok ~8 sn: izleyici bu kısmı atlıyor)`);
  }
  if (!rows.some((x) => x.s.cta === "comment" && x.start >= total * 0.75)) add(rows.at(-1), "cta", "low", "Kapanışta yorum sorusu yok");

  // Son 20 sn: YouTube bitiş ekranı öğeleri yazılı kartın üstüne biner.
  for (const x of rows) if (x.end > total - cfg.endScreenSec && TEXT_CARDS.has(x.s.type)) { add(x, "end_screen", "low", `Son ${cfg.endScreenSec} sn'de yazılı kart (${x.s.type}): bitiş ekranı öğeleri üstüne biner`); break; }

  // Göz okuyamadan kaybolan yazı.
  for (const x of rows) if (TEXT_SCENES.has(x.s.type) && x.end - x.start < cfg.flashSec) add(x, "text_flash", "medium", `Yazı ${(x.end - x.start).toFixed(2).replace(".", ",")} sn ekranda (okunmadan kayboluyor)`, "rerender");

  return out.sort((a, b) => a.time - b.time);
}
