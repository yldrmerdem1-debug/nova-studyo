// ÖN İZLEME KAPISI — render'dan ÖNCE her sahnenin bir karesi çizilir ve denetlenir; düzeltmeler render'dan önce yapılır.
//
// 17 Ekim 2026, Ebola gündem videosu: 75 dakikalık render'dan sonra kalite denetimi 25 sorun buldu — açılış haritasında
// Kongo boş, Uganda ve Kenya bayraklı; arka plandaki TV'de başka haber akan haber odası; "COVID" yazan aşı şişeleri;
// "9,144 CONFIRMED CASES AND" diye yarım kalan sayaç; neredeyse siyah bir kart. Düzeltme turu yeniden seçip parçaları
// yeniden render etti, bir saat daha. Kullanıcı: "görsel seçimi falan herşey önceden belli olsun, render kısmında bunlar
// fark edilmesin". Görseller, ses ve zamanlama render'dan önce zaten hazırlanabiliyor (motorun hazırlık modu); kare
// çizmek saniyeler sürer. Akış: hazırla → her sahneden bir kare → render sonrası denetimin AYNI görme denetimi →
// düzelt (arşivi yeniden seç, AI görselini yeniden üret, yazıyı sadeleştir) → yalnızca değişenleri yeniden hazırla →
// en çok iki tur → tek render.
import fs from "node:fs";
import path from "node:path";
import { judgeFrames, sceneRows, qaFixPlan, farRepeats, nearRepeats, frameHashes, frameLook, lookStats, lookFindings, CONTENT_DEVICES, ARCHIVE_TYPES } from "./docu-qa.js";
import { critiqueTimeline, stillShots } from "./docu-critic.js";
import { stripTags, realCastOf } from "./docu-script.js";
import { readJson } from "../util.js";
import { peopleNames, namesIn, shownName, hideNames } from "./docu-archive.js";

/*
 * KAPI KENDİ DÜZELTMESİNE DE BAKAR (France, 20 Ekim 2026 — kanal sahibi: "en kral mimari derken sen bunu yapmadın mı"):
 * eski kapı iki tur bakıyordu ama 2. turun düzeltmeleri (10 arşiv yeniden seçimi, 5 AI görseli) hiç görülmeden render'a
 * gitti; yeni seçimler yine yanlıştı (Filipin → ABD polisi), render sonrası denetim 26 sorun saydı. Şimdi: 1. tur bütün
 * sahneler; sonraki turlar YALNIZCA değişen sahnelerin karesini çizer (birkaç kare, birkaç saniye) ve onlara bakar —
 * düzeltme kalmayana ya da PREVIEW_ROUNDS dolana kadar. Aynı sahne PICK_AI_AFTER kez yanlış gelirse AI'a düşer.
 */
// 6 tur (25 Ekim 2026, kanal sahibi: "denetim yapmasın, direkt kusursuz çıksın"): 1. tur bütün kareler; sonraki turlar
// yalnızca o turda değişen sahneleri çizer — sorunlu sahne doğru görsel bulunana kadar yeniden seçilir, render bir kez.
export const PREVIEW_ROUNDS = 6;
/** Tam tur: bütün sahneler. Sonrakiler doğrulama turu (yalnızca değişenler). */
export const FULL_ROUNDS = 1;
const FPS = 30;
const isCard = (s) => s?.type === "title" && s.chapterCard;
const SEV = { low: 0, medium: 1, high: 2 };
/** Görsel anlatıma uymuyorsa: arşivde yeniden seçilir, AI görseli yeniden üretilir. */
const PICTURE_KINDS = new Set(["mismatch", "anachronism", "bad_crop", "wrong_face", "generic", "ai_look", "broken", "repeat"]);
/*
 * TEK RENDER (19 Ekim 2026, kanal sahibi: "sürekli rendere girmesin, tekte mükemmel çıkarmalı"): ön izleme render'dan
 * önce her sahneyi görür; düşük önemli görsel uyuşmazlık da (Bitcoin jetonu "kuma düşen bozuk para" için, "HOME INSURANCE"
 * belgesi deniz sigortası için, adı okunan tanker "gemi adı açıklanmadı" için — Hürmüz) burada düzeltilir. Render sonrası
 * denetim yalnızca ağır bir sorun kalırsa yeniden render ister (docu.js).
 * Cihazda değil (Kartal Yuvası incelemesi, 25 Ekim 2026): düşük önemli tek bir not (CNN "gazetesi", soluk harita köşesi)
 * bilinçli haritayı, alıntıyı, manşeti düz resme çeviriyordu; cihaz ancak orta ya da yüksek önemli bulguyla sade görsele döner.
 */
const LOW_FIXED = (x, s) => x.severity === "low" && PICTURE_KINDS.has(x.kind) && !x.device && !CONTENT_DEVICES.has(s?.type);
const TEXT_KINDS = new Set(["text_overflow", "text_on_face"]);
const PICTURE_TYPES = new Set(["photo", "words", "slam", "title"]);
/** Sahnenin KENDİ arşiv resmi: önceki/sonraki kareyi taşıyan satırın resmi komşusunundur, yeniden seçimi bir şey değiştirmez. */
const ownArchive = (s) => !!s?.archived && s.bg !== "prev" && s.bg !== "next" && !s.heldBg;
/*
 * İSTEME GİDEN ANLATIMDA GERÇEK AD YOK (inceleme, 27 Ekim 2026; Lula 20261026-29db03): not anlatımı istemin sonuna ekler
 * ("…what the narration says: His opponent was Senator Flávio Bolsonaro…") — gerçek kişinin adı görüntü modeline gidiyordu.
 * Senaryonun gerçek kişileri (realNames: realCast + isim kartları) "the person" olur (docu-archive.js hideNames); motor
 * yüzü sahnenin anlatımına bakarak yine gizler. docu.js'in "AI'a düşen arşiv sahnesi" notu da bu fonksiyondur.
 */
