// SÜRE HEDEFİ — konuşma temposu kalibrasyonu.
//
// SORUN: "3 dakika" istenen video 4 dk 31 sn çıkıyordu (hedefin %151'i).
// 22 bitmiş iş ölçüldü:
//
//   ön ayar      n    gerçek wpm   bütçe uyumu   süre (hedefin %'si)
//   test         5      109,4         %101            132
//   kisa        12      109,4          %97            127
//   uzunformat   2      117,1          %85            100
//
// İki bulgu:
//   1) config.js'teki 140 wpm varsayımı Türkçede gerçekte ~110. Kısa formatta
//      hatanın tamamı bu.
//   2) Uzun formatta senaryo bütçenin %85'ini yazıyor ve bu, yüksek wpm
//      varsayımını TESADÜFEN dengeliyor — o yüzden orada hedef tutuyordu.
//      Aynı düzeltmeyi oraya da uygulamak %100'ü %79'a düşürürdü.
//
// Bu yüzden kısa/uzun ayrı kalibre ediliyor ve sistem her işten öğreniyor.
// GERİ TEST (aynı uyum ve hız varsayımıyla, 20 gerçek iş):
//   kisa:  %127 -> %102   ·   TR kısa formatta sapma %28 -> %5
//   uzun:  değişmedi (bilerek)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Gerçek kalibrasyon dosyasına DOKUNMA — testler kullanıcının verisini bozmamalı.
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tempo-"));
process.env.NOVA_TEMPO_DOSYA = path.join(gecici, "tempo.json");

const { varsayilanWpm, tahminWpm, olcumEkle, tempoOzeti, ortanca, VARSAYILAN, YETER_ORNEK } =
  await import("../src/pipeline/tempo.js");

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};
const sifirla = () => { try { fs.rmSync(process.env.NOVA_TEMPO_DOSYA, { force: true }); } catch {} };

// ---------- 1. Ölçülen varsayılanlar ----------
kontrol("TR kisa format 110 wpm (olculdu, n=17)", varsayilanWpm("tr", 3) === 110, String(varsayilanWpm("tr", 3)));
// UZUN FORMAT YENIDEN KALIBRE. 140, senaryonun butcenin %85'ini yazdigi ESKI
// davranisa gore dogruydu; eksiklik yuksek katsayiyi dengeliyordu. Segment
// sayisi artik kesin dille isteniyor ve CANLI olcumde uyum %96 cikti
// (8/8 segment, 336/350 kelime). Denge bozulunca 140 ile 10 dk video %115'e
// cikiyor. Olculen hiz 117 wpm ile dogru katsayi 117/0,96 = 122.
kontrol("TR uzun format 122'ye cekildi (uyum %85 -> %96)",
  varsayilanWpm("tr", 10) === 122, String(varsayilanWpm("tr", 10)));
{
  const wpm = 117, uyum = 0.96;
  const sure = (c) => ((uyum * 10 * c) / wpm) / 10;
  kontrol("140 ile 10 dk video %115 olurdu", Math.round(sure(140) * 100) === 115, (sure(140)*100).toFixed(0));
  kontrol("122 ile %100'e oturuyor", Math.abs(sure(122) - 1) < 0.02, (sure(122)*100).toFixed(0) + "%");
}
kontrol("3 dk KISA sayiliyor", varsayilanWpm("tr", 3) === VARSAYILAN.kisa.tr);
kontrol("4 dk UZUN sayiliyor", varsayilanWpm("tr", 4) === VARSAYILAN.uzun.tr);
// EN bir ara 165'e ÇIKARILMIŞTI ve bu yanlıştı: yalnızca ölçülen hıza (170)
// bakılıp bütçe uyumu (%108) atlanmıştı. Belirleyici olan etkin katsayı
// wpm/uyum = 146; 165 ile 3 dakikalık örnek %106'dan %113'e kötüleşiyordu.
kontrol("EN 165'ten geri cekildi (o duzeltme ters yondeydi)",
  varsayilanWpm("en", 3) < 155, String(varsayilanWpm("en", 3)));
