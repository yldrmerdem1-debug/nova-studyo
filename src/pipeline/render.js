import fs from "node:fs";
import {verifyDirectorOutput} from './director-output.js';
import {buildDirectorShotReview,failedDirectorShotReview,renderedShotMedia} from './director-shot-review.js';
import path from "node:path";
import { getJobSettings, THEME_ACCENT, VISUAL_STYLES, videoEnc, encThreads } from "../config.js";
import { MUSIC_DIR, run, mapLimit, freeDiskMb } from "../util.js";
import { buildCaptions, buildAss, buildSrt } from "./subtitles.js";
import { makeThumbnails, rankThumbnailCandidates } from "./thumbnails.js";
import { beatsOf, alakaPuani } from "./media.js";
import { GORSEL_ESIGI, ARKA_GORSEL_ESIGI, ARKA_KALITE_ESIGI, KESIK_KALITE_ESIGI } from "./gorseldenetim.js";
import { introOverlay, chapterOverlay, emphasisOverlay, collageOverlay, punchZoom, ftext, displayFont, metinPerdesi } from "./graphics.js";
import { planTransitions, frameLayout, buildPieces, planOzet } from "./transitions.js";
import { canvasOf } from "./canvas.js";
import { kameraFiltresi, hareketSec } from "./kamera.js";
import { renderScene } from "./motion.js";
import { planScene, vurguSec } from "./director.js";
import { cachedKurguPlani as kurguPlani } from "./kurgu.js";
import { kesikleriHazirla, sekilAksani, perdeGradyani } from "./cutout.js";
import { gradeHaritasi } from "./grade.js";
import { normalizeEt, kodlanmisTepeyiSinirla } from "./loudness.js";
import { arkaPlanGecer, arkaPlanSec, yeniArkaDurum, kardesleriBul } from "./arkaplan.js";
import { sahneHizasi, somutCapaVar } from "./cumlehizasi.js";
import { bolumSureleri, muzikPlani, muzikZinciri } from "./muzik.js";
import { kazanclariHesapla } from "./muzikseviye.js";
import { getStyleProfile } from './style-profile.js';
import { planSoundDesign, writeSoundStem, appendSoundMix, measureSound } from './sound-design.js';
import { planEditorialSequence, planEditorialSourceTiming, renderEditorialShot as renderEditorialScene } from './editorial-shots.js';
import { measureVisualQuality, longformWarnings, longestFrozenRun } from './longform-quality.js';
import { planPortraitShortHook, targetEditorialCutSeconds } from './hook-pacing.js';
import { applyShotEditsToBeats, transitionOverrides } from './shot-edits.js';
import { ShotCache, shotCacheKey, pieceCacheKey, reviewCacheKey } from './shot-cache.js';
import { EDITORIAL_RENDER_VERSION } from './editorial-shots.js';
import { DIRECTOR_POLICY_VERSION } from './director-policy.js';
import { DIRECTOR_SHOT_REVIEW_VERSION } from './director-shot-review.js';

// Segmentler arası nefes payı. voice.js her segmentin kuyruğunda 0,5 sn doğal
// duraklama BIRAKIYOR (fazlası kırpılıyor); üstüne 0,35 daha eklemek ölü havayı
// geri getiriyordu.
const GAP = 0.12;

// YAPISAL NEFES — sabit boşluk her yerde aynı olmamalı.
//
// ÖLÇÜLEN KUSUR (20260814-a46ab2): 1856 kelime / 12 dk = 155 kelime/dakika ve
// 35 segmentin 35'i arasında AYNI 0,12 sn. Metinde tek bir duraklama işareti
// bile yok ('...' 0 adet, '<break>' 0 adet). Sonuç, izleyicinin "haber bülteni
// gibi aralıksız" diye tarif ettiği akış: 413.000 metreküp, 495 ton, +99 dB
// arka arkaya geliyor ve hiçbiri oturacak yer bulamıyor.
//
// Çare metne dokunmak DEĞİL. Metne "..." ya da <break> eklemek üç yeni sorun
// doğururdu: Edge tarafında etiket XML kaçışına takılıp sesli okunur (bu hata
// bir kez yapıldı — "bracket laughs"), altyazı metni sesle ayrışır, ve süre
// tahmini bozulur. Boşluk MONTAJDA veriliyor: hiçbir metin değişmiyor, her
// motorda aynı çalışıyor, altyazı hizası bozulmuyor.
//
// Toplam etki ölçüldü: 12 dakikalık bir işte ~5 saniye. Süreyi bozmuyor,
// ritmi değiştiriyor.
const NEFES = {
  /** Bölüm sonu — ardından bölüm kartı geliyor, izleyicinin beyni resetlenmeli. */
  bolumSonu: 0.70,
  /** Ekranda rakam/karşılaştırma grafiği olan segment — sayı otursun. */
  rakam: 0.40,
  /** Soruyla biten segment — soru havada kalmalı. */
  soru: 0.35,
  /** Olağan segment. */
  olagan: GAP,
};

// MÜZİK KISMA (DUCKING) — anlatım varken müzik geri çekilir.
//
// KULLANICI ŞİKÂYETİ: "arkada bazen titreme sesi var". Kurgudaki adı
// POMPALAMA: sıkıştırıcı hecelerin arasındaki mikro boşlukları takip edip
// müziği sürekli indirip kaldırıyor, kulak bunu dalgalanma olarak duyuyor.
//
// İKİ ÖLÇÜT BİRBİRİNE ZIT — biri iyileşirken diğeri bozulabilir:
//   1) POMPALAMA: sürekli konuşma boyunca müzik seviyesi sabit kalmalı
//   2) NEFES KABARMASI: bölüm sonundaki 0,70 sn'lik boşlukta müzik geri gelmeli
//
// İLK ÖLÇÜM YANLIŞ SONUÇ VERDİ. Yalnızca (2) ölçüldü ve en sert ayar "en iyi"
// ilan edildi — oysa şikâyetin sebebi tam da oydu. Sentetik konuşmayla
// (0,25 sn hece + 0,12 sn boşluk) iki eksen birlikte ölçüldüğünde:
//
//   ayar                        pompalama   salınım   nefes kabarması
//   0.02/10/120/500 (eski)       0,88 dB     3,4 dB       +5,9 dB
//   0.02/6/150/900  (seçilen)    0,53 dB     2,3 dB       +5,6 dB
//   0.02/4/200/1200              0,39 dB     1,8 dB       +4,4 dB
//   0.03/3/200/1000              0,35 dB     1,6 dB       +2,4 dB
//
// Seçilen ayar titremeyi %40 azaltırken bölüm sonu kabarmasını koruyor.
// Daha yumuşak ayarlar titremeyi biraz daha düşürüyor ama kabarmayı öldürüyor;
// o kabarma bölüm geçişini kasıtlı hissettiren şey.
export const DUCK = "threshold=0.02:ratio=6:attack=150:release=900";

/**
 * Videonun sonuna eklenen kapanış kuyruğu (saniye).
 *
 * YouTube bitiş ekranı en az 5 saniye ister; ölçülen videoda 0,42 saniye vardı
 * (bkz. zaman çizelgesi kurulumu). 7 saniye hem bitiş ekranına yer bırakıyor
 * hem de müziğin son 3,5 saniyelik kısılmasının duyulmasına izin veriyor.
 */
export const KAPANIS_KUYRUGU = 7.0;

/**
 * Bir segmentin ARDINDAN bırakılacak sessizlik (saniye) — SAF.
 *
 * Sıra önemli: bölüm sonu her şeyi ezer (kart geliyor), sonra rakam, sonra soru.
 */
export function nefesPayi(seg) {
  if (!seg) return NEFES.olagan;
  if (seg.lastOfSection) return NEFES.bolumSonu;
  const tur = seg.emphasis?.type;
  if (tur === "stat" || tur === "compare") return NEFES.rakam;
  if (/\?\s*$/.test(String(seg.text || "").trim())) return NEFES.soru;
  return NEFES.olagan;
}

/**
 * Geçişler açıkken her kesme İKİ kez kodlanır (kesme → parça). Ara kesmeler
 * hedef kaliteyle kodlanırsa ikinci geçişte jenerasyon kaybı üst üste biner —
 * ara dosyalar daha temiz tutulur, son kalite parça aşamasında belirlenir.
 */
const araCrf = (crf) => Math.max(14, crf - 4);

/**
 * KOLAJ klibi: üretilmiş kareyi/klibi beat süresine KIRP (asla yavaşlatma/uzatma),
 * üstüne Türkçe vurgu yazısını yak.
 */
async function renderCollageClip({ st, kanvas, media, dur, frames, overlay, outFile, killer, crf = st.crf, profile = null }) {
  const fps = st.fps;
  const N = Math.max(2, frames || Math.round(dur * fps));
  const enc = [...videoEnc(st, crf), "-an", "-y", outFile];
  const tail = `,setsar=1,format=yuv420p`;

  if (media?.type === "video" && media.file) {
    // Kaynak hedeften uzunsa -frames:v kırpar. KISAysa tpad son kareyi dondurarak
    // süreyi tamamlar — bu olmadan klip erken biter ve tüm kurgu sesle kayar
    // (yavaşlatma yok).
    const pad = `,tpad=stop_mode=clone:stop_duration=${dur.toFixed(3)}`;
    const vf = `${kanvas.fit},${fpsUyarla(fps)}${pad}${overlay}${tail}`;
    await run(st.ffmpegPath, [
      "-i", media.file, "-vf", vf, "-frames:v", String(N), "-r", String(fps), ...enc,
    ], { killer });
    return;
  }

  // Hareketsiz keyframe → sade 2D push-in
  const zoom = kameraFiltresi(media?.kadraj || '', media?.odak || '', 0, N, fps, kanvas, profile);
  const src = media?.file
    ? ["-i", media.file]
    : ["-f", "lavfi", "-i", kanvas.renk("0xE8DCC8")];
  await run(st.ffmpegPath, [
    ...src, "-vf", `${kanvas.yakin},${zoom}${overlay}${tail}`,
    "-frames:v", String(N), "-r", String(fps), ...enc,
  ], { killer });
}

// KEN BURNS ARTIK KAMERA.JS'TE — hareket sıra numarasına değil, KARENİN
// İÇERİĞİNE göre seçiliyor. Eski hâli altı hareketten birini `(i*7+3)%6` ile
// atıyordu: bir portre ile bir harita aynı muameleyi görüyordu.
//
// Buradaki ölçüm notu korunuyor, çünkü kamera.js aynı filtreyi kuruyor:
// zoompan tamsayı adımlarla örnekliyor; kaynağı 2× büyütüp lanczos ile
// küçültmek kenar bulanıklığını azaltıyor.
//
// ÖLÇÜLDÜ — BURASI TİTREMENİN KAYNAĞI DEĞİL. Kullanıcı bitmiş videoda titreme
// bildirdi ve önce buradan şüphelenildi. Gerçek Ken Burns parametreleriyle
// (z 1→1.26, yatay pan, çapraz) donuk kare oranı üç varyantta da %0,0 çıktı;
// kaynağı 2× veya 4× önceden büyütmek de aynı %0,0 veriyor. Gerçek videodaki
// %13,9 donuk kare BAŞKA yerden geliyor (bkz. tpad ve hareketsiz tipografi).
function kenBurns(i, N, fps, kanvas, kadraj = "", odak = "", profile = null) {
  return kameraFiltresi(kadraj, odak, i, N, fps, kanvas, profile);
}

/**
 * Stok videoyu hedef kare hızına getir — KARE KOPYALAMADAN.
 *
 * ÖLÇÜLEN KUSUR: kullanıcı bitmiş videoda titreme bildirdi. Gerçek dosyada
 * çekim içi karelerin %13,9'u BİREBİR aynıydı (31 küme, toplam 18,7 sn):
 * hareket duruyor, sonra sıçrıyor.
 *
 * Sebep: Pexels/Pixabay klipleri sık sık 24 veya 25 fps. Düz `fps=30` filtresi
 * araya KARE KOPYALIYOR ve kopya kare bir öncekinin aynısı oluyor. Ölçüldü:
 *     kaynak 24 fps -> %20,1 donuk kare
 *     kaynak 25 fps -> %16,8 donuk kare
 *     kaynak 30/60  -> %0,0
 *
 * İki çare denendi, ikisi de donuk oranını %0,0'a indiriyor:
 *   - hız uyarlama (setpts): klibi %20-25 hızlandırıyor
 *   - harmanlama (minterpolate blend): HIZI KORUYOR
 * B-roll'de hız korunmalı — yürüyen insan aceleci görünmemeli — o yüzden
 * harmanlama seçildi. Bedeli 5 saniyelik klip için 0,8 sn, ihmal edilebilir.
 *
 * Not: Ken Burns (fotoğraf) yolu bu kusurun kaynağı DEĞİL; gerçek
 * parametrelerle ölçüldü, üç varyantta da donuk oran %0,0 (bkz. kenBurns).
 */
