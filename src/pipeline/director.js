import { yaziYuksekligi } from "./motion.js";

// YÖNETMEN — bir sahnenin kompozisyonuna ve zamanlamasına karar verir.
//
// TASARIM İLKESİ: model NEYİN anlatılacağına, kod NEREYE ve NE ZAMAN konacağına
// karar verir. Piksel koordinatını dil modeline sordurmak tutarsız kompozisyon
// üretir — bir sahnede güzel, sonrakinde öğeler üst üste biner. Burada geometri
// ve zamanlama tamamen deterministik; modelin katkısı hangi kavramın kahraman
// olduğu ve hangi kelimenin vurgulanacağı.
//
// Dört iş yapar:
//   1. ŞABLON  — orana özel kompozisyon kütüphanesinden seçer, ardışık sahnede
//                aynısını tekrarlamaz (çeşitlilik).
//   2. GÜVENLİ ALAN — kadraj kenarı ve dikeyde platform arayüzünün kapattığı
//                bantlar dışlanır.
//   3. ÇAKIŞMA — görsel yuvaları yazı bloğunun üstüne binerse iterek çözer.
//   4. ZAMANLAMA — öğeler saate göre değil KONUŞMAYA göre girer; her giriş bir
//                kelimeye denk gelir. Vurgu öğesi vurgu kelimesiyle patlar.

/**
 * Güvenli alan (kanvas oranı). Dikeyde altta Reels/TikTok arayüzü, üstte durum
 * çubuğu var; oraya öğe koymak "kesilmiş" görünüyor.
 */
const GUVENLI = {
  yatay: { ust: 0.06, alt: 0.06, sol: 0.05, sag: 0.05 },
  dikey: { ust: 0.09, alt: 0.15, sol: 0.06, sag: 0.06 },
};

// ---------------------------------------------------------------- şablonlar
//
// Her şablon: yazı bloğunun çıpası + görsel yuvaları.
// rol: "hero" (kahraman, en büyük ve ilk), "destek", "aksan" (küçük, vurguda gelir)
// Konumlar merkez noktası, `en` kısa kenara oranlı genişlik (bkz. motion.js).

const YATAY = [
  {
    ad: "sag-hero",
    yazi: { x: 0.06, y: 0.60 },
    yuvalar: [
      { rol: "hero", x: 0.66, y: 0.40, en: 0.76, giris: "buyu" },
      { rol: "destek", x: 0.90, y: 0.19, en: 0.24, giris: "sagdan" },
      { rol: "aksan", x: 0.41, y: 0.68, en: 0.17, giris: "asagidan" },
    ],
  },
  {
    ad: "merkez-hero",
    yazi: { x: 0.06, y: 0.66 },
    yuvalar: [
      { rol: "hero", x: 0.53, y: 0.36, en: 0.72, giris: "otur" },
      { rol: "destek", x: 0.18, y: 0.28, en: 0.26, giris: "soldan" },
      { rol: "aksan", x: 0.85, y: 0.27, en: 0.18, giris: "sagdan" },
    ],
  },
  {
    ad: "ucgen",
    yazi: { x: 0.06, y: 0.64 },
    yuvalar: [
      { rol: "hero", x: 0.63, y: 0.32, en: 0.56, giris: "yukaridan" },
      { rol: "destek", x: 0.83, y: 0.58, en: 0.26, giris: "sagdan" },
      { rol: "aksan", x: 0.40, y: 0.55, en: 0.19, giris: "buyu" },
    ],
  },
  {
    ad: "serit",
    yazi: { x: 0.06, y: 0.70 },
    yuvalar: [
      { rol: "hero", x: 0.50, y: 0.34, en: 0.46, giris: "buyu" },
      { rol: "destek", x: 0.20, y: 0.34, en: 0.24, giris: "soldan" },
      { rol: "destek", x: 0.80, y: 0.34, en: 0.24, giris: "sagdan" },
    ],
  },
  {
    ad: "sol-hero",
    yazi: { x: 0.52, y: 0.66 },
    yuvalar: [
      { rol: "hero", x: 0.31, y: 0.39, en: 0.72, giris: "buyu" },
      { rol: "destek", x: 0.74, y: 0.24, en: 0.26, giris: "yukaridan" },
      { rol: "aksan", x: 0.87, y: 0.55, en: 0.17, giris: "sagdan" },
    ],
  },
];