kontrol("bilinmeyen dil TR'ye dusuyor", varsayilanWpm("de", 3) === 110);

// ---------- 2. Bütçe gerçekten düştü ----------
{
  const eski = (dk) => Math.round(dk * 140);
  const yeni = (dk) => Math.round(dk * varsayilanWpm("tr", dk));
  kontrol("3 dk butcesi 420 -> 330", eski(3) === 420 && yeni(3) === 330, `${eski(3)} -> ${yeni(3)}`);
  kontrol("10 dk butcesi 1400 -> 1220", yeni(10) === 1220, String(yeni(10)));
  // Ölçülen: 3 dk hedef, 4:31 (271 sn) çıktı = %151.
  // Bütçe 420 -> 330 (x0,7857) ise süre de aynı oranda düşer.
  kontrol("volkan videosu %151 -> ~%119'a inerdi (tek basina butce duzeltmesi)",
    Math.abs((271 / 180) * (330 / 420) * 100 - 119) < 2,
    ((271 / 180) * (330 / 420) * 100).toFixed(0) + "%");
}

// ---------- 3. Ölçüm biriktirme ----------
sifirla();
{
  kontrol("olcum yokken varsayilan kullaniliyor", tahminWpm("tr", "ses1", 3) === 110);

  // butce/dk = ETKİN wpm: hem konuşma hızını hem bütçe uyumunu içerir.
  // 330 bütçe, 180 sn (tam hedef) -> 330/3 = 110
  const r = olcumEkle({ lang: "tr", sesId: "ses1", kelime: 320, saniye: 180, butce: 330, dakika: 3 });
  kontrol("olcum kabul edildi", r !== null && Math.abs(r.etkin - 110) < 0.5, JSON.stringify(r));
  kontrol("ham konusma hizi da donuyor", Math.abs(r.ham - 106.7) < 1, String(r.ham?.toFixed(1)));

  kontrol("tek olcumle henuz ogrenmiyor", tahminWpm("tr", "ses1", 3) === 110);
  olcumEkle({ lang: "tr", sesId: "ses1", kelime: 320, saniye: 200, butce: 330, dakika: 3 });
  kontrol("iki olcumle de ogrenmiyor", tahminWpm("tr", "ses1", 3) === 110);
  olcumEkle({ lang: "tr", sesId: "ses1", kelime: 320, saniye: 200, butce: 330, dakika: 3 });
  const t = tahminWpm("tr", "ses1", 3);
  kontrol(`${YETER_ORNEK} olcumden sonra OGRENIYOR`, t !== 110 && t > 90 && t < 110, String(t.toFixed(1)));
  kontrol("ozet dogru rapor ediyor", tempoOzeti("tr", "ses1", 3).ogrenildi === true);
}

// ---------- 4. Kısa ve uzun ölçümler BİRBİRİNE KARIŞMIYOR ----------
sifirla();
{
  for (let i = 0; i < 4; i++) olcumEkle({ lang: "tr", sesId: "s", kelime: 300, saniye: 200, butce: 330, dakika: 3 });
  kontrol("kisa formatta ogrenildi", tempoOzeti("tr", "s", 3).ogrenildi === true);
  kontrol("UZUN format etkilenmedi", tahminWpm("tr", "s", 10) === 122, String(tahminWpm("tr", "s", 10)));
  kontrol("baska ses etkilenmedi", tahminWpm("tr", "baska", 3) === 110);
}

