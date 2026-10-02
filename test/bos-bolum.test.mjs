// BOŞ DÖNEN BÖLÜM SIFIRDAN YENİDEN İSTENİYOR MU?
//
// Ölçüldü — aynı gün ÜÇ ayrı işte model bölümleri metinsiz döndürdü:
//   20260809-3d2ca5 : 9 segmentin 9'u boş
//   20260809-d21945 : 9 segmentin 3'ü boş
//   20260809-bcd929 : 9 segmentin 3'ü boş
//
// Eski kod "boş geldi" ile "kısa geldi"yi aynı sayıyordu ve tek bir
// "öncekini GENİŞLET" isteği gönderiyordu — üstelik isteğin içine boş
// satırlar koyarak:
//     Önceki metin (genişletilecek):
//     1.
//     2.
// Model bu bağlamda yine boş döndürüyor, sistem eldekini kabul edip devam
// ediyordu. Her seferinde bir araştırma+senaryo turu ödenmiş oluyordu.
//
// Bu paket, boş vaka ile kısa vakanın AYRI ele alındığını sınar. Model
// çağrısı yapılmaz — istem metni ve akış kontrol edilir.
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const sc = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");

// --------------------------------------------------- İKİ VAKA AYRIŞTIRILDI
kontrol("boş gelme ayrı bir vaka olarak tanınıyor",
  sc.includes("const bos = kelime === 0;"));
kontrol("boş vakada SIFIRDAN yazma isteniyor (genişlet DEĞİL)",
  sc.includes("SESLENDİRME METNİNİ yaz") && sc.includes("Boş \"text\" alanı BIRAKMA"));
kontrol("boş vakada önceki BOŞ metin isteme eklenmiyor",
  /bos\s*\n?\s*\?\s*`Bu bölümün SESLENDİRME METNİNİ yaz/.test(sc) ||
  sc.includes("? `Bu bölümün SESLENDİRME METNİNİ yaz"),
  "boş satırlar gösterilirse model yine boş döndürüyor");
kontrol("kısa vakada eski 'genişlet' istemi korunuyor",
  sc.includes("Önceki metin (genişletilecek):"));

// ------------------------------------------------------- İKİNCİ HAK KİMDE
// Kısa kalma tek denemeyle düzeliyordu; ikinci tur parayı iki katına çıkarır.
// Bu yüzden ikinci hak YALNIZCA boş vakaya verilmeli.
kontrol("ikinci deneme yalnızca BOŞ vakaya veriliyor",
  sc.includes("if (deneme === 2 && !bos) break;"),
  "aksi halde her kısa bölüm iki kez ücretli isteniyor");
kontrol("en fazla iki deneme (sonsuz döngü yok)",
  /for \(let deneme = 1; deneme <= 2; deneme\+\+\)/.test(sc));
kontrol("hedefe ulaşınca döngü hemen kesiliyor",
  sc.includes("if (kelime >= plan.wordsPerSection * BOLUM_ALT_SINIR) break;"));
kontrol("istek patlarsa döngü kırılıyor (arka arkaya hata denenmiyor)",
  /Bölüm \$\{idx \+ 1\} yeniden yazılamadı, eldeki kullanılıyor\.`\);\s*\n\s*break;/.test(sc));

// ------------------------------------------------------ GERİLEME KORUMASI
kontrol("yalnızca daha uzun sonuç kabul ediliyor",
  sc.includes("if (say(yeni) > kelime) { segmentler = yeni; kelime = say(yeni); }"),
  "ikinci deneme daha kötü gelirse eldeki korunmalı");

// Son savunma yerinde mi: yeniden denemeler de tutmazsa iş medyaya geçmemeli.
kontrol("son savunma duruyor (metinsiz senaryo medyaya geçmez)",
  /export function senaryoyuDogrula/.test(sc) && /senaryoyuDogrula\(script, job\);/.test(sc));

// Kullanıcı ne olduğunu görmeli.
kontrol("boş vaka kullanıcıya AYRI mesajla bildiriliyor",
  sc.includes("METİNSİZ döndü"));

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
