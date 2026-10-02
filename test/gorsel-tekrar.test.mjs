// GÖRSEL TEKRARI ve KADRAJ KALİTESİ.
//
// Bitmiş videoda (volkan, 4,5 dk) ölçülen üç kusur:
//
// 1) AYNI GÖRSEL İKİ KEZ. 1 fps örneklenip normalize korelasyonla tarandı:
//      portre     195s <-> 215s   (0,996)
//      termal     217s <-> 238s   (0,998)
//      kül bulutu 245s <-> 267s   (0,997)
//      lav akışı   74s <->  87s   (0,990)
//    Dördü de aynı segmentin b0/b3'ü. Sebep: HAREKET_TAVAN 4 sahne açıyordu
//    ama segment başına yalnızca visuals.length (3) medya iniyor. `media[s{i}b3]`
//    bulunamayınca kod kardeş aramaya düşüyor, en yüksek puanlı kardeş de hep
//    b0 olduğu için son sahne ilk sahneyi tekrar ediyordu.
//
// 2/3) KADRAJ. 217s'deki kare termal kamera MONİTÖRÜNÜN eğik çekilmiş videosu:
//    sağ yarısı karanlık boş oda, sol yarısı yanmış sarı ekran. Denetimden
//    alaka 3 (tam isabet) almıştı — çünkü konu gerçekten doğruydu. Alaka
//    "doğru konu mu", kalite "ekranda iyi durur mu" sorusudur; ayrı ölçülmeli.
//
// Bu test üç korumanın da yerinde durduğunu kilitler — ağ/render gerektirmez.
import fs from "node:fs";
import {
  GORSEL_ESIGI, ARKA_GORSEL_ESIGI, ARKA_KALITE_ESIGI, KESIK_KALITE_ESIGI,
} from "../src/pipeline/gorseldenetim.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
const g = fs.readFileSync(new URL("../src/pipeline/gorseldenetim.js", import.meta.url), "utf8");
const i = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
const ap = fs.readFileSync(new URL("../src/pipeline/arkaplan.js", import.meta.url), "utf8");

// Seçim davranışının kendisi arkaplan-secim.test.mjs'te KODU ÇALIŞTIRARAK
// sınanıyor. Burada yalnızca bağlantıların yerinde durduğu kilitleniyor.

// ---------- 1. Sahne sayısı elindeki medyayı aşamaz ----------
// Tavan `durum`u da alıyor: videoda ZATEN gösterilmiş kaynaklar sayılmaz.
// Aksi hâlde segment 3 görsele sahip görünüp biri başka segmentte kullanılmışsa
// 3 sahne açılıyor ve sonuncusunda tekrar kaçınılmaz oluyordu (gerçek vaka:
// Rupite kilisesi üç segmentte indirilmiş, videoda üç kez çıkmıştı).
kontrol("medya tavani kardesleriBul ile olculuyor",
  r.includes("const medyaTavan = Math.max(1, kardesleriBul(media, f.index, durum, f.text).length)"));
kontrol("hareket modunda sahne sayisi medyayla sinirli",
  /Math\.min\(HAREKET_TAVAN, medyaTavan, Math\.round\(f\.dur \/ HAREKET_HEDEF\)\)/.test(r));
// Klasik dalda tavan artık `f.visuals.length` değil `klasikTavan`: stilin hedef
// kesme süresi varsa sahne sayısı SÜREDEN hesaplanıyor (ölçüldü: Vox stili
// 3-4 sn vaat ederken gerçek ortalama 8,95 sn çıkıyordu). Ama `medyaTavan`
// KORUNMALI — asıl tekrar koruması odur: elinde 3 resim varken 6 sahne açmak,
// aynı resmi ikinci kez göstermek demektir.
kontrol("diger modda da sinirli",
  /Math\.min\(klasikTavan, medyaTavan, Math\.floor\(f\.dur \/ MIN_BEAT\)\)/.test(r));
kontrol("sahne sayisi sureden hesaplaniyor",
  /const sureTabanli = hedefKesme \? Math\.round\(f\.dur \/ hedefKesme\) : 0/.test(r),
  "sabit sahne sayisi stilin vaat ettigi tempoyu tutturamiyordu");
kontrol("medya tavani hala ust sinir",
  /const klasikTavan = Math\.max\(f\.visuals\.length, sureTabanli\)/.test(r) &&
  /medyaTavan/.test(r),
  "medya tavani kalkarsa ayni gorsel iki kez ekrana gelir");