const sayNote = (s, names) => hideNames(stripTags(s?.say || ""), names);
export const aiNote = (s, names = []) => `it must plainly show what the narration says: ${sayNote(s, names).slice(0, 220)}`;
const brokenNote = (s, names = []) => `a clear, well-exposed picture, never a blank, white or washed-out frame — it must plainly show what the narration says: ${sayNote(s, names).slice(0, 200)}`;
/**
 * Senaryonun gerçek kişilerinin adları: realCast (eski senaryoda realCastOf) ve isim kartları/alıntı sahipleri (peopleNames).
 * realCast'taki CAST ANAHTARLARI alınmaz (inceleme, 27 Ekim 2026): "imf_chief", "student", "tel_aviv_protester" rol/yer
 * sözcüğüdür — anlatımdaki "College Students" (Macaristan 20261011-a5d8bf), "In Tel Aviv" "the person" oluyordu. Anahtarın
 * ad sözcüğü ("ananenko_young" → Ananenko) peopleNames'ten gelir: anlatımda hep büyük harfle geçen sözcük.
 */
export function realNames(script) {
  const cast = Array.isArray(script?.realCast) ? script.realCast : realCastOf(script || {});
  const keys = script?.cast || {};
  return [...new Set([...cast.filter((n) => !Object.hasOwn(keys, n)), ...peopleNames(script).map((p) => p.ad)].map(String).filter(Boolean))];
}
/** Yazı kartının yazı düzeltmesi. Şema/kart başlığı taşıyorsa başlık kalkar (adımlar ve satırlar kalır). */
const textFix = (s) => (s.type === "words" ? (s.textMode === "key" ? "clean-picture" : "key-only") : ["slam", "title"].includes(s.type) ? "other-style" : s.title ? "drop-title" : null);
const TEXT_FIXES = new Set(["key-only", "clean-picture", "other-style", "drop-title"]);
/** Düzeltmenin bozuk kare basamağı: yazı düzeltmeleri tek basamak ("text"). */
const stepOf = (fix) => (TEXT_FIXES.has(fix) ? "text" : fix);

/*
 * YAZI YÜZDE: ÖNCE YÜZDEN İNER, SONRA ESKİ DÜZELTME, SONRA DURUR (Lula, 26 Ekim 2026, iş 20261026-29db03): kancanın başlığı
 * "HOW BRAZIL REALLY VOTED" Lula'nın ağzının üstündeydi; kapı altı turun altısında da "text_on_face" buldu ve her turda aynı
 * "other-style"ı verdi — stil değişti, yazı kadrajın ortasında kaldı, 3-6. turlar yalnızca bu sahne için döndü. Artık
 * basamaklar sırayla ve her biri sahnede bir kez: "text-low" (büyük yazı alt üçte bire iner; motor textAt), sonra yazının
 * eski düzeltmesi (textFix: kart yazısız/anahtar kelime, başlık/vuruş başka stil); basamaklar bitince yalnızca bildirilir.
 */
function faceSteps(s) {
  const low = ["words", "slam", "title"].includes(s.type) && !s.layers && s.textAt !== "low" ? "text-low" : null;
  return [low, textFix(s)].filter(Boolean);
}

/*
 * AD BAŞKASININ RESMİNDE (Çernobil, 26 Ekim 2026, iş 20261026-24122a): "Their names were Oleksiy Ananenko…" satırının dev
 * "ANANENKO"su önceki sahnenin AI kontrol odası resmindeki başka adamların üstündeydi. Kapı "wrong_face" buldu; düzeltmesi
 * satırın KENDİ AI istemine not yazmaktı — satır önceki karenin resmini taşıyordu (bg prev), istemi hiç kullanılmadı, render
 * sonrası denetim aynı kusuru yine buldu. Gerçek kişinin yüzünü AI çizemez, komşunun resmi bu satır için yeniden seçilemez:
 * ad kalkar ("drop-name": isim kartı ve altyazı silinir, kart ve vuruş yazısız kalır; adı anlatım söyler). Kendi arşiv resmi
 * olan satır eskisi gibi yeniden seçilir (qaFixPlan). Ad bilgisi yoksa da önceki/sonraki karenin üstündeki yazı kalkar.
 */
const heldPicture = (s) => s?.bg === "prev" || s?.bg === "next" || !!s?.heldBg;
const nameDroppable = (s) => (s?.type === "photo" && !!(s.name || s.caption)) || (s?.type === "words" && s.textMode !== "none") || s?.type === "slam";
// Önceki/sonraki karenin üstündeki satır: kişiler biliniyorsa yalnızca yazısı bir AD taşıyorsa (inceleme, 27 Ekim 2026:
// adsız anahtar kelime kalkınca yanlış yüz yine ekranda kalıyordu, yalnızca zararsız yazı gidiyordu).
const nameOnWrongPicture = (x, s, people) => x.kind === "wrong_face" && !ownArchive(s) && nameDroppable(s)
  && (!!s.name || namesIn(shownName(s), people).length > 0 || (heldPicture(s) && !people.length));

/*
 * BOZUK KARE DÜZELTMESİZ GEÇMEZ (Denizaltı çarpışması, 25 Ekim 2026, iş 20261024-373aaf): rapor-tur-1'de dört "broken"
 * vardı — sahne 29 "neredeyse tamamen beyaz/krem", 131 "tamamen boş bej vinyet" (ikisi arşiv fotoğrafı, HIGH), 4 ve 74
 * çizilmemiş harita — plan {repick:[2,100,160,139], ai:[…], patches:[]} hiçbirine dokunmadı: arşiv fotoğrafının bozukluğu
 * "rerender" sayılıyordu (yeniden seçim yalnızca klipte), cihazın bozukluğunun düzeltme yolu yoktu; dördü render'a gidecekti.
 * Artık basamaklar sırayla, her biri sahnede bir kez: bozukluk sürerse sonraki tur bir sonrakini dener, basamaklar bitince
 * kapı o sahneyi bırakır (tur dönmez; render sonrası denetim söyler).
 *  - resim sahnesi: kaynağı (arşiv → yeniden seç, AI → bozuk kare notuyla yeniden üret; yazı kartında yazının uygulaması da),
 *    sonra efektler kalkar (simplify: flash/zoom-blur yanığı), en son sahne önceki karenin üstünde yazısız kalır (prev-picture);
 *  - cihaz: kendi arşiv resmi varsa (manşet, belge, alıntı) önce o yeniden seçilir (cihaz yeniden kurulur), sonra sade
 *    görsele döner (device-fallback); döndüğü sahne resim sahnesi olarak devam eder.
 */
