// GÖRSEL SAHNENİN KONUSUNU İZLER, CÜMLEDEKİ HER İSMİ DEĞİL.
//
// KULLANICI VAKASI: konu bağırsak gazının hacmiydi; cümlede benzetme olarak
// "uçak" geçti ve ekrana bir UÇAK geldi. Kurguda bunun adı "kelime tetikli
// kesme" — izleyici videoyu anahtar kelime slayt gösterisi olarak okur.
//
// İki yerde birden doğuyordu:
//   1) SORGU YAZIMI — senaryo modeli cümledeki isme sorgu açıyordu.
//      Ölçülen benzer sorgular: "skyscraper business district" (en iyi aday 1),
//      "signing insurance contract pen" (1), "scientific paper printed page" (0).
//   2) DENETİM — "cümlede geçen şeyi gösteriyor mu" diye sorduğu için uçak
//      fotoğrafına 3 veriyordu. Yani lafziliği ÖDÜLLENDİRİYORDU.
//
// AYRIM MUTLAK DEĞİL. Benzetme cümlenin VURGUSU ise onu göstermek doğrudur:
// "413.000 metreküp, iki Hindenburg eder" -> Hindenburg fotoğrafı 3'tür.
// Ölçüt: o görsel olmasa izleyici bir şey kaybeder mi?
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const script = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
const denetim = fs.readFileSync(new URL("../src/pipeline/gorseldenetim.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) SORGU YAZIMI — kaynakta kural var mı
// ---------------------------------------------------------------------------
kontrol("sorgunun sahnenin konusunu izlemesi isteniyor",
  /SORGU SAHNENİN KONUSUNU İZLESİN/.test(script));
kontrol("ölçü birimi / benzetme istisnası tanımlı",
  /yalnızca ölçü birimi ya da benzetme olarak geçiyorsa ona sorgu AÇMA/.test(script));
kontrol("vurgu olduğunda sorgu açılabiliyor",
  /o benzetme cümlenin VURGUSU ise sorgu onun olur/.test(script),
  "kural mutlak olursa iyi kesmeler de engellenir");
kontrol("kullanıcının uçak vakası örnek olarak duruyor",
  /uçağın taksi yaparken yaktığı yakıt kadar/.test(script));
kontrol("karşı örnek (Hindenburg) de duruyor",
  /Hindenburg disaster 1937/.test(script) && /rakamın karşılığı o/.test(script));
kontrol("ayırt etme sorusu yazılı",
  /izleyici bir şey kaybeder mi/.test(script));

// Eski kurallar bozulmamış olmalı — bu ekleme onların yerine geçmiyor.
kontrol("özel ad kuralı duruyor", /SORGULAR ANLATILAN ŞEYİN ADINI TAŞIMALI/.test(script));
kontrol("dörtte üç özel ad oranı duruyor", /EN AZ dörtte üçü özel ad/.test(script));
kontrol("vekil sorgu kuralları duruyor", /aynı konunun BAŞKA BİR AÇISI/.test(script));

// ---------------------------------------------------------------------------
// 2) DENETİM — lafziliği artık ödüllendirmiyor
// ---------------------------------------------------------------------------
kontrol("denetimde kelime tetikli kesme tanımlı",
  /CÜMLEDE GEÇEN KELİMEYİ GÖSTERMEK, SAHNEYİ GÖSTERMEK DEĞİLDİR/.test(denetim));
kontrol("ölçü birimi/benzetme en fazla 1",
  /ÖLÇÜ BİRİMİ ya da BENZETME olarak geçiyorsa[\s\S]{0,120}?en fazla 1/.test(denetim));
kontrol("uçak vakası denetimde de örnek",
  /gelen görsel bir UÇAKTI/.test(denetim) && /Sahnenin konusu uçak değil gaz: 1/.test(denetim));
kontrol("istisna denetimde de yazılı",
  /İSTİSNA — benzetme cümlenin VURGUSU ise/.test(denetim));
kontrol("Hindenburg örneği 3 alıyor",
  /Hindenburg fotoğrafı 3'tür/.test(denetim),
  "istisna yazılmazsa model iyi kesmeleri de kırar");
kontrol("ayırt etme sorusu denetimde de var",
  /bu görsel olmasa izleyici bir şey kaybeder mi/.test(denetim));

// ---------------------------------------------------------------------------
// 3) PUANLAMA ÖLÇEĞİ BOZULMADI
// ---------------------------------------------------------------------------
// Yeni kural bir DARALTMA; ölçeğin kendisi ve eski tuzaklar yerinde kalmalı.
kontrol("0-3 ölçeği duruyor",
  /3 = fotoğraf, anlatılan cümledeki/.test(denetim) &&
  /0 = anlatılanla hiçbir ilgisi yok/.test(denetim));
kontrol("cümlenin asıl ölçüt olduğu duruyor", /ASIL ÖLÇÜT BUDUR/.test(denetim));
kontrol("eski tuzak örnekleri duruyor",
  /BAHÇE DALGIÇ POMPASI/.test(denetim) && /gelen bir KEDİ/.test(denetim));
kontrol("yüz kuralı duruyor",
  /O KİŞİNİN YÜZÜ EN DEĞERLİ ŞEYDİR/.test(denetim),
  "yeni daraltma yüz kuralını ezmemeli — kişi videolarında en değerli kare o");

// MÜZE KURALI İKİYE AYRILDI — ölçülen kusur.
//
// Tek kural vardı ("sergi/galeri fotoğrafı en fazla 1") ve yanlış tarafa
// kesiyordu. Ölçüldü (20260817-b05a7a, Truva videosu): "Achilles ancient Greek
// statue" sorgusuna gelen MÜZEDEKİ AKHİLLEUS HEYKELİ 1 aldı. Antik çağda o
// heykel konunun KENDİSİDİR; serbest lisanslı başka kaydı yoktur. Aynı turda
// Troya Müzesi vitrinindeki altın geyik başı ve Hitit rölyefi de kırıldı.
//
// Ama kuralın doğduğu vaka da gerçek: Baba Vanga'nın YÜZÜ anlatılırken gelen
// müze vitrini izleyiciye o kadını göstermiyordu. Ayrım, vitrinin KONUNUN
// KENDİSİ mi yoksa başka bir şeyin YERİNE mi geçtiği.
kontrol("eserin kendisi anlatılıyorsa müze fotoğrafı kusur değil",
  /ESERİN KENDİSİ anlatılıyorsa[\s\S]{0,200}?müzede çekilmiş olması KUSUR DEĞİLDİR/.test(denetim));
kontrol("hangi eser türleri olduğu sayılıyor",
  /heykel, rölyev|heykel, rölyef, vazo, tablet, el yazması/.test(denetim));
kontrol("vitrin başkasının yerine geçiyorsa hâlâ en fazla 1",
  /VİTRİN BAŞKA BİR ŞEYİN YERİNE geçiyorsa en fazla 1/.test(denetim),
  "kuralın doğduğu Baba Vanga vakası korunmalı");
kontrol("Truva ölçümü kaynakta yazılı",
  /Achilles ancient\s*\n?Greek statue/.test(denetim) || /MÜZEDEKİ AKHİLLEUS HEYKELİ 1 aldı/.test(denetim));
kontrol("blanket 'sergi/galeri en fazla 1' kuralı kalmadı",
  !/ekran görüntüsü,\s*\n?\s*sergi\/galeri fotoğrafı: belgesel sahnesi değildir/.test(denetim),
  "antik tarih kanalında müzedeki eser konunun kendisidir");
kontrol("kalite ekseni duruyor", /AYRICA KALİTE PUANI VER/.test(denetim));
kontrol("kamera alanları duruyor", /SON İKİ ALAN KAMERA HAREKETİ İÇİN/.test(denetim));

// ---------------------------------------------------------------------------
// 4) İKİ UÇ AYNI ŞEYİ SÖYLÜYOR MU
// ---------------------------------------------------------------------------
// Sorgu yazımı ile denetim çelişirse model bir uçta üretip diğer uçta cezalanır.
// İkisinin de AYNI ölçütü ve AYNI istisnayı taşıması şart.
kontrol("iki uç da aynı ayırt etme sorusunu kullanıyor",
  /kaybeder mi/.test(script) && /kaybeder mi/.test(denetim));
kontrol("iki uç da aynı istisnayı tanıyor",
  /VURGUSU ise/.test(script) && /VURGUSU ise/.test(denetim),
  "biri istisnayı tanımazsa üretim ile denetim birbirini yer");

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
