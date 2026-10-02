// KATMAN MOTORU — bir sahneyi çok katmanlı hareketli kompozit olarak üretir.
//
// Neden gerekli: eski hatta "bir sahne = bir görüntü" idi (tek kaynak + üstüne
// drawtext/drawbox). Referans videolardaki editorial motion collage dilinde ise
// bir sahnede 4-6 ayrı öğe var ve her biri KENDİ zamanında, kendi yörüngesinde
// hareket ediyor. Kodda hiç `overlay=` kullanımı yoktu; bu modül onu getiriyor.
//
// ffmpeg ile neyin mümkün olduğu ölçülerek doğrulandı:
//   · alfa kanalında zaman bağımlı opaklık  → fade=t=in:alpha=1
//   · konum animasyonu                      → overlay=x='<t ifadesi>':eval=frame
//   · ölçek animasyonu                      → scale=w='<t ifadesi>':eval=frame
//   · yumuşatma eğrileri                    → pow()/clip() ifade fonksiyonları
//
// Katman modeli sade tutuldu: konum + opaklık + ölçek. Döndürme ve maske yok —
// bu üçü referans dildeki hareketin büyük kısmını zaten karşılıyor.

import fs from "node:fs";
import path from "node:path";
import { run } from "../util.js";
import { videoEnc } from "../config.js";
import { ftext, displayFont, boldFont } from "./graphics.js";

/** 3 haneye yuvarla — ffmpeg ifadelerinde uzun ondalık okunaksız. */
const s3 = (n) => (Math.round(n * 1000) / 1000).toString();

/**
 * Yumuşatılmış ilerleme (ease-out cubic): t0'da 0, t0+d'de 1, sonrası 1.
 * Öğeler sabit hızla değil, yavaşlayarak yerine oturur — "settle" hissi bu.
 */
const easeOut = (t0, d) => `(1-pow(1-clip((t-${s3(t0)})/${s3(Math.max(0.001, d))},0,1),3))`;

/** Geri sayan ilerleme: çıkışta kullanılır (t0'da 0, artarak 1). */
const easeIn = (t0, d) => `pow(clip((t-${s3(t0)})/${s3(Math.max(0.001, d))},0,1),2)`;

/**
 * Giriş yönleri. dx/dy kanvas oranı cinsinden başlangıç kayması,
 * o0 başlangıç ölçeği (1 = ölçek animasyonu yok).
 */
export const GIRISLER = {
  yok: { dx: 0, dy: 0, o0: 1 },
  soldan: { dx: -0.34, dy: 0, o0: 1 },
  sagdan: { dx: 0.34, dy: 0, o0: 1 },
  asagidan: { dx: 0, dy: 0.18, o0: 1 },
  yukaridan: { dx: 0, dy: -0.18, o0: 1 },
  buyu: { dx: 0, dy: 0, o0: 0.72 },
  kucul: { dx: 0, dy: 0, o0: 1.28 },
  otur: { dx: 0, dy: 0.06, o0: 0.92 },   // hafif — referans videodaki "yerine otur"
};

export const CIKISLAR = {
  yok: { dx: 0, dy: 0 },
  sola: { dx: -0.3, dy: 0 },
  saga: { dx: 0.3, dy: 0 },
  yukari: { dx: 0, dy: -0.2 },
};

/**
 * Tek bir görsel katmanın filtre zincirini ve overlay ifadesini üretir.
 *
 * @param L      katman tanımı
 * @param K      kanvas
 * @param idx    ffmpeg girdi indeksi
 */