function brokenSteps(s) {
  if (CONTENT_DEVICES.has(s.type)) return [ownArchive(s) && ARCHIVE_TYPES.has(s.type) ? "repick" : null, "device-fallback"].filter(Boolean);
  if (!PICTURE_TYPES.has(s.type)) return [];
  const pic = ownArchive(s) ? "repick" : !s.archived && s.imagePrompt ? "ai" : null;
  const first = s.type === "photo" ? [pic] : pic === "ai" ? [pic, "text"] : ["text", pic];
  return [...first, s.fx?.length || s.icons?.length ? "simplify" : null, s.type === "title" ? null : "prev-picture"].filter(Boolean);
}

/*
 * KARE GEÇİŞİN İÇİNDEN ALINMAZ (Denizaltı çarpışması, 25 Ekim 2026, iş 20261024-373aaf): rapor-tur-1'in üç yüksek
 * önemli "broken"ı — sahne 29 "neredeyse tamamen beyaz/krem", 74 "boş bej vinyet", 131 "tamamen boş bej vinyet zemin" —
 * resmin değil anın kusuruydu: arch-17ae2f543544.jpg, arch-05772a976686.jpg ve harita sağlam. Oturma anı (son kelime +
 * 14 kare) sahnenin sonunu aşıp sahnenin EN SON karesine kısılıyordu (188'de 187, 160'ta 159, 139'da 138): orası çıkan
 * geçişin içi — film-burn kareyi beyaz-sıcak filme yakar, epik türün dip-color'ı bej #f1dcaa'ya batırır — ve yazının,
 * ikonun söndüğü son kareler. Bozuk kare basamakları (brokenSteps) iki sağlam arşiv fotoğrafını yeniden seçtirecek (eski
 * seçim kalıcı reddedilir), haritayı düz resme çevirecekti. Artık her an sahnenin oturmuş, tam görünen aralığındadır:
 * giren geçiş, konu silmesi ve başlangıç efekti bittikten sonra; çıkan geçiş, konu silmesi ve yazının sönmesi başlamadan
 * önce (motorun kendi pencere uzunluklarıyla); an bir sözcüğün flaş karesine düşerse o sözcüğün hemen öncesi. Sahne bu
 * aralığa yetmeyecek kadar kısaysa ortası alınır ve an "edge" işaretlenir: o karedeki bozukluk yalnızca bildirilir.
 */
/** Motorun kesme pencereleri, kare: [kesmeden önce, sonra] (docu-engine/src/effects/catalog.ts TRANSITION_CATALOG.frames). */
export const TRANSITION_WINDOW = {
  cut: [0, 0], flash: [0, 4], zoom: [0, 7], glitch: [0, 5], blackout: [0, 8], whip: [0, 7], leak: [0, 12],
  "film-burn": [9, 10], ink: [5, 12], "paper-tear": [5, 9], slide: [4, 6], iris: [8, 9], match: [7, 9], pixel: [6, 6],
  "light-sweep": [6, 7], "dip-color": [7, 9], "spin-blur": [4, 6], "split-wipe": [5, 7],
};
/**
 * Sahnenin kendi örtüleri, kare (30 fps): konu silmesi girişte/çıkışta (topic/motifs.tsx WIPE_IN/WIPE_OUT); yazı, alt yazı
 * ve ikon son 10 karede söner (looks/text.tsx, topic/caption.tsx, topic/icons.tsx); flaş karesi vuruştan 4 kare sürer
 * (effects/overlays.tsx FlashFx); başlangıç efektleri: film-burn 1,1 sn yanık, zoom-blur 12 kare iz (effects/).
 */
export const SCENE_COVER = { wipeIn: 12, wipeOut: 10, exitFade: 10, flash: 4, startFx: { "film-burn": 33, "zoom-blur": 12 } };
/**
 * Bir kesmenin [önceki sahnenin son, sonraki sahnenin ilk] örtülü kare sayısı. Çift geçiş (kesmeden önce de çizer) iki
 * çekimin üçte birini geçmez, en az 2 kare (effects/transitions.tsx pairFrames); tek taraflı geçiş yalnızca giren sahnede.
 * Yazılmamış geçişi motor kendisi seçer (timeline.js pickTransitions): türlerin en uzunu varsayılır.
 */
function cutWindow(kind, prevFrames, curFrames) {
  if (!TRANSITION_WINDOW[kind]) {
    const all = Object.keys(TRANSITION_WINDOW).map((k) => cutWindow(k, prevFrames, curFrames));
    return [Math.max(...all.map((w) => w[0])), Math.max(...all.map((w) => w[1]))];
  }
  const [a, b] = TRANSITION_WINDOW[kind];
  return a ? [Math.max(2, Math.min(a, Math.floor(prevFrames / 3))), Math.max(2, Math.min(b, Math.floor(curFrames / 3)))] : [0, b];
}
/** Sahnenin oturmuş, tam görünen aralığı [lo, hi] (sahne içi kare; lo > hi: sahne buna yetmiyor). İlk sahne kesmeyle başlar. */
export function cleanSpan(scenes, placed, i) {
  const s = scenes?.[i] || {};
  const p = placed[i];
  const prev = placed[i - 1];
  const next = placed[i + 1];
  const into = i > 0 && prev ? cutWindow(s.transition, prev.frames, p.frames)[1] : 0;
  const out = next ? cutWindow(scenes[i + 1]?.transition, p.frames, next.frames)[0] : 0;
  const fx = Array.isArray(s.fx) ? s.fx : [];
  const lo = Math.max(into, s.wipe ? SCENE_COVER.wipeIn : 0, ...fx.map((k) => SCENE_COVER.startFx[k] || 0));
  const hi = p.frames - 1 - Math.max(out, scenes[i + 1]?.wipe ? SCENE_COVER.wipeOut : 0, SCENE_COVER.exitFade);
  return [lo, hi];
}

