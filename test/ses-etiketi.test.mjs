// SES ETİKETİ SESE GİDER, EKRANA GİTMEZ.
//
// ElevenLabs v3 metindeki `[laughs]` gibi etiketleri OYNUYOR — kullanıcı üç
// örneği dinleyip etiketli olanı seçti. Ama ölçüldü ki v3'ün hizalaması o
// karakterleri AYNEN geri veriyor:
//     hizalama metni: "...shrugs. [laughs] The atmosphere..."
// Altyazı ve ekrandaki yazı bu hizalamadan kurulduğu için, ayıklanmazsa
// izleyici ekranda "[laughs]" YAZISINI okur. Videoyu komik değil, bozuk yapar.
//
// Zincir üç yerden geçiyor ve üçü de tutmalı:
//   1) script.js  — seg.ses (etiketli) ile seg.text (temiz) ayrılır
//   2) voice.js   — TTS seg.ses okur; dönen kelime listesinden etiket düşer
//   3) config.js  — hangi tonda hangi etiketlere izin var
import fs from "node:fs";
import assert from "node:assert";
import { TONE_ETIKET, etiketleriAyikla } from "../src/config.js";
import { sesEtiketleriniAyir } from "../src/pipeline/script.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------------------------------------------------------------------------
// 1) AYIKLAMA
// ---------------------------------------------------------------------------
kontrol("etiket metinden çıkıyor",
  etiketleriAyikla("The atmosphere shrugs. [laughs] And that is that.") ===
  "The atmosphere shrugs. And that is that.");
kontrol("birden çok etiket çıkıyor",
  !/[[\]]/.test(etiketleriAyikla("[sighs] Eight billion. [laughs] Nothing happens.")));
kontrol("noktalama önünde boşluk bırakmıyor",
  !/\s[,.;:!?]/.test(etiketleriAyikla("Nothing happens [laughs] , really.")));
kontrol("etiketsiz metin bozulmuyor",
  etiketleriAyikla("Plain sentence with no tags.") === "Plain sentence with no tags.");
