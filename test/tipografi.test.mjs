// Kinetik tipografi kuralları — çok ajanlı analizde ölçülen kusurların hepsi burada
// kilitlenir. Saf matematik + üretilen ffmpeg ifadesinin denetimi (render yok).
import { makeCanvas } from "../src/pipeline/canvas.js";
import { planScene, vurguAni, girisAnlari } from "../src/pipeline/director.js";

let hata = 0;
const kontrol = (ad, kosul, detay = "") => {
  if (kosul) console.log("OK   " + ad);
  else { hata++; console.log("HATA " + ad + (detay ? "  -> " + detay : "")); }
};

const K169 = makeCanvas("16:9");
const K916 = makeCanvas("9:16");
const kelimeler = "Deniz feneri bekçileri aylarca tek başına yaşardı ve kimse onları hatırlamadı"
  .split(/\s+/).map((t, i) => ({ t, start: +(0.25 + i * 0.4).toFixed(2), end: +(0.25 + i * 0.4 + 0.34).toFixed(2) }));
const SURE = 5.6;
const medya = { hero: "h.png", destek: ["d.png"], aksan: "a.png" };

/** planScene -> yazı katmanı -> motion.js'in üreteceği drawtext dizisi */
function yaziKatmani(opts = {}) {
  const p = planScene({
    kanvas: opts.kanvas || K169, sure: opts.sure ?? SURE,
    kelimeler: opts.kelimeler ?? kelimeler, medya: opts.medya ?? medya,
    vurgu: opts.vurgu ?? "hatırlamadı", anahtar: opts.anahtar || "t1",
    tamEkran: opts.tamEkran ?? false,
    arkaplan: { tur: "renk", renk: "0x111111" },
  });
  return { plan: p, yazi: p.katmanlar.find((x) => x.tur === "yazi") };
}

// ==================== 1. Medya yokken yazı KAYBOLMAZ ====================
// Ölçüldü: erken dönüş yüzünden kesik üretilemeyen sahnede metin tamamen yoktu.
{
  const senaryolar = [
    ["hicbir medya yok", {}],
    ["bos diziler", { destek: [], aksan: null, hero: null }],
    ["sadece hero", { hero: "h.png" }],
    ["sadece aksan", { aksan: "a.png" }],
  ];
  let kayip = 0;
  const detay = [];
  for (const [ad, m] of senaryolar) {
    for (const tam of [false, true]) {
      for (const kanvas of [K169, K916]) {
        const { yazi } = yaziKatmani({ medya: m, tamEkran: tam, kanvas });
        if (!yazi) { kayip++; detay.push(`${ad}/tamEkran=${tam}/${kanvas.ratio}`); }
      }
    }
  }
  kontrol("medya olmasa da kinetik yazi duruyor", kayip === 0, detay.join(", "));
}

// ==================== 2. Vurgu anı HER ZAMAN sonlu ====================
// Ölçüldü: azalan sıralı kelime listesinde vurguAni bos string donuyordu -> ffmpeg "NaN".
{
  const bozuk = [
    ["bos", []],
    ["start yok", [{ t: "bir" }, { t: "iki" }]],
    ["start NaN", [{ t: "bir", start: NaN }, { t: "iki", start: 1 }]],
    ["azalan", [{ t: "bir", start: 3 }, { t: "iki", start: 1 }]],
    ["negatif", [{ t: "bir", start: -5 }]],
    ["sonsuz", [{ t: "bir", start: Infinity }]],
  ];
  let kotu = 0;
  const detay = [];
  for (const [ad, kl] of bozuk) {
    for (const v of [null, "bir", "olmayan"]) {
      const t = vurguAni(kl, v, SURE);
      if (!Number.isFinite(t) || t < 0) { kotu++; detay.push(`${ad}/${v}=${t}`); }
    }
  }
  // süre de bozuk olabilir
  for (const s of [0, -1, NaN, undefined]) {
    const t = vurguAni(kelimeler, "tek", s);
    if (!Number.isFinite(t) || t < 0) { kotu++; detay.push(`sure=${s} -> ${t}`); }
  }
  kontrol("vurguAni her zaman sonlu sayi donuyor", kotu === 0, detay.join(", "));
}

// ==================== 3. Giriş anları her zaman sonlu ====================
{
  let kotu = 0;
  for (const kl of [[], [{ t: "a" }], [{ t: "a", start: NaN }], kelimeler]) {
    for (const n of [0, 1, 3, 6]) {
      const a = girisAnlari(kl, n, SURE);
      if (a.some((x) => !Number.isFinite(x) || x < 0)) { kotu++; }
    }
  }
  kontrol("girisAnlari her zaman sonlu", kotu === 0, kotu + " bozuk");
}

