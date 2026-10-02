// DENETİM KARARI TEK BAKIŞA BIRAKILMAZ.
//
// ÖLÇÜLEN KUSUR (20260815-07e514, 62 sahne): ön sıralama ile asıl denetim AYNI
// görsele bakıyor ve farklı puan veriyordu —
//
//   aynı puan : 31
//   düştü     : 18   (ön sıralama 3 dedi, denetim 1 dedi)
//   çıktı     : 13
//
// Yani kalite rakamının yarısı gürültüydü. Boru hattı o gürültüye bakıp yedek
// aday indiriyor, AI görseli ürettiriyor, para harcıyordu. Somut örnek:
// "GEDmatch genealogy website screen" — ön sıralama 3, denetim 1; arada değişen
// tek şey modelin o anki kararıydı, görsel aynıydı.
//
// İKİ AYRI SEBEP, İKİ AYRI ÇARE:
//   1) Çözünürlük farkı — ön sıralama 640px, denetim 384px'e bakıyordu. Üstelik
//      384'ün yetmediği bu modülün KENDİ yorumunda yazılıydı (Baba Vanga'nın
//      belgesindeki vesikalık 384'te ~40 piksel kalıyor).
//   2) Model kararsızlığı — aynı çözünürlükte bile sınırdaki görsellerde
//      tutarsız. Çare: iki oy çelişirse üçüncüsünü sor, ortancayı al.
//
// BU TESTİN ASIL DEĞERİ: iki ölçüm noktasının çözünürlüğünün BİRBİRİNDEN
// AYRILAMAMASI. Ayrıldıkları anda gürültü geri gelir ve kimse fark etmez.
import fs from "node:fs";
import assert from "node:assert";
import { ortanca, DENETIM_BOYUT, CEKISME_FARKI } from "../src/pipeline/gorseldenetim.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const kaynak = fs.readFileSync(new URL("../src/pipeline/gorseldenetim.js", import.meta.url), "utf8");
const idx = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) ORTANCA — üç oyun ortası
// ---------------------------------------------------------------------------
kontrol("üç oyun ortancası", ortanca([3, 1, 1]) === 1);
kontrol("aykırı tek oy kararı belirlemiyor", ortanca([3, 1, 3]) === 3);
kontrol("sıra önemsiz", ortanca([1, 3, 2]) === 2 && ortanca([2, 3, 1]) === 2);
kontrol("hepsi aynıysa aynı", ortanca([2, 2, 2]) === 2);
kontrol("eksik oy atlanıyor", ortanca([undefined, 1, 3]) === 3);
kontrol("hiç oy yoksa null", ortanca([]) === null && ortanca([null, undefined]) === null);
kontrol("sıfır oy geçerli sayılıyor", ortanca([0, 0, 3]) === 0,
  "0 = 'hiç ilgisi yok'; yanlışlıkla elenirse alakasız görsel geçer");

