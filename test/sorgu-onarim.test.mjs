// SORGU, ANLATTIĞI CÜMLEDEKİ ŞEYİ ADIYLA İSTİYOR MU?
//
// Bitmiş videoda kare kare ölçüldü (20260809-a4daff): 20 sahnenin 14'ü o anda
// söyleneni gösteriyordu, 6'sı göstermiyordu. Altısının sebebi de seçim
// aşamasında DEĞİLDİ — senaryo o cümle için zaten yanlış şeyi istemişti:
//
//   "1942'de Dimitar Gushterov ile evlendi"  -> "Petrich town 1940s"
//   "Arnavut devlet ajansı ATA bile kapıldı" -> "news agency wire service"
//
// Kesme doğru anda, görsel doğru sahnede, ama istenen şey cümleyle ilgisiz.
// Bu paket, o sorguların YAKALANDIĞINI ve onarım geçişinin bağlı olduğunu
// sınar. (Model çağrısı yapılmaz — yakalama mantığı ve kablolama sınanır.)
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const sc = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");

// ------------------------------------------------------------- KABLOLAMA
kontrol("onarım geçişi tanımlı", /export async function sorgulariOnar\(/.test(sc));
kontrol("onarım boru hattına bağlı",
  /script = await sorgulariOnar\(job, script, usage, logFn\);/.test(sc));
kontrol("onarım REDAKSİYONDAN SONRA çalışıyor",
  sc.indexOf("script = await redaksiyon(") < sc.indexOf("script = await sorgulariOnar("),
  "redaksiyon cümleleri değiştirebiliyor; sorgular son metne göre denetlenmeli");
kontrol("onarım hatası videoyu düşürmüyor",
  /Sorgu onarımı atlandı/.test(sc));

// SARMALAYICI ADI TUZAĞI — ölçülmüş regresyon.
// Model şemayı okuyup içeriği doğru üretti ama listeyi "duzeltmeler" yerine
// "queries" altında döndürdü; 19 düzeltmenin 19'u sessizce düştü.
kontrol("yanıt sarmalayıcısı esnek okunuyor",
  /diziBul\(out, "duzeltmeler", "queries"/.test(sc),
  "hesapta yapılandırılmış çıktı zorlanmıyor, dış anahtar değişebiliyor");
kontrol("hata ayıklama çıktısı bırakılmamış", !/console\.log\("HAM:/.test(sc));

// ---------------------------------------------------- YAKALAMA MANTIĞI
// Modülün kendi yardımcıları dışa açık değil; mantık burada birebir
// yeniden kurulup aynı girdilerle sınanıyor (kural değişirse test de değişir).
const TR = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const ascii = (s) => String(s).toLowerCase().replace(/[çğıöşüâîû]/g, (c) => TR[c] || c);
function kokler(metin, ilkAtla = false) {
  const out = new Set();
  const kesmeliBas = /^[A-ZÇĞİÖŞÜ][\wçğıöşüâîû]*'/.test(String(metin).trimStart());
  String(metin).split(/[^\wçğıöşüâîûÇĞİÖŞÜ]+/).filter(Boolean).forEach((h, i) => {
    if (/^\d{3,4}$/.test(h)) { out.add(h); return; }
    if (ilkAtla && i === 0 && !kesmeliBas) return;
    if (h.length < 4 || !/^[A-ZÇĞİÖŞÜ]/.test(h)) return;
    out.add(ascii(h.split("'")[0]).slice(0, 6));
  });
  return out;
}
const ortusuyor = (a, b) => { for (const x of a) for (const y of b) if (x.startsWith(y) || y.startsWith(x)) return true; return false; };
const sorunlu = (cumle, sorgu) => !ortusuyor(kokler(cumle, true), kokler(sorgu));

// Ölçülmüş gerçek hatalar — hepsi YAKALANMALI.
kontrol("yakalar: Dimitar cümlesine jenerik kasaba sorgusu",
  sorunlu("1942'de Dimitar Gushterov ile evlendi.", "Petrich town 1940s"));
kontrol("yakalar: ATA cümlesine jenerik ajans sorgusu",
  sorunlu("Arnavut devlet ajansı ATA bile bu akıma kapıldı.", "news agency wire service"));
kontrol("yakalar: Zemun cümlesine jenerik körlük sorgusu",
  sorunlu("Zemun'daki körler okuluna verildi.", "blind woman hands braille"));
kontrol("yakalar: imza cümlesine jenerik ev sorgusu",
  sorunlu("Ne imzalı tek sayfa bıraktı ne de bir defter.", "old green house"));

// Doğru eşleşmeler — YAKALANMAMALI (boşuna model çağrısı yapılmasın).
kontrol("geçirir: cümledeki kişi adı sorguda var",
  !sorunlu("1942'de Dimitar Gushterov ile evlendi.", "Dimitar Gushterov 1942 wedding"));
kontrol("geçirir: Türkçe 'Petriç' ile İngilizce 'Petrich' eşleşir",
  !sorunlu("Petriç'teki evi müze oldu.", "Petrich house museum Bulgaria"),
  "ASCII katlaması olmadan bu sorgu boşuna yeniden yazdırılırdı");
kontrol("geçirir: yıl eşleşmesi yeterli",
  !sorunlu("Bin dokuz yüz kırk iki, 1942 yılıydı.", "Bulgaria 1942 wartime"));
kontrol("geçirir: cümle başındaki kesmeli özel ad sayılır",
  !sorunlu("Rupite'de kendi kilisesini yaptırdı.", "Rupite church Bulgaria"));
kontrol("yakalar: cümle başındaki sıradan kelime özel ad SAYILMAZ",
  sorunlu("Meme kanserinden öldü.", "Meme archive photo"),
  "'Meme' yalnızca cümle başı olduğu için büyük harfli — özel ad değil");

// ------------------------------------- YANIT ANAHTARI TUZAĞI (ortak yardımcı)
// Ölçülen çökme (20260809-e6f503): model plan bölümlerini "sections" dışında
// bir anahtarla döndürdü, runOutline undefined.slice() ile patladı ve iş
// araştırma parası harcandıktan SONRA düştü. Aynı tuzak aynı gün üç yerde.
const { diziBul } = await import("../src/pipeline/script.js");
kontrol("diziBul: beklenen ad varsa onu alir",
  diziBul({ sections: [1, 2] }, "sections").length === 2);
kontrol("diziBul: ad degistiyse yine bulur",
  diziBul({ bolumler: [1, 2, 3] }, "sections").length === 3);
kontrol("diziBul: hic tanimadigi ad olsa bile ilk diziyi bulur",
  diziBul({ baslik: "x", her_neyse: [1] }, "sections").length === 1);
kontrol("diziBul: sarmalayicisiz duz dizi kabul edilir",
  diziBul([1, 2], "sections").length === 2);
kontrol("diziBul: bos/gecersiz girdide bos dizi (cokmez)",
  diziBul(null).length === 0 && diziBul(undefined).length === 0 && diziBul("metin").length === 0);
kontrol("plan bolum listesi bos donerse ANLASILIR hata",
  /Plan üretilemedi: bölüm listesi boş döndü/.test(sc));
const diziBulSayisi = (sc.match(/diziBul\(/g) || []).length;
kontrol("bolum ve segment okumalari da yardimciya bagli",
  diziBulSayisi >= 5, `bulunan: ${diziBulSayisi} (tanim + plan + segment + tekrar + onarim)`);

// ------------------------------- METİNSİZ SENARYO MEDYAYA GEÇMESİN
// Ölçülen israf (20260809-3d2ca5): model 9 segmentin 9'unu metinsiz döndürdü.
// Mevcut denetim gördü ("0/107 kelime"), yeniden istedi, yine 0 geldi ve iş
// YİNE DE devam etti: 11 dakika medya arandı, görseller indirilip denetlendi,
// ve iş ancak seslendirmede çöktü. Harcanan para tamamen boşa gitti.
const { senaryoyuDogrula, normalizeSegments } = await import("../src/pipeline/script.js");
const dene = (s) => { try { senaryoyuDogrula(s); return null; } catch (e) { return e.message; } };
const seg = (t) => ({ text: t, visuals: [], emphasis: {} });
kontrol("dogrulama: metinsiz senaryo DURDURULUR",
  /eksik döndü/.test(dene({ sections: [{ segments: [seg(""), seg(""), seg("")] }] }) || ""));
kontrol("dogrulama: hata mesaji harcama yapilmadigini soyluyor",
  /harcama yapılmadı/.test(dene({ sections: [{ segments: [seg("")] }] }) || ""));
kontrol("dogrulama: TEK bir bos segment bile durdurur",
  /eksik döndü/.test(dene({ sections: [{ segments: [seg("dolu bir anlatim cumlesi"), seg("ikinci dolu cumle burada"), seg("")] }] }) || ""),
  "9 segmentin 3u bos gecmis ve is seslendirmede cokmustu");
kontrol("dogrulama: hic segment yoksa durur",
  /hiç segment/.test(dene({ sections: [] }) || ""));
kontrol("dogrulama: saglam senaryo gecer",
  dene({ sections: [{ segments: [seg("birinci anlatim cumlesi burada"), seg("ikinci anlatim cumlesi burada")] }] }) === null);
kontrol("dogrulama boru hattina bagli", /senaryoyuDogrula\(script, job\);/.test(sc));
kontrol("baslik eksikse konudan dolduruluyor", (() => {
  const s = { title: "", sections: [{ title: "", segments: [seg("dolu anlatim cumlesi burada")] }] };
  senaryoyuDogrula(s, { topic: "Baba Vanga hikayesi" });
  return s.title === "Baba Vanga hikayesi" && !!s.sections[0].title;
})(), "aksi halde video adi ve bolum kartlari 'undefined' yaziyor");

// BOLUM BASLIGI ARTIK NUMARA DEGIL, ICERIKTEN TURETILIYOR.
//
// Eskiden bu yedek her bolume "Bölüm N" yaziyordu. Olculdu (20260814-a46ab2):
// video INGILIZCEYDI ve ekrandaki bolum kartlarinda, YouTube chapter
// damgalarinda Turkce "Bölüm 1..5" gorundu. Bolumun kendi goal/covers alani
// zaten ne anlattigini yaziyor; baslik oradan cikar.
kontrol("bolum basligi bolumun iceriginden tureiyor", (() => {
  const s = { title: "x", sections: [{ title: "", goal: "Gazin kimyasal bilesimi anlatilir.",
    segments: [seg("dolu anlatim cumlesi burada")] }] };
  senaryoyuDogrula(s, { topic: "konu" });
  return /Gazin kimyasal/.test(s.sections[0].title);
})(), "numara yerine icerikten baslik");
kontrol("hicbir bilgi yoksa VIDEONUN DILINDE numaraya dusuyor", (() => {
  const en = { title: "x", sections: [{ title: "", segments: [seg("dolu anlatim cumlesi burada")] }] };
  senaryoyuDogrula(en, { topic: "konu", language: "en" });
  const tr = { title: "x", sections: [{ title: "", segments: [seg("dolu anlatim cumlesi burada")] }] };
  senaryoyuDogrula(tr, { topic: "konu", language: "tr" });
  return en.sections[0].title === "Part 1" && tr.sections[0].title === "Bölüm 1";
})(), "Ingilizce videoda 'Bölüm 1' yaziyordu — olculen kusur buydu");

// Alan adi da degisebiliyor: metin baska bir ad altinda gelirse okunmali.
kontrol("normalizeSegments: metin alternatif alan adindan okunur",
  normalizeSegments([{ narration: "anlatim burada", visuals: [] }])[0].text === "anlatim burada");
kontrol("normalizeSegments: metin yoksa bos dize (undefined degil)",
  normalizeSegments([{ visuals: [] }])[0].text === "");

// -------------------- İSTEĞE BAĞLI ADIM VİDEOYU DÜŞÜREMEZ
// Ölçülen kayıp (20260809-8674dc): araştırma, senaryo, medya ve seslendirme
// bitmiş ve ödenmişti; iş SEO adımında API hatasıyla çöktü ve neredeyse hazır
// olan video çöpe gitti. SEO başlık/açıklama üretir — video onsuz da biter.
const ix = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
kontrol("SEO hatasi videoyu dusurmuyor",
  /SEO paketi üretilemedi/.test(ix) && /seo = await cachedSeo/.test(ix));
kontrol("SEO hatasinda makul varsayilan konuyor",
  /seo = { title: script.title || job.topic/.test(ix),
  "aksi halde sonraki adimlar undefined okur ve bu sefer orada coker");

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