// ==================== 4. Yazı katmanı bozuk kelimeye dayanıklı ====================
{
  const kirli = [
    { t: "iyi", start: 0.3 }, { t: "bozuk", start: NaN }, { t: "geri", start: 0.1 },
    { t: "", start: 1.2 }, { t: "son", start: 2.4 },
  ];
  const { yazi } = yaziKatmani({ kelimeler: kirli, vurgu: "son" });
  kontrol("kirli kelime listesiyle yazi katmani uretiliyor", !!yazi);
  if (yazi) {
    const zamanlar = yazi.kelimeler.map((k) => k.t0);
    kontrol("kelime zamanlari sonlu", zamanlar.every(Number.isFinite), JSON.stringify(zamanlar));
    kontrol("vurgu zamani sonlu", Number.isFinite(yazi.vurguT0), String(yazi.vurguT0));
  }
}

// ==================== 5. Tek kelimelik / uç segmentler ====================
{
  const tekKelime = [{ t: "Yalnızlık", start: 0.3 }];
  const { yazi: y1 } = yaziKatmani({ kelimeler: tekKelime, vurgu: "Yalnızlık", sure: 2.2 });
  kontrol("tek kelime = vurgu: katman yine uretiliyor", !!y1);

  const cokUzun = [{ t: "A".repeat(60), start: 0.3 }, { t: "son", start: 1.4 }];
  const { yazi: y2 } = yaziKatmani({ kelimeler: cokUzun, vurgu: "son", sure: 3 });
  kontrol("60 karakterlik kelime patlatmiyor", !!y2);

  const { yazi: y3 } = yaziKatmani({ kelimeler, sure: 0.9 });
  kontrol("cok kisa sahnede (0.9sn) katman uretiliyor", !!y3);
}

// ==================== 6. Vurgu sahne bitmeden giriyor ====================
{
  // Vurgu son kelimeye denk gelirse ve sahne kısaysa, görünmeden kesilmemeli.
  const { yazi } = yaziKatmani({ vurgu: "hatırlamadı", sure: 5.6 });
  const bitis = yazi.bitis;
  kontrol("vurgu bitisten en az 0.4sn once giriyor",
    yazi.vurguT0 <= bitis - 0.4, `vurguT0=${yazi.vurguT0} bitis=${bitis}`);
}