const DIKEY = [
  {
    ad: "ust-hero",
    yazi: { x: 0.07, y: 0.60 },
    yuvalar: [
      { rol: "hero", x: 0.47, y: 0.28, en: 0.78, giris: "buyu" },
      { rol: "destek", x: 0.80, y: 0.44, en: 0.30, giris: "sagdan" },
      { rol: "aksan", x: 0.21, y: 0.47, en: 0.19, giris: "soldan" },
    ],
  },
  {
    ad: "capraz",
    yazi: { x: 0.07, y: 0.62 },
    yuvalar: [
      { rol: "hero", x: 0.41, y: 0.23, en: 0.70, giris: "yukaridan" },
      { rol: "destek", x: 0.71, y: 0.45, en: 0.32, giris: "sagdan" },
      { rol: "aksan", x: 0.26, y: 0.47, en: 0.18, giris: "asagidan" },
    ],
  },
  {
    ad: "yigin",
    yazi: { x: 0.07, y: 0.64 },
    yuvalar: [
      { rol: "hero", x: 0.45, y: 0.20, en: 0.62, giris: "yukaridan" },
      { rol: "destek", x: 0.58, y: 0.44, en: 0.36, giris: "asagidan" },
      { rol: "aksan", x: 0.20, y: 0.40, en: 0.20, giris: "sagdan" },
    ],
  },
  {
    ad: "tek-dev",
    yazi: { x: 0.07, y: 0.63 },
    yuvalar: [
      { rol: "hero", x: 0.50, y: 0.29, en: 0.86, giris: "otur" },
      { rol: "aksan", x: 0.78, y: 0.14, en: 0.22, giris: "kucul" },
    ],
  },
];

// ---------------------------------------------------------------- tam ekran
//
// SİNEMATİK HAREKET dili: arka plan görüntü ekranı KAPLAR (kahraman odur), üstüne
// köşelerde birkaç çerçeveli öğe ve altta kelime kelime kurulan yazı gelir.
// Kolaj şablonlarından farkı: merkezde büyük bir kesik YOK, öğeler kadrajın
// kenarlarında durur ki arka plan görüntüsü kapanmasın.

const TAM_YATAY = [
  {
    ad: "tam-sag-ust",
    yazi: { x: 0.055, y: 0.735 },
    yuvalar: [
      { rol: "destek", x: 0.845, y: 0.20, en: 0.25, giris: "sagdan" },
      { rol: "aksan", x: 0.905, y: 0.47, en: 0.15, giris: "sagdan" },
    ],
  },
  {
    ad: "tam-sol-ust",
    yazi: { x: 0.055, y: 0.735 },
    yuvalar: [
      { rol: "destek", x: 0.135, y: 0.21, en: 0.24, giris: "soldan" },
      { rol: "aksan", x: 0.88, y: 0.24, en: 0.15, giris: "yukaridan" },
    ],
  },
  {
    ad: "tam-sag-yigin",
    yazi: { x: 0.055, y: 0.735 },
    yuvalar: [
      { rol: "destek", x: 0.865, y: 0.24, en: 0.21, giris: "sagdan" },
      { rol: "aksan", x: 0.865, y: 0.52, en: 0.18, giris: "sagdan" },
    ],
  },
  {
    ad: "tam-tek",
    yazi: { x: 0.055, y: 0.735 },
    yuvalar: [
      { rol: "destek", x: 0.83, y: 0.27, en: 0.31, giris: "buyu" },
    ],
  },
];

