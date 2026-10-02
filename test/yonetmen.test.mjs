// Yönetmen testi: kompozisyon kuralları gerçekten uygulanıyor mu.
// Saf matematik — ffmpeg çalıştırmaz, yüzlerce sahne üzerinde kural denetler.
import { planScene, sablonSec, girisAnlari, vurguAni, vurguSec } from "../src/pipeline/director.js";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { yaziYuksekligi } from "../src/pipeline/motion.js";

let hata = 0;
const kontrol = (ad, kosul, detay = "") => {
  if (kosul) console.log("OK   " + ad);
  else { hata++; console.log("HATA " + ad + (detay ? "  -> " + detay : "")); }
};

const GUV = (K) => (K.dikey || K.kare
  ? { ust: 0.09, alt: 0.15, sol: 0.06, sag: 0.06 }
  : { ust: 0.06, alt: 0.06, sol: 0.05, sag: 0.05 });

/** Katmanın normalize yarı ölçüleri (motion.js ile aynı: kısa kenara oranlı). */
const yari = (L, K) => {
  const kisa = Math.min(K.w, K.h);
  return { w: (L.en * kisa) / K.w / 2, h: (L.en * kisa) / K.h / 2 };
};

// --- sahte konuşma: 12 kelime, 5 saniye ---
const KELIME = ["Deniz", "feneri", "bekçileri", "aylarca", "tek", "başına", "yaşardı", "ve", "kimse", "onları", "hatırlamadı", "bugün"];
const kelimeler = KELIME.map((t, i) => ({ t, start: +(0.25 + i * 0.38).toFixed(2), end: +(0.25 + i * 0.38 + 0.3).toFixed(2) }));
const SURE = 5.2;
const medya = { hero: "h.png", destek: ["d1.png", "d2.png"], aksan: "a.png" };

// ==================== 1. Kadraj dışına taşma ====================
{
  let tasan = 0, sahne = 0;
  for (const oran of ["16:9", "9:16", "1:1"]) {
    const K = makeCanvas(oran), g = GUV(K);
    for (let i = 0; i < 60; i++) {
      const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "bekçileri", anahtar: "b" + i });
      sahne++;
      for (const L of p.katmanlar.filter((x) => x.tur === "gorsel")) {
        const y = yari(L, K);
        if (L.x - y.w < g.sol - 1e-4 || L.x + y.w > 1 - g.sag + 1e-4 ||
            L.y - y.h < g.ust - 1e-4 || L.y + y.h > 1 - g.alt + 1e-4) tasan++;
      }
    }
  }
  kontrol("hicbir oge guvenli alan disina tasmiyor (" + sahne + " sahne)", tasan === 0, tasan + " tasma");
}

// ==================== 2. Yazı bloğu okunur kalıyor ====================
{
  let cakisan = 0;
  for (const oran of ["16:9", "9:16"]) {
    const K = makeCanvas(oran);
    for (let i = 0; i < 60; i++) {
      const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "bekçileri", anahtar: "c" + i });
      const yazi = p.katmanlar.find((x) => x.tur === "yazi");
      if (!yazi) continue;
      const h = yaziYuksekligi(kelimeler.map((w) => ({ s: w.t })), K, { x: yazi.x, vurgu: true });
      const r = { x0: yazi.x - 0.02, x1: Math.min(1, yazi.x + 0.86), y0: yazi.y - 0.02, y1: Math.min(1, yazi.y + h + 0.02) };
      for (const L of p.katmanlar.filter((x) => x.tur === "gorsel")) {
        const y = yari(L, K);
        const a = { x0: L.x - y.w, x1: L.x + y.w, y0: L.y - y.h, y1: L.y + y.h };
        if (!(a.x1 <= r.x0 || a.x0 >= r.x1 || a.y1 <= r.y0 || a.y0 >= r.y1)) cakisan++;
      }
    }
  }
  kontrol("gorseller yazi blogunu kapatmiyor", cakisan === 0, cakisan + " cakisma");
}

// ==================== 3. Ana görseller ağır binmiyor ====================
// NOT: Aksan öğelerinin binmesi KURAL DIŞI değil, kolaj estetiğinin parçası
// (referans videoda küçük kırmızı şekil fotoğrafın köşesine oturuyor).
// Denetlenen şey: kahraman ve destek birbirini yutmasın.
{
  let agir = 0, cift = 0, enKotu = 0;
  for (const oran of ["16:9", "9:16", "1:1"]) {
    const K = makeCanvas(oran);
    for (let i = 0; i < 60; i++) {
      const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "hatırlamadı", anahtar: "g" + i });
      const g = p.katmanlar.filter((x) => x.tur === "gorsel" && x.girisSure !== 0.34); // aksan hariç
      for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
        cift++;
        const ya = yari(g[a], K), yb = yari(g[b], K);
        const ortX = Math.max(0, ya.w + yb.w - Math.abs(g[a].x - g[b].x));
        const ortY = Math.max(0, ya.h + yb.h - Math.abs(g[a].y - g[b].y));
        if (ortX <= 0 || ortY <= 0) continue;
        // örtüşen alan / küçük öğenin alanı
        const kucukAlan = Math.min(ya.w * ya.h, yb.w * yb.h) * 4;
        const oran2 = (ortX * ortY) / kucukAlan;
        enKotu = Math.max(enKotu, oran2);
        if (oran2 > 0.42) agir++;
      }
    }
  }
  kontrol("hero/destek agir binmiyor (" + cift + " cift, en kotu %" + Math.round(enKotu * 100) + ")",
    agir === 0, agir + " agir binme");
}