// Gerçek sayılarla. 4. sahne Math.round(dur/6.5) >= 4 olunca açılıyor, yani
// segment 22,75 sn'yi aşınca. Videonun ortalaması 271/12 = 22,6 sn — tam bu
// sınırın dibinde; segmentlerin bir kısmı aşıyor. Ölçülen 4 tekrarın 12
// segmentten çıkması bununla birebir tutarlı.
{
  const HAREKET_TAVAN = 4, HAREKET_HEDEF = 6.5;
  const eski = (dur) => Math.max(1, Math.min(HAREKET_TAVAN, Math.round(dur / HAREKET_HEDEF)));
  const yeni = (dur, medya) =>
    Math.max(1, Math.min(HAREKET_TAVAN, Math.max(1, medya), Math.round(dur / HAREKET_HEDEF)));

  kontrol("4. sahne esigi 22,75 sn", eski(22.7) === 3 && eski(22.8) === 4,
    `${eski(22.7)} / ${eski(22.8)}`);
  kontrol("24sn/3medya: ESKIDEN 4 sahne aciliyordu (tekrarin kaynagi)",
    eski(24) === 4, String(eski(24)));
  kontrol("24sn/3medya: ARTIK 3 sahne — 4.'ye resim yok, acilmiyor",
    yeni(24, 3) === 3, String(yeni(24, 3)));
  kontrol("medya bolca ise tavan yine 4", yeni(30, 6) === 4, String(yeni(30, 6)));
  kontrol("tek medya varsa tek sahne", yeni(24, 1) === 1, String(yeni(24, 1)));
  kontrol("hic medya yoksa yine 1 sahne (kart)", yeni(24, 0) === 1, String(yeni(24, 0)));
  // Kısa segment zaten tavana ulaşmıyor — düzeltme onu etkilememeli.
  kontrol("kisa segment etkilenmiyor", yeni(13, 3) === eski(13), `${yeni(13, 3)} vs ${eski(13)}`);
}

// ---------- 2. Kardeş seçimi: hiç kullanılmamış ÖNCE ----------
{
  const blok = ap.slice(ap.indexOf("kardesler.sort"), ap.indexOf("kardesler.sort") + 800);
  const sonDosya = blok.indexOf("=== durum.sonDosya ? 1 : 0");
  const kullanim = blok.indexOf("durum.kullanim.get(kimlik(x))");
  const puan = blok.indexOf("(y.gorsel ?? 1)");
  kontrol("once bir onceki sahnenin dosyasi elenir", sonDosya >= 0 && sonDosya < kullanim);
  kontrol("SONRA hic kullanilmamis tercih edilir (puandan ONCE)",
    kullanim >= 0 && puan >= 0 && kullanim < puan,
    `kullanim@${kullanim} puan@${puan}`);
  kontrol("tekrar yasagi ARDISIK ile sinirli degil",
    /!kullanildi\(own\)/.test(ap));
  kontrol("secim render.js'ten arkaplan.js'e tasindi",
    /arkaPlanSec\(media, segIdx, b, durum, narration\)/.test(r) && !/kardesler\.sort/.test(r));
}

// ---------- 3. Kalite ekseni ----------
kontrol("arka plan kalite esigi tanimli", ARKA_KALITE_ESIGI === 1, String(ARKA_KALITE_ESIGI));
kontrol("kesik kalite esigi daha kati", KESIK_KALITE_ESIGI > ARKA_KALITE_ESIGI,
  `${KESIK_KALITE_ESIGI} > ${ARKA_KALITE_ESIGI}`);
kontrol("alaka esikleri degismedi", GORSEL_ESIGI === 2 && ARKA_GORSEL_ESIGI === 1);

kontrol("semada kalite alani var", /kalite: \{\s*\n?\s*type: "integer"/.test(g));
// Zorunlu alanlara sonradan kamera alanları eklendi (kadraj/odak — bkz.
// kamera.js). Kontrol listenin tamamını değil, KALİTENİN zorunlu kalmasını
// kilitliyor: bu alan düşerse kötü kadrajlı görsel tam ekrana çıkar.
kontrol("kalite zorunlu alan", /required: \[[^\]]*"kalite"[^\]]*\]/.test(g));
kontrol("promptta kalite ALAKADAN BAGIMSIZ deniyor", /bu ALAKADAN BAĞIMSIZDIR/.test(g));
kontrol("promptta ekrandan cekilmis ornegi var", /EKRANDAN\/MONİTÖRDEN çekilmiş/.test(g));
kontrol("promptta iki puanin ayrildigi ornek var", /Alaka 3, KALİTE 1/.test(g));
kontrol("kalite gelmezse 2 varsayiliyor",
  /Number\.isFinite\(s\?\.kalite\) \? s\.kalite : 2/.test(g));