const TAM_DIKEY = [
  {
    ad: "tam-ust-d",
    yazi: { x: 0.065, y: 0.685 },
    yuvalar: [
      { rol: "destek", x: 0.755, y: 0.155, en: 0.34, giris: "sagdan" },
      { rol: "aksan", x: 0.20, y: 0.30, en: 0.20, giris: "soldan" },
    ],
  },
  {
    ad: "tam-sag-d",
    yazi: { x: 0.065, y: 0.685 },
    yuvalar: [
      { rol: "destek", x: 0.775, y: 0.34, en: 0.32, giris: "sagdan" },
      { rol: "aksan", x: 0.24, y: 0.15, en: 0.19, giris: "yukaridan" },
    ],
  },
  {
    ad: "tam-tek-d",
    yazi: { x: 0.065, y: 0.685 },
    yuvalar: [
      { rol: "destek", x: 0.71, y: 0.22, en: 0.42, giris: "buyu" },
    ],
  },
];

/** Sabit hash — aynı sahne her çalıştırmada aynı şablonu alsın (tekrarlanabilirlik). */
function hash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Şablon seçer. Ardışık sahnede aynısını KULLANMAZ — aynı kompozisyon üst üste
 * gelince video "donmuş" hissi veriyor.
 */
export function sablonSec(kanvas, anahtar, oncekiAd, tamEkran = false) {
  const dik = kanvas.dikey || kanvas.kare;
  const havuz = tamEkran ? (dik ? TAM_DIKEY : TAM_YATAY) : (dik ? DIKEY : YATAY);
  const uygun = havuz.filter((s) => s.ad !== oncekiAd);
  const liste = uygun.length ? uygun : havuz;
  return liste[hash(anahtar) % liste.length];
}

// ---------------------------------------------------------------- zamanlama

/**
 * Girişleri KONUŞMAYA kilitler.
 *
 * Öğeler saat başına değil, söylenen kelimelere iner — kurgunun ritim hissi
 * buradan gelir. n giriş için kelime listesinden dengeli aralıklı n an seçilir;
 * kelime zamanı yoksa (altyazı kapalı vb.) eşit aralığa düşülür.
 *
 * @param kelimeler [{t,start,end}] segment başına göreli
 * @param n         kaç giriş anı
 * @param sure      sahnenin süresi
 */
export function girisAnlari(kelimeler, n, sure) {
  if (n <= 0) return [];
  const k = (kelimeler || []).filter((w) => Number.isFinite(w?.start));
  // İlk öğe hep erken girer (sahnenin çıpası), kalanlar konuşmaya yayılır.
  const ilk = 0.12;
  if (k.length < n + 1) {
    const adim = Math.max(0.28, (sure * 0.55) / Math.max(1, n));
    return Array.from({ length: n }, (_, i) => +(ilk + i * adim).toFixed(3));
  }
  // Kelime listesinin ilk %65'ine yay — son çeyrekte yeni öğe girmesin,
  // izleyici vurgu anında dağılmasın.
  const son = Math.floor(k.length * 0.65);
  const out = [ilk];
  for (let i = 1; i < n; i++) {
    const idx = Math.min(son, Math.max(1, Math.round((i / n) * son)));
    out.push(+Math.min(sure - 0.6, k[idx].start).toFixed(3));
  }
  // Monoton artan olsun (aynı kelimeye iki öğe düşerse ikincisi hafif kaysın)
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1] + 0.14) out[i] = +(out[i - 1] + 0.22).toFixed(3);
  }
  return out;
}

/**
 * Vurgu kelimesinin sahne içindeki anı; bulunamazsa konuşmanın %70'i.
 * Dönüş HER ZAMAN sonlu bir sayıdır — bozuk kelime zamanı ffmpeg ifadesine
 * "NaN" olarak sızıp filtre zincirini bozuyordu (azalan sıralı listede ölçüldü).
 */
