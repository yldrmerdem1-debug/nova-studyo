// GERÇEK GÖRÜNTÜ AKSIN (28 Ekim 2026, kanal sahibi: "koyduğun videolardaki videolar sanki çok hızlı geçiliyor… anlatım
// kısmına tam uyuyorsa 30 sn'likte koyulabilir… o kısımda geçiş hataları, duygu hataları var").
//
// Ölçülen (Husi–Suudi haberi 20261028-59b606, props): 12 klip, her biri yalnız kendi satırında, 3,8-8 sn. Elde 11-17 sn
// görüntü olan klipler (sahne 56: 17 sn, 62: 11, 122: 11) 6-7 sn'de kesildi; kaynak klipler zaten en çok 8 sn indiriliyordu
// (SOURCE_LIMITS.maxClipSec). Ardından gelen satırlar aynı anı anlatsa da her satıra yeni bir AI karesi kesiliyordu.
// Girişte gerçek klipten başlık kartına "whip", 56. sahneye "match" geçişi vardı.
//
// Kural:
//   1. Gerçek görüntü (arşiv klibi ya da kaynak videonun olay klibi) ardındaki satırlarda da sürer: o satırlar
//      bg:'prev' olur, motor klibi kaldığı yerden oynatır (produce.mjs finalizeClipWindows; gerçek görüntüde kamera yok).
//      Sınırlar: toplam en çok 30 sn ve klibin elindeki görüntü kadar; aynı bölüm; satır düz bir resim sahnesi
//      (kendi gerçek fotoğrafı, isim kartı, cihazı, harita/sayı kartı yok); izleyici çağrısı değil; duygu ailesi aynı;
//      satır yeni bir özel ad, yıl ya da tarih getirmiyor (yeni bir şey anlatıyorsa kendi resmi olmalı). Kancada (ilk 20
//      sn) tutma en çok 8 sn: açılışın kesme hızı korunur.
//   2. Gerçek görüntüye giriş ve çıkışta "whip/flash/glitch/zoom/spin" ve "match" geçişi kesmeye döner; tutulan satırlar
//      arasında geçiş yoktur (aynı çekim).
/** Senaryonun duyguları (docu-script.js MOODS) ailelerine: karanlık, aydınlık; kalanı (curious, reveal) nötr. */
const FAMILIES = { dark: new Set(["tension", "dread", "sad"]), light: new Set(["triumph", "calm"]) };

export const HOLD_LIMITS = { maxSec: 30, hookSec: 20, hookMaxSec: 8, maxLines: 5 };

/** İzleyici çağrısı satırı (beğen/abone/yorum/Hype): markCtaScenes `cta` yazar; eski senaryoda sözünden tanınır. */
export function isCallToAction(s) {
  if (s?.cta) return true;
  return /\b(?:hype\b|subscrib|hit (?:the )?like|like(?:,| and| &) subscribe|in the comments|leave a comment|comment (?:below|which|and)|tap (?:the )?bell)/i.test(String(s?.say || ""));
}

/** Gerçek görüntü: arşiv/stok klibi ya da kaynak videonun olay klibi (kişinin kendi sesi ayrı sahnedir, tutulmaz). */
export function isRealFootage(s) {
  return !!s?.video && !!(s.archived || s.sourceLabel) && !s.sourceVoice && !s.aiVideo;
}

/** Bir satırın kendi resmini isteyen işleri: cihazlar, kartlar, kendi gerçek fotoğrafı, isim kartı. */
const OWN_PICTURE_FIELDS = ["name", "stat", "annotate", "icons", "inserts", "present", "fromScene", "doc", "split", "board", "timeline", "quote", "chapterCard", "outro", "counter"];
function plainPictureLine(s) {
  if (!s || s.type !== "photo") return false;
  if (s.archived || s.image || s.video || s.sourceVoice) return false;
  return !OWN_PICTURE_FIELDS.some((k) => s[k] != null && s[k] !== false && s[k] !== "");
}