// ---------- 3b. JSON ŞABLONUNDA SABİT PUAN OLMAMALI ----------
// Ölçüldü (canlı, aynı 3 görsel, tek değişken): şablonda "puan":0 yazarken
// model onu kopyalıyordu ve sorguyla BİREBİR örtüşen görseller bile 0 alıyordu.
//   önce: kül 0 · sentetik 0 · termal 0
//   sonra: kül 3 · sentetik 3 · termal 3   (kalite 3 / 1 / 2 — doğru ayrışıyor)
// Bu hesapta şema uygulanmadığı için şablon TEK sözleşme; sabit değer yazmak
// doğrudan çıktıyı bozuyor.
{
  const satir = (g.match(/\{"sonuclar":\[\{[^\n]*/) || [""])[0];
  kontrol("sablonda puan icin sabit deger YOK", !/"puan":\s*\d/.test(satir), satir);
  kontrol("sablonda kalite icin sabit deger YOK", !/"kalite":\s*\d/.test(satir), satir);
  kontrol("sablonda kalite alani VAR", /"kalite":/.test(satir), satir);
  kontrol("sablonda yer tutucu kullanilmis", /<0-3/.test(satir), satir);
}
kontrol("kalite 0-3 arasina kirpiliyor", /Math\.max\(0, Math\.min\(3, Number\.isFinite\(s\?\.kalite\)/.test(g));

// ---------- 4. Kapılar ----------
kontrol("arka plan kapisi kaliteyi de bakiyor",
  /!\(Number\.isFinite\(m\.kalite\) && m\.kalite < ARKA_KALITE_ESIGI\)/.test(ap));
kontrol("kose kesigi kapisi kaliteyi de bakiyor",
  /if \(Number\.isFinite\(m\.kalite\) && m\.kalite < KESIK_KALITE_ESIGI\) continue;/.test(r));
// Denetim hiç çalışmadıysa (eski işler) alan yoktur — kapı UYGULANMAMALI.
kontrol("denetimsiz medya arka plan kapisina takilmiyor",
  /Number\.isFinite\(m\.kalite\)/.test(ap) && /Number\.isFinite\(m\.gorsel\)/.test(ap));
kontrol("denetimsiz medya kose kapisina takilmiyor",
  /Number\.isFinite\(m\.kalite\)/.test(r));

// ---------- 5. Kalite kaydediliyor ve yedek aramayi tetikliyor ----------
kontrol("kalite media kaydina yaziliyor", /media\[beatId\]\.kalite = p\.kalite/.test(i));
kontrol("yedek turunda kalite de kayitlaniyor", /kalite: p\.kalite, gorunen: p\.gorunen/.test(i));
kontrol("kotu kadraj yedek aramayi tetikliyor",
  /Number\.isFinite\(m\.kalite\) && m\.kalite < ARKA_KALITE_ESIGI\)\)\);/.test(i));
kontrol("kullanilamaz kadraj yerine GECEMEZ",
  /p\.kalite >= ARKA_KALITE_ESIGI &&/.test(i));
kontrol("esit alakada daha iyi kadraj kazanir",
  /p\.puan === \(eski\?\.gorsel \?\? -1\) && p\.kalite > \(eski\?\.kalite \?\? -1\)/.test(i));

// ---------- 6. Arayüz kadrajı gösteriyor ----------
{
  const a = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  kontrol("secim ekraninda kadraj rozeti var", /kadraj \$\{d\.kalite\}\/3/.test(a));
  kontrol("kotu kadrajli kart 'sorunlu' isaretleniyor",
    /Number\.isFinite\(d\.kalite\) && d\.kalite < 2/.test(a));
  kontrol("ozet metni kadraji da kapsiyor", /konu ya da kadraj/.test(a));
}

console.log(hata === 0 ? "\nGORSEL TEKRAR TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