export function vurguAni(kelimeler, vurgu, sure) {
  const guvenli = Number.isFinite(sure) && sure > 0 ? sure : 4;
  const varsayilan = +(guvenli * 0.7).toFixed(3);
  const k = (kelimeler || []).filter((w) => Number.isFinite(w?.start));
  const dogrula = (v) => (Number.isFinite(v) && v >= 0 ? +v.toFixed(3) : varsayilan);
  if (vurgu && k.length) {
    // Diakritikten bağımsız eşleştir: emphasis.value modelden BÜYÜK HARF/eksik
    // şapkalı gelebiliyor, TTS kelimesi ise metindeki hâliyle.
    const hedef = katla(vurgu);
    const bul = k.find((w) => katla(w.t) === hedef)
      // tam eşleşme yoksa ön ek dene ("bekçileri" ↔ "bekçiler")
      || k.find((w) => hedef.length >= 5 && katla(w.t).startsWith(hedef.slice(0, 5)));
    if (bul) return dogrula(Math.max(0, Math.min(guvenli - 0.5, bul.start)));
  }
  return varsayilan;
}

// ---------------------------------------------------------------- çakışma

/** Dikdörtgen kesişimi (normalize koordinat). */
function kesisir(a, b) {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);
}

/**
 * Yazı bloğunun kapladığı alan (normalize).
 *
 * Yükseklik motion.js'in GERÇEK satır kırmasından gelir — kaç satır olacağını
 * burada bağımsız tahmin etmek, uzun cümlelerde yönetmenin "boş" sandığı yere
 * yazının taşmasına yol açıyordu.
 */
function yaziAlani(yazi, kanvas, kelimeler, vurguVar) {
  const h = yaziYuksekligi(kelimeler, kanvas, { x: yazi.x, vurgu: vurguVar });
  return { x0: yazi.x - 0.02, x1: Math.min(1, yazi.x + 0.86), y0: yazi.y - 0.02, y1: Math.min(1, yazi.y + h + 0.02) };
}

/**
 * YERLEŞİM — üç kısıtı TEK gevşetme döngüsünde çözer.
 *
 * Ayrı geçişler halinde uygulamak işe yaramıyordu: kadraj/yazı düzeltmesi
 * ayrıştırmayı, ayrıştırma da kadraj düzeltmesini bozuyordu (480 çiftin 105'i
 * hâlâ biniyordu). Kısıtlar her turda birlikte uygulanır ve turlar ilerledikçe
 * çözülemeyen durumda küçültmeye başvurulur — kadraj dışına taşma ve binme
 * ASLA çıktıya sızmaz.
 *
 *   1. kadraj (güvenli alan)
 *   2. yazı bloğu (yazı her zaman okunur kalır — öğe yukarı itilir)
 *   3. birbirleri (küçük olan itilir, hiyerarşi korunur)
 */