const clean = (t) => String(t || "").replace(/\[[^\]]*\]/g, " ");
const MONTHS = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
/** Satırın getirdiği yeni şey: öncekilerde geçmeyen özel ad (cümle başı hariç), yıl ya da ay adı. */
export function newNamedThing(line, known) {
  const text = clean(line);
  const k = clean(known).toLowerCase();
  for (const m of text.matchAll(/\b(1\d{3}|20\d{2})\b/g)) if (!k.includes(m[1])) return m[1];
  const mo = text.match(MONTHS);
  if (mo && !k.includes(mo[0].toLowerCase())) return mo[0];
  // Özel ad: büyük harfle başlayan, cümle başında olmayan sözcük ("Riyadh", "Lockwood", "C-GAUN").
  const words = [...text.matchAll(/(^|[.!?:;"“]\s*|\s)([A-Z][\p{L}\p{N}'’.-]*)/gu)];
  for (const w of words) {
    const atStart = /^$|[.!?:;"“]\s*$/.test(w[1]);
    const word = w[2].replace(/['’]s$/, "").replace(/[.-]+$/, "");
    if (atStart || word.length < 3 || /^(?:The|This|That|These|Those|Then|But|And|Yet|So|It|Its|They|There|Here|When|What|Why|How|One|Two|Three)$/.test(word)) continue;
    if (!k.includes(word.toLowerCase())) return word;
  }
  return null;
}

/** Duygu ailesi: tutulan çekimin ortasında müzik ve ton yön değiştirmesin. */
export function moodFamily(m) {
  const v = String(m || "").toLowerCase();
  if (!v) return "";
  return FAMILIES.dark.has(v) ? "dark" : FAMILIES.light.has(v) ? "light" : "neutral";
}
/** Karanlıktan aydınlığa (ya da tersi) dönen satır aynı çekimde kalmaz; nötr (merak, açığa çıkış) iki yana da uyar. */
const moodFlips = (a, b) => { const x = moodFamily(a), y = moodFamily(b); return !!x && !!y && x !== "neutral" && y !== "neutral" && x !== y; };

/** Klibin elindeki görüntü (sn): videoDur dosyadaki son kullanılabilir saniye, videoStart başlangıç. */
export function footageLeft(s) {
  const a = Number(s?.videoStart) || 0;
  const d = Number(s?.videoDur) || 0;
  if (!d) return 0;
  return d > a + 0.25 ? d - a : d;
}

/**
 * Bir klibin ardından kaç satırın onu sürdürebileceği. `avail` klibin elindeki görüntü (bilinmiyorsa sınırsız: indirme
 * öncesi istenen uzunluk). `span`: kaynak videoyu planlayan modelin "bu görüntü ardındaki N satıra da uyuyor" kararı —
 * verilmişse içerik kararı odur (yeni özel ad denetimi yapılmaz), yalnızca yapı kuralları uygulanır; verilmemişse (arşiv
 * klibi) yeni özel ad, yıl ya da ay getiren satırda durulur.
 * Dönüş: { lines: [resmi klibe dönen sahne indeksleri], sec: klip + tutulan satırlar (+ zaten tutulan yazı satırları) }.
 */
export function footageHold(scenes, i, { avail = Infinity, startSec = HOLD_LIMITS.hookSec, span = null, limits = HOLD_LIMITS } = {}) {
  const s = scenes[i];
  const own = Number(s?.dur) || 0;
  const cap = Math.min(startSec < limits.hookSec ? limits.hookMaxSec : limits.maxSec, avail + 0.5);
  const lines = [];
  let sec = own;
  let taken = 0;
  let known = [s?.say, s?.search, s?.caption, s?.sourceLabel, s?.title, s?.kicker].filter(Boolean).join(" ");
  const maxLines = span == null ? limits.maxLines : Math.min(limits.maxLines, Math.max(0, Math.trunc(span)));
  for (let j = i + 1; j < scenes.length && taken < maxLines; j++) {
    const n = scenes[j];
    if (!n || n.chapter !== s.chapter || isCallToAction(n)) break;
    const d = Number(n.dur) || 0;
    if (sec + d > cap) break;
    // Zaten önceki resmi tutan yazı satırı (words/slam bg:'prev') klibi zaten sürdürür; resim ister satırsa kendi resmi kalır.
    const textHeld = (n.type === "words" || n.type === "slam") && n.bg === "prev" && !n.image;
    if (!textHeld && !plainPictureLine(n)) break;
    if (!textHeld && moodFlips(s.mood, n.mood)) break;
    if (span == null && !textHeld && newNamedThing(n.say, known)) break;
    sec += d;
    taken++;
    if (!textHeld) lines.push(j);
    known += ` ${n.say || ""}`;
  }
  return { lines, sec: +sec.toFixed(2) };
}

/** Gerçek görüntünün kenarında kalabilen geçişler (motor edit-grammar.mjs T_FOOTAGE_OK ile aynı). */
const FOOTAGE_OK = new Set(["cut", "blackout", "dip-color"]);

/**
 * Senaryoya uygular (saf: kopya döner). Gerçek görüntüden sonraki uygun satırlar bg:'prev' olur, geçişler sadeleşir.
 * Dönüş: { script, held: [{scene, lines, sec}], edges }.
 */
export function holdFootage(script, { logFn = () => {}, limits = HOLD_LIMITS } = {}) {
  const scenes = (script?.scenes || []).map((s) => ({ ...s }));
  const held = [];
  let t = 0;
  const starts = scenes.map((s) => { const a = t; t += Number(s.dur) || 0; return a; });
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!isRealFootage(s) || isCallToAction(s)) continue;
    const r = footageHold(scenes, i, { avail: footageLeft(s), startSec: starts[i], span: Number.isFinite(s.holdSpan) ? s.holdSpan : null, limits });
    delete s.holdSpan;
    if (!r.lines.length) continue;
    for (const j of r.lines) {
      const n = scenes[j];
      delete n.imagePrompt;
      delete n.capped;
      n.bg = "prev";
      n.heldFootage = i;
      n.transition = "cut";
    }
    held.push({ scene: i, lines: r.lines, sec: r.sec });
    logFn(`Gerçek görüntü sürüyor: sahne ${i + 1} klibi ${r.lines.length} satır daha (${r.lines.map((j) => j + 1).join(", ")}), toplam ~${Math.round(r.sec)} sn`);
    i = r.lines.at(-1);
  }
  // Geçişler: gerçek görüntüye giriş, tutulan satırlar ve çekimden çıkış kesme.
  let edges = 0;
  const real = (k) => isRealFootage(scenes[k]) || scenes[k]?.heldFootage != null;
  for (let k = 0; k < scenes.length; k++) {
    const s = scenes[k];
    const into = real(k) && !(k > 0 && real(k - 1) && scenes[k].heldFootage != null);
    const out = k > 0 && real(k - 1) && !real(k);
    if ((into || out) && s.transition && !FOOTAGE_OK.has(String(s.transition))) {
      s.transition = "cut";
      edges++;
    }
  }
  if (edges) logFn(`Gerçek görüntü geçişleri: ${edges} hızlı geçiş (whip/flash/match) kesmeye döndü`);
  return { script: { ...script, scenes }, held, edges };
}
