// YENİ AÇI SORGUSU — MARKA ADI VE SOYUT SORGU KURALLARI.
//
// ÖLÇÜLEN KUSUR (20260815-07e514). Zayıf kalan 17 arşiv sahnesinin 9'unda
// (%53) havuzun TAMAMI kötüydü: bakılan adayların en iyisi bile 0-1 aldı.
// Yani sıralama ya da seçim değil, SORGUNUN KENDİSİ umutsuzdu. İki kümeye
// ayrılıyorlar:
//
//   MARKA/KURUM — ücretsiz arşivde fotoğrafı yok, olmayacak da:
//     "Illumina NovaSeq X sequencer"        -> yanıp sönen ampuller     (1)
//     "AstraZeneca headquarters Cambridge"  -> jenerik cephe detayı     (1)
//     "Regeneron Tarrytown New York"        -> kurumsal etkinlik        (1)
//     "Loudoun County data centers aerial"  -> basın toplantısı         (0)
//
//   SOYUT — kelimeleri her şeye uyan, hiçbir şeyi göstermeyen sorgular:
//     "scientific paper printed page"       -> 1960'lar IBM reklamı     (0)
//     "skyscraper business district"        -> jenerik silüet           (1)
//     "signing insurance contract pen"      -> el sıkışma + ev maketi   (1)
//
// Yeni açı istemi KİŞİ için zaten iyi kurallar taşıyordu (heykel, gravür,
// mezar, ev). Bu iki küme için hiçbir kural yoktu.
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const src = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
const blok = src.match(/export async function yeniGorselAcilari[\s\S]*?\n}/)?.[0] || "";
kontrol("yeni açı bloğu bulundu", blok.length > 800);

// ---------------------------------------------------------------------------
// 1) ESKİ KURALLAR DURUYOR MU (kişi tarafı ölçülerek yazılmıştı)
// ---------------------------------------------------------------------------
kontrol("eşanlamlı tekrar yasağı duruyor", /Aynı şeyi eşanlamlıyla tekrar SORMA/.test(blok));
kontrol("kişi için heykel/gravür sırası duruyor", /heykel\/büst\/anıt/.test(blok));
kontrol("telifli yakın dönem uyarısı duruyor", /genelde telifli/.test(blok));
kontrol("Baba Vanga örneği duruyor", /Rupite Bulgaria village/.test(blok));

// ---------------------------------------------------------------------------
// 2) MARKA / KURUM / CİHAZ KURALI
// ---------------------------------------------------------------------------
kontrol("marka adını atma kuralı var", /MARKA ADINI AT/.test(blok));
kontrol("nesnenin kendisi isteniyor", /nesnenin kendisini/.test(blok));
kontrol("ölçülen vaka örnek olarak veriliyor: dizileyici",
  /Illumina NovaSeq X sequencer/.test(blok) && /DNA sequencing machine laboratory/.test(blok));
kontrol("ölçülen vaka örnek olarak veriliyor: ilaç şirketi",
  /AstraZeneca/.test(blok) && /pharmaceutical research campus/.test(blok));
kontrol("ölçülen vaka örnek olarak veriliyor: veri merkezi",
  /Loudoun County/.test(blok) && /data center server hall/.test(blok));

// ---------------------------------------------------------------------------
// 3) SOYUT SORGU KURALI
// ---------------------------------------------------------------------------
kontrol("soyut sorgu kuralı var", /SORGU SOYUTSA/.test(blok));
kontrol("çekilebilir sahne isteniyor", /somut, çekilebilir bir sahneye çevir/.test(blok));
kontrol("kim/nerede/ne yapıyor biçimi isteniyor", /kim\/nerede\/ne yapıyor/.test(blok));
kontrol("ölçülen vaka örnek olarak veriliyor: bilimsel makale",
  /scientific paper\\n?\s*printed page/.test(blok.replace(/\s+/g, " "))
  || /scientific paper printed page/.test(blok.replace(/\\n/g, " ").replace(/\s+/g, " ")));
kontrol("soyut örneğin karşılığı somut",
  /researcher reading journal desk/.test(blok));

// ---------------------------------------------------------------------------
// 4) ÇIKTI HÂLÂ SAĞLAM OKUNUYOR
// ---------------------------------------------------------------------------
// Bu hesapta şema uygulanmıyor; çıplak dizi de gelebiliyor.
kontrol("çıplak dizi kabul ediliyor", /Array\.isArray\(out\) \? out : \(out\?\.sahneler/.test(blok));
kontrol("tanınmayan id atılıyor", /if \(!gecerli\.has\(k\?\.id\)\) continue/.test(blok),
  "modelin uydurduğu id sahneyi yanlış görselle eşlerdi");
kontrol("sorgu sayısı ikiyle sınırlı", /\.slice\(0, 2\)/.test(blok));

// ---------------------------------------------------------------------------
// 5) YENİ AÇININ DENETİMİ DE CÜMLEYE BAKIYOR
// ---------------------------------------------------------------------------
// Bakmıyordu: yeni açıdan inen görsel yalnızca YENİ SORGUYA göre puanlanıyordu.
// Sorgu zaten "başka bir açı" olduğu için ona uyması kolay; ölçüt izleyicinin
// duyduğu cümle olmalı. Aynı kusur ana denetimde ölçülmüştü (sorgu ekseninde
// 26 görselin 22'si "uyumlu", bitmiş videoda isabet %45).
{
  const idx = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
  kontrol("yeni açı denetimi cümleleri alıyor",
    /gorselleriDenetle\(yeni, Object\.fromEntries\([\s\S]{0,220}?cumleler \}/.test(idx));
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