// ==================== 3b. Hiçbir öğe görünmez küçüklüğe düşmüyor ====================
{
  let minik = 0, toplam = 0, enKucuk = 1;
  for (const oran of ["16:9", "9:16", "1:1"]) {
    const K = makeCanvas(oran);
    for (let i = 0; i < 60; i++) {
      const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "hatırlamadı", anahtar: "m" + i });
      for (const L of p.katmanlar.filter((x) => x.tur === "gorsel")) {
        toplam++;
        enKucuk = Math.min(enKucuk, L.en);
        if (L.en < 0.085) minik++;   // kısa kenarın %8,5'inden küçük = ekranda nokta
      }
    }
  }
  kontrol("oge gorunmez kuculuge dusmuyor (en kucuk " + enKucuk.toFixed(3) + ", " + toplam + " oge)",
    minik === 0, minik + " minik oge");
}

// ==================== 4. Yazı kadrajın altından taşmıyor ====================
{
  let tasan = 0;
  const uzun = "Bu cumle bilerek cok uzun tutuldu cunku satir kirmanin gercekten calistigini gormek istiyoruz ve tek satira asla sigmamali";
  const uzunK = uzun.split(/\s+/).map((t, i) => ({ t, start: +(0.2 + i * 0.3).toFixed(2), end: +(0.2 + i * 0.3 + 0.25).toFixed(2) }));
  for (const oran of ["16:9", "9:16"]) {
    const K = makeCanvas(oran);
    for (const kl of [kelimeler, uzunK]) {
      const p = planScene({ kanvas: K, sure: 12, kelimeler: kl, medya, vurgu: "test", anahtar: "y1" });
      const yazi = p.katmanlar.find((x) => x.tur === "yazi");
      if (!yazi) continue;
      const h = yaziYuksekligi(kl.map((w) => ({ s: w.t })), K, { x: yazi.x, vurgu: true });
      if (yazi.y + h > 1.0) tasan++;
    }
  }
  kontrol("yazi blogu kadrajin altindan tasmiyor", tasan === 0, tasan + " tasma");
}

// ==================== 5. Çeşitlilik ====================
{
  let tekrar = 0;
  for (const oran of ["16:9", "9:16"]) {
    const K = makeCanvas(oran);
    let onceki = null;
    for (let i = 0; i < 40; i++) {
      const s = sablonSec(K, "s" + i, onceki);
      if (s.ad === onceki) tekrar++;
      onceki = s.ad;
    }
  }
  kontrol("ardisik sahnede sablon tekrarlanmiyor", tekrar === 0, tekrar + " tekrar");
}

// ==================== 6. Tekrarlanabilirlik ====================
{
  const K = makeCanvas("9:16");
  const a = JSON.stringify(planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "tek", anahtar: "sabit" }));
  const b = JSON.stringify(planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "tek", anahtar: "sabit" }));
  kontrol("ayni girdi ayni plani uretiyor", a === b);
}

// ==================== 7. Zamanlama konuşmaya kilitli ====================
{
  const anlar = girisAnlari(kelimeler, 3, SURE);
  const kelimeAnlari = new Set(kelimeler.map((w) => w.start));
  const kilitli = anlar.slice(1).filter((t) => kelimeAnlari.has(t)).length;
  kontrol("girisler kelimelere iniyor", kilitli >= 1, kilitli + "/" + (anlar.length - 1) + " · " + anlar);
  kontrol("girisler artan sirada", anlar.every((t, i) => i === 0 || t > anlar[i - 1]), String(anlar));
  kontrol("son ceyrekte yeni oge girmiyor", anlar.every((t) => t <= SURE * 0.78), String(anlar));
}

// ==================== 8. Vurgu anı ====================
{
  const t = vurguAni(kelimeler, "bekçileri", SURE);
  kontrol("vurgu ani dogru kelimede", Math.abs(t - kelimeler[2].start) < 0.001, t + " vs " + kelimeler[2].start);
  kontrol("diakritiksiz/buyuk harf de bulunuyor", Math.abs(vurguAni(kelimeler, "BEKCILERI", SURE) - kelimeler[2].start) < 0.001);
  const yok = vurguAni(kelimeler, "olmayankelime", SURE);
  kontrol("bulunamayan vurgu makul ana dusuyor", yok > SURE * 0.5 && yok < SURE, String(yok));
}