function gorselKatman(L, K, idx) {
  const g = GIRISLER[L.giris] || GIRISLER.otur;
  const c = CIKISLAR[L.cikis] || CIKISLAR.yok;
  const bas = L.bas ?? 0;
  const sure = L.sure ?? 2;
  const gS = L.girisSure ?? 0.55;
  const cS = L.cikisSure ?? 0.4;
  const son = bas + sure;

  // Hedef genişlik KISA KENARA oranlanır, genişliğe değil. Genişliğe bağlanınca
  // aynı sahne tanımı 9:16'da doğru, 16:9'da kadraja sığmıyordu; kısa kenar
  // referansı sayesinde tek tanım iki oranda da aynı görünüyor.
  // `tamEn: true` diyen katman (arka plan şeridi gibi) genişliğe oranlanır.
  const taban = L.tamEn ? K.w : Math.min(K.w, K.h);
  const hedefW = Math.max(2, Math.round((L.en ?? 0.4) * taban / 2) * 2);
  const eG = easeOut(bas, gS);          // giriş ilerlemesi
  const eC = easeIn(son, cS);           // çıkış ilerlemesi

  // --- TAM EKRAN DEVRALMA ---
  //
  // Köşedeki öğe vuruş anında bir anlığına ekranı kaplar, sonra yerine döner.
  // Kurgunun en güçlü hamlelerinden biri: izleyicinin gözü zaten köşeye
  // takılmışken o görüntü öne çıkıp geri çekiliyor. Sürekli köşede duran
  // küçük kutunun dekora dönüşme sorununun panzehiri.
  //
  // Tek bir ilerleme değişkeni (dp) hem ölçeği hem konumu sürüyor: 0 = köşe
  // hâli, 1 = tam ekran. Böylece büyürken merkeze kayıyor, küçülürken geri
  // dönüyor — iki animasyon ayrı yazılırsa senkron kayıyor.
  const dev = L.devral;
  const devralW = Math.round(K.w * 0.92 / 2) * 2;   // tam kaplamıyor, kenarda pay kalıyor
  let dp = null;
  if (dev && Number.isFinite(dev.bas)) {
    const dIn = dev.girisSure ?? 0.45, dTut = dev.sure ?? 1.1, dOut = dev.cikisSure ?? 0.45;
    const d0 = dev.bas;
    dp = `clip(min((t-${s3(d0)})/${s3(dIn)},(${s3(d0 + dIn + dTut + dOut)}-t)/${s3(dOut)}),0,1)`;
  }

  // --- ölçek ---
  const olcekli = g.o0 !== 1;
  const temelW = olcekli
    ? `${hedefW}*(${s3(g.o0)}+${s3(1 - g.o0)}*${eG})`
    : String(hedefW);
  const wIfade = dp ? `(${temelW})+${devralW - hedefW}*(${dp})` : temelW;
  const olcekF = (olcekli || dp)
    ? `scale=w='${wIfade}':h=-2:eval=frame`
    : `scale=${hedefW}:-2`;

  // --- opaklık ---
  // fade alpha=1 girdi akışında alfa ister; format=rgba onu garanti eder.
  const fadeF = `format=rgba,fade=t=in:st=${s3(bas)}:d=${s3(gS * 0.8)}:alpha=1` +
    `,fade=t=out:st=${s3(son)}:d=${s3(cS)}:alpha=1`;

  // --- konum ---
  // Merkez hedefi piksel cinsinden; overlay'de w/h katmanın anlık ölçüsü olduğu
  // için ölçek animasyonuyla birlikte doğru merkezlenir.
  const cx = Math.round((L.x ?? 0.5) * K.w);
  const cy = Math.round((L.y ?? 0.5) * K.h);
  const dxPx = Math.round(g.dx * K.w), dyPx = Math.round(g.dy * K.h);
  const cxPx = Math.round(c.dx * K.w), cyPx = Math.round(c.dy * K.h);

  // Devralma sırasında merkez, köşe konumundan kadraj merkezine kayar. Aynı dp
  // ilerlemesi kullanılıyor ki büyüme ile kayma birbirine kilitli kalsın.
  const merkezX = dp ? `(${cx}+${Math.round(K.w / 2 - cx)}*(${dp}))` : String(cx);
  const merkezY = dp ? `(${cy}+${Math.round(K.h / 2 - cy)}*(${dp}))` : String(cy);

  const xIf = `${merkezX}-w/2` +
    (dxPx ? `+${dxPx}*(1-${eG})` : "") +
    (cxPx ? `+${cxPx}*${eC}` : "");
  const yIf = `${merkezY}-h/2` +
    (dyPx ? `+${dyPx}*(1-${eG})` : "") +
    (cyPx ? `+${cyPx}*${eC}` : "");

  return {
    // katmanın kendi hazırlığı → [kN]
    hazirla: `[${idx}:v]${fadeF},${olcekF},setsar=1[k${idx}]`,
    // zincire eklenecek overlay gövdesi (etiketler çağıran tarafından konur)
    govde: `overlay=x='${xIf}':y='${yIf}':eval=frame` +
      `:enable='between(t,${s3(bas)},${s3(son + cS)})'`,
    etiket: `k${idx}`,
  };
}