/**
 * Her sahneden bir an: sahne oturduğunda (son kelimeden ~0,5 sn sonra, kelime yoksa sahnenin %70'i) — yazılar tam
 * görünmüş, görsel yerinde —, sahnenin temiz aralığına kısılmış (cleanSpan). Render sonrası denetim kareyi sabit aralıkla
 * alır; yarım görünen yazı orada da sayılır.
 */
/*
 * HER GÖRSEL GÖRÜLÜR (Kartal Yuvası, 25 Ekim 2026): kapı sahne başına TEK kare görüyordu; ara planlar (scene.inserts)
 * ve uzun sahnenin ilk görseli hiç görülmedi. Kapı 13 → 2 bulguya indi, render sonrası denetim 21 saydı: kancada gerçek
 * fotoğraf gibi duran AI yangın karesi, Hint plakalı motosiklet, ABD itfaiyesi, konum işaretli sahte kulübe — hepsi ara
 * plan ya da sahne ortası. Artık her ara planın oturduğu an (+0,7 sn) ve 7 sn'den uzun ara plansız sahnenin %35'i de çizilir.
 */
export const LONG_SCENE_SEC = 7;
export function previewMoments(scenes, placed, fps = FPS) {
  const out = [];
  (scenes || []).forEach((s, i) => {
    const p = placed?.[i];
    if (!p || !(p.frames > 0)) return;
    const words = Array.isArray(s.wordTimes) ? s.wordTimes : [];
    const settled = words.length ? Math.round(Number(words[words.length - 1].t || 0) * fps) + 14 : Math.round(p.frames * 0.7);
    const [lo, hi] = cleanSpan(scenes, placed, i);
    const edge = lo > hi;
    const inSpan = (f) => (edge ? Math.floor(p.frames / 2) : Math.max(lo, Math.min(hi, f)));
    let local = inSpan(isCard(s) ? Math.round(2.2 * fps) : settled);
    // Flaş karesi sahnenin vuruşunda patlar (effects/timing.ts mainHit); vuruşu motor seçer (scenes.tsx sceneImpacts, vurgulu
    // sözcük), kapı bilemez: her sözcük olası vuruş sayılır — an bir sözcüğün flaşına düşebiliyorsa o sözcüğün hemen öncesi.
    if (!edge && Array.isArray(s.fx) && s.fx.includes("flash-frame")) {
      for (const w of [...words].reverse()) {
        const wf = Math.round(Number(w?.t) * fps);
        if (local >= wf && local < wf + SCENE_COVER.flash && wf - 1 >= lo) local = wf - 1;
      }
    }
    out.push({ r: i, frame: p.from + local, t: (p.from + local) / fps, ...(edge ? { edge: true } : {}) });
    if (isCard(s) || edge) return;
    const ins = Array.isArray(s.inserts) ? s.inserts : [];
    ins.forEach((x, k) => {
      // Ara plan kesildiği karede başlar, sonrakine ya da sahne sonuna kadar durur (scenes.tsx InsertShots): an, o görünürken.
      const from = Math.round(Number(x?.at) * fps);
      const at = Math.min(hi, Math.round((Number(x?.at) + 0.7) * fps));
      if (!(at > 0 && at >= from && at >= lo) || Math.abs(at - local) < fps * 0.5) return;
      out.push({ r: i, frame: p.from + at, t: (p.from + at) / fps, ins: k });
    });
    if (!ins.length && p.frames > LONG_SCENE_SEC * fps) {
      const mid = inSpan(Math.round(p.frames * 0.35));
      if (Math.abs(mid - local) > 2 * fps) out.push({ r: i, frame: p.from + mid, t: (p.from + mid) / fps });
    }
  });
  return out.sort((a, b) => a.frame - b.frame);
}

/**
 * Bulgulardan düzeltme planı (saf):
 *  - repick: arşiv/stok görseli anlatıma uymuyor (render sonrası denetimin planıyla aynı: qaFixPlan)
 *  - ai: AI görseli anlatıma uymuyor ya da bozuk → istem, anlatımın kendisiyle güçlendirilip yeniden üretilir
 *  - patches: yazı taşıyor/yüzü kapatıyor → yazının uygulaması değişir (tasarım kapısının düzeltmeleriyle aynı);
 *    cihazın içeriği yanlış (harita, bölünmüş ekran, manşet…) → sahne sade görsele döner ("device-fallback")
 *  - bozuk kare ("broken") → basamaklardan sıradaki (brokenSteps): yeniden seçim, AI, yazı, efekt, önceki kare ya da cihaz yedeği;
 *    kare geçişin içinden alınmışsa (x.edge: sahne temiz aralığa yetmiyor) düzeltme yok, yalnızca bildirilir
 * @param scenes motora giden senaryo (engine-script; bölüm kartı yok) — `scene` indeksleri buna göre
 * @param tried  önceki turların düzeltmeleri (priorFixes): sahne → [{kind, fix}] — bozuk karede denenmiş basamak atlanır
 * @param people senaryonun kişileri (docu-archive.js peopleNames): ekrandaki ad başkasının resmindeyse ad kalkar
 * @param names  gerçek kişi adları (realNames): AI notuna giden anlatımda "the person" olur
 */