// ---------- 5. Bozuk ölçümler kalibrasyonu zehirlemiyor ----------
sifirla();
{
  const red = [
    ["cok az kelime", { kelime: 10, saniye: 100, butce: 330, dakika: 3 }],
    ["cok kisa sure", { kelime: 300, saniye: 5, butce: 330, dakika: 3 }],
    ["imkansiz hizli", { kelime: 300, saniye: 30, butce: 330, dakika: 3 }],
    ["sifir sure", { kelime: 300, saniye: 0, butce: 330, dakika: 3 }],
  ];
  for (const [ad, o] of red) {
    kontrol(`reddediliyor: ${ad}`, olcumEkle({ lang: "tr", sesId: "z", ...o }) === null);
  }
  kontrol("bozuk olcumler kaydedilmedi", tempoOzeti("tr", "z", 3).ornek === 0);

  // Bütçe bilinmiyorsa ham hıza düşülür — çökmemeli.
  const r = olcumEkle({ lang: "tr", sesId: "z2", kelime: 300, saniye: 180, dakika: 3 });
  kontrol("butce yoksa ham hiza dusuluyor", r && Math.abs(r.etkin - 100) < 0.5, JSON.stringify(r));
}

// ---------- 6. Ortanca yardımcısı ----------
kontrol("ortanca tek sayida", ortanca([3, 1, 2]) === 2);
kontrol("ortanca cift sayida", ortanca([1, 2, 3, 4]) === 2.5);
kontrol("bos dizi null", ortanca([]) === null);