/**
 * Öbek SONUNDA durmaması gereken kelimeler.
 *
 * Sadece kelime sayısına göre bölünce ekranda "değil sadece Ve" gibi yarım
 * kalmış parçalar çıkıyordu (gerçek videoda görüldü). Bağlaç ve edatlar bir
 * sonraki öbeğe aittir; onlarla bitmek cümleyi ortasından kesiyor.
 */
// DİKKAT: eşleştirme ASCII'ye KATLANMAZ. "şu" → "su" katlaması su (H₂O)
// kelimesini bağlaç sanıyordu ve "yük biner ve su" öbeği hatalı işaretleniyordu.
// Senaryo metni düzgün Türkçe yazıldığı için küçük harfe indirmek yeterli.
const BAGLAC = new Set([
  "ve", "ile", "ama", "fakat", "çünkü", "ancak", "yani", "ya", "veya", "ki",
  "de", "da", "ise", "hem", "gibi", "için", "kadar", "göre", "diye",
  "bir", "bu", "şu", "her", "en", "daha", "çok", "sadece",
]);

/** Kelime noktalama ile bitiyorsa doğal duraktır. */
const DURAK = /[.,;:!?…]$/;

/**
 * Kelimeleri okunabilir öbeklere böler.
 *
 * Önce kapasiteye (kelime sayısı + karakter bütçesi) göre bir aday pencere
 * kurulur, sonra o pencerenin içinde EN İYİ kesme noktası aranır:
 *   1. noktalama ile biten kelime  (en iyi — cümle zaten orada duruyor)
 *   2. bağlaçtan hemen önce        (bağlaç sonraki öbeği açar)
 *   3. kapasite sınırı             (çare yoksa)
 * Kesme noktası pencerenin son %45'inde aranır; daha geriye gidilirse öbekler
 * gereksiz kısalıp yazı zıplıyor.
 */
export function obekle(kelimeler, maxKelime, maxKarakter) {
  const out = [];
  let i = 0;
  while (i < kelimeler.length) {
    // 1) kapasiteye göre en fazla nereye kadar gidebiliriz
    let son = i, uzunluk = 0;
    while (son < kelimeler.length) {
      const ek = (uzunluk ? 1 : 0) + String(kelimeler[son].s).length;
      if (son > i && (son - i >= maxKelime || uzunluk + ek > maxKarakter)) break;
      uzunluk += ek; son++;
    }
    if (son >= kelimeler.length) { out.push(kelimeler.slice(i)); break; }

    // 2) daha iyi bir kesme noktası ara.
    // En az `enAzKelime` kelimelik öbek kalmalı — aksi hâlde her virgülde
    // bir-iki kelimelik parçalar çıkıp yazı zıplıyor. Pencere buna göre açılır;
    // önceki dar pencere (%55) cümle başındaki virgülleri tamamen kaçırıyordu.
    const enAzKelime = Math.max(2, Math.ceil(maxKelime * 0.45));
    const enErkenJ = i + enAzKelime - 1;   // j = kesmeden ÖNCEKİ son kelime
    let secilen = son;
    for (let j = son - 1; j >= enErkenJ; j--) {
      if (DURAK.test(String(kelimeler[j].s))) { secilen = j + 1; break; }   // noktalamadan SONRA kes
    }
    if (secilen === son) {
      for (let j = son - 1; j >= enErkenJ; j--) {
        const sonraki = kelimeler[j + 1];
        if (sonraki && BAGLAC.has(kucult(sonraki.s))) { secilen = j + 1; break; } // bağlaçtan ÖNCE kes
      }
    }
    // 3) hâlâ bağlaçla bitiyorsa bir kelime geri çekil
    while (secilen > i + 1 && BAGLAC.has(kucult(kelimeler[secilen - 1].s))) secilen--;

    out.push(kelimeler.slice(i, secilen));
    i = secilen;
  }
  return out.filter((o) => o.length);
}