// ==================== 9. Aksan öğesi vurguyla gelir ====================
{
  const K = makeCanvas("16:9");
  let denendi = 0, dogru = 0;
  const vT = vurguAni(kelimeler, "aylarca", SURE);
  for (let i = 0; i < 40; i++) {
    const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "aylarca", anahtar: "v" + i });
    const aksan = p.katmanlar.find((x) => x.tur === "gorsel" && x.girisSure === 0.34);
    if (!aksan) continue;
    denendi++;
    if (aksan.bas >= vT - 0.09) dogru++;
  }
  kontrol("aksan ogesi vurgu aninda geliyor", denendi > 0 && dogru === denendi, dogru + "/" + denendi);
}

// ==================== 10. Hiyerarşi ====================
{
  let ihlal = 0, sahne = 0;
  for (const oran of ["16:9", "9:16"]) {
    const K = makeCanvas(oran);
    for (let i = 0; i < 40; i++) {
      const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "kimse", anahtar: "h" + i });
      const g = p.katmanlar.filter((x) => x.tur === "gorsel");
      if (g.length < 2) continue;
      sahne++;
      const hero = g.find((x) => x.girisSure === 0.62);
      if (!hero) { ihlal++; continue; }
      if (g.some((x) => x !== hero && x.bas < hero.bas - 1e-6)) ihlal++;
    }
  }
  kontrol("hero ilk giren (" + sahne + " sahne)", ihlal === 0, ihlal + " ihlal");
}

// ==================== 11. Süreler ====================
{
  let tasan = 0;
  for (const oran of ["16:9", "9:16", "1:1"]) {
    const K = makeCanvas(oran);
    for (let i = 0; i < 40; i++) {
      const p = planScene({ kanvas: K, sure: SURE, kelimeler, medya, vurgu: "bugün", anahtar: "t" + i });
      for (const L of p.katmanlar.filter((x) => x.tur === "gorsel")) {
        if (L.bas + L.sure > SURE + 1e-6 || L.sure <= 0) tasan++;
      }
    }
  }
  kontrol("katman sureleri sahneyi asmiyor", tasan === 0, tasan + " tasma");
}

// ==================== 12. Eksik medyaya dayanıklılık ====================
{
  const K = makeCanvas("9:16");
  kontrol("medya yoksa patlamiyor",
    Array.isArray(planScene({ kanvas: K, sure: SURE, kelimeler, medya: {}, vurgu: "tek", anahtar: "x" }).katmanlar));
  kontrol("tek medyayla calisiyor",
    planScene({ kanvas: K, sure: SURE, kelimeler, medya: { hero: "h.png" }, vurgu: "tek", anahtar: "y" })
      .katmanlar.filter((x) => x.tur === "gorsel").length === 1);
  const sessiz = planScene({ kanvas: K, sure: SURE, kelimeler: [], medya, vurgu: null, anahtar: "z" });
  kontrol("kelime zamani yoksa calisiyor", sessiz.katmanlar.filter((x) => x.tur === "gorsel").length >= 1);
  kontrol("kelime yoksa yazi katmani da yok", !sessiz.katmanlar.some((x) => x.tur === "yazi"));
}

// ==================== 13. Vurgu kelimesi seçimi ====================
{
  kontrol("emphasis keyword onceligi", vurguSec("bir sey", { type: "keyword", value: "DEVRIM" }) === "DEVRIM");
  kontrol("emphasis stat onceligi", vurguSec("bir sey", { type: "stat", value: "%73" }) === "%73");
  kontrol("zayif kelimeler elenir (ASCII)", vurguSec("cunku fakat gibi daha", null) === null,
    String(vurguSec("cunku fakat gibi daha", null)));
  kontrol("zayif kelimeler elenir (diakritikli)", vurguSec("çünkü fakat gibi ancak", null) === null,
    String(vurguSec("çünkü fakat gibi ancak", null)));
  const c = "Deniz feneri bekcileri aylarca yalnizdi ve sonunda hepsi terkedildi";
  const kl = c.split(/\s+/);
  const v = vurguSec(c, null);
  const yer = kl.indexOf(v) / (kl.length - 1);
  kontrol("vurgu cumlenin ikinci yarisinda", yer >= 0.45, v + " @ " + yer.toFixed(2));
  kontrol("bos metin null doner", vurguSec("", null) === null);
}

console.log(hata === 0 ? "\nTUM KURALLAR GECTI" : "\n" + hata + " KURAL IHLALI");
process.exit(hata ? 1 : 0);