kontrol("boş girdi çökertmiyor", etiketleriAyikla("") === "" && etiketleriAyikla(null) === "");
kontrol("çok uzun köşeli parantez etiket sayılmıyor",
  /\[/.test(etiketleriAyikla("A [this is far too long to be a real audio tag here] B")),
  "24 karakterden uzun köşeli parantez muhtemelen etiket değil, dokunulmamalı");

// ---------------------------------------------------------------------------
// 2) SENARYODA AYRIŞMA
// ---------------------------------------------------------------------------
{
  const script = {
    sections: [{
      segments: [
        { text: "Eight billion people let go. [laughs] The atmosphere shrugs." },
        { text: "No tags in this one at all." },
      ],
    }],
  };
  const sayi = sesEtiketleriniAyir(script, { tone: "komik" });
  const [a, b] = script.sections[0].segments;
  kontrol("etiket sayısı raporlanıyor", sayi === 1, String(sayi));
  kontrol("ses metni etiketi KORUYOR", /\[laughs\]/.test(a.ses), a.ses);
  kontrol("ekran metni etiketten TEMİZ", !/[[\]]/.test(a.text), a.text);
  kontrol("ekran metni anlamlı kalıyor",
    a.text === "Eight billion people let go. The atmosphere shrugs.", a.text);
  kontrol("etiketsiz segmente ses alanı eklenmiyor", b.ses === undefined);
  kontrol("etiketsiz segmentin metni değişmiyor", b.text === "No tags in this one at all.");
}

// ---------------------------------------------------------------------------
// 3) BAĞLANTILAR
// ---------------------------------------------------------------------------
{
  const v = fs.readFileSync(new URL("../src/pipeline/voice.js", import.meta.url), "utf8");
  kontrol("seslendirme etiketli metni okuyor", /seg\.ses \|\| seg\.text/.test(v),
    "seg.ses okunmazsa etiket hiç seslendirilmez");
  kontrol("kelime listesinden etiket ayıklanıyor",
    /words\.filter\(\(w\) => !\/\[\[\\\]\]\/\.test\(w\.t\)\)/.test(v) ||
    /temizWords = words\.filter/.test(v),
    "ayıklanmazsa altyazıda '[laughs]' yazar");
  kontrol("etiketli tonlarda v3 modeli seçiliyor",
    /baglam\.v3 \? "eleven_v3"/.test(v) && /v3Aktif = !!TONE_ETIKET\[job\.tone\]/.test(v),
    "v2 etiketleri oynamaz, olduğu gibi okur");
  kontrol("kullanıcının model ayarı önceliğini koruyor",
    /st\.elevenModel \|\| \(baglam\.v3/.test(v));
}
{
  const s = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  kontrol("ayrıştırma senaryo kurulur kurulmaz çağrılıyor",
    /sesEtiketleriniAyir\(script, job, logFn\);/.test(s));
  kontrol("ayrıştırma doğrulamadan ÖNCE yapılıyor",
    s.indexOf("sesEtiketleriniAyir(script, job, logFn)") < s.indexOf("senaryoyuDogrula(script, job)"),
    "sonra yapılsaydı kelime sayımı ve çapa ölçümü etiketleri sayardı");
  kontrol("istem etiket sayısını sınırlıyor", /en fazla 2 etiket/.test(s),
    "sınırsız etiket doğallığı bozar — her cümlede gülen anlatıcı sinir bozucu");
  kontrol("istem uydurma etiketi yasaklıyor", /Listede olmayan etiket UYDURMA/.test(s));
}

// ---------------------------------------------------------------------------
// 4) TON EŞLEMESİ
// ---------------------------------------------------------------------------
kontrol("komik tonda etiket tanımlı", Array.isArray(TONE_ETIKET.komik) && TONE_ETIKET.komik.length > 0);
kontrol("eğitici gibi ciddi tonlarda etiket YOK",
  !TONE_ETIKET.egitici && !TONE_ETIKET.arastirmaci,
  "belgesel anlatımında gülen anlatıcı ciddiyeti bozar");
kontrol("tüm etiketler tek kelime (v3 biçimi)",
  Object.values(TONE_ETIKET).every((l) => l.every((e) => /^[a-z]+$/.test(e))));

// ---------------------------------------------------------------------------
// 5) ETİKET YANLIŞ MOTORA GİTMEMELİ
// ---------------------------------------------------------------------------
// Etiketi YALNIZCA ElevenLabs v3 oynuyor. Edge TTS ve ElevenLabs v2 onu düz
// metin sanıp "bracket laughs" diye OKUR — video komik değil bozuk olur.
//
// Bu, ses etiketi eklenirken yapılan GERÇEK bir hatanın kaydı: ilk sürümde
// etiketli metin (seg.ses) her iki motora da gidiyordu. Edge ile üretilecek
// bir komik video baştan sona "bracket laughs" diye okuyacaktı.
{
  const v = fs.readFileSync(new URL("../src/pipeline/voice.js", import.meta.url), "utf8");
  kontrol("Edge dalına daima temiz metin gidiyor",
    /edgeSynth\(etiketleriAyikla\(text\)/.test(v),
    "Edge etiketi harf harf okur");
  kontrol("v3 devrede değilse ElevenLabs de temiz metin alıyor",
    /okunacak = v3Aktif \? text : etiketleriAyikla\(text\)/.test(v),
    "v2 de etiketi oynamaz, okur");
  kontrol("model seçimi ile gönderilen metin aynı karara bağlı",
    /v3: v3Aktif/.test(v),
    "ayrışırsa ya v2'ye etiket gider ya v3'e temiz metin — ikisi de yanlış");
  kontrol("komşu bağlam metni de temizleniyor",
    /onceki: etiketleriAyikla/.test(v) && /sonraki: etiketleriAyikla/.test(v),
    "bağlamdaki etiket tonlamayı yanıltır");
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