export function previewFixPlan(issues, scenes, { fp, tried = null, people = [], names = [] } = {}) {
  const low = (x) => LOW_FIXED(x, scenes?.[x.scene]);
  const list = (issues || []).filter((x) => x && x.scene !== null && x.scene !== undefined && (SEV[x.severity] >= 1 || low(x))).map((x) => (low(x) ? { ...x, severity: "medium" } : x));
  // Bozuk kare kendi basamaklarından geçer (aşağıda): arşiv klibinin "repick"i de birinci basamağı.
  const repick = qaFixPlan({ issues: list.filter((x) => x.kind !== "broken") });
  const taken = new Set(repick.map((f) => f.scene));
  const ai = [];
  const patches = [];
  for (const x of list) {
    const s = scenes?.[x.scene];
    if (!s || taken.has(x.scene)) continue;
    // Sorun bir ara plandaysa (x.insert) sahnenin kendi görseli değil o ara plan gider: sahne ara plansız kalır.
    if (x.insert && PICTURE_KINDS.has(x.kind) && fp) {
      taken.add(x.scene);
      patches.push({ say: fp(s), fix: "no-inserts", reasons: x.detail, scene: x.scene, kind: x.kind });
      continue;
    }
    if (x.kind === "broken") {
      // Geçiş/sönme karesindeki "boş/bozuk" kare, resmin kanıtı değil: sağlam resim atılmaz, cihaz düz resme dönmez.
      if (x.edge) continue;
      const done =new Set((tried?.get(x.scene) || []).filter((f) => f.kind === "broken").map((f) => stepOf(f.fix)));
      // Not istemde zaten var: aynı istem aynı resmi getirir (görselin önbellek anahtarı istem) — basamak denenmiş sayılır.
      if (String(s.imagePrompt || "").includes(brokenNote(s, names))) done.add("ai");
      // Önceki karenin üstünde yazısız kalan sahne son basamaktadır (yazı geri gelmez).
      const step = done.has("prev-picture") ? null : brokenSteps(s).find((k) => !done.has(k));
      if (!step) continue;
      if (step === "repick") repick.push({ scene: x.scene, kind: x.kind, detail: x.detail });
      else if (step === "ai") ai.push({ scene: x.scene, kind: x.kind, detail: x.detail, note: brokenNote(s, names) });
      else if (fp) patches.push({ say: fp(s), fix: step === "text" ? textFix(s) : step, reasons: x.detail, scene: x.scene, kind: x.kind });
      else continue;
      taken.add(x.scene);
      continue;
    }
    // İçeriği yanlış cihaz (Kartal Yuvası, 25 Ekim 2026: Almanya'daki yerler Avusturya bayrağının içinde, Berghof'suz
    // "BERGHOF: HIS HOME" paneli): bulgu eskiden atılıyordu, düzeltme yolu da yoktu. Sahne kendi resmiyle sade görsele
    // döner (senaryodaki geçersiz cihazın yedeği gibi); doğrulama turu yeni kareye bakar.
    if (x.fix === "device-fallback" && CONTENT_DEVICES.has(s.type)) {
      if (!fp) continue;
      taken.add(x.scene);
      patches.push({ say: fp(s), fix: "device-fallback", reasons: x.detail, scene: x.scene, kind: x.kind });
      continue;
    }
    // Ad başkasının resminde (nameOnWrongPicture): AI notu ya da komşunun resmi düzeltmez — ad kalkar, bir kez.
    if (nameOnWrongPicture(x, s, people)) {
      if (!fp || (tried?.get(x.scene) || []).some((f) => f.fix === "drop-name")) continue;
      taken.add(x.scene);
      patches.push({ say: fp(s), fix: "drop-name", reasons: x.detail, scene: x.scene, kind: x.kind });
      continue;
    }
    // Adsız yazının altındaki komşu resimde yanlış yüz: bu satırda düzeltecek bir şey yok (istemi kullanılmıyor, ad yok) —
    // AI notu yalnızca boş bir doğrulama turu açardı; bulgu raporda kalır.
    if (x.kind === "wrong_face" && heldPicture(s)) continue;
    if (PICTURE_KINDS.has(x.kind) && !s.archived && s.imagePrompt && PICTURE_TYPES.has(s.type)) {
      const note = aiNote(s, names);
      // Not önceki turda istemine yazıldı: aynı istem aynı resmi getirir — "yeniden üretmek" turu boşa döndürürdü.
      if (String(s.imagePrompt).includes(note)) continue;
      taken.add(x.scene);
      ai.push({ scene: x.scene, kind: x.kind, detail: x.detail, note });
    } else if (TEXT_KINDS.has(x.kind)) {
      // Şema/kart başlığı taşıyorsa başlık kalkar (adımlar ve satırlar kalır); eskiden bu türlerin düzeltmesi yoktu.
      // Yüzdeki yazı basamaklarla (faceSteps): önce alt üçte bir, sonra yazının düzeltmesi, denenmiş basamak tekrarlanmaz.
      const done = new Set((tried?.get(x.scene) || []).filter((f) => f.kind === "text_on_face").map((f) => f.fix));
      const fix = x.kind === "text_on_face" ? faceSteps(s).find((k) => !done.has(k)) : textFix(s);
      if (!fix || !fp) continue;
      taken.add(x.scene);
      patches.push({ say: fp(s), fix, reasons: x.detail, scene: x.scene, kind: x.kind });
    }
  }
  return { repick, ai, patches };
}

/**
 * Önceki turların düzeltmeleri (on-izleme/rapor-tur-1…N-1.json `fixes`): sahne → [{kind, fix}], turların sırasıyla.
 * Turlar 1'den sırayla yazılır (senaryo değişince 1. tur baştan): N'den küçük raporlar bu senaryonundur. Sahne sırası
 * kaymışsa (araya ses klibi girdi) kayıt başka sahneye düşmez: anlatımın parmak izi tutmalı.
 */