// ---------- 7. Boru hattı bağlantısı ----------
{
  const s = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  const i = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
  const c = fs.readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
  kontrol("butce tahminWpm'den geliyor",
    /minutes \* tahminWpm\(job\.language, job\.elevenVoiceId \|\| job\.voiceId, minutes\)/.test(s));
  kontrol("script.js artik sabit wordsPerMinute kullanmiyor", !/wordsPerMinute/.test(s));
  kontrol("config.js tek kaynaktan okuyor", /return varsayilanWpm\(lang\)/.test(c));
  kontrol("her isten olcum aliniyor", /olcumEkle\(\{ lang: job\.language, sesId, kelime, saniye: speech, butce, dakika: hedefDk \}\)/.test(i));
  kontrol("kalibrasyon isi durdurmuyor (try/catch)",
    /catch \{ \/\* kalibrasyon işi durdurmaz \*\//.test(i));
  kontrol("gunluge tempo yaziliyor", /Tempo: \$\{olculen\.ham/.test(i));
}


// ---------- 8. UZUNLUK BANTLARI ----------
// Çok kısa işler ayrı rejim: bütçe küçüldükçe model bütçenin ÜSTÜNE çıkıyor.
// Ölçüldü — 1 dakikalık işte bütçe uyumu TR %98, EN %156. Bu ölçümler
// 3 dakikalıkların kalibrasyonuna karışırsa ikisi de bozulur.
{
  kontrol("1 dk MINI banda dusuyor", varsayilanWpm("en", 1) === VARSAYILAN.mini.en);
  kontrol("3 dk KISA banda dusuyor", varsayilanWpm("en", 3) === VARSAYILAN.kisa.en);
  kontrol("10 dk UZUN banda dusuyor", varsayilanWpm("tr", 10) === VARSAYILAN.uzun.tr);

  // EN düzeltmesi: bir ara 165'e çıkarılmıştı — hız ölçümüne bakılıp bütçe
  // uyumu atlandığı için YANLIŞ yöndeydi. Etkin katsayı wpm/uyum = 146.
  kontrol("EN kisa 146 (etkin katsayidan)", varsayilanWpm("en", 3) === 146, String(varsayilanWpm("en", 3)));
  kontrol("EN artik 165 DEGIL (o duzeltme tersti)", varsayilanWpm("en", 3) !== 165);
  // 3 dk EN örneği: 501 kelime / 191,07 sn. Katsayı 146 ile hedefi tam tutmalı.
  {
    const kelime = 501, sure = 191.07, dk = 3, eskiButce = 3 * 155;
    const wpm = kelime / (sure / 60), uyum = kelime / eskiButce;
    const yeni = (uyum * dk * 146) / wpm / dk;
    kontrol("EN 3dk ornegi %100'e oturuyor", Math.abs(yeni - 1) < 0.02, "%" + (yeni * 100).toFixed(0));
  }

  // Bantlar birbirini kirletmemeli.
  sifirla();
  for (let i = 0; i < 4; i++) olcumEkle({ lang: "tr", sesId: "b", kelime: 120, saniye: 62, butce: 110, dakika: 1 });
  kontrol("mini bantta ogrenildi", tempoOzeti("tr", "b", 1).ogrenildi === true);
  kontrol("KISA bant etkilenmedi", tahminWpm("tr", "b", 3) === 110, String(tahminWpm("tr", "b", 3)));
  kontrol("UZUN bant etkilenmedi", tahminWpm("tr", "b", 10) === 122, String(tahminWpm("tr", "b", 10)));
}

// ---------- 9. BÖLÜM UZUNLUK DENETİMİ ----------
// Ölçüldü: aynı 10 dk isteğinde bir iş bölüm başına 4 segment/100 kelime,
// başkası 12 segment/300 kelime üretti. Segment başına kelime ikisinde de ~25;
// süreyi doğrudan segment SAYISI belirliyor ve model onu tutmuyordu.
{
  const sc = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  // Düz metin araması: bu dizgeler `${...}` ve `*` gibi regex'te anlam taşıyan
  // karakterler içeriyor, kaçırmak yerine olduğu gibi aranıyor.
  const var_ = (x) => sc.includes(x);
  kontrol("bolum alt siniri tanimli", var_("const BOLUM_ALT_SINIR = 0.70"));
  kontrol("uzunluk kurali promptta KESIN diye yaziyor", var_("BU KURAL KESİN"));
  kontrol("segment sayisi promptta acikca isteniyor",
    var_("Bu bölüm TAM ${segPerSection} segment olacak"));
  // Koşul bir döngü içine alındı (boş dönen bölüme ikinci hak verilebilsin
  // diye); aranan şey hâlâ aynı: hedefin altındaysa yeniden istenir.
  kontrol("kisa bolum yeniden isteniyor",
    var_("kelime >= plan.wordsPerSection * BOLUM_ALT_SINIR) break;"));
  kontrol("modele ONCEKI DENEME sayilari veriliyor",
    var_("ÖNCEKİ DENEME ${segmentler.length} segment"));
  kontrol("ikinci deneme daha KISA gelirse eldeki korunuyor",
    var_("if (say(yeni) > kelime) { segmentler = yeni; kelime = say(yeni); }"));
  kontrol("tekrar patlarsa is durmuyor", var_("yeniden yazılamadı"));
  // Satirin sonuna capa yuzdesi eklendi (bolum somutlugu olculuyor), o yuzden
  // kapanis parantezi artik hemen "kelime"den sonra gelmiyor.
  kontrol("gunluge segment ve kelime yaziliyor",
    var_("(${segmentler.length} segment, ${kelime} kelime"));
  kontrol("gunluge bolum capa orani da yaziliyor",
    var_("çapa %${Math.round(oran * 100)}"));

  // Eşik gerçek verilerle: %28 yakalanmalı, %85 yakalanmamalı.
  const tetikler = (oran) => oran < 0.70;
  kontrol("basarisiz is (%28) yakalaniyor", tetikler(392 / 1400) === true);
  kontrol("basarili is (%85) BOSUNA tetiklenmiyor", tetikler(1192 / 1400) === false);
  kontrol("normal sapma (%97) tetiklenmiyor", tetikler(0.97) === false);
}


// ---------- 10. YAPISAL TABAN ----------
// EN 1 dakikalık iş %124 çıkıyordu ve bu bir "model kaprisi" DEĞİLDİ:
//   sectionCount = max(3, ...) -> 1 dk icin bile 3 bolum
//   segPerSection = max(2, ...) -> bolum basina 2 segment
//   toplam 6 segment x 23 kelime (olculen taban) = 138 kelime = 1,25 dk
// Yani "1 dakika" hedefi ULASILAMAZDI; hicbir prompt duzeltemezdi.
// 3 bolum tabani YouTube bolum isaretleri icin vardi, kisa videoda anlamsiz.
{
  const { planSections } = await import("../src/pipeline/script.js");
  const pl = (on, dil = "tr") => planSections({ durationPreset: on, language: dil });

  const bir = pl("test");
  kontrol("1 dk artik 3 bolum ZORLAMIYOR", bir.sectionCount < 3, String(bir.sectionCount));
  kontrol("1 dk en az 1 bolum", bir.sectionCount >= 1, String(bir.sectionCount));
  kontrol("1 dk yapisal taban HEDEFIN ALTINDA",
    bir.enAzKelime < bir.totalWords, bir.enAzKelime + " < " + bir.totalWords);

  // Uzun formatlarda 3 bolum tabani KORUNMALI (chapter icin gerekli).
  for (const on of ["kisa", "standart", "uzunformat", "derin"]) {
    const x = pl(on);
    kontrol(on + " en az 3 bolum (chapter icin)", x.sectionCount >= 3, String(x.sectionCount));
    kontrol(on + " tabani hedefi kisitlamiyor", x.enAzKelime < x.totalWords,
      x.enAzKelime + " < " + x.totalWords);
  }

  kontrol("segment sayisi plandan geliyor (tek kaynak)",
    Number.isFinite(pl("kisa").segPerSection) && pl("kisa").segPerSection >= 2);
  kontrol("EN 1 dk de ulasilabilir", pl("test", "en").enAzKelime < pl("test", "en").totalWords);

  const sc = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  kontrol("segPerSection iki yerde ayri hesaplanmiyor",
    !sc.includes("Math.max(2, Math.round(plan.wordsPerSection / 45))"));
  kontrol("ulasilamaz hedef kullaniciya bildiriliyor",
    sc.includes("video hedeften biraz uzun çıkabilir"));
}
// ---------- 11. TEMPO KORUNUYOR ----------
// segPerSection eskiden kelime butcesine bagliydi (wordsPerSection / 45).
// Butceyi 420'den 330'a cekince bolum basina segment sessizce 3'ten 2'ye
// dusuyordu: ayni sure daha az sahneye bolunur, sahneler uzar, tempo yavaslar.
// Sure hedefini duzeltirken kurguyu bozmamak icin segment sayisi artik
// TEMPODAN hesaplaniyor (~22 sn/segment).
{
  const { planSections } = await import("../src/pipeline/script.js");
  const sn = (on, dk) => {
    const p = planSections({ durationPreset: on, language: "tr" });
    return (dk * 60) / (p.sectionCount * p.segPerSection);
  };
  kontrol("3 dk: eski tempo korundu (9 segment / 20 sn)",
    Math.abs(sn("kisa", 3) - 20) < 0.5, sn("kisa", 3).toFixed(1) + " sn");
  for (const [on, dk] of [["kisa", 3], ["standart", 8], ["uzunformat", 10], ["derin", 20]]) {
    const x = sn(on, dk);
    kontrol(on + " segment temposu 18-25 sn arasi", x >= 18 && x <= 25, x.toFixed(1) + " sn");
  }
  const sc = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  // Eski KOD biçimi aranıyor; "wordsPerSection / 45" ifadesi açıklama
  // yorumunda hâlâ geçiyor (neden değiştiğini anlatmak için).
  kontrol("segment sayisi artik butceye bagli DEGIL",
    !sc.includes("Math.round(wordsPerSection / 45)"));
  kontrol("segment sayisi tempodan hesaplaniyor",
    sc.includes("Math.round(wordsPerSection / wordsPerSegment)"));
  kontrol("tempo sabiti tanimli", sc.includes("const SEGMENT_SANIYE = 22"));
}

try { fs.rmSync(gecici, { recursive: true, force: true }); } catch {}
console.log(hata === 0 ? "\nTEMPO TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