function fpsUyarla(fps) {
  // mpdecimate ÖNCE: bazı stok dosyalar 30 fps ETİKETLİ olduğu hâlde içeriği
  // 24 fps'ten çevrilmiş, yani kopya kareler DOSYANIN İÇİNE gömülü.
  // minterpolate onları gerçek hareket sanıp olduğu gibi geçiriyordu; gerçek
  // videoda kalan takılmanın kaynağı buydu (11,2 sn donuk küme).
  //
  // max=1 ŞART. Sınırsız mpdecimate tamamen durgun bir çekimde bütün kareleri
  // atıyor: ölçüldü, 5,00 saniyelik klip 0,00 saniyeye düşüyor ve sahne
  // videodan siliniyor. max=1 ile ölçüm:
  //     gömülü kopyalı klip -> donuk %2,0 → %0,0
  //     tamamen durgun klip -> süre 5,00 → 4,86 sn (korunuyor)
  return `mpdecimate=max=1,minterpolate=fps=${fps}:mi_mode=blend`;
}

/** Tek beat klibi üret (sessiz görüntü). */
async function renderBeatClip({ st, kanvas, index, media, dur, frames, fadeIn, fadeOut, outFile, cardText, overlay = "", punch = false, killer, crf = st.crf, gradeF = null, accent = "0x22d3ee", loc = "tr", profile = null }) {
  const fps = st.fps;
  // Kare sayısı dışarıdan gelir: geçiş kesimleri tam kareye oturmalı, yoksa
  // her klipte yarım karelik hata birikip sesi kaydırıyor.
  const N = Math.max(2, frames || Math.round(dur * fps));
  // vignette a=PI/4.6 kenarları %64 karartıyordu (ölçüldü) — kadrajın köşesindeki
  // öğeler ve yazı kayboluyordu. PI/9 hafif bir çerçeve hissi bırakır, yutmaz.
  // Kaynağa özel derecelendirme (grade.js) varsa onu kullan; yoksa sabit temel.
  // vignette a=PI/4.6 kenarları %64 karartıyordu — PI/9 hafif çerçeve bırakır.
  const grade = st.cinemaGrade === false ? ""
    : `,${gradeF || "eq=contrast=1.05:saturation=1.13"},vignette=a='PI/9'`;
  const fades = [];
  if (fadeIn) fades.push(`fade=t=in:st=0:d=0.45`);
  if (fadeOut) fades.push(`fade=t=out:st=${Math.max(0, dur - 0.5).toFixed(2)}:d=0.5`);
  const tail = `${fades.length ? "," + fades.join(",") : ""},setsar=1,format=yuv420p`;
  const enc = [...videoEnc(st, crf), "-an", "-y", outFile];

  if (media?.type === "image" && media.file) {
    // Hareket, denetimin bu karede GÖRDÜĞÜNE göre seçiliyor (bkz. kamera.js).
    // Alanlar yoksa (denetim kapalı/çökmüş) genel Ken Burns'e düşülür.
    const move = punch ? punchZoom(N, fps, kanvas)
      : kenBurns(index, N, fps, kanvas, media.kadraj, media.odak, profile);
    const vf = kanvas.genis + "," + move + grade + overlay + tail;
    await run(st.ffmpegPath, ["-i", media.file, "-vf", vf, "-frames:v", String(N), "-r", String(fps), ...enc], { killer });
    return;
  }

  if (media?.type === "video" && media.file) {
    const zoom = punch ? `,${kanvas.yakin}` : "";
    const vf = `${kanvas.fit},${fpsUyarla(fps)}` + zoom + grade + overlay + tail;
    await run(st.ffmpegPath, ["-stream_loop", "-1", "-i", media.file, "-vf", vf, "-frames:v", String(N), ...enc], { killer });
    return;
  }

  // YEDEK KART — SİYAH EKRAN OLMAMALI.
  //
  // Ölçülen kusur (20260810-210a05): videonun 18,9 saniyesi (%4,5) siyahtı —
  // üç ayrı yerde 4,4 / 5,7 / 8,2 saniyelik bomboş kareler. İki sebebi vardı:
  //
  //   1) Zemin 0x0d1117 idi — neredeyse saf siyah, ekranda "video donmuş"
  //      gibi duruyor.
  //   2) `font && !overlay` koşulu: ekranda BİR bindirme varsa yazı hiç
  //      çizilmiyordu. Vox + "sadece vurgu" düzeninde, vurgulanacak sayı/ad
  //      olmayan sahnede bindirme de boş kalıyor ve kare tamamen boşalıyor.
  //
  // Artık görselsiz sahnelerde kullanılan TASARLANMIŞ tipografi perdesi
  // kullanılıyor (metinPerdesi): okunur zemin, vurgu çizgisi, kadraja
  // sığdırılmış büyük yazı. Bindirme varsa o da korunur; perde zaten
  // ortada durduğu için üst üste binmiyor.
  const perde = metinPerdesi(cardText, "", dur, accent, loc, kanvas);
  const font = displayFont();
  // metinPerdesi metni boşsa (ör. sorgu yoksa) en azından düz bir yazı kalsın.
  const yedekYazi = !perde && font
    ? `,drawtext=fontfile='${font}':text='${ftext(cardText, 36) || "..."}':fontcolor=0xE8EDF2:` +
      `fontsize=${Math.round(64 * (kanvas.k || 1))}:x=(w-text_w)/2:y=(h-text_h)/2`
    : "";
  // Zemin artık okunur bir koyu lacivert — blackdetect'in siyah saydığı
  // aralığın belirgin dışında, ama yazıyı da bastırmıyor.
  const vf = `${kanvas.dolgu("0x17202e")}${perde}${yedekYazi}${overlay}${tail}`;
  await run(st.ffmpegPath, ["-f", "lavfi", "-i", `${kanvas.renk("0x17202e")}:r=${fps}`, "-vf", vf, "-frames:v", String(N), ...enc], { killer });
}

/**
 * music/ klasöründeki yatak parçaların adları. Klasör yoksa boş dizi →
 * render müziksiz dala girer (akış kırılmaz).
 *
 * Hangi parçanın nereye düşeceğine muzik.js karar veriyor: video başına tek
 * parça değil, BÖLÜM başına parça. Gerekçe orada yazılı.
 */
function muzikDosyalari() {
  try {
    return fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|m4a|wav|ogg|flac)$/i.test(f));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// KESİK (kenardaki küçük görsel) SEÇİMİ
// ---------------------------------------------------------------------------
//
// ESKİ HÂLİ: salt döndürme indeksi — `havuz[(beatIndex + 1) % havuz.length]`.
// Alaka hiç ölçülmüyordu. Gerçek videodan kare çıkarılarak doğrulanan sonuçlar:
//   "1995'te Japon robot Kaikō"        → köşede bir KEDİ
//   "James Cameron dibe ulaştı"        → köşede yine aynı kedi
//   "su sıcaklığı bir ile dört derece" → köşede TANSİYON ALETİ
//   "HMS Challenger 1875"              → köşede Şarm El Şeyh tatil resifi
//   "Everest'i alıp bıraksanız"        → köşede kumsal (videonun İLK kesiği)
// 42 kesik yuvasının 37'si (%88) sahnesinin sorgusuyla sıfır örtüşmeliydi.
//
// YENİ KURAL — iki kademeli:
//   1) SERT KAPI: görselin KENDİ sorgusuna alakası eşiğin altındaysa aday değil.
//      Kediyi, tansiyon aletini, peygamberdevesi karidesini kesen kapı budur;
//      bu görsellerin alakasızlığı zaten ÖLÇÜLMÜŞTÜ, sadece kullanılıyordu.
//   2) YUMUŞAK SIRALAMA: kapıyı geçenler arasından sahnenin sorgusuna en yakın
//      olan seçilir; tekrar edenler cezalandırılır ki ardışık sahneler aynı
//      damgayı taşımasın (ölçüldü: 18 farklı kesik 42 yuvada, %41 tekrar).
// Kapıyı hiçbir aday geçemezse yuva BOŞ kalır — yanlış görselden boşluk yeğdir.

/** Görselin kendi sorgusuna en az bu kadar METİN benzerliği (zayıf sinyal). */
const KESIK_OZ_ESIGI = 0.12;

// ---------------------------------------------------------------------------
// KESİK NE SIKLIKTA ÇIKMALI?
// ---------------------------------------------------------------------------
//
// Ölçüldü (gerçek video, 29 sahne): 26 sahnede köşede bir öğe vardı — yani
// ekran neredeyse hiç dinlenmiyordu. İzleyici sürekli oraya bakıyor, karşılığında
// çoğu zaman bir şey bulamıyor; öğe "dekor" hâline geliyor ve anlamını yitiriyor.
//
// İyi kurguda köşe öğesi bir AN için çıkar: bir kişi anılınca portresi, bir yer
// anılınca haritası. Üç kural:
//   1) ARALIK — art arda gelmez, aralarında en az KESIK_ARALIK sahne olur.
//   2) TEK ÖĞE — bir sahnede en fazla bir kesik (eskiden 2 yuva doluyordu).
//   3) HAK ETME — sıradan bir eşleşme yetmez; ya görsel denetimi tam puan
//      vermiş olmalı ya da sahnenin sorgusuyla belirgin biçimde örtüşmeli.
// Hiçbiri sağlanmazsa sahne temiz kalır.

/** İki kesik arasında en az kaç sahne boş geçmeli. */
const KESIK_ARALIK = 2;
/** "Hak etti" sayılmak için sahne yakınlığı eşiği (denetim tam puan değilse). */
const KESIK_HAK_ESIGI = 0.30;

function kesikSec(b, kesikler, media, tamEkran, oncekiKesik, kullanim, durum = {}) {
  const arkaId = tamEkran ? b.media?.beatId : null;
  const sahneSorgu = b.query || "";

  const adaylar = [];
  for (let k = 0; k < 3; k++) {
    const id = `s${b.segIndex}b${k}`;
    const src = kesikler[id];
    if (!src || id === arkaId) continue;
    const m = media[id] || {};

    // SERT KAPI — GÖRSEL DENETİMİ. gorseldenetim.js indirilen fotoğrafa BAKIP
    // 0-3 puan veriyor. Metin ekseninin ayıramadığı vakaları ayıran tek şey bu:
    // "kathy, cat, maine coon, portrait" etiketli kedi metinde geçiyordu,
    // görselde geçmiyor. Denetim çalışmadıysa (alan yok) kapı uygulanmaz.
    if (Number.isFinite(m.gorsel) && m.gorsel < GORSEL_ESIGI) continue;

    // İKİNCİ SERT KAPI — KADRAJ KALİTESİ. Alaka "doğru konu mu", kalite
    // "ekranda iyi durur mu" sorusudur; ikisi bağımsız. Köşedeki kesik ekranın
    // küçük bir parçası olduğu için kötü kadraj burada tam ekrandan daha çok
    // batıyor: yarısı boş ya da bulanık bir görsel küçülünce hiçbir şey
    // anlatmıyor. Denetim çalışmadıysa alan yoktur, kapı uygulanmaz.
    if (Number.isFinite(m.kalite) && m.kalite < KESIK_KALITE_ESIGI) continue;

    // Zayıf ikinci kapı: metin alakası. Denetim yapılamadığı işlerde tek süzgeç
    // budur; sıfıra yakınları (peygamberdevesi karidesi 0.000) yine de keser.
    // ESKİ İŞLERDE bu alan da yok — o zaman aday geçirilir, çünkü eski bir işi
    // yeniden render ederken tüm sahneleri boşaltmak doğru olmaz.
    const oz = Number.isFinite(m.alaka) ? m.alaka : null;
    if (oz !== null && oz < KESIK_OZ_ESIGI) continue;

    // Sahne yakınlığı: bu görsel, ŞU AN anlatılan şeye ne kadar yakın?
    // Karşılaştırma İngilizce sorgu ↔ İngilizce başlık ekseninde (Türkçe sahne
    // metniyle ölçmek işe yaramıyor — ölçüldü, o eksende her şey sıfır çıkıyor).
    const havuz = [{ metin: m.metin || "" }, { metin: m.sorgu || "" }];
    const yakin = sahneSorgu
      ? Math.max(alakaPuani(sahneSorgu, m.metin || "", havuz),
                 alakaPuani(sahneSorgu, m.sorgu || "", havuz) * 0.85)
      : 0;

    const tekrarCezasi = (oncekiKesik?.has(id) ? 0.30 : 0) + (kullanim?.get(id) || 0) * 0.06;
    // Görsel denetimi puanı varsa sıralamada da baskın olsun (3 → +0.5, 2 → +0.17).
    const gorselKatki = Number.isFinite(m.gorsel) ? ((m.gorsel - GORSEL_ESIGI) / 2) * 0.5 : 0;
    // HAK ETTİ Mİ? Denetim tam puan verdiyse (3/3) ya da sahnenin sorgusuyla
    // belirgin örtüşme varsa. Sıradan bir eşleşme köşeye çıkmayı hak etmiyor.
    const hakEtti = m.gorsel === 3 || yakin >= KESIK_HAK_ESIGI;
    adaylar.push({
      id, src, hakEtti,
      puan: (oz ?? 0.5) * 0.45 + yakin * 0.55 + gorselKatki - tekrarCezasi,
    });
  }

  // Sahne temiz mi kalsın? Üç kapı: aralık, hak etme, tek öğe.
  const bosluk = (durum.sahneNo ?? 0) - (durum.sonKesikSahne ?? -99);
  if (bosluk < KESIK_ARALIK) return { src: [], idler: [] };

  const uygun = adaylar.filter((a) => a.hakEtti).sort((x, y) => y.puan - x.puan);
  if (!uygun.length) return { src: [], idler: [] };

  // TEK öğe. İki kesik aynı anda köşelerde durunca kadraj kalabalıklaşıyor ve
  // ikisi de dekora dönüşüyor; anlamlı olan bir tanesi yeter.
  const secilen = uygun[0];
  durum.sonKesikSahne = durum.sahneNo ?? 0;
  return { src: [secilen.src], idler: [secilen.id] };
}