/** Küçük harfe indir + noktalamayı at. ASCII katlaması YAPILMAZ (bkz. BAGLAC notu). */
function kucult(s) {
  return String(s || "").toLocaleLowerCase("tr").replace(/[.,;:!?…"“”'’()]/g, "");
}

/**
 * KİNETİK TİPOGRAFİ — kelimeler sırayla belirir.
 *
 * Kelime genişliğini TAHMİN ETMEK yerine, her adımda o ana kadarki metnin
 * TAMAMI tek bir drawtext olarak çizilir ve konumu ffmpeg'e bırakılır. Böylece
 * hizalama birebir doğru olur; sola dayalı olduğu için önceki kelimeler
 * yerinden oynamaz, izleyici kelimelerin tek tek eklendiğini görür.
 *
 * Vurgu kelimesi ayrı satırda, büyük ve renkli çıkar (referans videodaki
 * "he play with is / MIND" düzeni).
 */
function kinetikYazi(L, K) {
  const disp = displayFont(), bold = boldFont() || displayFont();
  if (!disp) return [];
  // Bozuk kelime zamanı (NaN, eksik, azalan sıra) ffmpeg ifadesine "NaN" olarak
  // sızıp tüm filtre zincirini bozuyordu. Burada temizlenir: sonlu olmayanlar
  // atılır, sıra monoton artan hâle getirilir.
  let onceki = -Infinity;
  const kelimeler = (L.kelimeler || [])
    .filter((k) => k && k.s && Number.isFinite(k.t0))
    .map((k) => {
      const t0 = k.t0 <= onceki ? onceki + 0.08 : k.t0;
      onceki = t0;
      return { ...k, t0: +t0.toFixed(3) };
    });
  // Gövde kelimesi olmadan SADECE VURGU gösterilebilmeli. Eskiden burada erken
  // dönülüyordu ve "deşifre yok, sadece sayı/isim" düzeni hiç kurulamıyordu.
  if (!kelimeler.length && !L.vurgu) return [];

  const parts = [];
  const S = (n) => Math.round(n * K.k);
  const x = Math.round((L.x ?? 0.08) * K.w);
  const yUst = Math.round((L.y ?? 0.62) * K.h);
  // Dikeyde satır başına daha az karakter sığdığı için gövde yazısı biraz büyük
  const boyUst = S(L.boy || (K.dikey ? 54 : 46));
  // Kelime listesi boş olabilir (yalnız-vurgu düzeni) — son kelimeye bakma
  const sonKelimeT0 = kelimeler.length ? kelimeler[kelimeler.length - 1].t0 : 0;
  const bitis = L.bitis ?? (sonKelimeT0 + 1.6);
  // Kolaj paleti açık zeminli — varsayılan yazı rengi KOYU olmalı, yoksa
  // krem üstüne krem yazıp görünmez oluyor. Koyu zeminde çağıran renk geçer.
  const govdeRenk = L.renk || "0x2A2A2E";
  // Okunabilirlik: zemin ne olursa olsun ince bir kontur metni ayırır.
  const kontur = L.kontur === false ? "" : `:borderw=${Math.max(1, S(2))}:bordercolor=${L.konturRenk || "0xF4EBDC"}@0.75`;

  // --- ÖBEKLEME ---
  // Belgesel cümleleri 15-20 kelime; tamamını biriktirince ekran 5-7 satır minik
  // yazıyla doluyor ve tipografi etkisini tamamen kaybediyor (ölçüldü: gerçek
  // videoda okunmaz duvar çıktı). Referans dilde ekranda AYNI ANDA 3-6 kelime var.
  //
  // Bu yüzden cümle öbeklere bölünür: her öbek kelime kelime kurulur, sonraki
  // öbek başlayınca ekranı tamamen devralır. Konuşmayla senkron korunur.
  const maxKelime = K.dikey ? 4 : 6;
  const kullanilir = K.w * 0.86 - x;
  const maxKarakter = Math.max(14, Math.floor(kullanilir / (boyUst * 0.5)));

  // Vurgu kelimesi gövdede TEKRAR ETMEZ — referans dilde büyük yazı gövdenin
  // DEVAMIdır ("he play with is" → "MIND"), kopyası değil. Aynı kelimeyi iki kez
  // basmak vuruşu zayıflatıyor.
  const sade = (s) => String(s || "").toLocaleLowerCase("tr").replace(/[.,!?;:"“”'’]/g, "");
  const govdeKelime = L.vurgu
    ? kelimeler.filter((k) => sade(k.s) !== sade(L.vurgu))
    : kelimeler;

  const obekler = obekle(govdeKelime, maxKelime, maxKarakter);

  // Opaklık ÖBEK seviyesinde hesaplanır, kelime seviyesinde DEĞİL.
  //
  // Eski hâlde her kelime durumu alpha'yı 0'dan rampa ediyordu; kelime eklendiği
  // an TÜM SATIR sönüp yanıyordu. Kare kare ölçüldü: mürekkep piksel sayısı her
  // kelimede 1-2 kare boyunca TAM SIFIRA iniyor (saniyede ~3 kez göz kırpma).
  //
  // Şimdi tek bir ifade: öbek başında yumuşak açılış, öbek sonunda yumuşak
  // kapanış, arada sabit 1. Kelime eklenmesi opaklığa hiç dokunmuyor — satır
  // sadece uzuyor, "daktilo" etkisi bozulmadan titreme gidiyor.
  const AC = 0.13;      // öbek açılışı
  const CIKIS = 0.16;   // öbek çıkışı — sonraki öbeğin üstüne BİNER
  const KALK = Math.round(boyUst * 0.5);  // çıkarken yukarı kayma (px)

  obekler.forEach((obek, oi) => {
    // Öbek, sonraki öbeğin ilk kelimesine kadar ekranda kalır
    const obekSonu = oi < obekler.length - 1 ? obekler[oi + 1][0].t0 : bitis;
    const obekBasi = obek[0].t0;
    const acilis = `clip((t-${s3(obekBasi)})/${AC},0,1)`;
    // "obek" modunda kelimeler tek tek EKLENMEZ; öbeğin tamamı bir anda belirir.
    // Uzun videoda kelime kelime akış bekleme hissi veriyordu.
    const tekAdim = L.obekBirlikte === true;
    const adimlar = tekAdim ? [obek[obek.length - 1]] : obek;
    let metin = tekAdim ? obek.map((w) => w.s).join(" ") : "";
    adimlar.forEach((k, i) => {
      if (!tekAdim) metin = metin ? `${metin} ${k.s}` : k.s;
      const t0 = tekAdim ? obekBasi : k.t0;
      const sonMu = i === adimlar.length - 1;
      const t1 = sonMu ? obekSonu : obek[obek.indexOf(k) + 1].t0;
      if (t1 <= t0) return;

      if (!sonMu) {
        // Öbek içi: opaklık sabit (sadece açılış rampası). Kelime eklenmesi
        // opaklığa DOKUNMAZ — eski hâlde her kelimede satır sıfıra iniyordu.
        parts.push(
          `drawtext=fontfile='${disp}':text='${ftext(metin, 90)}'` +
          `:fontcolor=${govdeRenk}:fontsize=${boyUst}${kontur}` +
          `:x=${x}:y=${yUst}:alpha='${acilis}'` +
          // between() iki ucta da kapsayıcı; üst sınır bir tık geri çekilerek
          // sınır karesinde iki durumun üst üste çizilmesi engellenir.
          `:enable='between(t,${s3(t0)},${s3(t1 - 0.001)})'`
        );
        return;
      }

      // Öbeğin SON durumu: sınırdan sonra da CIKIS kadar yaşar, sönerken yukarı
      // kayar. Böylece sonraki öbek açılırken ekran boş kalmaz (ölçüldü: tam
      // sınırda ikisi de 0 olduğu için öbek başına 1 kare tamamen boşalıyordu)
      // ve iki metin aynı yerde üst üste binmez — çıkan yukarı süzülür.
      const ilerleme = `clip((t-${s3(obekSonu)})/${CIKIS},0,1)`;
      parts.push(
        `drawtext=fontfile='${disp}':text='${ftext(metin, 90)}'` +
        `:fontcolor=${govdeRenk}:fontsize=${boyUst}${kontur}` +
        `:x=${x}:y='${yUst}-${KALK}*${ilerleme}'` +
        `:alpha='clip(min(${acilis},1-${ilerleme}),0,1)'` +
        `:enable='between(t,${s3(t0)},${s3(obekSonu + CIKIS)})'`
      );
    });
  });
  // --- TİPOGRAFİK AKSAN: gövdenin üstünde ince çizgi ---
  //
  // Önceden ekranda serbest yüzen düz bir kare vardı ve sağdan kayarak giriyordu;
  // fotoğraf üstünde çıpası olmadığı için "ekranı bir şey geçiyor" gibi duruyordu.
  // Aksan artık YAZIYA BAĞLI: gövdenin üstünde, ilk kelimeyle birlikte soldan
  // çizilen ince bir çizgi. Kompozisyonun parçası, gezici bir öğe değil.
  if (L.serit !== false) {
    // Şerit gövdeyle birlikte, gövde yoksa vurguyla birlikte çizilir
    const ilkT = kelimeler.length ? kelimeler[0].t0 : (Number.isFinite(L.vurguT0) ? L.vurguT0 : 0.2);
    const cizgiEn = Math.round(boyUst * 3.4);
    const kalinlik = Math.max(2, S(4));
    const yCizgi = yUst - Math.round(boyUst * 0.62);
    const ciz = `clip((t-${s3(ilkT)})/0.34,0,1)`;
    parts.push(
      `drawbox=x=${x}:y=${yCizgi}:w='${cizgiEn}*${ciz}':h=${kalinlik}` +
      `:color=${L.seritRenk || L.vurguRenk || "0xE02417"}@0.95:t=fill` +
      `:enable='between(t,${s3(ilkT)},${s3(bitis)})'`
    );
  }

  // --- vurgu kelimesi: gövdenin ALTINDA ayrı satır ---
  if (L.vurgu) {
    const ham = Number.isFinite(L.vurguT0) ? L.vurguT0 : sonKelimeT0 + 0.18;

    // VURGU ZAMANLAMASI — okunacak kadar durmalı.
    //
    // Ölçüldü (6,5 sn'lik gerçek sahne): vurgu, kelimenin SÖYLENDİĞİ anda
    // giriyordu. vurguSec ise sözü SON iki kelimeden seçiyor (dilbilgisi bozulmasın
    // diye). İkisi birleşince vurgu 3,9. saniyede giriyor ve ekranda 2,6 sn
    // kalıyordu; kelime metinde bulunamazsa 1,95 sn. Açılış/kapanış payı da
    // düşünce okunabilir süre ~2 saniyeye iniyordu — "çıkıp hemen kayboluyor"
    // şikâyetinin sebebi tam olarak buydu.
    //
    // İki düzeltme: (1) söz söylenmeden AZ ÖNCE gir — beklenti yaratır, kurgu
    // dilinde doğrudur; (2) en az bir taban süre ekranda kal, gerekirse girişi
    // daha da öne çek. Taban söz uzunluğuyla ölçeklenir: tek sayı hızlı okunur,
    // üç kelime daha uzun sürer.
    const ONCEDEN = 0.35;
    const sozKelime = String(L.vurgu || "").trim().split(/\s+/).filter(Boolean).length;
    const enAzGorunur = Math.min(bitis * 0.62, 2.2 + 0.3 * Math.max(0, sozKelime - 1));
    const vt0 = Math.max(0, Math.min(ham - ONCEDEN, bitis - enAzGorunur));
    // PUNTO UZUNLUĞA GÖRE KÜÇÜLÜR — yoksa uzun vurgu kadraj dışına taşıyor.
    // Ölçüldü (1920×1080, x=%5,5): 26 karaktere kadar temiz, 28 karakterde sağ
    // kenardan taşıyor. Sabit 132 punto yerine sığacak en büyük punto seçilir.
    // 0,52 = bold fontta ortalama karakter genişliği / punto oranı (ölçüldü).
    const vurguMetin = ftext(L.vurgu, 28);
    const kullanilirEn = K.w - x - Math.round(K.w * 0.05);   // sağda da güvenli pay
    const harfSayisi = Math.max(1, String(L.vurgu || "").slice(0, 28).length);
    const boyVurgu = Math.max(
      S(48),                                                  // okunmayacak kadar küçülmesin
      Math.min(S(L.vurguBoy || 132), Math.floor(kullanilirEn / (harfSayisi * 0.52)))
    );
    const e = easeOut(vt0, 0.34);
    // Gövde öbeklendiği için ekranda HER ZAMAN tek satır — vurgu tam altına oturur.
    // Gövde yoksa vurgu gövdenin yerine oturur; varsa altına iner.
    const yVurgu = kelimeler.length
      ? yUst + Math.round(boyUst * 1.22) + Math.round(boyUst * 0.15)
      : yUst;
    parts.push(
      `drawtext=fontfile='${bold}':text='${vurguMetin}'` +
      `:fontcolor=${L.vurguRenk || "0xE02417"}:fontsize=${boyVurgu}${kontur}` +
      `:x=${x}:y='${yVurgu}+${S(22)}*(1-${e})'` +
      // Gövdeyle aynı mantık: açılış + sahne sonunda kapanış. Sert kesme yok.
      // Açılış 0,16 → 0,26 sn: sert beliriş "flaş" gibi duruyordu, göz uyum
      // sağlamadan yazı zaten oradaydı. Kapanış ise sahne KESİLİRKEN sönüyordu
      // ve "kayboldu" hissi veriyordu; artık son 0,12 sn'ye sıkıştırılıyor,
      // yani vurgu kesmeye kadar TAM opaklıkta duruyor.
      `:alpha='clip(min((t-${s3(vt0)})/0.26,(${s3(bitis)}-t)/0.12),0,1)'` +
      `:enable='between(t,${s3(vt0)},${s3(bitis)})'`
    );
  }
  return parts;
}

/**
 * Yazı bloğunun kaplayacağı yükseklik (normalize) — yönetmen çakışma hesabında
 * kullanır. motion.js ile AYNI satır kırma mantığını kullanmak zorunda, yoksa
 * yönetmenin "boş" sandığı yere yazı taşar.
 */
export function yaziYuksekligi(kelimeler, K, { boy, vurgu } = {}) {
  const boyUst = Math.round((boy || (K.dikey ? 54 : 46)) * K.k);
  // Gövde öbeklere bölündüğü için EKRANDA HER ZAMAN TEK SATIR duruyor; cümle
  // uzunluğuna göre yükseklik hesaplamak (eski hâli) yönetmenin boş yere yer
  // ayırmasına ve öğeleri küçültmesine yol açıyordu.
  const satirYuk = Math.round(boyUst * 1.22);
  const vurguYuk = vurgu ? Math.round(132 * K.k * 1.15) + Math.round(boyUst * 0.15) : 0;
  return (satirYuk + vurguYuk) / K.h;
}

/**
 * Test kancası: üretilen drawtext dizisini render etmeden denetlemek için.
 * ffmpeg çalıştırmadan ifade doğruluğunu kilitleyen testler buna bakar
 * (bkz. test/tipografi.test.mjs).
 */
export function kinetikYaziDenetim(L, K) {
  return kinetikYazi(L, K);
}

/**
 * Sahneyi render eder.
 *
 * @param arkaplan  { tur:"gorsel"|"renk", src|renk }
 * @param katmanlar görsel ve yazı katmanları
 * @param frames    üretilecek kare sayısı (kesim noktaları tam kareye otursun)
 */
export async function renderScene({ st, kanvas: K, arkaplan, katmanlar = [], frames, outFile, killer, crf = st.crf, bindirme = "", profile = null }) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const fps = st.fps;
  const N = Math.max(2, frames);
  const gorseller = katmanlar.filter((L) => L.tur === "gorsel" && L.src);
  const yazilar = katmanlar.filter((L) => L.tur === "yazi");

  // KARARTMA PERDESİ. Tercih edilen yol önceden pişirilmiş gradyan PNG
  // (cutout.js/perdeGradyani): bant izi bırakmaz, kare başına tek overlay.
  // PNG yoksa basamaklı drawbox'a düşülür — ince bantlar görünür ama akış kırılmaz.
  const perdePng = arkaplan?.perde && arkaplan?.perdeSrc && fs.existsSync(arkaplan.perdeSrc)
    ? arkaplan.perdeSrc : null;

  // --- girdiler ---
  const inputs = [];
  const bgTur = arkaplan?.tur;
  if (bgTur === "video" && arkaplan.src) {
    inputs.push("-stream_loop", "-1", "-i", arkaplan.src);
  } else if (bgTur === "gorsel" && arkaplan.src) {
    inputs.push("-loop", "1", "-i", arkaplan.src);
  } else {
    inputs.push("-f", "lavfi", "-i", `${K.renk(arkaplan?.renk || "0xE8DCC8")}:r=${fps}`);
  }
  for (const L of gorseller) inputs.push("-loop", "1", "-i", L.src);
  // Perde PNG'si EN SON girdi — katman indekslerini kaydırmasın diye
  const perdeIdx = perdePng ? gorseller.length + 1 : -1;
  if (perdePng) inputs.push("-loop", "1", "-i", perdePng);

  // --- filtre grafiği ---
  const zincir = [];
  let bgF;
  if (bgTur === "video") {
    bgF = `${K.fit},fps=${fps}`;
  } else if (bgTur === "gorsel") {
    // Ken Burns: sabit arka plan cansız duruyor
    const {kameraFiltresi} = await import('./kamera.js');
    bgF = profile ? `${K.genis},${kameraFiltresi(arkaplan.kadraj || '',arkaplan.odak || '',0,N,fps,K,profile)}`
      : `${K.genis},zoompan=z='1.0+0.08*on/${N - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${N}${K.zp(fps)}`;
  } else {
    bgF = `scale=${K.w}:${K.h}`;
  }
  // Kaynağa özel derecelendirme (grade.js) — farklı sitelerden gelen görselleri
  // tek görsel dile oturtur. Yoksa sabit temel değere düşülür.
  const grade = arkaplan?.grade === false ? ""
    : `,${arkaplan?.gradeF || "eq=contrast=1.04:saturation=1.08"}`;

  let perde = "";
  if (arkaplan?.perde && !perdePng) {
    const b = Math.round(K.h * 0.46);
    const adim = 9, alfa = 0.095;
    const kutular = [];
    for (let i = 0; i < adim; i++) {
      const yuk = Math.round((b * (adim - i)) / adim);
      kutular.push(`drawbox=x=0:y=${K.h - yuk}:w=${K.w}:h=${yuk}:color=black@${alfa}:t=fill`);
    }
    perde = "," + kutular.join(",");
  }
  zincir.push(`[0:v]${bgF}${grade}${perde},setsar=1,format=rgba[bg]`);

  // Overlay zinciri: [onceki][kN]overlay=...[oN]
  let onceki = "bg";
  gorseller.forEach((L, i) => {
    const idx = i + 1;
    const { hazirla, govde, etiket } = gorselKatman(L, K, idx);
    zincir.push(hazirla);
    zincir.push(`[${onceki}][${etiket}]${govde}[o${idx}]`);
    onceki = `o${idx}`;
  });

  // Perde katmanların ÜSTÜNE, yazının ALTINA gelir: fotoğrafı ve köşe öğelerini
  // karartır ama yazıyı karartmaz.
  if (perdePng) {
    zincir.push(`[${perdeIdx}:v]format=rgba,scale=${K.w}:${K.h},setsar=1[perde]`);
    zincir.push(`[${onceki}][perde]overlay=0:0[perdeli]`);
    onceki = "perdeli";
  }

  // --- yazı katmanları (kompozitin üstüne yakılır) ---
  const dt = [];
  for (const L of yazilar) dt.push(...kinetikYazi(L, K));

  // GRAFİK BİNDİRMESİ (veri barları, dev rakam, bölüm kartı).
  //
  // graphics.js bu çizimleri hazır drawtext/drawbox zinciri olarak üretiyor ve
  // KLASİK modda kullanılıyordu; sinematik modda hiç çağrılmıyordu. Sonuç:
  // senaryo modelinin ürettiği "compare" karşılaştırma barları ve "stat" dev
  // rakamları çöpe gidiyordu — belgeselin en güçlü anları ekrana çıkmıyordu.
  // Hazır zincir olduğu için burada tek yapılacak şey kuyruğa eklemek.
  const grafik = String(bindirme || "").replace(/^,/, "");
  const parcalar = [...dt, ...(grafik ? [grafik] : [])];
  const kuyruk = parcalar.length ? `${parcalar.join(",")},format=yuv420p` : "format=yuv420p";
  zincir.push(`[${onceki}]${kuyruk}[v]`);

  await run(st.ffmpegPath, [
    ...inputs,
    "-filter_complex", zincir.join(";"),
    "-map", "[v]", "-frames:v", String(N), "-r", String(fps),
    ...videoEnc(st, crf), "-an", "-y", outFile,
  ], { killer });
  return outFile;
}