function yerlesim(yuvalar, kanvas, yaziRect) {
  const g = kanvas.dikey || kanvas.kare ? GUVENLI.dikey : GUVENLI.yatay;
  const kisa = Math.min(kanvas.w, kanvas.h);
  const NEFES = 0.012;
  const Y = yuvalar.map((y) => ({ ...y }));
  const yari = (o) => ({ w: (o.en * kisa) / kanvas.w / 2, h: (o.en * kisa) / kanvas.h / 2 });
  const maxW = (1 - g.sol - g.sag) / 2, maxH = (1 - g.ust - g.alt) / 2;

  for (let tur = 0; tur < 14; tur++) {
    let ihlal = 0;

    // --- 1. kadraj ---
    for (const o of Y) {
      let { w, h } = yari(o);
      if (w > maxW || h > maxH) {
        o.en *= Math.min(maxW / w, maxH / h);
        ({ w, h } = yari(o));
        ihlal++;
      }
      const nx = Math.min(1 - g.sag - w, Math.max(g.sol + w, o.x));
      const ny = Math.min(1 - g.alt - h, Math.max(g.ust + h, o.y));
      if (Math.abs(nx - o.x) > 1e-6 || Math.abs(ny - o.y) > 1e-6) ihlal++;
      o.x = nx; o.y = ny;
    }

    // --- 2. yazı bloğu ---
    if (yaziRect) {
      for (const o of Y) {
        const { w, h } = yari(o);
        if (!kesisir({ x0: o.x - w, x1: o.x + w, y0: o.y - h, y1: o.y + h }, yaziRect)) continue;
        ihlal++;
        const hedef = yaziRect.y0 - h - 0.015;
        if (hedef >= g.ust + h) o.y = hedef;
        else o.en *= 0.82;   // yukarı sığmıyor → küçült, sonraki tur yeniden dener
      }
    }

    // --- 3. birbirleri ---
    for (let i = 0; i < Y.length; i++) {
      for (let j = i + 1; j < Y.length; j++) {
        const a = Y[i], b = Y[j];
        // AKSAN ÖĞELERİ BİLEREK BİNEBİLİR. Referans dilde küçük kırmızı şekil
        // fotoğrafın köşesine oturuyor — bu, kolaj estetiğinin parçası. Tam
        // ayrım dayatmak hem yanlış görünüyor hem de dar dikey kadrajda tüm
        // öğelerin sıfıra kadar küçülmesine yol açıyordu.
        if (a.rol === "aksan" || b.rol === "aksan") continue;
        const ya = yari(a), yb = yari(b);
        const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
        // Kısmi örtüşmeye izin ver: küçük öğenin %30'una kadar binme kolajda doğal.
        const kucukW = Math.min(ya.w, yb.w), kucukH = Math.min(ya.h, yb.h);
        const gerekX = ya.w + yb.w + NEFES - kucukW * 0.6;
        const gerekY = ya.h + yb.h + NEFES - kucukH * 0.6;
        if (dx >= gerekX || dy >= gerekY) continue;
        ihlal++;
        // Kahramanı sabit tut, küçüğü it — görsel hiyerarşi bozulmasın
        const kucuk = a.en <= b.en ? a : b, buyuk = kucuk === a ? b : a;
        const yk = yari(kucuk);
        const eksikX = gerekX - dx, eksikY = gerekY - dy;
        if (eksikY <= eksikX) {
          const yon = kucuk.y >= buyuk.y ? 1 : -1;
          const hedef = kucuk.y + yon * eksikY;
          if (hedef - yk.h >= g.ust && hedef + yk.h <= 1 - g.alt) kucuk.y = hedef;
          else kucuk.en *= 0.8;
        } else {
          const yon = kucuk.x >= buyuk.x ? 1 : -1;
          const hedef = kucuk.x + yon * eksikX;
          if (hedef - yk.w >= g.sol && hedef + yk.w <= 1 - g.sag) kucuk.x = hedef;
          else kucuk.en *= 0.8;
        }
      }
    }

    if (!ihlal) break;
    // Geç turlarda hâlâ ihlal varsa yer açmanın tek yolu küçültmek
    if (tur >= 9) for (const o of Y) o.en *= 0.93;
  }

  return Y.map((o) => ({ ...o, x: +o.x.toFixed(4), y: +o.y.toFixed(4), en: +Math.max(0.09, o.en).toFixed(4) }));
}

// ---------------------------------------------------------------- sahne planı

/**
 * Bir sahnenin katman planını üretir (motion.js'in beklediği biçimde).
 *
 * @param kanvas      canvas.js nesnesi
 * @param sure        sahnenin süresi (sn)
 * @param kelimeler   [{t,start,end}] segment başına göreli — konuşmaya kilitleme
 * @param medya       { hero, destek:[], aksan } → dosya yolları (eksik olan atlanır)
 * @param vurgu       vurgulanacak kelime (yoksa null)
 * @param anahtar     tekrarlanabilir şablon seçimi için (beat id)
 * @param oncekiSablon bir önceki sahnenin şablon adı (çeşitlilik)
 * @param arkaplan    { tur, src|renk }
 */