// ---------------------------------------------------------------------------
// 2) İKİ ÖLÇÜM NOKTASI AYNI ÇÖZÜNÜRLÜKTE BAKMALI
// ---------------------------------------------------------------------------
kontrol("denetim boyutu 640", DENETIM_BOYUT === 640, String(DENETIM_BOYUT));
kontrol("asıl denetim sabiti kullanıyor",
  /async function makeAuditPreview\(ffmpeg, ffprobe, src, tur, dest, boyut = DENETIM_BOYUT/.test(kaynak),
  "asıl denetim ön sıralamayla aynı boyutu kullanmalı");
kontrol("küçültme boyutu değişkenden geliyor",
  /scale=\$\{boyut\}:\$\{boyut\}/.test(kaynak) && /\[\$\{i\}:v\]scale=\$\{boyut\}:\$\{panelHeight\}/.test(kaynak));
kontrol("ön sıralama da aynı sabiti kullanıyor",
  /boyut: DENETIM_BOYUT/.test(kaynak),
  "sabit yerine sayı yazılırsa ikisi sessizce ayrılır");
kontrol("aday denetiminin varsayılanı da aynı sabit",
  /boyut = DENETIM_BOYUT/.test(kaynak));
// Kaynakta hiçbir yerde ÇALIŞAN 384 kalmamalı — biri unutulursa gürültü geri
// gelir ve kimse fark etmez. (Yorumlarda geçmesi serbest: kusurun tarihi orada.)
{
  const kodsuz = kaynak.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  kontrol("kodda çıplak 384 kalmadı", !/\b384\b/.test(kodsuz),
    "yorum dışında 384 geçmemeli");
}

// ---------------------------------------------------------------------------
// 3) ÇELİŞKİDE ÜÇÜNCÜ OY
// ---------------------------------------------------------------------------
kontrol("çelişki eşiği 2", CEKISME_FARKI === 2,
  "1 puanlık fark komşu kategori kararsızlığı; 2 puan kararı değiştiriyor");
kontrol("ön puan denetime giriyor", /onPuanlar = \{\}/.test(kaynak));
kontrol("çelişki fark ile bulunuyor",
  /Math\.abs\(on\.puan - su\.puan\) >= CEKISME_FARKI/.test(kaynak));
kontrol("yalnızca çelişenlere tekrar soruluyor",
  /sor\(cekismeli, ucuncu, "Üçüncü bakış"\)/.test(kaynak),
  "hepsine sormak maliyeti ikiye katlardı");
kontrol("karar ortancayla veriliyor",
  /ortanca\(\[on\.puan, su\.puan, u\.puan\]\)/.test(kaynak));
kontrol("kalite de ortancalanıyor",
  /ortanca\(\[on\.kalite, su\.kalite, u\.kalite\]\)/.test(kaynak),
  "kadraj puanı da tam ekran kararını etkiliyor");
kontrol("görülen tarif puanla tutarlı kalıyor",
  /p === u\.puan \? u\.gorunen : su\.gorunen/.test(kaynak),
  "puan üçüncü bakıştan gelip tarif ikinciden kalırsa günlük yanıltır");
kontrol("üçüncü tur patlarsa iş durmuyor",
  /Üçüncü bakış yapılamadı/.test(kaynak));
kontrol("iptal edilmişse üçüncü tur çalışmıyor",
  /if \(cekismeli\.length && !isCancelled\(\)\)/.test(kaynak));
kontrol("sonuç kullanıcıya raporlanıyor",
  /Üçüncü bakış bitti: \$\{cekismeCozulen\}/.test(kaynak));

// ---------------------------------------------------------------------------
// 4) HAT BAĞLANTISI — ön puan gerçekten taşınıyor mu
// ---------------------------------------------------------------------------
kontrol("index.js ön puanları topluyor", /const onPuanlar = \{\}/.test(idx));
kontrol("ön puan SEÇİLEN adaydan okunuyor",
  /find\(\(x\) => x\.id === picks\[b\.id\]\)/.test(idx),
  "başka adayın puanı taşınırsa çelişki tespiti anlamsızlaşır");
kontrol("ön puan denetime veriliyor", /cumleler, onPuanlar \}\)\)/.test(idx));
kontrol("kalite de taşınıyor", /puan: c\.onGorsel, kalite: c\.onKalite/.test(idx));

// ---------------------------------------------------------------------------
// 5) TEK BAKIŞ TURU BOZULMASIN
// ---------------------------------------------------------------------------
// Soru turu ortak bir işleve alındı; ilk tur hâlâ TÜM görsellere bakmalı ve
// parti başarısızlıkları hâlâ sebebiyle raporlanmalı.
kontrol("ilk tur tüm görsellere bakıyor",
  /await sor\(hazir, puanlar, "Görsel denetimi"\)/.test(kaynak));
kontrol("parti hatası sebebiyle raporlanıyor",
  /denetim partisi başarısız/.test(kaynak) && /Sebep: \$\{ilk\}/.test(kaynak));
kontrol("denetim hiç çalışmadıysa yüksek sesle uyarılıyor",
  /DİKKAT: görsel içerik denetimi hiç çalışamadı/.test(kaynak));

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
