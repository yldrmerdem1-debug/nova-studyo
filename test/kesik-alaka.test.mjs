// KENARDAKI KESIK ALAKALI MI?
//
// Gercek bir videoda olculen ve gozle dogrulanan hatalar:
//   "Japon robot Kaiko"  -> kosede bir KEDI
//   "su sicakligi"       -> kosede TANSIYON ALETI
//   "HMS Challenger 1875"-> kosede Sarm El Seyh resifi
// Sebep: kesik salt dondurme indeksiyle seciliyordu, alaka hic olculmuyordu.
// Bu test o davranisin geri gelmedigini kanitlar. Ag/model gerektirmez.
import { renderAll } from "../src/pipeline/render.js";
import { planScene } from "../src/pipeline/director.js";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { alakaPuani } from "../src/pipeline/media.js";
import { GORSEL_ESIGI, ARKA_GORSEL_ESIGI } from "../src/pipeline/gorseldenetim.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------- 1. Esikler tutarli mi ----------
kontrol("kenar esigi arka plan esiginden KATI", GORSEL_ESIGI > ARKA_GORSEL_ESIGI,
  `kenar=${GORSEL_ESIGI} arka=${ARKA_GORSEL_ESIGI}`);
kontrol("arka plan esigi 0'i (hic ilgisi yok) reddediyor", ARKA_GORSEL_ESIGI > 0);

// ---------- 2. alakaPuani gercek vakalarda dogru yonde mi ----------
{
  // Sagladigi tek sey siralama: tam isabet, yuzeysel eslesmeden yuksek olmali.
  const havuz = [
    { metin: "Collecting Multibeam Sonar Data data hydrography map mapping" },
    { metin: "shark, deep sea, oceanic, whitetip shark" },
  ];
  const dogru = alakaPuani("multibeam sonar seafloor mapping", havuz[0].metin, havuz);
  const yanlis = alakaPuani("multibeam sonar seafloor mapping", havuz[1].metin, havuz);
  kontrol("isabetli baslik, alakasizdan yuksek puan aliyor", dogru > yanlis,
    `dogru=${dogru.toFixed(3)} yanlis=${yanlis.toFixed(3)}`);
  kontrol("bos metin sifir puan aliyor", alakaPuani("deep sea submersible", "", havuz) === 0);
  kontrol("bos sorgu patlamiyor", alakaPuani("", "shark deep sea", havuz) === 0);
}

// ---------- 3. Alakasiz kesik SAHNEYE GIRMIYOR ----------
// renderAll'i calistirmak agir; kesikSec dogrudan disari acilmiyor. Bunun yerine
// planScene'in bos medyada da sahneyi kurdugunu ve alakasiz kaynak verilmediginde
// gorsel katmani URETMEDIGINI dogrula.
{
  const K = makeCanvas("16:9");
  const kelime = "Mariana Cukuru on bir kilometre derinlikte".split(/\s+/)
    .map((s, i) => ({ t: s, start: +(0.3 + i * 0.4).toFixed(2) }));

  const bos = planScene({
    kanvas: K, sure: 7, kelimeler: kelime, medya: {},   // hicbir kesik gecmedi
    vurgu: "11 km", anahtar: "a", tamEkran: true, yaziModu: "vurgu",
    arkaplan: { tur: "renk", renk: "0x11151c" },
  });
  const gorselKatman = bos.katmanlar.filter((k) => k.tur === "gorsel");
  kontrol("alakasiz aday elenince gorsel katmani URETILMIYOR", gorselKatman.length === 0,
    gorselKatman.length + " katman");
  kontrol("kesik olmasa da sahne yazisi duruyor", bos.katmanlar.some((k) => k.tur === "yazi"));

  const dolu = planScene({
    kanvas: K, sure: 7, kelimeler: kelime, medya: { destek: ["k1.png"], aksan: "k2.png" },
    vurgu: "11 km", anahtar: "a", tamEkran: true, yaziModu: "vurgu",
    arkaplan: { tur: "renk", renk: "0x11151c" },
  });
  kontrol("alakali aday verilince gorsel katmani cikiyor",
    dolu.katmanlar.some((k) => k.tur === "gorsel"));
}