/**
 * Tüm renderı yürütür: klipler → concat → ses → altyazı → final → thumbnail.
 * @returns {durationSec, sectionTimes:[{title, start}]}
 */
export function sceneAnchorQueries(media,segmentIndex,visuals=[],count=0){
 return Array.from({length:Math.max(0,count)},(_,i)=>
  media?.[`s${segmentIndex}b${i}`]?.editorial?.anchorQuote||visuals?.[i]?.anchorQuote||visuals?.[i]?.query||'');
}

export async function renderAll(job, script, media, tts, jobDir, logFn, onProgress, killer) {
  const st = getJobSettings(job);
  for (const key of ['editIntensity','soundDesign','sfxVolume','musicVolume']) if(job[key] !== undefined) st[key] = job[key];
  const profile = getStyleProfile(job.theme, st.editIntensity);
  const qualityWarnings = [...(job.editorialPlan?.warnings || [])];
  logFn(`Kurgu profili: ${profile.name} · ${profile.intensity}. ${profile.description}`);
  // Kanvas: 16:9 / 9:16 / 1:1 — tüm filtre ölçüleri buradan gelir (canvas.js)
  const kanvas = canvasOf(job);
  const renderDir = path.join(jobDir, "render");
  fs.mkdirSync(renderDir, { recursive: true });

  // KOLAJ modu: script.beats var, bölüm yapısı yok — beat 1:1 ses segmentidir
  const isCollage = Array.isArray(script.beats);

  // --- zaman çizelgesi (segment seviyesi: ses + altyazı) ---
  const flat = [];
  let idx = 0;
  if (isCollage) {
    for (const b of script.beats) {
      const t = tts[idx];
      if (!t) throw new Error(`TTS eşleşme hatası: ${b.id}`);
      flat.push({
        segId: t.segId, index: idx, sectionIndex: 0, sectionTitle: "",
        firstOfSection: idx === 0, lastOfSection: idx === script.beats.length - 1,
        text: b.text, overlayText: b.overlayText, emphasis: null,
        visuals: [{ query: b.concept, type: "video", kind: "generic" }],
        dur: t.duration + 0.12, words: t.words, audio: t.audio,
      });
      idx++;
    }
  } else
  for (let si = 0; si < script.sections.length; si++) {
    const sec = script.sections[si];
    for (let gi = 0; gi < sec.segments.length; gi++) {
      const seg = sec.segments[gi];
      const segId = `s${idx}`;
      const t = tts[idx];
      if (!t || t.segId !== segId) throw new Error(`TTS eşleşme hatası: ${segId}`);
      flat.push({
        segId, index: idx, sectionIndex: si, sectionTitle: sec.title,
        firstOfSection: gi === 0, lastOfSection: gi === sec.segments.length - 1,
        text: seg.text, emphasis: seg.emphasis, visuals: beatsOf(seg),
        // Nefes payı sabit değil, YAPISAL: bölüm sonunda uzun, rakamdan sonra
        // orta, soruda kısa. Sabit 0,12 sn ölçülmüş bir kusurdu (bkz. NEFES).
        dur: t.duration + nefesPayi({
          lastOfSection: gi === sec.segments.length - 1,
          emphasis: seg.emphasis, text: seg.text,
        }),
        words: t.words, audio: t.audio,
      });
      idx++;
    }
  }
  // KAPANIŞ KUYRUĞU — video son sözle birlikte kesilmesin.
  //
  // ÖLÇÜLEN KUSUR (20260817-b05a7a): son altyazı 670,547. saniyede bitiyor,
  // dosya 670,967'de. Arada 0,42 saniye var ve o sürede görüntü tam siyaha
  // bile inemiyor (son karenin parlaklığı YAVG=21,9). İzleyici son cümleyi
  // duyuyor, yarım saniye sonra ekran kesiliyor — "dosya bozuk mu" hissi.
  //
  // Somut kayıp: YouTube bitiş ekranı (abone kartı, sonraki video önerisi)
  // EN AZ 5 saniyelik boş kuyruk ister. 0,42 saniyede o alan hiç kullanılamaz.
  //
  // Uygulaması tek satır çünkü ses zaten buna hazır: her segmentin WAV'ı
  // `apad` ile kendi `dur`una kadar sessizlikle dolduruluyor (aşağıda),
  // dolayısıyla son bloğun süresini uzatmak narration.wav'ı da uzatıyor.
  // Müzik `amix=duration=first` ile onu takip ediyor ve zaten toplam sürenin
  // son 3,5 saniyesinde kısılıyor — yani kuyruk müzikle kapanıyor.
  if (flat.length && !isCollage) {
    // A short editorial video resolves its final thought and fades out;
    // long-form work retains room for a YouTube end screen.
    const shortEditorial=VISUAL_STYLES[job.visualStyle]?.editorial===true&&flat.reduce((s,f)=>s+f.dur,0)<=90;
    flat[flat.length - 1].dur += shortEditorial?1.4:KAPANIS_KUYRUGU;
    flat[flat.length - 1].kapanisKuyrugu = true;
  }

  let offset = 0;
  const sectionTimes = [];
  for (const f of flat) {
    f.offset = offset;
    if (f.firstOfSection && f.sectionTitle) sectionTimes.push({ title: f.sectionTitle, start: offset });
    offset += f.dur;
  }
  const totalDur = offset;

  // --- kesme listesi (beat seviyesi: görüntü) ---
  // style burada gerekli: hareket modu kesme sayısını 1'e indiriyor.
  const style = VISUAL_STYLES[job.visualStyle] || VISUAL_STYLES.klasik;
  const editorialMod = style.editorial === true && !isCollage;
  const hareketMod = style.hareket === true && !isCollage;
  // Tam ekran: arka plan görüntü kadrajı kaplar, öğeler üstünde yüzer
  const tamEkran = hareketMod && style.tamEkran === true;

  // HAREKET MODUNDA HEDEF SAHNE SÜRESİ.
  //
  // Segment başına TEK sahne zorlanıyordu ve segmentler 44-54 kelimelik
  // paragraflar olduğu için sahneler ORTALAMA 23,7 SANİYE sürüyordu (ölçüldü;
  // değişim katsayısı 0,09 — tam tekdüze). Tek kompozisyonda 23 saniye
  // izleyiciyi kaçırır. Segment artık hedef süreye göre birden çok sahneye
  // bölünür; kelimeler de sahnelere paylaştırılır.
  const HAREKET_HEDEF = Math.max(5.5, Math.min(9,6.5 / Math.sqrt(profile.camera.speed)));
  const HAREKET_TAVAN = 4;   // segment başına en fazla sahne
  const MIN_BEAT = 2.2;
  const beats = [];
  // ARKA PLAN SEÇİMİ.
  //
  // Eskiden: kendi medyası yoksa aynı segmentten herhangi biri, o da yoksa
  // VİDEONUN HERHANGİ BİR medyası. Alaka hiç sorulmuyordu. Gerçek videoda
  // "Deepsea Challenger submersible 2012" sahnesinin tam ekran arka planı
  // KITTORY marka Rus bahçe dalgıç pompası oldu; "tectonic plate subduction
  // diagram" sahnesine İzlanda turist manzarası düştü.
  //
  // Artık denetimden kalan (gorsel < eşik) medya arka plan olarak seçilmez;
  // önce aynı segmentin denetimi geçen görselleri denenir, hiçbiri yoksa
  // renk kartına düşülür (motion.js düz zemin + yazı ile sahneyi kurar).
  // Arka planda daha gevşek eşik: "zayıf ama konuyla ilgili" görsel düz renkten
  // iyidir. Yalnızca tamamen alakasız olan (pompa, kedi, tansiyon aleti) reddedilir.
  //
  // Seçimin kendisi arkaplan.js'e taşındı — closure olduğu için test edilemiyordu
  // ve içindeki tekrar kuralı gerçek videoda dört kez sızmıştı.
  const gecer = arkaPlanGecer;
  let arkaElenen = 0;
  // Cümle hizalaması sayaçları — kullanıcıya kaç sahnenin hizalandığı bildirilir.
  let hizaliSegment = 0, hizasizSegment = 0, hizaDusen = 0, hizaTasinan = 0;
  const durum = yeniArkaDurum();
  // SÖYLENENİN GÖSTERİLECEK KARŞILIĞI YOKSA FOTOĞRAF KOYMA.
  //
  // Belgesel anlatımının bir bölümü SOYUTTUR: retorik soru, geçiş cümlesi,
  // yorum. "Peki o geleceği mi gördü yoksa her nesil kendi korkusunu mu
  // okudu?" — bunun karşılığı arşivde yoktur. Oraya ne konursa konsun
  // yalnızca çağrışım kalır ve izleyici ekranda ilgisiz bir şey görür.
  //
  // Ölçüldü (5 üretim, kare kare): "söyleneni gösteriyor" oranı %55-61
  // aralığında takılı kaldı; kalan kaybın büyük kısmı bu tür cümlelerdi.
  // Seçim hatası değil — gösterilecek şey olmaması.
  //
  // İKİ KOŞUL BİRDEN aranır, yoksa video gereksiz yere yazıya boğulur:
  //   1) görsel denetimi o görseli zaten ZAYIF bulmuş (alaka <= 1), ve
  //   2) sahnede söylenen cümlede SOMUT ÇAPA yok (özel ad / yıl / nicelik).
  // İkisi de doğruysa render tipografiye düşer (metinPerdesi) — yanıltıcı
  // fotoğraf yerine söylenenin kendisi ekrana kurulur.
  let capasizTipografi = 0;
  const capasizAdaylar = [];
  const TIPOGRAFI_TAVANI = 0.25;   // sahnelerin en fazla dörtte biri
  const sahneMedyasi = (f, b, vIdx, hiza, durs) => {
    const m = mediaFor(f.index, vIdx, f.text);
    if (!m?.file) return m;
    // KAPI İKİ KOŞULA BAĞLI — ve bu bilerek DAR tutuldu.
    //
    // 1) Görsel denetimi bu görseli zaten ZAYIF bulmuş olmalı (alaka <= 1).
    // 2) Sahnede söylenen cümlede somut çapa olmamalı.
    //
    // Neden dar: ölçüldü (20260809-c03c63) — kural devrede DEĞİLKEN video zaten
    // %89 isabet tutturdu. Böyle bir videoda iyi fotoğrafları yazıya çevirmek
    // düpedüz zarar olur. Denetim kötü demediyse fotoğraf yerinde kalır.
    //
    // KALDIRILAN ÜÇÜNCÜ KOŞUL — "sorguda özel ad olmasın":
    // Ölçüldü (20260811-5ef0d8): bu kapı HİÇ açılmadı, tek bir sahne bile
    // tipografiye düşmedi. Sebep, sorgu onarımının kendisiydi — o adım
    // 19/19 sorguya bilerek özel ad koyuyor ("Noland Arbaugh Neuralink
    // electrodes", "Alexander Huth semantic decoder fMRI"). Yani iki iyi
    // özellik birbirini iptal ediyordu: sorgular iyileştikçe tipografi
    // güvenliği kapanıyordu.
    //
    // Mantık da hatalıydı: 1. koşul zaten "denetim BU GÖRSELE kötü dedi"
    // diyor. SORGUDAKİ özel ad, gelen GÖRSEL hakkında hiçbir şey söylemez —
    // nitekim "Neuralink N1 implant coin size" sorgusuna NASA'dan uzay
    // fotoğrafı geldi ve bu koşul yüzünden ekranda kaldı.
    if (!Number.isFinite(m.gorsel) || m.gorsel > 1) return m;
    // Sahnede söylenen cümleler: hizalama varsa onun penceresi, yoksa segment.
    let metin = f.text || "";
    if (hiza?.pencereler && hiza.gruplar?.[b]) {
      const g = hiza.gruplar[b];
      const ic = hiza.pencereler.filter((p) => p.bas < g.son - 0.01 && p.son > g.bas + 0.01);
      if (ic.length) metin = ic.map((p) => p.metin).join(" ");
    }
    if (somutCapaVar(metin)) return m;      // aranacak somut bir şey var
    // Hemen düşürme: TAVAN sahne sayısına göre uygulanacağı için aday olarak
    // işaretlenip beat listesi tamamlandıktan sonra karar veriliyor.
    capasizAdaylar.push(`s${f.index}b${b}`);
    return m;
  };
  const mediaFor = (segIdx, b, narration) => {
    const own = media[`s${segIdx}b${b}`];
    if (own?.file && !gecer(own)) arkaElenen++;
    return arkaPlanSec(media, segIdx, b, durum, narration);
  };
  if (isCollage) {
    // 1 beat = 1 klip; kırpma montajda yapılır
    script.beats.forEach((b, i) => {
      beats.push({
        id: b.id, segIndex: i, beatIndex: 0, first: true, last: true,
        sectionIndex: 0, sectionTitle: "", firstOfSection: false,
        isVideoStart: i === 0, isVideoEnd: i === script.beats.length - 1,
        query: b.concept, overlayText: b.overlayText, emphasis: null,
        media: media[b.id], dur: flat[i].dur,
      });
    });
  } else
  for (const f of flat) {
    // GÖRSEL SAYISI TAVANI. Segment başına yalnızca visuals.length kadar (3)
    // medya indiriliyor, ama HAREKET_TAVAN 4'tü: uzun segmentlerde 4. sahne
    // yaratılıyor, `media["s{i}b3"]` bulunamıyor ve kod kardeş aramaya
    // düşüyordu. En yüksek puanlı kardeş de hep b0 olduğu için her uzun
    // segmentin SON sahnesi İLK sahnenin görselini tekrar ediyordu.
    // Bitmiş videoda ölçüldü: portre 195s+215s, termal 217s+238s,
    // kül bulutu 245s+267s, lav 74s+87s — dördü de aynı segmentin b0/b3'ü.
    // Elinde resim yoksa sahne açma: sahne sayısı kullanılabilir medyayı aşamaz.
    const medyaTavan = Math.max(1, kardesleriBul(media, f.index, durum, f.text).length);

    // STİL VAAT ETTİĞİ TEMPOYU TUTSUN.
    //
    // ÖLÇÜLEN KUSUR (20260817-b05a7a): kullanıcı "Vox — 3-4 sn'de bir kesme"
    // stilini seçti, gerçek ortalama 8,95 saniye çıktı (75 kesme / 670,97 sn).
    // Piksel bazlı bağımsız sahne tespiti de 74 sınır buldu, medyan 8,6 sn,
    // en uzun plan 20,7 sn. Vaat ile teslim arası 2,5 kat.
    //
    // Sebep: tavan `f.visuals.length` idi ve o da stilin `beats` değeri (3).
    // 30 saniyelik bir segment 3 sahneye bölünüyor, sahne başına 10 saniye
    // düşüyordu — süre ne olursa olsun sahne sayısı sabit kalıyordu.
    //
    // Artık stilin HEDEF KESME SÜRESİ varsa sahne sayısı süreden hesaplanıyor.
    // Medya tavanı hâlâ üst sınır: elinde 3 resim varken 6 sahne açmak, aynı
    // resmi tekrar göstermek demektir (bu kusur bir kez yapılmıştı, yukarıdaki
    // yoruma bakın). Yani hedef ancak yeterli medya varsa tutturulabilir —
    // asıl çözüm senaryonun uzun segmentte daha çok görsel istemesidir.
    const hedefKesme = targetEditorialCutSeconds(job,totalDur,VISUAL_STYLES[job.visualStyle]?.hedefKesme || 0);
    const sureTabanli = hedefKesme ? Math.round(f.dur / hedefKesme) : 0;
    const klasikTavan = Math.max(f.visuals.length, sureTabanli);

    // Süre kısa kaldıysa beat sayısını düşür — 2 sn'den kısa kesme göz yorar
    const hook = planPortraitShortHook({job,segment:f,totalDurationSec:totalDur,mediaCount:medyaTavan,
      anchors:sceneAnchorQueries(media,f.index,f.visuals,medyaTavan)});
    const istenenN = hook?.count ?? (hareketMod
      ? Math.max(1, Math.min(HAREKET_TAVAN, medyaTavan, Math.round(f.dur / HAREKET_HEDEF)))
      : Math.max(1, Math.min(klasikTavan, medyaTavan, Math.floor(f.dur / MIN_BEAT))));
    // Grafik/kart taşıyan ilk kesmeye ekstra süre ver ki izleyici okuyabilsin.
    // Hareket modunda sahneler eşit bölünür — biri uzun kalırsa tempo yine düşer.
    const hasCard = !hareketMod
      && (f.index === 0 || f.firstOfSection || (f.emphasis && f.emphasis.type !== "none"));

    // KESME CÜMLE SINIRINA OTURSUN — ritim eğrisinden ÖNCE denenir.
    //
    // Süreler eskiden yalnızca ritme göre paylaşılıyordu ve kesme cümlenin
    // ortasına düşüyordu: görsel, kendi cümlesi söylenmeden ekrana geliyor ya
    // da geçtikten sonra kalıyordu. Ölçüldü (20260809-bc5629): 27 görselin en
    // fazla 6'sı kendi cümlesiyle hizalıydı, 5'i bir sahne kayıktı — radyo
    // görseli radyodan bahsedilmeden bir sahne önce çıkıyordu.
    //
    // TTS kelime zamanları elimizde olduğu için cümlenin sesin neresinde
    // olduğu ÖLÇÜLEBİLİR. Kart taşıyan sahnede taban süre yükseltilir ki
    // izleyici yazıyı okuyabilsin.
    const hizaTaban = hook?.minSceneSec ?? (hasCard ? Math.max(MIN_BEAT, 3.2) : MIN_BEAT);
    const hiza = hook?.alignment ?? sahneHizasi(f.text, f.words, istenenN, f.dur, hizaTaban,
      job.mediaKind==='director'
        ? sceneAnchorQueries(media,f.index,f.visuals,istenenN)
        : (f.visuals || []).map((v,i) => media[`s${f.index}b${i}`]?.editorial?.anchorQuote || v.anchorQuote || v.query));
    // Hizalama sahne sayısını DÜŞÜREBİLİR: 2 doğru sahne, 3 kayık sahneden iyi.
    const n = hiza ? hiza.gruplar.length : istenenN;
    if (hiza && n < istenenN) hizaDusen += istenenN - n;
    if (hiza) hizaliSegment++; else hizasizSegment++;
    // Sahne -> özgün görsel indeksi. Hizalama yoksa birebir sıra.
    const gorselIdx = (b) => (hiza ? hiza.gorselSirasi[b] : b);
    if (hiza && hiza.gorselSirasi.some((v, b) => v !== b)) hizaTasinan++;

    const firstShare = n > 1 && hasCard ? 0.5 : 1 / n;
    let durs;
    if (hiza) {
      durs = hiza.gruplar.map((g) => g.dur);
    } else if (hareketMod && n > 1) {
      // RİTİM. Eşit bölünce sahneler hep aynı uzunlukta çıkıyordu (ölçüldü:
      // değişim katsayısı 0,04 — tekdüze). Segment içinde hızlanan bir yay
      // kurulur: ilk sahne kurar, sonrakiler sıkışır. Kelimeler zaman
      // penceresine göre dilimlendiği için konuşma senkronu bozulmaz.
      const agirlik = Array.from({ length: n }, (_, b) => 1.22 - (b / Math.max(1, n - 1)) * 0.44);
      const toplam = agirlik.reduce((a, c) => a + c, 0);
      durs = agirlik.map((w) => (f.dur * w) / toplam);
    } else {
      durs = Array.from({ length: n }, (_, b) =>
        b === 0 ? f.dur * firstShare : (f.dur * (1 - firstShare)) / (n - 1)
      );
    }
    let ic = 0;   // sahnenin segment içindeki başlangıcı
    for (let b = 0; b < n; b++) {
      beats.push({
        id: `s${f.index}b${b}`,
        segIndex: f.index, beatIndex: b, first: b === 0, last: b === n - 1,
        sectionIndex: f.sectionIndex, sectionTitle: f.sectionTitle,
        firstOfSection: f.firstOfSection && b === 0,
        isVideoStart: f.index === 0 && b === 0,
        isVideoEnd: f.index === flat.length - 1 && b === n - 1,
        // Görsel, sahnede SÖYLENEN cümleye göre seçilir; sıraya göre değil.
        query: f.visuals[gorselIdx(b)]?.query || f.visuals[0]?.query,
        emphasis: b === 0 ? f.emphasis : null,
        media: sahneMedyasi(f, b, gorselIdx(b), hiza, durs),
        dur: durs[b],
        // Kelimeleri sahnelere dilimlemek için segment içi pencere
        icBas: ic,
        icSon: ic + durs[b],
        sahneSayisi: n,
      });
      ic += durs[b];
    }
  }

  // --- altyazılar ---
  // ÇAPASIZ SAHNELERİ TİPOGRAFİYE DÜŞÜR — tavanla.
  //
  // Aday: denetimin zayıf bulduğu (alaka <= 1) VE cümlesinde somut çapa
  // olmayan sahne. Hepsini birden yazıya çevirmek videoyu ucuzlatır; en fazla
  // dörtte biri dönüşür, öncelik en düşük alaka puanlı olanda.
  if (capasizAdaylar.length) {
    const tavan = Math.max(1, Math.floor(beats.length * TIPOGRAFI_TAVANI));
    const sirali = capasizAdaylar
      .map((id) => beats.find((x) => x.id === id))
      .filter((x) => x?.media?.file)
      .sort((a, b) => (a.media.gorsel ?? 9) - (b.media.gorsel ?? 9));
    for (const b of sirali.slice(0, tavan)) { b.media = null; capasizTipografi++; }
    if (sirali.length > tavan) {
      logFn(`${sirali.length - tavan} çapasız sahne tavan nedeniyle görselli bırakıldı ` +
        `(en fazla sahnelerin %${Math.round(TIPOGRAFI_TAVANI * 100)}'i tipografiye döner).`);
    }
  }
  if (capasizTipografi) {
    logFn(`${capasizTipografi} sahnede anlatılanın somut karşılığı yok (soyut cümle) — ` +
      `yanıltıcı fotoğraf yerine tipografi kuruldu.`);
  }

  // KURGU MASASI — editörde verilen plan kararları (kamera, ekran yazısı,
  // giren geçiş). Otomatik seçimlerden SONRA uygulanır ki kullanıcı kararı
  // tipografi/arka plan kurallarınca geri çevrilmesin.
  const shotEdits = job.shotEdits && typeof job.shotEdits === 'object' ? job.shotEdits : {};
  if (Object.keys(shotEdits).length) {
    const r = applyShotEditsToBeats(beats, shotEdits);
    logFn(`Kurgu masası: ${r.applied} plan kararı uygulandı.`);
    if (r.unmatched.length) qualityWarnings.push(`${r.unmatched.length} plan kararı artık var olmayan plana ait (${r.unmatched.slice(0, 6).join(', ')}); metin değiştiyse editörde yeniden verin.`);
  }

  // `text` ŞART: altyazı TTS kelimelerinden kuruluyor ve onlar noktalamasız
  // geliyor. Özgün metin verilmezse hem ekranda nokta çıkmıyor hem de
  // öbekleme cümle sınırını göremiyor (bkz. subtitles.js noktalamaGeriYaz).
  const timeline = flat.map((f) => ({ offset: f.offset, duration: f.dur, words: f.words, text: f.text }));
  if (job.subtitleMode !== "none") {
    const subtitleLayout = { width: kanvas.w, height: kanvas.h, editorial:editorialMod };
    const captions = buildCaptions(timeline, job.subtitleMode, subtitleLayout);
    fs.writeFileSync(path.join(jobDir, "subs.ass"), buildAss(captions, job.subtitleMode, subtitleLayout), "utf8");
  }
  fs.writeFileSync(path.join(jobDir, "subs.srt"), buildSrt(timeline), "utf8");

  // --- KURGU PLANI — videonun tamamı için TEK model çağrısı ---
  //
  // Geçiş planından ÖNCE alınır: model hangi sınırın hangi geçişi hak ettiğini
  // de söylüyor. Sahne süresi olarak beat'in ham süresi verilir; geçiş payları
  // henüz hesaplanmadı ama model için yeterince yakın (kaç saniyelik bir sahne
  // olduğunu bilmesi yeter, milisaniye değil).
  //
  // Plan alınamazsa (ağ/kota/şema) her şey kural tabanlı yola düşer — kurgu
  // planı bir İYİLEŞTİRMEDİR, bağımlılık değil.
  let kurgu = new Map();
  if (hareketMod && job.kurguPlani !== false && !job.demo) {
    kurgu = await kurguPlani(
      beats.map((b, i) => ({
        no: i,
        metin: flat[b.segIndex]?.text || "",
        gorunen: b.media?.gorunen || b.query || "",
        sure: b.dur,
        bolumBasi: !!b.firstOfSection,
        bolumAdi: b.sectionTitle || "",
      })),
      { baslik: script.title, logFn, usage: job.usage, profile, model:st.model, cacheDir:job.recoveryDir || jobDir }
    );
  }

  // --- geçiş planı ---
  // Kesme listesi kesinleştikten SONRA planlanır: sınır türü (kesme/segment/bölüm),
  // vurgu anları ve yedek kartlar plana giriyor. Süre-nötr — toplam uzunluk
  // değişmez, ses senkronu bozulmaz (bkz. transitions.js).
  const gecisModu = job.transitions || "sinematik";
  const plan = planTransitions(beats, {
    theme: job.theme,
    intensity: gecisModu,
    uretilmis: isCollage || job.mediaKind === "fullai",
    kurgu,
    profile,
    director: job.mediaKind === 'director',
    overrides: transitionOverrides(beats, shotEdits),
  });
  // Kare düzeni: bütün kesim noktaları tamsayı kareye oturur. Saniye bazlı
  // hesap ffmpeg'in parça başına yuvarlamasıyla birikimli kayma üretiyordu
  // (10 kesmede 0,17 sn ölçüldü) — kare bazlı toplam TAM eşit çıkıyor.
  const layout = frameLayout(beats, plan, st.fps);
  const sourceTiming=editorialMod?planEditorialSourceTiming(beats,layout,st.fps):[];
  const visualQuality = measureVisualQuality(beats, plan, {fps:st.fps,sourceTiming});
  const visualWarnings = longformWarnings(visualQuality, job);
  qualityWarnings.push(...visualWarnings);
  fs.writeFileSync(path.join(jobDir, 'visual-quality.json'), JSON.stringify({
    ...visualQuality,
    mode: job.mediaKind,
    warnings: visualWarnings,
  }, null, 2));
  if (['mixed', 'ai', 'director'].includes(job.mediaKind)) {
    logFn(`Hareketli görüntü kapsamı: %${visualQuality.videoPercent} (${visualQuality.videoSec}/${visualQuality.durationSec} sn).`);
  }
  const editorialPlans = editorialMod ? planEditorialSequence(beats.map((b,i)=>{
    const f=flat[b.segIndex];
    const words=(f?.words||[]).filter(w=>Number.isFinite(w?.start)&&w.start>=b.icBas-.001&&w.start<b.icSon)
      .map(w=>({...w,start:Math.max(0,w.start-b.icBas)}));
    return {director:job.mediaKind==='director',beat:b,text:words.length?words.map(w=>w.t).join(' '):(b.sahneSayisi===1?f?.text:''),words,title:script.title,index:i,profile,canvas:kanvas};
  })).map((scene,i)=>{
    // Rendered clips include incoming-transition handles. Text and SFX share
    // the visible slot clock; shift only draw timing by that handle length.
    scene.renderLeadIn=i>0?layout.a[i-1]/st.fps:0;
    Object.assign(scene,sourceTiming[i]);
    return scene;
  }) : [];
  if (editorialMod) {
    visualQuality.longestFrozenRunSec = longestFrozenRun(editorialPlans);
    const frozenWarning = longformWarnings({ longestFrozenRunSec: visualQuality.longestFrozenRunSec, durationSec: 0 }, {}).filter((w) => /hiçbir şey hareket etmiyor/.test(w));
    qualityWarnings.push(...frozenWarning);
    fs.writeFileSync(path.join(jobDir, 'visual-quality.json'), JSON.stringify({ ...visualQuality, mode: job.mediaKind, warnings: [...visualWarnings, ...frozenWarning] }, null, 2));
  }
  fs.writeFileSync(path.join(jobDir,'edit-plan.json'),JSON.stringify({version:2,visualStyle:job.visualStyle,profile,fps:st.fps,crf:st.crf,subtitleMode:job.subtitleMode,transitions:plan,totalFrames:layout.toplamKare,visualQuality,scenes:beats.map((b,i)=>({id:b.id,sectionIndex:b.sectionIndex,duration:b.dur,frames:layout.slot[i],mediaType:b.media?.type||'card',sourceId:b.media?.sourceId||b.media?.kaynakId||b.media?.file||null,mediaFile:b.media?.file||null,segIndex:b.segIndex,...(job.mediaKind==='director'?{anchorQuote:b.media?.editorial?.anchorQuote||null}:{}),relevance:Number.isFinite(b.media?.gorsel)?b.media.gorsel:null,videoConsistency:Number.isFinite(b.media?.videoTutarlilik)?b.media.videoTutarlilik:null,flow:b.media?.akis||null,camera:hareketSec(b.media?.kadraj,b.media?.odak,i,layout.L[i],st.fps,profile),...(editorialMod?{composition:editorialPlans[i]}:{})}))},null,2));
  const uzunluk = layout.L.map((f) => f / st.fps); // her kesmenin RENDER uzunluğu (sn)
  const gecisVar = plan.some((p) => p.sure > 0);
  if (gecisVar) logFn(`Geçiş planı: ${planOzet(plan)}`);
  else logFn("Geçişler kapalı — sert kesme.");

  // --- disk ön kontrolü ---
  // Geçiş açıkken kesme başına iki dosya var (ara kesme + parça) ve ara kesmeler
  // daha yüksek kaliteyle kodlanıyor — pay üç katına çıkarılır.
  const kesmeMb = gecisVar ? 7.5 : 2.5;
  const needMb = Math.round(beats.length * kesmeMb + totalDur * 0.25 + 300);
  const freeMb = freeDiskMb(jobDir);
  if (freeMb < needMb) {
    throw new Error(
      `Disk yetersiz: bu render için ~${needMb} MB gerekiyor, ${freeMb} MB boş. ` +
      `Kütüphaneden eski videoları silin veya daha kısa bir süre seçin.`
    );
  }
  if (freeMb < needMb * 3) logFn(`Uyarı: disk daralıyor (${Math.round(freeMb / 1024)} GB boş).`);

  // --- RENK DERECELENDİRME ---
  // Stok görseller 5-6 farklı siteden geliyor; her biri farklı ışıkta.
  // Ölçüldü: gerçek fotoğraflarda parlaklık yayılımı 31 birim, derecelendirme
  // sonrası 6. Kaynak başına tek kare ölçülür (grade.js), beat kimliğine göre
  // filtre üretilir.
  let gradeMap = {};
  if (st.cinemaGrade !== false) {
    const gorulen = new Set();
    const girdiler = [];
    for (const b2 of beats) {
      const f = b2.media?.file;
      if (!f || gorulen.has(f)) continue;
      gorulen.add(f);
      girdiler.push({ id: f, src: f, video: b2.media.type === "video" });
    }
    try {
      gradeMap = await gradeHaritasi(girdiler, {
        ffmpegPath: st.ffmpegPath, tema: job.theme, mapLimit,
        concurrency: st.concurrency, killer, logFn,
      });
    } catch (e) { logFn(`Renk derecelendirme atlandı: ${String(e.message).slice(0,70)}`); }
  }

  // --- hareket modu: kesikleri hazırla ---
  // Her sahne 3 katman istiyor; senaryonun yazdığı 3 görsel sorgusunun indirilmiş
  // hâli (s{i}b0..b2) maskeli kesiğe çevrilir. Tamamen yerel, ücretsiz.
  let kesikler = {};
  if (hareketMod) {
    const girdiler = [];
    for (const f of flat) {
      // TAM EKRAN dilinde b0 arka plan olarak KULLANILIR — kesiğe çevrilmez.
      // Sadece b1/b2 üstteki çerçeveli öğeler olur.
      const ilk = tamEkran ? 1 : 0;
      for (let b = ilk; b < 3; b++) {
        const m = media[`s${f.index}b${b}`];
        // Video da kabul edilir: maskeliKesik ffmpeg'e besliyor ve -frames:v 1 ile
        // ilk kareyi alıyor. Önceden yalnızca "image" geçiyordu ve kaynak video
        // olduğunda köşe öğesi sessizce kayboluyordu.
        if (m?.file && (m.type === "image" || m.type === "video")) {
          girdiler.push({ id: `s${f.index}b${b}`, src: m.file, tur: m.type, rol: b === 0 ? "hero" : b === 1 ? "destek" : "aksan" });
        }
      }
    }
    logFn(`${tamEkran ? "Sinematik hareket" : "Hareketli kolaj"}: ${girdiler.length} kesik hazırlanıyor...`);
    kesikler = await kesikleriHazirla(girdiler, path.join(renderDir, "kesik"), {
      kanvas, mapLimit, killer, logFn, aiKesik: job.aiKesik === true,
    });
    onProgress(58);
  }

  // Tasarım aksanı: köşedeki küçük öğe FOTOĞRAF DEĞİL, tema renginde geometrik
  // şekil. Önceden başka bir fotoğrafın minik hâliydi ve ekranda anlam
  // taşımıyordu; referans dilde oradaki öğe zaten bir tasarım öğesi.
  // Yüzen tasarım şekli SADECE kâğıt kolajda anlamlı. Tam ekran fotoğrafın
  // üstünde çıpasız duruyor ve "ekranı bir şey geçiyor" gibi görünüyordu;
  // orada aksan artık yazıya bağlı ince çizgi (motion.js serit).
  // Karartma perdesi: iş başına TEK gradyan PNG (9 drawbox yerine tek overlay,
  // bant izi yok). Üretilemezse motion.js basamaklı yola düşer.
  let perdeSrc = null;
  if (tamEkran) {
    try {
      const p = path.join(renderDir, "perde.png");
      await perdeGradyani(p, kanvas, { killer });
      perdeSrc = p;
    } catch (e) { logFn(`Perde gradyanı üretilemedi, basamaklı yola düşülüyor: ${String(e.message).slice(0,70)}`); }
  }

  let aksanSekli = null;
  if (hareketMod && !tamEkran) {
    try {
      const renk = (THEME_ACCENT[job.theme] || THEME_ACCENT.belgesel).replace("0x", "0x");
      const kisa = Math.min(kanvas.w, kanvas.h);
      const yol = path.join(renderDir, "kesik", "_aksan.png");
      await sekilAksani(yol, {
        renk,
        sekil: ["kare", "daire", "yuvarlak"][Math.abs(job.id.charCodeAt(job.id.length - 1)) % 3],
        boyut: Math.round(kisa * 0.22),
        killer,
      });
      aksanSekli = yol;
    } catch (e) {
      logFn(`Tasarım aksanı üretilemedi, atlanıyor: ${String(e.message).slice(0, 80)}`);
    }
  }

  // --- hareket modu: sahne planları (SIRALI) ---
  // Şablon çeşitliliği bir öncekine bakarak çalışıyor; render paralel olduğu için
  // planlama önce ve sırayla yapılmalı, yoksa "önceki şablon" yarışa girer ve
  // ardışık sahneler aynı kompozisyonu alabilir.
  const sahnePlanlari = [];
  if (hareketMod) {
    // KURGU PLANI — videonun tamamı için TEK model çağrısı.
    //
    // Kural tabanlı kurgu tutarlıydı ama sahnenin İÇERİĞİNİ görmüyordu; her
    // sahne aynı araçlarla kuruluyordu. Model bütün sahneleri birden görüp
    // hangi anın ne hak ettiğini söylüyor — köşe öğesi mi, tam ekran devralma
    // mı, grafik mi, yoksa temiz kadraj mı. Geometriyi yine kod garanti eder.
    // Plan alınamazsa (ağ/kota/şema) kural yolu aynen devam eder.
    let sonSablon = null;
    let vurusluSahne = 0;   // "sadece vurgu" modunda ekranın ne kadarı yazılı — log'a çıkar
    let bindirmeliSahne = 0; // kaç sahne grafik/kart aldı (kurgu çeşitliliği ölçüsü)
    let devralanSahne = 0;   // kaç sahnede köşe öğesi ekranı devraldı
    let oncekiKesik = new Set();          // ardışık sahnede aynı damga çıkmasın
    const kesikKullanim = new Map();      // id -> kaç sahnede kullanıldı
    const kesikDurum = { sahneNo: 0, sonKesikSahne: -99 };  // seyreltme durumu
    let kesikYuva = 0, kesikDolu = 0;     // alaka kapısının ne kadarını elediği
    beats.forEach((b, i) => {
      const f = flat[b.segIndex];
      // Segment birden çok sahneye bölündüğünde kelimeler de bölünmeli, yoksa
      // her sahne cümlenin TAMAMINI gösterir ve kelime-konuşma senkronu kopar.
      // Sahnenin penceresine düşen kelimeler alınıp zamanları sahne başına göre
      // yeniden çıpalanır.
      const tumKelime = f?.words || [];
      const dilim = (b.sahneSayisi ?? 1) <= 1
        ? tumKelime
        : tumKelime
            .filter((w) => Number.isFinite(w?.start) && w.start >= b.icBas - 0.01 && w.start < b.icSon)
            .map((w) => ({ ...w, start: Math.max(0, w.start - b.icBas) }));
      // Pencereye hiç kelime düşmediyse (uzun sessizlik) sahne yazısız kalmasın:
      // segmentin o bölümüne en yakın kelimeyi al.
      const kelimeDilim = dilim.length || !tumKelime.length
        ? dilim
        : [{ ...tumKelime[Math.min(tumKelime.length - 1, b.beatIndex)], start: 0.2 }];
      // Kesikler ALAKAYA göre seçilir (bkz. kesikSec). Arka planın hangi beat'e
      // ait olduğu beatId ile bilinir — eskiden dosya adı alt-dizgi kıyasıydı ve
      // paylaşılan indirmede ("s3b0" -> s0b1.jpg) devre dışı kalıyordu.
      // KARAR SIRASI ÖNEMLİ: önce bu sahnenin ARACI belirlenir (model planı ya
      // da kural), sonra ona göre kesik/vuruş seçilir. Ters sırada kesik seçimi
      // henüz tanımlanmamış karara bakıyordu.
      const k = kurgu.get(i) || null;      // modelin bu sahne için kararı (varsa)

      const kartVar = b.isVideoStart
        || (b.firstOfSection && script.sections.length >= 2)
        || k?.arac === "bolum";
      // Grafik: model istediyse VE senaryoda gerçekten sayı/karşılaştırma varsa.
      // Model "grafik" der ama emphasis boşsa çizilecek bir şey yok — o zaman
      // kural yoluna düşülür, uydurma grafik üretilmez.
      let grafikEmphasis = b.emphasis;
      let grafikVar = !kartVar && !!b.emphasis
        && (b.emphasis.type === "stat" || b.emphasis.type === "compare")
        && (!k || k.arac === "grafik" || !kurgu.size);

      // MODEL "grafik" DEDİ AMA SENARYODA EMPHASIS YOK.
      // Senaryonun emphasis alanı SEGMENT başına tek; segment 3 sahneye
      // bölününce diğer iki sahne emphasis'siz kalıyor. Model o sahnede sayı
      // gördüyse haklı — vurgusundaki sayıyı dev rakam grafiğine çeviriyoruz.
      // Sayı yoksa uydurma grafik üretilmez, kural yoluna düşülür.
      if (!grafikVar && !kartVar && k?.arac === "grafik" && k.vurgu && /\d/.test(k.vurgu)) {
        grafikEmphasis = { type: "stat", value: k.vurgu, label: "", items: [] };
        grafikVar = true;
      }
      b.grafikEmphasis = grafikEmphasis;
      b.bindirmeVar = kartVar || grafikVar;

      // VURGU: modelin seçtiği söz öncelikli — ama sahnenin metninde GERÇEKTEN
      // geçiyor olmalı. Model uydurursa (ölçüldü: bazen özetliyor) kural yoluna
      // düşülür; ekranda söylenmeyen bir söz durmasın.
      const sahneMetni = kelimeDilim.map((w) => w.t).join(" ");
      const modelVurgu = k?.vurgu && sahneMetni.toLocaleLowerCase("tr").includes(k.vurgu.toLocaleLowerCase("tr"))
        ? k.vurgu : null;
      const sahneVurgu = b.bindirmeVar ? null
        : (modelVurgu ?? (k && k.vurgu === "" ? null : vurguSec(sahneMetni, b.beatIndex === 0 ? f?.emphasis : null)));
      if (sahneVurgu) vurusluSahne++;
      if (b.bindirmeVar) bindirmeliSahne++;

      // KESİK SEÇİMİ — araç kararından SONRA.
      // Model "temiz" dediyse köşeye hiçbir şey konmaz, aralık kuralı bile
      // çalışmaz. "kose"/"tamekran" dediyse aralık kuralı GEVŞETİLİR: kararı
      // içeriğe bakarak verdi, kural ise körlemesine seyreltiyordu.
      kesikDurum.sahneNo = i;
      const modelIster = k?.arac === "kose" || k?.arac === "tamekran";
      const modelTemiz = k?.arac === "temiz" || k?.arac === "grafik" || k?.arac === "bolum";
      const secim = (b.bindirmeVar || modelTemiz)
        ? { src: [], idler: [] }
        : kesikSec(b, kesikler, media, tamEkran, oncekiKesik, kesikKullanim,
            modelIster ? { ...kesikDurum, sonKesikSahne: -99 } : kesikDurum);
      if (modelIster && secim.idler.length) kesikDurum.sonKesikSahne = i;
      oncekiKesik = new Set(secim.idler);
      for (const id of secim.idler) kesikKullanim.set(id, (kesikKullanim.get(id) || 0) + 1);
      kesikYuva += 1;                       // sahne başına EN FAZLA bir kesik
      kesikDolu += secim.src.length;

      const plan = planScene({
        kanvas, sure: layout.L[i] / st.fps,
        kelimeler: kelimeDilim,             // TTS kelime zamanları → yazı konuşmaya oturur
        medya: {
          // kesikSec artık EN FAZLA BİR kesik döndürüyor (seyreltme kuralı).
          // Tam ekranda o tek öğe destek yuvasına gider; kolajda kahraman olur.
          hero: tamEkran ? null : (secim.src[0] || null),
          destek: (tamEkran ? [secim.src[0]] : []).filter(Boolean),
          // Aksan = tasarım şekli (fotoğraf DEĞİL). Fotoğrafa düşülmez; ikinci
          // bir fotoğraf köşeyi kalabalıklaştırıp ikisini de dekora çeviriyordu.
          aksan: aksanSekli || null,
        },
        // Vurgu kelimesi SAHNENİN KENDİ kelimelerinden seçilir. Segmentin
        // tamamından seçilirse aynı segmentten çıkan tüm sahneler aynı kelimeyi
        // patlatıyor ve vuruş anlamsızlaşıyor. Senaryonun işaretlediği emphasis
        // yalnızca ilk sahnede geçerli.
        vurgu: sahneVurgu,
        anahtar: b.id,
        oncekiSablon: sonSablon,
        tamEkran,
        yaziModu: job.yaziModu || "vurgu",
        // Tam ekranda arka plan = beat'in kendi medyası (foto → Ken Burns,
        // video → tam kadraj), üstüne yazı için karartma bandı. Kolajda kâğıt zemin.
        arkaplan: tamEkran
          ? (b.media?.file
              ? { tur: b.media.type === "video" ? "video" : "gorsel", src: b.media.file, perde: true, perdeSrc, gradeF: gradeMap[b.media.file] || null }
              : { tur: "renk", renk: "0x11151c", perde: true, perdeSrc })
          : { tur: "renk", renk: "0xE8DCC8" },
      });
      // TAM EKRAN DEVRALMA — kurgu planı "tamekran" dediği sahnelerde.
      // Köşedeki öğe vuruş anında ekranı kaplayıp yerine döner. Vuruş anı
      // yoksa sahnenin ortasına konur. Kural tabanlı yolda hiç kullanılmaz:
      // içeriğe bakmadan verilecek bir karar değil, model seçmeli.
      if (k?.arac === "tamekran") {
        const gorselKat = plan.katmanlar.find((L) => L.tur === "gorsel");
        if (gorselKat) {
          const sahneSure = layout.L[i] / st.fps;
          const vT = plan.katmanlar.find((L) => L.tur === "yazi" && Number.isFinite(L.vurguT0))?.vurguT0;
          const dBas = Math.max(
            gorselKat.bas + 0.35,
            Math.min(Number.isFinite(vT) ? vT - 0.25 : sahneSure * 0.45, sahneSure - 2.4)
          );
          if (dBas + 2.1 < gorselKat.bas + gorselKat.sure) {
            gorselKat.devral = { bas: +dBas.toFixed(3), girisSure: 0.45, sure: 1.15, cikisSure: 0.45 };
            devralanSahne++;
          }
        }
      }
      sonSablon = plan.sablon;
      sahnePlanlari.push(plan);
    });
    const cesit = new Set(sahnePlanlari.map((p) => p.sablon)).size;
    const oran = Math.round((vurusluSahne / Math.max(1, sahnePlanlari.length)) * 100);
    logFn(`Sahne planı hazır: ${sahnePlanlari.length} sahne, ${cesit} farklı kompozisyon, ` +
      `${vurusluSahne} sahnede vuruş (%${oran}).`);
    // Alaka kapısı ne kadarını eledi? Sessizce boş yuva bırakmak yerine söyle.
    const elenen = Math.max(0, kesikYuva - kesikDolu);
    logFn(`Kurgu çeşitliliği: ${bindirmeliSahne} sahnede grafik/bölüm kartı` +
      (devralanSahne ? `, ${devralanSahne} sahnede tam ekran devralma` : "") + ".");
    logFn(`Kenar görseli: ${sahnePlanlari.length} sahnenin ${kesikDolu}'inde köşe öğesi var (%${Math.round(kesikDolu/Math.max(1,sahnePlanlari.length)*100)}) — ` +
      `gerisi temiz kadraj.`);
    if (arkaElenen)
      logFn(`${arkaElenen} sahnenin arka planı içerik denetiminden geçemedi, yerine segmentin uygun görseli kullanıldı.`);
    // Kesmelerin cümle sınırına oturup oturmadığı ölçülebilir bir şey — söyle.
    if (hizaliSegment || hizasizSegment) {
      const t = hizaliSegment + hizasizSegment;
      logFn(`Görsel–anlatım hizası: ${hizaliSegment}/${t} segmentte kesmeler cümle sınırına oturdu` +
        (hizaTasinan ? `, ${hizaTasinan} segmentte görsel söylendiği sahneye taşındı` : "") +
        (hizaDusen ? `, ${hizaDusen} sahne birleştirildi (cümlesi olmayan sahne açılmadı)` : "") +
        (hizasizSegment ? `; ${hizasizSegment} segmentte kelime zamanı yoktu, ritim bölmesi kullanıldı.` : "."));
    }
    // "Sadece vurgu" düzeninde vuruş yoksa ekranda hiç yazı kalmıyor; sessizce
    // boş geçmektense uyar — kullanıcı öbek moduna geçmeyi seçebilsin.
    if ((job.yaziModu || "vurgu") === "vurgu" && oran < 50)
      logFn(`Uyarı: sahnelerin %${100 - oran}'inde vurgulanacak sayı/özel ad yok, ekran yazısız kalıyor. ` +
        `Yazı düzenini "Öbek öbek" yapmak bu videoda daha dolu durur.`);
  }

  // --- beat klipleri (paralel) ---
  logFn(`${beats.length} ${hareketMod ? "sahne" : "kesme"} render ediliyor (${st.concurrency} paralel)...`);
  const accent = THEME_ACCENT[job.theme] || THEME_ACCENT.belgesel;
  const loc = job.language === "tr" ? "tr" : "en";
  // Ara kesmeler geçiş varken daha temiz kodlanır (çift kodlama kaybını önler)
  const kesmeCrf = gecisVar ? araCrf(st.crf) : st.crf;
  let clipsDone = 0;
  // Görseli olmayıp tipografiye düşen sahne sayısı. Klip döngüsünde artıyor,
  // bu yüzden döngüyle AYNI kapsamda tanımlı olmalı.
  let gorselsizTipografi = 0;
  // Akıllı yeniden render: değişmeyen editoryal plan önbellekten gelir (shot-cache.js).
  const shotCache = editorialMod ? new ShotCache(path.join(job.recoveryDir || jobDir, 'shot-cache')) : null;
  const shotKeys = beats.map(() => null);
  const kodlayici = JSON.stringify(videoEnc(st, kesmeCrf));
  const klipUret = async (b, i) => {
    if (killer.cancelled) throw new Error("cancelled");
    const renderSure = uzunluk[i];   // slot süresi + komşu geçişlerin taşma payı
    const renderKare = layout.L[i];  // aynısı kare cinsinden — kesim noktası buna göre
    const outFile = path.join(renderDir, `${b.id}.mp4`);
    if(editorialMod) {
      const gradeF=b.media?.file?gradeMap[b.media.file]:null;
      const key=shotKeys[i]=shotCacheKey({version:EDITORIAL_RENDER_VERSION,plan:editorialPlans[i],frames:renderKare,fps:st.fps,canvas:kanvas,crf:kesmeCrf,grade:st.cinemaGrade!==false?gradeF:'off',media:b.media,encoder:kodlayici});
      try {
        if(!shotCache.restore(key,outFile)){
          await renderEditorialScene({st,canvas:kanvas,media:b.media,plan:editorialPlans[i],frames:renderKare,outFile,killer,crf:kesmeCrf,gradeF});
          shotCache.store(key,outFile);
        }
      } catch(e) {
        shotKeys[i]=null;
        if(killer.cancelled)throw e;
        if(job.mediaKind==='director')throw new Error(`AI Yönetmen sahnesi ${b.id} oluşturulamadı: ${e.message}`,{cause:e});
        logFn(`Editoryal sahne ${b.id} kaynakla oluşturulamadı: ${String(e.message).slice(0,160)}`);
        qualityWarnings.push(`${b.id} editoryal sahnesinde kaynak kullanılamadı; grafik yedeğini kontrol edin.`);
        await renderEditorialScene({st,canvas:kanvas,media:null,plan:editorialPlans[i],frames:renderKare,outFile,killer,crf:kesmeCrf});
      }
      clipsDone++;
      if(clipsDone%4===0||clipsDone===beats.length){logFn(`Editoryal kompozisyonlar: ${clipsDone}/${beats.length}`);onProgress(55+(clipsDone/beats.length)*(gecisVar?14:18));}
      return outFile;
    }
    if (isCollage) {
      const overlay = collageOverlay(b.overlayText, b.dur, loc, kanvas);
      await renderCollageClip({ st, kanvas, media: b.media, dur: renderSure, frames: renderKare, overlay, outFile, killer, crf: kesmeCrf, profile });
      clipsDone++;
      if (clipsDone % 6 === 0 || clipsDone === beats.length) {
        logFn(`Kesmeler: ${clipsDone}/${beats.length}`);
        onProgress(55 + (clipsDone / beats.length) * (gecisVar ? 14 : 18));
      }
      return outFile;
    }

    if (hareketMod) {
      // SİNEMATİK MODDA GRAFİK/KART BİNDİRMESİ.
      //
      // Bunlar klasik modda vardı, burada yoktu. Eksikliği ölçülebilir:
      // senaryo modeli "compare" (karşılaştırma barları) ve "stat" (dev rakam +
      // açıklama) üretiyor, şemada zorunlu alan, ama sinematik dalda hiç
      // çizilmiyordu. Belgeselin en güçlü anı olan sayı karşılaştırması ekrana
      // çıkmıyordu. Üstelik her sahne aynı iki araçla (arka plan + köşe öğesi)
      // kurulduğu için kurgu mekanik duruyordu.
      // Karar PLANLAMA aşamasında verildi (b.bindirmeVar) — orada kinetik vuruş
      // da ona göre kapatıldı. Burada yalnızca çizim yapılır, karar tekrarlanmaz.
      let bindirme = "";
      if (b.bindirmeVar) {
        if (b.isVideoStart) bindirme = introOverlay(script.title, accent, loc, kanvas);
        else if (b.firstOfSection) bindirme = chapterOverlay(b.sectionIndex + 1, b.sectionTitle, accent, loc, kanvas);
        else bindirme = emphasisOverlay(b.grafikEmphasis || b.emphasis, b.dur, accent, loc, kanvas);
      } else if (!b.media?.file) {
        // GÖRSELSİZ SAHNE — düz zemin yerine tipografi.
        //
        // Arşivde karşılığı olmayan konularda (Baba Vanga gibi) birden çok
        // sahne görselsiz kalıyor ve ekranda yalnızca altyazı olan ölü kareler
        // çıkıyordu. Belgeselin çözümü boş ekran değil, sahnenin kilit
        // ifadesini ekrana kurmak.
        //
        // Metin sırası: model vurgusu → sahnenin seçilmiş vurgusu → bölüm başlığı.
        const perdeMetni = b.grafikEmphasis?.value || b.emphasis?.value ||
          sahnePlanlari[i].katmanlar.find((L) => L.tur === "yazi" && L.vurgu)?.vurgu ||
          b.sectionTitle || "";
        bindirme = metinPerdesi(perdeMetni, b.sectionTitle && perdeMetni !== b.sectionTitle
          ? b.sectionTitle : "", b.dur, accent, loc, kanvas);
        if (bindirme) gorselsizTipografi++;
      }
      await renderScene({
        st, kanvas, arkaplan: sahnePlanlari[i].arkaplan, katmanlar: sahnePlanlari[i].katmanlar,
        frames: renderKare, outFile, killer, crf: kesmeCrf, bindirme, profile,
      });
      clipsDone++;
      if (clipsDone % 4 === 0 || clipsDone === beats.length) {
        logFn(`Sahneler: ${clipsDone}/${beats.length}`);
        onProgress(58 + (clipsDone / beats.length) * (gecisVar ? 11 : 15));
      }
      return outFile;
    }

    let overlay = "";
    let punch = false;
    if (b.isVideoStart) overlay = introOverlay(script.title, accent, loc, kanvas);
    else if (b.firstOfSection && script.sections.length >= 2) overlay = chapterOverlay(b.sectionIndex + 1, b.sectionTitle, accent, loc, kanvas);
    else if (style.graphics && b.emphasis && b.emphasis.type !== "none") {
      overlay = emphasisOverlay(b.emphasis, b.dur, accent, loc, kanvas);
      punch = !!overlay;
    }
    // NOT: bindirme zamanları kesmenin KENDİ saatine göre yazılıyor; taşma payı
    // (onPay[i]) kadar erken başlarlar. Bu bilinçli olarak sorun değil:
    //  - ilk kesmede ve vurgu kesmelerinde giren geçiş 0'dır → pay yok,
    //  - bölüm kartı ise geçiş biterken belirir, kurgu olarak zaten istenen şey.
    const args = {
      st, kanvas, index: b.segIndex * 3 + b.beatIndex, media: b.media, dur: renderSure, frames: renderKare,
      // Bölüm başındaki fade artık gereksiz — geçişin kendisi o işi yapıyor.
      fadeIn: b.isVideoStart || (b.firstOfSection && !gecisVar),
      fadeOut: b.isVideoEnd,
      outFile, cardText: b.query, overlay, punch, killer, crf: kesmeCrf,
      // Yedek kart tipografiyi bunlarla kuruyor (siyah ekran yerine tasarım).
      accent, loc, profile,
      gradeF: b.media?.file ? gradeMap[b.media.file] : null,
    };
    try {
      await renderBeatClip(args);
    } catch (e) {
      if (killer.cancelled) throw e;
      // Tek bir bozuk medya tüm videoyu düşürmesin — o kesmeyi kartla üret.
      //
      // SEBEBİ DE YAZ. Eskiden yalnızca "kullanılamadı" deniyordu ve ffmpeg'in
      // gerçek hatası yutuluyordu; 63 kesmenin 4'ü karta düştüğünde neden
      // olduğu hiçbir yerde görünmüyordu (dosyalar render sonrası siliniyor,
      // sonradan da bakılamıyor). Kaynak ve hata satırı olmadan bu sınıf hata
      // hiç teşhis edilemez.
      const kaynak = b.media?.file ? path.basename(b.media.file) : "(medya yok)";
      qualityWarnings.push(`Sahne ${b.id}: ${kaynak} açılamadı; yedek kart kullanıldı. Editörde görseli değiştirip yeniden render edin.`);
      logFn(`Kesme ${b.id} medyası kullanılamadı (${b.media?.provider || "?"} · ${kaynak}) — ` +
        `sebep: ${String(e.message).replace(/\s+/g, " ").slice(0, 160)} — yedek kart üretiliyor.`);
      await renderBeatClip({ ...args, media: null, punch: false });
    }
    clipsDone++;
    if (clipsDone % 6 === 0 || clipsDone === beats.length) {
      logFn(`Kesmeler: ${clipsDone}/${beats.length}`);
      // Geçiş açıkken 69'da bitip geçiş aşamasına devrediyor (69→75); kapalıyken
      // geçiş aşaması yok, doğrudan 73'e kadar gidiyor. Çubuk geri sıçramasın.
      onProgress(55 + (clipsDone / beats.length) * (gecisVar ? 14 : 18));
    }
    return outFile;
  };

  const clipResults = await mapLimit(beats, st.concurrency, klipUret);

  // TEK BİR KESME ÇÖKMESİ 1,5 SAATLİK İŞİ ÖLDÜRMESİN.
  //
  // Ölçülen kusur (20260812-798d89, 12 dakikalık iş): 84 kesmenin 72'si
  // bittikten sonra bir ffmpeg 0xC0000005 (erişim ihlali) ile çöktü ve
  // `if (failedClip) throw` bütün işi düşürdü — 81 dakika ve araştırma,
  // senaryo, 4109 aday, 105 medya, seslendirme, hepsi çöpe.
  //
  // Bu kusur geçiş aşamasında ZATEN düzeltilmişti (bkz. transitions.js
  // parcaUret); aynı korumanın kesme aşamasında da olması gerekiyordu.
  //
  // İki kademe: önce paralel yük olmadan tek başına tekrar; o da olmazsa
  // yedek kart. Kart, o sahnenin görselsiz kalması demek — videoyu tamamen
  // kaybetmekten kıyaslanamaz derecede iyi.
  const bozuk = [];
  clipResults.forEach((r, k) => { if (!r.ok) bozuk.push(k); });
  for (const k of bozuk) {
    if (killer.cancelled) throw clipResults[k].error;
    const b = beats[k];
    logFn(`Kesme ${k + 1}/${beats.length} düştü (${String(clipResults[k].error?.message || "").replace(/\s+/g, " ").slice(0, 70)}) — ` +
      `paralel yük olmadan tekrar deneniyor...`);
    try {
      clipResults[k] = { ok: true, value: await klipUret(b, k) };
      continue;
    } catch (e) {
      logFn(`Kesme ${k + 1} yeniden de düştü — yedek kart üretiliyor.`);
      qualityWarnings.push(`Sahne ${b.id}: iki render denemesi başarısız; yedek kart kullanıldı. Kaynağı editörde kontrol edin.`);
    }
    // Son çare: medyasız kart. Süre/kare hesabı korunur ki kurgu kaymasın.
    shotKeys[k] = null;   // yedek kart önbellekteki planın yerine geçmesin
    const outFile = path.join(renderDir, `${b.id}.mp4`);
    await renderBeatClip({
      st, kanvas, index: k, media: null, dur: uzunluk[k], frames: layout.L[k],
      fadeIn: false, fadeOut: false, outFile, cardText: b.query || b.overlayText || "",
      overlay: "", punch: false, killer, crf: st.crf, accent, loc,
    });
    clipResults[k] = { ok: true, value: outFile };
  }
  // Görselsiz sahneler artık düz zemin değil tipografi. Kaç tane olduğu
  // kullanıcıya söylenir: sayı yüksekse konu arşivde gerçekten zayıf demektir.
  if (gorselsizTipografi) {
    logFn(`${gorselsizTipografi} sahnede arşiv görseli bulunamadı — düz zemin yerine tipografi kuruldu.`);
    qualityWarnings.push(`${gorselsizTipografi} sahnede kaynak görsel yerine tipografi kullanıldı; yayın öncesi sahneleri gözden geçirin.`);
  }
  const missingVisuals=beats.filter(b=>!b.media?.file);
  if(missingVisuals.length) qualityWarnings.push(`${missingVisuals.length} sahnede kaynak görsel yok (${missingVisuals.map(b=>b.id).join(', ')}); yedek kart veya tipografiyi editörde kontrol edin.`);

  // --- geçişler + video concat ---
  if (gecisVar) {
    const parcaDir = path.join(renderDir, "parca");
    const { listFile } = await buildPieces({
      st, clipFiles: beats.map((b) => path.join(renderDir, `${b.id}.mp4`)),
      plan, layout, outDir: parcaDir, killer, mapLimit, logFn,
      cache: shotCache, cacheKeys: shotKeys,
      onProgress: (n, toplam) => {
        if (n % 6 === 0 || n === toplam) {
          logFn(`Geçişler: ${n}/${toplam}`);
          onProgress(69 + (n / toplam) * 6);
        }
      },
    });
    await run(st.ffmpegPath, [
      "-f", "concat", "-safe", "0", "-i", path.basename(listFile), "-c", "copy", "-y",
      path.join("..", "silent.mp4"),
    ], { cwd: parcaDir, killer });
    // Ara kesmeler artık gereksiz — parçalar üretildi, disk hemen boşalsın
    for (const b of beats) { try { fs.rmSync(path.join(renderDir, `${b.id}.mp4`), { force: true }); } catch {} }
  } else {
    fs.writeFileSync(path.join(renderDir, "clips.txt"), beats.map((b) => `file '${b.id}.mp4'`).join("\n"), "utf8");
    await run(st.ffmpegPath, ["-f", "concat", "-safe", "0", "-i", "clips.txt", "-c", "copy", "-y", "silent.mp4"], { cwd: renderDir, killer });
  }
  onProgress(75);
  if (shotCache) {
    const removed = shotCache.prune();
    logFn(`Akıllı render: ${shotCache.hits} parça önbellekten geldi, ${shotCache.misses} parça yeniden kodlandı${removed ? `, ${removed} eski kayıt temizlendi` : ''}.`);
  }

  // --- ses: pad + concat + müzik + loudnorm ---
  logFn("Ses miksajı yapılıyor...");
  await mapLimit(flat, st.concurrency, async (f) => {
    if (killer.cancelled) throw new Error("cancelled");
    const wav = path.join(renderDir, `${f.segId}.wav`);
    await run(st.ffmpegPath, ["-i", f.audio, "-af", "apad", "-t", f.dur.toFixed(3), // Ara WAV MONO: seslendirme zaten tek kanal, stereo yazmak diski iki katına
      // çıkarıyordu (ölçüldü 85 MB → 43 MB). Miksajda stereoya açılıyor.
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", "-y", wav], { killer });
  });
  const alist = path.join(renderDir, "audio.txt");
  fs.writeFileSync(alist, flat.map((f) => `file '${f.segId}.wav'`).join("\n"), "utf8");
  const narration = path.join(renderDir, "narration.wav");
  await run(st.ffmpegPath, ["-f", "concat", "-safe", "0", "-i", "audio.txt", "-c", "copy", "-y", "narration.wav"], { cwd: renderDir, killer });

  const muzikBloklari = Number(st.musicVolume) > 0 ? muzikPlani(job, bolumSureleri(flat), muzikDosyalari()) : [];
  let editorialOffset=0;
  const editorialEvents=editorialPlans.flatMap((p,i)=>{
    const events=p.events.map(e=>({...e,start:+(editorialOffset+e.start).toFixed(3)}));
    editorialOffset+=beats[i].dur;return events;
  });
  const soundPlan = planSoundDesign(beats,{...st,profile,...(editorialMod?{editorialEvents}:{})});
  soundPlan.music={enabled:muzikBloklari.length>0,volume:st.musicVolume,blocks:muzikBloklari,policy:profile.music};
  soundPlan.narration={duck:DUCK,targetLufs:-14,targetTruePeakDb:-1.5};
  const finalAudio = path.join(renderDir, "audio.m4a");
  // Seviye HER İKİ yolda da iki geçişle ayarlanıyor (bkz. loudness.js):
  // tek geçiş hedefi 1,5-2 dB altında bırakıyordu ve YouTube kısık sesi
  // yükseltmediği için bu fark doğrudan izleyiciye gidiyordu.
  let kullanilanMuzik = [];
  let girdiler, zincir;
  if (muzikBloklari.length) {
    const ozet = muzikBloklari.map((b) => `${b.dosya} ${Math.round(b.sure)}sn`).join(" → ");
    logFn(`Fon müziği (${muzikBloklari.length} bölüm): ${ozet}`);
    // Künye için: hangi parçalar GERÇEKTEN kullanıldı (bkz. kunye.js).
    kullanilanMuzik = [...new Set(muzikBloklari.map((b) => b.dosya))];
    kullanilanMuzik = kullanilanMuzik.map(file => muzikBloklari.find(b => b.dosya === file)?.provenance || file);
    // Müziğe GİRİŞ/ÇIKIŞ fade'i şart: eskiden videonun ilk karesinde patlıyor,
    // son karesinde kesiliyordu. Bloklar arasındaki geçiş acrossfade ile.
    // Kullanıcı klasöre dışarıdan parça atabiliyor ve o parçalar kurulum
    // yataklarından 12-16 dB gürültülü olabiliyor. Her parça bir kez ölçülüp
    // aynı güce çekiliyor (ölçüm önbellekte, sonraki videolarda tekrar yok).
    const yollar = muzikBloklari.map((b) => path.join(MUSIC_DIR, b.dosya));
    const kazanclar = await kazanclariHesapla(st.ffmpegPath, yollar, { logFn, killer });
    const mz = muzikZinciri(
      muzikBloklari.map((b) => {
        const dosya = path.join(MUSIC_DIR, b.dosya);
        return { ...b, dosya, kazanc: kazanclar[dosya] || 0 };
      }),
      { narration, musicVolume: st.musicVolume, toplamSure: totalDur, profile, sectionDurations:bolumSureleri(flat) }
    );
    girdiler = mz.girdiler;
    // Anlatım AÇIKÇA stereoya çevriliyor. Eskiden mono [0:a] doğrudan amix'e
    // giriyordu ve ffmpeg dönüşümü kendisi araya sokuyordu; ölçüldü: bitmiş
    // dosya -15,0 LUFS (hedef -14). Açık dönüşümle -13,7'ye çıkıyor, iki
    // geçişli loudnorm ile tam -14,0'a oturuyor.
    // asplit şart: bir filtre ÇIKIŞ etiketi iki yerde kullanılamaz (giriş
    // etiketi kullanılabiliyordu, hata bu yüzden yıllarca görünmedi).
    zincir =
      `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[ses][yan];` +
      `${mz.muzikZinciri};` +
      `[mus][yan]sidechaincompress=${DUCK}[duck];` +
      `[ses][duck]amix=inputs=2:duration=first:normalize=0`;
  } else {
    const reason = Number(st.musicVolume) === 0 ? 'Fon müziği kullanıcı ayarıyla kapalı.' : 'Gerçek fon müziği bulunamadı; music/ klasörüne kullanım izniniz olan bir parça ekleyin. Yer tutucu uğultular kullanılmadı.';
    logFn(reason);
    if(Number(st.musicVolume)>0) qualityWarnings.push(reason);
    girdiler = ["-i", narration];
    zincir = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo`;
  }
  if(soundPlan.cues.length) {
    const stem=writeSoundStem(soundPlan,path.join(renderDir,'sfx.wav'));
    const mix=appendSoundMix(girdiler,zincir,stem);
    girdiler=mix.inputs;zincir=mix.chain;
    logFn(`Ses tasarımı: ${soundPlan.cues.length} seyrek bölüm/veri işareti.`);
  }
  soundPlan.preNormalization = await normalizeEt(st.ffmpegPath, girdiler, zincir, finalAudio, { killer, logFn });
  try {
    const encoded=await measureSound(st.ffmpegPath,finalAudio,{killer});
    const bounded=await kodlanmisTepeyiSinirla(st.ffmpegPath,finalAudio,{measured:encoded,measureFn:measureSound,killer,logFn});
    soundPlan.measured=bounded.measured;
    soundPlan.encodedPeakCorrection=bounded.correction;
    if(bounded.warning) qualityWarnings.push(bounded.warning);
  } catch(e) { if(killer.cancelled) throw e; qualityWarnings.push(`Ses kalite ölçümü tamamlanamadı: ${e.message}`); }
  soundPlan.warnings=[...new Set([...(soundPlan.warnings||[]),...qualityWarnings])];
  fs.writeFileSync(path.join(jobDir,'sound-plan.json'),JSON.stringify(soundPlan,null,2));
  onProgress(78);

  // --- final: altyazı yak + ses ekle ---
  //
  // ALTYAZI KAPALIYSA GÖRÜNTÜ YENİDEN KODLANMAZ. Kliplerin hepsi zaten hedef
  // ayarlarla kodlandı; final turda tekrar geçmek hem 36,7 saniye harcıyor hem
  // de ikinci nesil kayıp bindiriyordu (ölçüldü: -c:v copy ile 0,3 sn ve dosya
  // 1,2 MB daha küçük). Altyazı yakmak gerekiyorsa mecburen yeniden kodlanır.
  const altyaziYak = job.subtitleMode !== "none";
  logFn(altyaziYak ? "Final video birleştiriliyor (altyazı yakılıyor)..." : "Final video birleştiriliyor...");
  const outFile = path.join(jobDir, "output.mp4");
  const finalArgs = ["-i", path.join("render", "silent.mp4"), "-i", path.join("render", "audio.m4a")];
  if (altyaziYak) finalArgs.push("-vf", "ass=subs.ass");
  finalArgs.push("-map", "0:v", "-map", "1:a");
  if (altyaziYak) {
    finalArgs.push(
      "-c:v", "libx264", "-preset", st.preset, "-crf", String(st.crf),
      // Final birleştirme TEK süreç — paralel kodlamalardan farklı olarak
      // burada bütün çekirdekler kullanılabilir. Yine de AÇIKÇA yazılıyor:
      // "varsayılana bırak" alışkanlığı bu boru hattında iki kez iş öldürdü.
      "-threads", encThreads({ concurrency: 1 }),
      "-pix_fmt", "yuv420p",
      // Sabit GOP: YouTube'un yeniden kodlaması sahne kesmelerinde bozulmasın
      "-g", String(st.fps * 2), "-keyint_min", String(st.fps * 2), "-sc_threshold", "0",
      // Renk uzayı etiketleri — yoksa oynatıcılar tahmin ediyor ve renk kayıyor
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    );
  } else {
    finalArgs.push("-c:v", "copy");
  }
  // DOSYA KENDİNİ TANITSIN.
  //
  // ÖLÇÜLEN KUSUR (20260817-b05a7a): MP4'te hiç metadata yoktu — ffprobe
  // yalnızca major_brand/encoder gösteriyordu, title/date/language hepsi boş
  // ve iki akışın dili de "und". Dosya adı da sabit "output.mp4". Yükleme
  // ekranında video "output" adıyla geliyor; yükleyen kişi seo.md'yi elle
  // yapıştırmayı unutursa başlıksız yayına gidiyor.
  const baslik = String(script?.title || job?.topic || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const dil = job?.language === "en" ? "eng" : "tur";
  if (baslik) finalArgs.push("-metadata", `title=${baslik}`);
  finalArgs.push(
    "-metadata:s:v:0", `language=${dil}`,
    "-metadata:s:a:0", `language=${dil}`,
    // Both streams are already bounded to the planned duration. -shortest with
    // stream-copy H264 dropped reordered tail packets (4 frames in 31.26 s).
    "-c:a", "copy", "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats", "-y", "output.mp4"
  );
  await run(st.ffmpegPath, finalArgs, {
    cwd: jobDir, killer,
    onLine: (line) => {
      const m = line.match(/out_time_us=(\d+)/) || line.match(/out_time_ms=(\d+)/);
      if (m) {
        const sec = parseInt(m[1]) / 1e6;
        onProgress(78 + Math.min(1, sec / totalDur) * 13);
      }
    },
  });

  const directorOutput=job.mediaKind==='director'?await verifyDirectorOutput(outFile,{st,expectedDuration:totalDur,killer,logFn}):null;
  let directorShotReview=null;
  if(job.mediaKind==='director'){
    try{
      const reviewPlan=JSON.parse(fs.readFileSync(path.join(jobDir,'edit-plan.json'),'utf8'));
      const reviewText=(i)=>flat[beats[i]?.segIndex]?.text||'';
      const reviewKeys=beats.map((b,i)=>reviewCacheKey({shotKey:shotKeys?.[i],transitionIn:i?plan[i-1]:null,transitionOut:plan[i]||null,narration:reviewText(i),spokenMoment:b.media?.editorial?.anchorQuote||'',policyVersion:DIRECTOR_POLICY_VERSION,reviewVersion:DIRECTOR_SHOT_REVIEW_VERSION}));
      directorShotReview=await buildDirectorShotReview(outFile,{st,editPlan:reviewPlan,script,media:renderedShotMedia(beats),dir:jobDir,usage:job.usage,logFn,killer,reviewKeys,cacheFile:path.join(job.recoveryDir||jobDir,'shot-review-cache.json')});
      if(!directorShotReview.passed)qualityWarnings.push(`${directorShotReview.warnings.length} final kesme görsel denetiminde işaretlendi. Kalite kontrolü ekranında kareleri ve anlatımı inceleyin.`);
    }catch(e){
      if(killer?.cancelled)throw e;
      const reason=`Final kesme denetimi tamamlanamadı: ${String(e.message).slice(0,140)}. Yayın öncesi görsel kontrol gerekli.`;
      directorShotReview=failedDirectorShotReview(jobDir,reason);
      qualityWarnings.push(reason);
      logFn(qualityWarnings.at(-1));
    }
  }

  // --- kapak tasarımları (3 varyant) ---
  let thumbs = [];
  try {
    // KAPAK GÖRSELİ SEÇİMİ.
    //
    // Eski hâli listedeki İLK fotoğrafı alıyordu ve üç varyant da aynı görseli
    // kullanıyordu. İki sorun: (a) ilk kesmeler kancanın karşılaştırma çekimi
    // oluyor (Everest, kol saati gibi konu dışı görseller — 9 işin 5'inde kapak
    // alakasızdı), (b) üç varyantın aynı görseli taşıması A/B denemesini anlamsız
    // kılıyor. Artık ilk %20 elenip farklı kesmelerden üç ayrı görsel veriliyor.
    // KAPAĞA GİRECEK GÖRSELLER — alakaya göre, sıraya göre değil.
    //
    // İki kusur ölçüldü (20260809-c03c63): havuz videonun İLK %20'sini
    // dışlıyordu — oysa konunun kişisinin portresi tam orada duruyor — ve
    // seçim yalnızca eşit aralıklı tarama yapıp alakaya hiç bakmıyordu.
    // Sonuç: üç kapağın birinde uzaydan dünya, birinde 1925 tarihli bir
    // İngiliz okul sınıfı fotoğrafı vardı. YouTube'da tıklanmayı en çok
    // kapak belirlerken bu doğrudan izlenme kaybı.
    //
    // Artık açılış dışlanmıyor ve sıralama denetim puanına göre yapılıyor:
    // tam isabet (3) olanlar önce, sonra kadraj kalitesi.
    const havuz = beats
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.media?.file && (b.media.type === "image" || isCollage));
    const puanli = rankThumbnailCandidates(havuz, job);
    const gorseller = [];
    const gorulen = new Set();
    for (const { b } of puanli) {
      if (gorseller.length >= 3) break;
      const f = b.media.file;
      if (f && !gorulen.has(f)) { gorulen.add(f); gorseller.push(f); }
    }
    // Denetim puanı hiç yoksa (denetim kapalı) eski eşit aralıklı tarama.
    if (!gorseller.length) {
      for (let k = 0; k < havuz.length && gorseller.length < 3; k++) {
        const idx = Math.floor((k * havuz.length) / 3) % havuz.length;
        const f = havuz[idx]?.b.media.file;
        if (f && !gorulen.has(f)) { gorulen.add(f); gorseller.push(f); }
      }
    }
    // Havuz boşsa (hepsi video/kart) eski davranışa dön
    if (!gorseller.length) {
      const y = beats.find((b) => b.media?.file)?.media.file;
      if (y) gorseller.push(y);
    }
    thumbs = await makeThumbnails({
      job, title: script.title,
      imageFile: gorseller[0] || null,
      imageFiles: gorseller,
      jobDir, st, killer, logFn,
    });
  } catch (e) {
    logFn(`Kapak üretimi atlandı: ${e.message}`);
    qualityWarnings.push(`Kapak üretilemedi: ${e.message}. Yayından önce kapak oluşturun.`);
  }
  if(thumbs.length<3 && !qualityWarnings.some(w=>w.startsWith('Kapak üretilemedi'))) qualityWarnings.push(`${thumbs.length}/3 kapak üretildi; eksik kapakları yayın öncesi tamamlayın.`);
  soundPlan.warnings=[...new Set([...(soundPlan.warnings||[]),...qualityWarnings])];
  fs.writeFileSync(path.join(jobDir,'sound-plan.json'),JSON.stringify(soundPlan,null,2));
  return { durationSec: totalDur, sectionTimes, thumbs, muzikler: kullanilanMuzik, qualityWarnings, quality: {profile:profile.id,audio:soundPlan.measured || null,visuals:visualQuality,directorOutput,directorShotReview:directorShotReview?{passed:directorShotReview.passed,total:directorShotReview.scenes.length,flagged:directorShotReview.warnings.length}:null,warnings:qualityWarnings}, reviewArtifacts:['edit-plan.json','visual-quality.json','sound-plan.json',...(directorOutput?['director-output-check.json']:[]),...(directorShotReview?['director-shot-review.json']:[])] };
}