export function priorFixes(outDir, round, { scenes, fp } = {}) {
  const out = new Map();
  for (let k = 1; k < round; k++) {
    for (const f of readJson(path.join(outDir, `rapor-tur-${k}.json`), null)?.fixes || []) {
      if (f?.scene === null || f?.scene === undefined || !f.fix) continue;
      if (fp && f.fp && scenes?.[f.scene] && fp(scenes[f.scene]) !== f.fp) continue;
      if (!out.has(f.scene)) out.set(f.scene, []);
      out.get(f.scene).push({ kind: f.kind, fix: f.fix });
    }
  }
  return out;
}

/** AI notları sahnenin istemine yazılır (istem değişince görsel yeniden üretilir). Yerinde değişir; kaç sahne döner. */
export function applyPreviewAiNotes(scenes, ai) {
  let n = 0;
  for (const [k, note] of Object.entries(ai || {})) {
    const s = scenes?.[+k];
    if (!s || s.archived || !s.imagePrompt || String(s.imagePrompt).includes(note)) continue;
    s.imagePrompt = `${s.imagePrompt} — ${note}`;
    n++;
  }
  return n;
}

/*
 * Ara plan kesilebilecek satır: fotoğraf, resmin üstünde anahtar kelime/yazısız kart ya da bölüm/sıralama kartı olmayan
 * resimli başlık (lib/inserts.mjs insertable).
 * KANCADA BEKLEYEN BAŞLIK KARTI (Kartal Yuvası, 25 Ekim 2026): bölüm kartı olmayan başlık ("It Burned Down in One Night",
 * 6,2 sn, arşiv resmi üstünde) dört kapı turunda da "yavaş kanca" diye raporlandı, hiç düzeltilmedi — motorun başlık
 * bileşeni ara plan çizmiyordu. Artık çiziyor (scenes.tsx PlainTitle; insertable işaretli başlığı seçer): satır aynı
 * "cutaway" düzeltmesini alır, başlık yerinde kalır, altındaki resim değişir. Anahtar söz kartına çevrilmez: söz karesi
 * anlatımın hizalamasından gelir, başlık ise söylenmez.
 * Başlığın kendi resmi olmalı, klibi olmamalı (insertable "!s.image || s.video"ı reddeder; PlainTitle klibi oynatır):
 * eskiden klipli başlık da işaretleniyordu, motor işareti yok sayıyordu.
 */
const cuttable = (s) => s?.type === "photo" || (s?.type === "words" && (s.textMode === "key" || s.textMode === "none"))
  || (s?.type === "title" && !s.chapterCard && !s.rankCard && !!s.image && !s.video);
/*
 * Klibi motorda düşmüş arşiv başlığı: senaryoda klip var, kapının çizdiği satır durağan (motor "arşiv klibi kullanılamıyor"
 * deyip durağan karesine döndü). Kesilmez — ara plan ölü klibin karesinin üstüne AI resmi koyardı —, arşivi yeniden seçilir:
 * bozuk klibin düzeltmesiyle aynı (docu-qa.js fixFor). Klibi çizilen başlık zaten hareket eder; ona hiçbir şey yapılmaz.
 */
const lostClip = (s, drawn) => s?.type === "title" && !s.chapterCard && !s.rankCard && !!s.video && !drawn?.video && ownArchive(s);

/** Kancada/uzun bekleyen çekimlerin satırları: [{scene, s (motora giden), drawn (çizilen), kind}]. */
function heldRows(critic, rows, scenes) {
  const shots = stillShots(rows);
  const out = [];
  for (const x of critic || []) {
    if (!(x.kind === "hook_slow" || (x.kind === "long_hold" && x.severity !== "low"))) continue;
    const sh = shots.find((h) => Math.abs(h.start - x.time) < 0.05);
    for (const r of sh?.rows || []) {
      const s = r.scene === null || r.scene === undefined ? null : scenes?.[r.scene];
      if (s) out.push({ scene: r.scene, s, drawn: r.s, kind: x.kind });
    }
  }
  return out;
}

/**
 * ZAMAN ÇİZELGESİ ELEŞTİRMENİ RENDER'DAN ÖNCE (France, 20 Ekim 2026): "kancada aynı kare 6-7 sn" render sonrası
 * bulunuyordu, oysa yalnızca senaryo ve ses süresi gerekir. Yavaş kanca / uzun bekleyen kare çekimindeki satırlar
 * "cutaway" düzeltmesi alır: motor o satıra tempo "hold" olsa da ara plan keser. Zaten işaretli satır yeniden
 * işaretlenmez (kesilemiyorsa tur dönmez). Resimli başlık kartı da kesilir (başlık durur, altına ara plan gelir).
 * Ara planı kapıda reddedilmiş satır (noInserts) da işaretlenmez: aynı istem aynı resmi getirir; "cutaway" yaması
 * "no-inserts"in yerine geçip ara planı geri getiriyordu, iki yama altı tur boyunca birbirini siliyordu.
 * @param critic critiqueTimeline bulguları · rows sceneRows · scenes motora giden senaryo
 * @returns sahne indeksleri (engine-script)
 */
export function holdCuts(critic, rows, scenes) {
  const out = new Set();
  for (const { scene, s, drawn } of heldRows(critic, rows, scenes)) {
    // Yazı uygulaması (anahtar kelime/yazısız) ve başlığın resmi motorda kararlaşır: çizilen senaryoya da bakılır. Motor ara
    // planı hazırlanmış satırda seçer (insertable): çizilen satırda klip ya da derinlik katmanı varsa işaret yok sayılırdı.
    if ((cuttable(s) || cuttable(drawn)) && !drawn?.video && !drawn?.layers && !lostClip(s, drawn) && !s.cutaway && !s.noInserts) out.add(scene);
  }
  return [...out].sort((a, b) => a - b);
}