// ==================== 7. Üretilen ffmpeg ifadesi temiz ====================
// motion.js'in ürettiği drawtext dizisini doğrudan denetle: NaN / undefined /
// bos alan olmamalı, alpha ifadesi öbek seviyesinde olmalı.
{
  const { kinetikYaziDenetim } = await import("../src/pipeline/motion.js");
  if (typeof kinetikYaziDenetim !== "function") {
    kontrol("motion.js denetim kancasi disa aciliyor", false, "kinetikYaziDenetim yok");
  } else {
    const kotuGirdi = [
      { ad: "normal", L: { tur: "yazi", kelimeler: kelimeler.map((k) => ({ s: k.t, t0: k.start })), vurgu: "hatırlamadı", vurguT0: 4.4, bitis: 5.5 } },
      { ad: "bozuk zaman", L: { tur: "yazi", kelimeler: [{ s: "a", t0: NaN }, { s: "b", t0: 1 }], vurgu: "b", vurguT0: NaN, bitis: 3 } },
      { ad: "vurgusuz", L: { tur: "yazi", kelimeler: kelimeler.map((k) => ({ s: k.t, t0: k.start })), bitis: 5.5 } },
    ];
    let sorun = 0; const detay = [];
    for (const { ad, L } of kotuGirdi) {
      const p = kinetikYaziDenetim(L, K169);
      const hepsi = p.join(";");
      if (/NaN|undefined|Infinity/.test(hepsi)) { sorun++; detay.push(ad + ": NaN/undefined"); }
      // alpha öbek seviyesinde: aynı öbekteki tüm durumlar AYNI alpha ifadesini taşımalı
      const alfalar = p.filter((s) => s.includes("fontsize=" + Math.round(46 * K169.k)))
        .map((s) => (s.match(/alpha='([^']+)'/) || [])[1]);
      const benzersiz = new Set(alfalar).size;
      // öbek sayısı kadar farklı alpha olmalı, kelime sayısı kadar DEĞİL
      if (alfalar.length > 3 && benzersiz >= alfalar.length) {
        sorun++; detay.push(`${ad}: alpha kelime basina degisiyor (${benzersiz}/${alfalar.length})`);
      }
      if (/alpha='min\(1,\(t-[\d.]+\)\/0\.1\)'/.test(hepsi)) {
        sorun++; detay.push(ad + ": eski kelime-basina alpha rampasi hala var");
      }
    }
    kontrol("uretilen drawtext ifadeleri temiz ve obek seviyesinde", sorun === 0, detay.join(" | "));
  }
}

// ==================== 8. Yazı düzenleri (yaziModu) ====================
// vurgu  → gövde YOK, yalnızca vuruş
// obek   → gövde var, öbek tek adımda belirir
// kelime → gövde kelime kelime kurulur
{
  const { kinetikYaziDenetim } = await import("../src/pipeline/motion.js");
  const uzun = "Adı Mariana Çukuru hilal biçiminde iki bin beş yüz elli kilometre uzanan bir yarık"
    .split(/\s+/).map((s, i) => ({ t: s, start: +(0.3 + i * 0.38).toFixed(2) }));
  const beklenen = { vurgu: 0, obek: 3, kelime: 14 };
  let hataliMod = 0; const detay = [];
  for (const mod of ["vurgu", "obek", "kelime"]) {
    const p = planScene({
      kanvas: K169, sure: 8, kelimeler: uzun, medya: { destek: ["d.png"] },
      vurgu: "10.935 m", anahtar: "m", tamEkran: true, yaziModu: mod,
      arkaplan: { tur: "renk", renk: "0x111" },
    });
    const y = p.katmanlar.find((x) => x.tur === "yazi");
    if (!y) { hataliMod++; detay.push(mod + ": yazi katmani YOK"); continue; }
    const dt = kinetikYaziDenetim(y, K169);
    const govde = dt.filter((s) => s.includes("fontsize=46")).length;
    if (govde !== beklenen[mod]) { hataliMod++; detay.push(`${mod}: govde ${govde} (beklenen ${beklenen[mod]})`); }
    if (!dt.some((s) => s.includes("fontsize=132"))) { hataliMod++; detay.push(mod + ": VURGU KAYIP"); }
  }
  kontrol("uc yazi duzeni de dogru cikti veriyor", hataliMod === 0, detay.join(" | "));

  // Gövde olmasa bile vurgu durmalı — bu yol eskiden hiç desteklenmiyordu
  const yalniz = planScene({
    kanvas: K169, sure: 6, kelimeler: [], medya: {},
    vurgu: "11 kilometre", anahtar: "y", tamEkran: true, yaziModu: "vurgu",
    arkaplan: { tur: "renk", renk: "0x111" },
  });
  const yy = yalniz.katmanlar.find((x) => x.tur === "yazi");
  kontrol("kelime listesi bos olsa da vurgu uretiliyor",
    !!yy && kinetikYaziDenetim(yy, K169).some((s) => s.includes("fontsize=132")));
}

// ==================== 9. Vurgu BİLGİ değerine göre seçilir ====================
// Gerçek videoda "descending" gibi sıradan bir fiil 132 piksel altın harfle
// ekrana çıkıyordu — izleyiciye hiçbir şey söylemiyor. Sıralama artık uzunluk
// değil bilgi değeri: sayı > özel ad > içerik sözcüğü; ulaç/sürerlik cezalı.
{
  const { vurguSec } = await import("../src/pipeline/director.js");
  const bos = (m) => vurguSec(m, null) === null;

  kontrol("siradan fiil vurgu OLMAZ", bos("They kept descending."), vurguSec("They kept descending.", null));
  kontrol("zayif zarf vurgu OLMAZ",
    bos("Above the steel sphere hung a float roughly"),
    vurguSec("Above the steel sphere hung a float roughly", null));

  kontrol("rakam vurgu KAZANIR", vurguSec("The sphere reached 10935 metres.", null) === "10935");
  kontrol("yil vurgu KAZANIR", vurguSec("Bu yarığa insan ilk kez 1875'te dokundu", null) === "1875'te");
  // Sayi YAZIYLA yazilinca birim kelimesi olcu sayilir — belgeselin en degerli vurusu.
  kontrol("yaziyla sayidan sonraki birim kazanir",
    vurguSec("It took three hours fifteen minutes", null) === "minutes",
    String(vurguSec("It took three hours fifteen minutes", null)));
  kontrol("Turkce olcu birimi kazanir",
    vurguSec("Okyanusun en derin noktası on bir kilometre", null) === "kilometre");

  // Senaryonun kendi isaretledigi vurgu her zaman oncelikli.
  kontrol("senaryonun stat vurgusu aynen gecer",
    vurguSec("herhangi bir cumle burada", { type: "stat", value: "10.935 m" }) === "10.935 m");
  kontrol("3 kelimeden kisa parcada vurgu yok", bos("cok kisa"));
}

console.log(hata === 0 ? "\nTUM TIPOGRAFI KURALLARI GECTI" : "\n" + hata + " KURAL IHLALI");
process.exit(hata ? 1 : 0);