// ---------- 4. render.js kesigi ALAKAYLA seciyor, dondurmeyle degil ----------
{
  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8"));

  kontrol("eski dondurme ifadesi kaldirildi",
    !/havuz\[\(b\.beatIndex \+ 1\) % havuz\.length\]/.test(kaynak));
  kontrol("kesikSec fonksiyonu var", /function kesikSec\(/.test(kaynak));
  kontrol("kesik secimi gorsel denetimi puanini KAPI olarak kullaniyor",
    /m\.gorsel < GORSEL_ESIGI\) continue/.test(kaynak));
  kontrol("arka plan videonun rastgele medyasina DUSMUYOR",
    !/return anyMedia \|\| own;/.test(kaynak));
  // Arka plan seçimi arkaplan.js'e taşındı (closure olduğu için test
  // edilemiyordu); davranışı arkaplan-secim.test.mjs kodu çalıştırarak sınıyor.
  {
    const ap = await import("node:fs").then((m) =>
      m.readFileSync(new URL("../src/pipeline/arkaplan.js", import.meta.url), "utf8"));
    kontrol("arka plan alakasizsa metin kartina dusuyor",
      /file: null, type: "card"/.test(ap));
  }
  kontrol("arka planla ayni kesik beatId ile eleniyor (alt-dizgi degil)",
    /id === arkaId/.test(kaynak) && !/s\.includes\(path\.basename\(arkaSrc/.test(kaynak));
}

// ---------- 5. media.js yedek kolu alakayi olcuyor ----------
{
  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/media.js", import.meta.url), "utf8"));

  kontrol("yedek havuz alaka esigiyle suzuluyor", /YEDEK_ESIGI/.test(kaynak));
  kontrol("yedek adaylar puana gore siralaniyor",
    /\.filter\(\(x\) => x\.a >= YEDEK_ESIGI\)/.test(kaynak));
  kontrol("indirilen medya KOKEN bilgisi tasiyor (sorgu/metin/alaka)",
    /sorgu: b\.visual\.query/.test(kaynak) && /alaka: \+metinOrtusme/.test(kaynak));
  kontrol("yedek aday indirme yolu disari acik", /export async function yedekAdayIndir/.test(kaynak));
}

// ---------- 6. Devam yolunda aday listesi kaybolmuyor ----------
{
  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8"));
  kontrol("kayitli senaryodan tum devam yollarinda beat turleri normalize ediliyor",
    /if \(validScript\(savedScript\)\)[\s\S]*?normalizeBeatTypes\(job, script\)/.test(kaynak));
  kontrol("gorsel denetimi hatta bagli", /gorselleriDenetle\(/.test(kaynak));
  kontrol("denetimden kalan gorsel icin yedek araniyor", /yedekAdayIndir\(/.test(kaynak));
}

// ---------- 7. Sorgu kisaltma: fazla dar sorgu arsivi bosa dusuruyordu ----------
// Olculdu: "HMS Challenger 1875 expedition" -> 2 aday, 0 Wikimedia (Dodge Challenger
// arabasi geldi). "HMS Challenger expedition" -> 24 aday, 9 Wikimedia (gercek 1872
// gravurleri). 26 sorguda toplam: aday 299->764, guvenilir kaynak 32->191, bozulan 0.
{
  const { sorguVaryantlari } = await import("../src/pipeline/media.js");

  const v1 = sorguVaryantlari("HMS Challenger 1875 expedition");
  kontrol("yil sorgudan dusuruluyor", v1.includes("HMS Challenger expedition"), JSON.stringify(v1));
  kontrol("ozel adi tasiyan bas iki kelime varyanti var", v1.includes("HMS Challenger"), JSON.stringify(v1));

  const v2 = sorguVaryantlari("xenophyophore deep sea organism");
  kontrol("yilsiz uzun sorguda da kisaltma uretiliyor", v2.length >= 2, JSON.stringify(v2));

  kontrol("kisa sorgu bosuna kisaltilmiyor", sorguVaryantlari("deep sea").length === 0);
  kontrol("varyant listesi tam sorgunun kendisini icermiyor",
    !sorguVaryantlari("Trieste bathyscaphe 1960 Piccard").includes("Trieste bathyscaphe 1960 Piccard"));
  kontrol("bos/bozuk girdi patlatmiyor",
    sorguVaryantlari("").length === 0 && Array.isArray(sorguVaryantlari("1960")));

  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/media.js", import.meta.url), "utf8"));
  kontrol("aday toplama artik kisaltmali yolu kullaniyor",
    /results\[key\] = await sorguVeYedekleri\(/.test(kaynak));
  // Kısaltma varyantından gelen aday AYNI şeyi gösteriyor -> tam sorguya göre
  // puanlanır. VEKİL aday ise BAŞKA bir şeyi gösteriyor (kişinin evi, kasabası);
  // tam sorguya göre ölçülseydi alakası sıfıra yakın çıkar ve denetim onu
  // haksız yere elerdi. Bu yüzden ölçüt vekilde kendi sorgusu oluyor.
  kontrol("varyanttan gelen adayin puani TAM sorguya gore yeniden hesaplaniyor",
    /const olcut = c\.vekil && c\.vekilSorgu \? c\.vekilSorgu : v\.query/.test(kaynak) &&
    /c\.score = score\(c, v\.type, v\.kind, olcut,/.test(kaynak));
  kontrol("vekil aday KENDI sorgusuna gore olculuyor",
    /c\.alaka = metinOrtusme\(olcut,/.test(kaynak));
  kontrol("vekil aday esit puanda geride kaliyor", /if \(c\.vekil\) c\.score -= 12;/.test(kaynak));
}

// ---------- 8. Secim ekrani: gorseller ON DENETIMDEN gecmis olarak geliyor ----------
// Kullanici "once gorselleri goster, sonra baslat" istedi. Gorselleri dizmek
// yetmiyor; hangisinin YANLIS oldugu da gorunmeli, yoksa 26 karta tek tek
// bakmak gerekiyor. Kucuk resimden denetlenip beatId -> {puan, gorunen} yaziliyor.
{
  const gd = await import("../src/pipeline/gorseldenetim.js");
  kontrol("aday on denetimi disari acik", typeof gd.adaylariDenetle === "function");

  const idx = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8"));
  // Sira onemli: manuel dal -> denetim -> DURAKLAMA. Denetim duraklamadan sonra
  // calisirsa secim ekrani puanlari goremez.
  const iManual = idx.indexOf('mediaMode === "manual"');
  const iDenetim = idx.indexOf("adaylariDenetle(", iManual);
  const iBekle = idx.indexOf('"awaiting_picks"', iDenetim > 0 ? iDenetim : iManual);
  kontrol("manuel modda DURAKLAMADAN ONCE denetim calisiyor",
    iManual > 0 && iDenetim > iManual && iBekle > iDenetim,
    `manual@${iManual} denetim@${iDenetim} bekle@${iBekle}`);
  kontrol("denetim sonucu diske yaziliyor", /denetim\.json"\), puanlar\)/.test(idx));

  const srv = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../server.js", import.meta.url), "utf8"));
  kontrol("secim ucu denetimi arayuze veriyor", /denetim: readJson\(path\.join\(dir, "denetim\.json"\)/.test(srv));

  const ui = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../public/app.js", import.meta.url), "utf8"));
  kontrol("secim ekrani rozet ciziyor", /class="dn dn-\$\{r\.s\}"/.test(ui));
  kontrol("sorunlu kart isaretleniyor", /sorunlu \? " sorunlu" : ""/.test(ui));
  kontrol("alternatifler ALAKA sirasina diziliyor",
    /\.sort\(\(a, b\) => \(b\.alaka \?\? 0\) - \(a\.alaka \?\? 0\)\)/.test(ui));
  kontrol("gorsel onayi ANA EKRANDA (Tum ayarlar'a gomulu degil)",
    /data-onay="manual"/.test(ui) && /Önce bana göster/.test(ui));

  // Video adayi KAPAK KARESIYLE degerlendirilemiyor: stok klibin ilk karesi
  // cogu zaman konuyu gostermiyor, hatta siyah olabiliyor. Ustune gelince oynar.
  kontrol("video adayi oynatilabilir eleman olarak ciziliyor",
    /<video class="\$\{sinif\} vid"/.test(ui));
  kontrol("fare degmeden tek bayt inmiyor (preload=none)", /preload="none"/.test(ui));
  kontrol("onizleme hem secim ekranina hem alternatif penceresine bagli",
    (ui.match(/videoOnizlemeBagla\(/g) || []).length >= 3);
  kontrol("ayni anda tek klip calar", /if \(o !== v\) durdur\(o\)/.test(ui));
  kontrol("fare cekilince basa sariyor", /v\.pause\(\); v\.currentTime = 0;/.test(ui));
}

// ---------- 9. Kose ogesi SEYREK cikar, surekli degil ----------
// Olculdu (gercek video, 27 sahne): eski kuralda 23 sahnede (%85) kose ogesi
// vardi — ekran hic dinlenmiyordu ve oge dekora donuyordu. Yeni kuralla 9 (%33).
{
  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8"));

  kontrol("kesikler arasinda en az bir bosluk sarti var", /const KESIK_ARALIK = [2-9]/.test(kaynak));
  kontrol("aralik sarti gercekten uygulaniyor",
    /if \(bosluk < KESIK_ARALIK\) return \{ src: \[\], idler: \[\] \}/.test(kaynak));
  kontrol("sahne basina EN FAZLA bir kesik", /return \{ src: \[secilen\.src\], idler: \[secilen\.id\] \}/.test(kaynak));
  kontrol("aksan yuvasina ikinci FOTOGRAF konmuyor", /aksan: aksanSekli \|\| null/.test(kaynak));
  kontrol("'hak etme' sarti var (tam puan ya da belirgin ortusme)",
    /hakEtti = m\.gorsel === 3 \|\| yakin >= KESIK_HAK_ESIGI/.test(kaynak));
  kontrol("hak etmeyen aday elenir", /adaylar\.filter\(\(a\) => a\.hakEtti\)/.test(kaynak));

  // cutout.js: bos/karanlik kesik ekrana konmaz (gercek videoda bombos krem
  // kare ve simsiyah kare gorulmustu).
  const ct = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/cutout.js", import.meta.url), "utf8"));
  kontrol("kesik icerik denetimi var", /function kesikIcerikVar/.test(ct));
  kontrol("bos/karanlik kesik sahneye konmuyor", /return \{ id: g\.id, file: null, bos: true \}/.test(ct));
  kontrol("video kaydirmasi SUREYE gore seciliyor (sabit -ss degil)",
    /Math\.min\(1\.0, sure \* 0\.25\)/.test(ct) && !/"-ss", "1\.0", "-i", src/.test(ct));
}

// ---------- 10. Ardisik sahnede AYNI gorsel yasak ----------
// Olculdu: gercek videoda son iki sahne ayni plaketi tam ekran gosteriyordu;
// Ken Burns yonu degisse bile "video dondu" hissi veriyor. Simulasyon: 2 -> 0.
{
  const r = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8"));

  // Bu kurallar arkaplan.js'e taşındı. Ayrıca yasak artık ARDIŞIK ile sınırlı
  // değil: aynı görsel videoda ikinci kez çıkamıyor (kullanılmamış alternatif
  // varken). Davranış sınaması arkaplan-secim.test.mjs'te.
  const ap = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/arkaplan.js", import.meta.url), "utf8"));
  kontrol("onceki sahnenin arka plani takip ediliyor", /sonDosya: null/.test(ap));
  // Karşılaştırma artık DOSYA ADI değil KAYNAK ADAYI üzerinden: aynı görsel iki
  // beat için inince iki farklı dosya adı alıyor ve dosya adına bakan süzgeç
  // onu göremiyordu (gerçek vaka: Rupite kilisesi videoda üç kez çıktı).
  kontrol("kendi medyasi bile olsa ardisik tekrar engelleniyor",
    /kimlik\(own\) !== durum\.sonDosya/.test(ap));
  kontrol("yasak artik ARDISIK ile sinirli degil", /&& !kullanildi\(own\)/.test(ap));
  kontrol("kardes siralamasinda onceki gorsel EN SONA itiliyor",
    /kimlik\(x\) === durum\.sonDosya \? 1 : 0/.test(ap));

  // Vurgu puntosu: sabit 132 uzun metinde kadraj disina tasiyordu (olculdu).
  const mo = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/motion.js", import.meta.url), "utf8"));
  kontrol("vurgu puntosu uzunluga gore kuculuyor",
    /Math\.floor\(kullanilirEn \/ \(harfSayisi/.test(mo));
  kontrol("punto okunmayacak kadar kucuk olmuyor", /Math\.max\(\s*S\(48\)/.test(mo));
}

console.log(hata === 0 ? "\nKESIK ALAKA TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