export function planScene({ kanvas, sure, kelimeler = [], medya = {}, vurgu = null, anahtar = "0", oncekiSablon = null, arkaplan, tamEkran = false, yaziModu = "vurgu" }) {
  const sablon = sablonSec(kanvas, anahtar, oncekiSablon, tamEkran);

  // --- hangi yuvalara medya var ---
  const havuz = [];
  if (medya.hero) havuz.push({ rol: "hero", src: medya.hero });
  for (const d of medya.destek || []) havuz.push({ rol: "destek", src: d });
  if (medya.aksan) havuz.push({ rol: "aksan", src: medya.aksan });

  // Şablonun yuvalarını rol önceliğine göre doldur; medya yoksa yuva boş kalır
  // (uydurma öğe koymaktansa sahnenin sade kalması yeğdir).
  const sirali = [...sablon.yuvalar].sort((a, b) =>
    ({ hero: 0, destek: 1, aksan: 2 }[a.rol] - { hero: 0, destek: 1, aksan: 2 }[b.rol]));
  const dolu = [];
  const kalan = [...havuz];
  for (const yuva of sirali) {
    // Şablonda medyadan AZ yuva varsa (ör. "tam-tek": tek yuva) rol eşleşmesi
    // peşine düşmek en iyi adayı çöpe atıyordu — render.js kesikleri zaten
    // ALAKA SIRASIYLA veriyor, o yüzden yuva azken listenin başı alınır.
    const yuvaAz = sirali.length < havuz.length;
    const i = yuvaAz ? 0 : kalan.findIndex((h) => h.rol === yuva.rol);
    const alt = i >= 0 ? i : kalan.findIndex((h) => h.rol !== "hero");
    if (alt < 0) continue;
    dolu.push({ ...yuva, src: kalan[alt].src });
    kalan.splice(alt, 1);
  }
  // NOT: burada ERKEN DÖNÜLMEZ. Eskiden `if (!dolu.length) return {katmanlar: []}`
  // vardı ve kesik üretilemeyen sahne YAZISINI DA kaybediyordu — gerçek videoda
  // bazı sahneler tamamen sessiz/yazısız çıkıyordu (ölçüldü: 7 karenin 2'sinde
  // sıfır mürekkep). Tam ekran dilinde bu özellikle sık, çünkü kahraman zaten
  // arka plandır ve yalnızca b1/b2 kesiğe çevrilir; ikisi de inmezse sahne boş
  // kalırdı. Görsel olmayabilir, yazı HER ZAMAN olmalı.

  // --- yerleştirme ---
  const yaziRect = kelimeler.length
    ? yaziAlani(sablon.yazi, kanvas, kelimeler.map((w) => ({ s: w.t })), !!vurgu)
    : null;
  const yerli = dolu.length ? yerlesim(dolu, kanvas, yaziRect) : [];

  // --- zamanlama ---
  const anlar = girisAnlari(kelimeler, yerli.length, sure);
  const vT = vurguAni(kelimeler, vurgu, sure);

  const katmanlar = yerli.map((y, i) => {
    // Aksan öğesi VURGU ANINDA gelir — kurgunun vuruşu orada.
    const bas = y.rol === "aksan" ? Math.max(anlar[i] ?? 0.2, vT - 0.08) : (anlar[i] ?? 0.2);
    return {
      tur: "gorsel", src: y.src,
      x: y.x, y: y.y, en: y.en,
      bas: +bas.toFixed(3),
      sure: +Math.max(0.5, sure - bas - 0.12).toFixed(3),
      giris: y.giris,
      // Hero daha ağır girer (büyük kütle hissi), küçükler çevik
      girisSure: y.rol === "hero" ? 0.62 : y.rol === "aksan" ? 0.34 : 0.48,
      cikisSure: 0.32,
    };
  });

  // Kelime zamanları PLANA girmeden temizlenir. motion.js render anında ayrıca
  // temizliyor ama plan nesnesi loglanıyor/serileştiriliyor — içinde NaN veya
  // azalan sıra taşımamalı, yoksa hata ancak ffmpeg patlayınca fark ediliyor.
  let sonZaman = -Infinity;
  const temizKelime = kelimeler
    .filter((w) => w && w.t && Number.isFinite(w.start))
    .map((w) => {
      const t0 = w.start <= sonZaman ? sonZaman + 0.08 : w.start;
      sonZaman = t0;
      return { s: w.t, t0: +t0.toFixed(3) };
    });

  // EKRANDAKİ YAZI DÜZENİ.
  //
  //   vurgu  → gövde YOK, yalnızca vuruş (sayı/isim/tarih). Varsayılan.
  //   obek   → gövde var, öbek bir bütün belirir (kelime kelime değil)
  //   kelime → gövde kelime kelime kurulur (Reels dili)
  //
  // Neden varsayılan "vurgu": ekranda akan deşifre metni anlatıcının söylediğini
  // tekrar ediyordu ve uzun cümleler anlamsız parçalara bölünüyordu ("biçiminde
  // iki bin beş"). İyi belgeselde ekran yazısı deşifre değil vurgudur; deşifre
  // zaten subs.srt'de. Ayrıca 7 saniyelik sahnede izleyici yazıyı gelmesinden
  // hızlı okuyor, kelime kelime akış bekleme hissi veriyor.
  const govdeVar = yaziModu !== "vurgu";
  const govdeKelimeler = govdeVar ? temizKelime : [];

  if (govdeKelimeler.length || vurgu) {
    katmanlar.push({
      tur: "yazi",
      kelimeler: govdeKelimeler,
      // "obek" modunda tüm öbek aynı anda belirsin: kelime zamanlarını öbek
      // başına eşitlemek motion.js'in kümülatif çizimini tek adıma indirir.
      obekBirlikte: yaziModu === "obek",
      x: sablon.yazi.x, y: sablon.yazi.y,
      // Tam ekran dilinde yazı karartma bandının üstünde duruyor → açık renk,
      // koyu kontur. Kolajda tersi (kâğıt zemin açık, yazı koyu).
      // Aksan çizgisi vurgu kelimesiyle AYNI renkte — ekranda iki farklı vurgu
      // rengi olunca uyumsuz duruyor.
      ...(tamEkran
        ? { renk: "0xF4F7FA", vurguRenk: "0xFFD23F", konturRenk: "0x0A0C10", seritRenk: "0xFFD23F" }
        : { seritRenk: "0xE02417" }),
      vurgu: vurgu || null, vurguT0: vurgu ? vT : null,
      bitis: +Math.max(0.6, sure - 0.08).toFixed(3),
    });
  }

  return { sablon: sablon.ad, katmanlar, arkaplan };
}