/** Bekleyen çekimde klibi motorda düşmüş arşiv başlıkları → yeniden seçim ({scene, kind, detail}, qaFixPlan biçiminde). */
export function lostClipRepicks(critic, rows, scenes) {
  const out = new Map();
  for (const { scene, s, drawn, kind } of heldRows(critic, rows, scenes)) {
    if (lostClip(s, drawn) && !out.has(scene)) out.set(scene, { scene, kind, detail: "Klipli başlık durağan kaldı (motor klibi kullanamadı): arşiv yeniden seçilir" });
  }
  return [...out.values()].sort((a, b) => a.scene - b.scene);
}

/**
 * KAPI: kareleri çizer, denetler, planı döndürür.
 * @param props    motorun hazırlık modunda yazdığı senaryo (props.json: bölüm kartları, ses süreleri, görseller)
 * @param render   async (items:[{frame, out, composition}]) => {files} — docu.js motorla çizer (renderWithEngine)
 * @param scenes   motora giden senaryo (engine-script) — düzeltme planı buna göre
 * @param only     doğrulama turu: yalnızca bu sahnelerin (engine-script indeksi) karesi çizilir ve denetlenir
 * @param people   senaryonun kişileri (docu-archive.js peopleNames, yönetmenin senaryosundan); yoksa props'tan
 * @param names    gerçek kişi adları (realNames, yönetmenin senaryosundan); yoksa props'tan — AI notunda "the person" olur
 * @param measure  görünüş ölçüsü (docu-qa.js frameLook; test için): async (klasör, kare sayısı, ffmpeg) => [{yavg, satavg}]
 * @returns {{issues, plan, report, frames, look}} — look: görünüş ölçüsü (docu-qa.js lookStats), yalnızca tam turda; yoksa null
 */