/**
 * Vurgu kelimesi seçimi — model bir şey söylemediyse metinden çıkarır.
 * En uzun içerik kelimesi genelde cümlenin ağırlık merkezidir; bağlaç ve
 * zamirler elenir.
 */
/**
 * Türkçe karakterleri ASCII'ye indirger.
 *
 * Karşılaştırmalar buradan geçmeli: kullanıcı "çünkü" yerine "cunku" yazdığında
 * zayıf kelime listesi tutmuyordu ve bağlaç ekrana dev puntoyla vurgu olarak
 * basılıyordu. Aynı sorun vurgu kelimesini TTS zaman çizelgesinde ararken de var.
 */
export function katla(s) {
  return String(s || "")
    .toLocaleLowerCase("tr")
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[âÂ]/g, "a").replace(/[îÎ]/g, "i").replace(/[ûÛ]/g, "u")
    .replace(/[.,!?;:"“”'’()\[\]]/g, "");
}

const ZAYIF = new Set([
  "ve", "ile", "ama", "fakat", "cunku", "icin", "gibi", "daha", "cok", "bir",
  "bu", "su", "o", "da", "de", "ki", "mi", "mi", "her", "hic", "sonra", "once",
  "kadar", "yine", "hepsi", "belki", "ancak", "yani", "diye", "olarak", "uzere",
  "the", "and", "but", "for", "with", "this", "that", "from", "into", "than",
].map(katla));

export function vurguSec(metin, emphasis) {
  if (emphasis?.type === "keyword" && emphasis.value) return String(emphasis.value).split(/\s+/)[0];
  if (emphasis?.type === "stat" && emphasis.value) return String(emphasis.value);
  const kelimeler = String(metin || "").replace(/[.,!?;:"“”]/g, " ").split(/\s+/).filter(Boolean);
  // 3 kelimeden kısa parçada vuruş anlamsız — gövde zaten kendisi kadar kısa.
  if (kelimeler.length < 3) return null;

  // VURGU YALNIZCA SON KELİMELERDEN SEÇİLİR.
  //
  // Vurgu kelimesi gövdeden çıkarıldığı için (tekrar etmesin diye) cümlenin
  // ORTASINDAN seçilirse geriye bozuk Türkçe kalıyor: "nükleer kalma bomba
  // karbonu çıktı" + dev "denemelerden". Ölçüldü: segmentlerin %90'ı böyleydi.
  // Referans dilde büyük yazı gövdenin DEVAMIdır — yani cümlenin son öğesi.
  // Son iki kelimeyle sınırlamak hem dilbilgisini korur hem vuruşu sona koyar.
  const sonPencere = Math.max(1, Math.min(2, kelimeler.length - 1));
  const bas = kelimeler.length - sonPencere;

  // BİLGİ DEĞERİ, uzunluk değil.
  //
  // Eskiden sıralama salt kelime uzunluğuydu ve gerçek videoda "descending"
  // gibi sıradan bir fiil 132 piksel altın harfle ekrana çıkıyordu — izleyiciye
  // hiçbir şey söylemiyor. Belgeselin para birimi SAYIdır: derinlik, yıl, süre,
  // basınç. Sonra özel adlar gelir. Sıradan fiil/sıfat vuruşu hak etmiyor.
  const bilgiPuani = (w, oncekiSayi) => {
    let p = Math.min(w.length, 12) * 0.4;
    if (/\d/.test(w)) p += 10;                                   // rakam: en değerlisi
    else if (/^[A-ZÇĞİÖŞÜ]/.test(w)) p += 5;                      // özel ad
    // BİRİM/ÖLÇÜ: "fifteen minutes", "on bir kilometre" — sayı YAZIYLA yazılınca
    // rakam kuralı kaçırıyordu, oysa belgeselin en değerli vuruşu tam bu.
    if (oncekiSayi) p += 7;
    if (/(ing|erek|arak|iyor|yordu)$/i.test(w)) p -= 4;           // ulaç/sürerlik: zayıf
    return p;
  };

  /** Yazıyla sayı (iki dilde). Bir sonraki kelimeyi "ölçü" yapan işaret. */
  const SAYI_SOZ = new Set([
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "fifteen", "twenty", "thirty", "forty", "fifty", "sixty",
    "hundred", "thousand", "million", "billion",
    "bir", "iki", "uc", "dort", "bes", "alti", "yedi", "sekiz", "dokuz", "on",
    "yirmi", "otuz", "kirk", "elli", "altmis", "yetmis", "seksen", "doksan",
    "yuz", "bin", "milyon", "milyar",
  ].map(katla));
  /** Vuruşu hak etmek için gereken en düşük bilgi puanı. */
  const HAK_ESIGI = 4.6;

  const puanla = (enAzUzunluk) => kelimeler
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => i >= bas && w.length >= enAzUzunluk && !ZAYIF.has(katla(w)))
    .map((x) => ({
      ...x,
      p: bilgiPuani(x.w, x.i > 0 && (SAYI_SOZ.has(katla(kelimeler[x.i - 1])) || /\d/.test(kelimeler[x.i - 1])))
        + (x.i === kelimeler.length - 1 ? 1 : 0),
    }))
    .sort((a, b) => b.p - a.p);

  // Kademeli gevşetme: sahne kelimeleri kısa olduğunda 5 harf eşiği çoğu
  // sahneyi vurgusuz bırakıyordu ve videoda bazı sahnelerde altın kelime
  // olup bazılarında olmuyordu (tutarsız görünüyordu). Eşik kademeli düşer.
  for (const esik of [5, 4, 3]) {
    const p = puanla(esik);
    if (p.length && p[0].p >= HAK_ESIGI) return p[0].w;
  }
  // Buradan sonrası için "son çare olarak en uzun kelimeyi al" denendi ve GERİ
  // ALINDI: tüm kelimeler zayıfsa ekrana 132 piksel altın harflerle "daha" ya da
  // "ancak" basılıyordu. Vurgusuz sahne, anlamsız vurgudan iyidir. Kapsama
  // yukarıdaki kademeli eşikle (5→4→3) zaten yeterince artıyor.
  return null;
}