export async function previewGate({ props, scenes, render, placeTimeline, dir, settings = {}, usage, logFn = () => {}, llm, model, ffmpeg = "ffmpeg", isCancelled = () => false, fp, round = 1, judge = judgeFrames, only = null, people = null, names = null, measure = frameLook }) {
  const placed = placeTimeline(props.scenes, FPS, props.beats || []);
  const rows = sceneRows(props, placed);
  const inOnly = (sc) => !only || (sc !== null && sc !== undefined && only.has(sc));
  const moments = previewMoments(props.scenes, placed).filter((m) => inOnly(rows[m.r]?.scene));
  const out = path.join(dir, "on-izleme");
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^(f|r)_\d+\.jpg$/.test(f)) fs.rmSync(path.join(out, f), { force: true });
  const items = moments.map((m, k) => ({ frame: m.frame, out: path.join(out, `r_${String(k + 1).padStart(4, "0")}.jpg`), composition: "video" }));
  const t0 = Date.now();
  const { files = [] } = await render(items);
  if (isCancelled()) throw new Error("cancelled");
  // Çizilen kareler sırayla f_0001… (görme denetiminin kontak sayfası düzeni); çizilemeyen kare atlanır.
  const got = [];
  moments.forEach((m, k) => {
    const src = items[k].out;
    if (!files.includes(src) || !fs.existsSync(src)) return;
    fs.renameSync(src, path.join(out, `f_${String(got.length + 1).padStart(4, "0")}.jpg`));
    got.push({ t: m.t, row: rows[m.r], mid: true, ...(m.ins !== undefined ? { ins: m.ins } : {}), ...(m.edge ? { edge: true } : {}) });
  });
  const what = only ? `doğrulama: değişen ${moments.length} sahne` : `${moments.length} sahne`;
  logFn(`Ön izleme (tur ${round}, ${what}): ${got.length}/${moments.length} kare çizildi (${Math.round((Date.now() - t0) / 1000)} sn)`);
  const missing = moments.length - got.length;
  const seen = got.length
    ? await judge({
      tmp: out, got, script: props, settings, usage, logFn, isCancelled, ff: ffmpeg, preRender: true,
      cacheFile: path.join(dir, "docu-preview-vision.json"), ...(llm ? { llm } : {}), ...(model ? { model } : {}),
    })
    : { issues: [], vision: { calls: 0, frames: 0, skipped: null } };
  // Ara plan karesinin bulgusu işaretlenir (düzeltme: ara plan kalkar, sahnenin kendi görseli kalır).
  for (const x of seen.issues) if (got.some((g) => g.ins !== undefined && g.row?.scene === x.scene && Math.abs(g.t - Number(x.time)) < 0.08)) x.insert = true;
  // Geçişin içinden çizilmiş karenin (kısa sahne, previewMoments "edge") bozukluğu işaretlenir: düzeltilmez, bildirilir.
  for (const x of seen.issues) if (x.kind === "broken" && got.some((g) => g.edge && g.row?.scene === x.scene && Math.abs(g.t - Number(x.time)) < 0.08)) x.edge = true;
  // Tekrarlar (render sonrası denetimle aynı kurallar): aynı resim dosyası dakikalar arayla ve kısa arayla aynı kare.
  // Doğrulama turunda yalnızca değişen bir sahneye dokunan tekrar sayılır (değişmeyenler önceki turda görüldü).
  const repeats = farRepeats(rows).filter((x) => inOnly(x.row.scene) || inOnly(x.first.scene)).map((x) => ({ scene: x.row.scene, time: +x.row.start.toFixed(2), kind: "repeat", severity: x.count >= 3 ? "high" : "medium", detail: `Aynı fotoğraf ${x.count}. kez (ilk: sahne ${x.first.scene === null ? "-" : x.first.scene + 1})`, fix: x.row.s?.archived ? "repick" : "review", source: "script" }));
  try { if (got.length) repeats.push(...nearRepeats(got, await frameHashes(out, got.length, ffmpeg))); } catch (e) { logFn(`Ön izleme: kare özeti çıkarılamadı (${String(e?.message || e).slice(0, 100)})`); }
  // Cihazın tekrarı yalnızca bildirilir (docu-qa.js visionIssue, "review"): cihazın kendi resminin tekrarını (repick) ezmez.
  for (const x of repeats) if (!seen.issues.some((i) => i.scene === x.scene && i.kind === "repeat" && !i.device)) seen.issues.push(x);
  // GÖRÜNÜŞ (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: luma 52-56, doygunluk 2,5-6 — kapı hiçbir turda
  // "video kapkara ve renksiz" demedi). Çizilen karelerin parlaklığı, doygunluğu, karanlık kare payı; ölçüm satırı her zaman
  // günlükte, hedefin altında too_dark / desaturated bulgusu (videonun tamamı: sahne planına girmez, öneriyi taşır).
  // Yalnızca tam turda: doğrulama turu birkaç değişen sahneyi çizer, videonun görünüşü değildir (1. turun bulgusu açık kalır).
  let look = null;
  if (!only && got.length) {
    try {
      const lf = await measure(out, got.length, ffmpeg);
      const measured = lookStats(lf.map((f, k) => ({ ...f, scene: got[k]?.row?.scene ?? null })));
      if (measured.frames) {
        look = measured;
        logFn(`Ön izleme (tur ${round}) — ${look.line}`);
        for (const x of lookFindings(look)) seen.issues.push(x);
      }
    } catch (e) { logFn(`Ön izleme: görünüş ölçülemedi (${String(e?.message || e).slice(0, 100)})`); }
  }
  // Zaman çizelgesi (render sonrası eleştirmenin aynısı, ücretsiz): her turda bütün video — kesilen satırın süresi değişmez.
  let critic = [];
  try { critic = critiqueTimeline(props, placed, { sensitive: !!props.sensitive }); } catch (e) { logFn(`Ön izleme: zaman çizelgesi eleştirmeni çalışmadı (${String(e?.message || e).slice(0, 100)})`); }
  const holds = critic.filter((x) => x.kind === "hook_slow" || (x.kind === "long_hold" && x.severity !== "low"));
  for (const x of holds) seen.issues.push({ ...x });
  // Önceki turların düzeltmeleri: bozuk karenin denenmiş basamağı tekrarlanmaz (yamalar docu.js'te sahne başına birikir).
  const tried = round > 1 ? priorFixes(out, round, { scenes, fp }) : new Map();
  // Kişiler: yönetmenin senaryosundan (docu.js verir; AI'a düşen sahnenin silinen kartı da bilinir), yoksa çizilen senaryodan.
  const plan = previewFixPlan(seen.issues, scenes, { fp, tried, people: people || peopleNames(props), names: names || realNames(props) });
  const taken = new Set([...plan.repick, ...plan.ai, ...plan.patches].map((f) => f.scene));
  for (const f of lostClipRepicks(critic, rows, scenes)) if (!taken.has(f.scene)) { taken.add(f.scene); plan.repick.push(f); }
  const cuts = fp ? holdCuts(critic, rows, scenes).filter((i) => !taken.has(i)) : [];
  for (const i of cuts) plan.patches.push({ say: fp(scenes[i]), fix: "cutaway", reasons: "kancada/uzun bekleyen kare: ara plan", scene: i, kind: "hold" });
  const fpOf = (i) => (fp && scenes?.[i] ? fp(scenes[i]) : undefined);
  const report = {
    round, at: new Date().toISOString(), frames: got.length, missing, vision: seen.vision, ...(only ? { only: [...only] } : {}),
    ...(look ? { look: { frames: look.frames, luma: look.luma, sat: look.sat, darkShare: look.darkShare, ok: look.ok, line: look.line } } : {}),
    issues: seen.issues.map((x) => ({ scene: x.scene, kind: x.kind, severity: x.severity, detail: x.detail, ...(x.edge ? { edge: true } : {}) })),
    plan: { repick: plan.repick.map((f) => f.scene), ai: plan.ai.map((f) => f.scene), patches: plan.patches.map((p) => ({ scene: p.scene, fix: p.fix })) },
    // Sonraki turların kaydı (priorFixes): hangi sahneye hangi bulgu için ne yapıldı; fp = anlatımın parmak izi.
    fixes: [
      ...plan.repick.map((f) => ({ scene: f.scene, fp: fpOf(f.scene), kind: f.kind, fix: "repick" })),
      ...plan.ai.map((f) => ({ scene: f.scene, fp: fpOf(f.scene), kind: f.kind, fix: "ai" })),
      ...plan.patches.map((p) => ({ scene: p.scene, fp: p.say, kind: p.kind, fix: p.fix })),
    ],
  };
  fs.writeFileSync(path.join(out, `rapor-tur-${round}.json`), JSON.stringify(report, null, 2));
  const fixes = plan.repick.length + plan.ai.length + plan.patches.length;
  const devices = plan.patches.filter((p) => p.fix === "device-fallback").length;
  const blanks = plan.patches.filter((p) => p.fix === "simplify" || p.fix === "prev-picture").length;
  const texts = plan.patches.length - cuts.length - devices - blanks;
  logFn(`Ön izleme (tur ${round}): ${seen.issues.length} bulgu${seen.vision.skipped ? ` (görme denetimi yapılmadı: ${seen.vision.skipped})` : ""} — ${fixes ? `${plan.repick.length} arşiv yeniden seçilecek, ${plan.ai.length} AI görseli yeniden üretilecek, ${texts} yazı sadeleşecek${devices ? `, ${devices} cihaz sade görsele dönecek` : ""}${blanks ? `, ${blanks} bozuk karenin efekti kalkacak ya da önceki kare tutulacak` : ""}${cuts.length ? `, ${cuts.length} bekleyen kareye ara plan` : ""}` : "render'dan önce düzeltilecek sorun yok"}`);
  for (const x of seen.issues.filter((i) => SEV[i.severity] >= 1).slice(0, 8)) logFn(`  sahne ${x.scene === null ? "-" : x.scene + 1}: ${x.kind} — ${String(x.detail).slice(0, 140)}${x.edge ? " (geçiş karesi: yalnızca bildirildi)" : ""}`);
  return { issues: seen.issues, plan, report, frames: got.length, look };
}
