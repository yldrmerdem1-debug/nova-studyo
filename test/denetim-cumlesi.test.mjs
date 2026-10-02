// GÖRSEL DENETİMİ SORGUYA DEĞİL, ANLATILANA BAKMALI.
//
// ÖLÇÜLEN KUSUR (20260811-c2e50d): denetim, seçilen 26 görselin 22'sine
// "tam uyumlu" (2-3 puan) dedi. Buna karşılık bitmiş videodan yapılan
// bağımsız ölçüm (her cümlenin ortasından kare + o cümleyle karşılaştırma)
// %45 isabet buldu — 38 karenin 21'i zayıf ya da alakasız.
//
// Fark ölçütteydi: denetim görseli SORGUYLA karşılaştırıyordu, izleyici ise
// CÜMLEYİ duyuyor. Sorgu "Neuralink N1 implant coin size" olup gelen fotoğraf
// bir implant görüntüsüyse denetim haklı olarak "uyumlu" der; ama o an
// "zihin kontrolünü unut, asıl tehlike daha sıradan" cümlesi okunuyorsa
// ekrandaki şey izleyici için alakasızdır.
//
// Bu kusur, tipografi kapısını da kilitliyordu: kapının birinci koşulu
// "denetim bu görsele ZAYIF demiş olsun" — denetim yanlış ölçütle "iyi"
// dediği için kapı hiç açılmadı (iki videoda da tek satır log yok).
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const dnt = fs.readFileSync(new URL("../src/pipeline/gorseldenetim.js", import.meta.url), "utf8");
const idx = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) KURAL METNİ
// ---------------------------------------------------------------------------
kontrol("kural metni ölçütü ANLATILAN olarak tanımlıyor",
  /ANLATILAN — o an seslendirmede söylenen cümle\. ASIL ÖLÇÜT BUDUR\./.test(dnt));
kontrol("sorgunun yalnızca ipucu olduğu yazılı", /ARANMA AMACI[\s\S]{0,60}ipucu/.test(dnt));
kontrol("puanlama anlatılana göre tarif ediliyor",
  /3 = fotoğraf, anlatılan cümledeki/.test(dnt) && /0 = anlatılanla hiçbir ilgisi yok/.test(dnt));
kontrol("cümle yoksa sorguya düşüleceği yazılı",
  /ANLATILAN boş geldiyse yalnızca sorguya göre puanla/.test(dnt),
  "cümlesiz çağrılarda model ölçütsüz kalmamalı");

// ---------------------------------------------------------------------------
// 2) VERİ GERÇEKTEN TAŞINIYOR MU
// ---------------------------------------------------------------------------
// NOT: imzalarda `() => {}` varsayılanları var, o yüzden `[^)]*` kullanılamaz —
// ilk parantezde takılır. Fonksiyon adından itibaren pencere taranıyor.
kontrol("gorselleriDenetle cümle alıyor",
  /function gorselleriDenetle[\s\S]{0,300}?cumleler = \{\}/.test(dnt));
kontrol("adaylariDenetle cümle alıyor",
  /function adaylariDenetle[\s\S]{0,300}?cumleler = \{\}/.test(dnt));
kontrol("adaylariSirala sorgu→cümle haritası alıyor",
  /function adaylariSirala[\s\S]{0,300}?sorguCumlesi = \{\}/.test(dnt));
kontrol("cümle küçültme adımında taşınıyor", /cumle: cumleler\[m\.beatId\] \|\| ""/.test(dnt));
kontrol("etikette ANLATILAN satırı var", /ANLATILAN: "\$\{String\(p\.cumle\)/.test(dnt));
kontrol("boş cümlede ANLATILAN satırı hiç eklenmiyor",
  /p\.cumle \?[\s\S]{0,120}: ""/.test(dnt),
  "boş bir 'ANLATILAN:' satırı modeli ölçütsüz bırakır");
kontrol("ön sıralama da cümleyi denetime geçiriyor",
  /adaylariDenetle\(istek, \{[^}]*cumleler: sentetikCumle/.test(dnt));

// ---------------------------------------------------------------------------
// 3) BORU HATTI CÜMLELERİ KURUYOR MU
// ---------------------------------------------------------------------------
kontrol("index cümle haritasını senaryodan kuruyor",
  /cumleler\[b\.id\] = b\.seg\?\.text \|\| ""/.test(idx));
// Çağrı çok satıra yayılabilir ve yeni argüman eklenebilir (ön puanlar gibi);
// kontrol biçimi değil, CÜMLENİN GEÇMESİNİ kilitliyor.
kontrol("ana denetim çağrısı cümleleri veriyor",
  /gorselleriDenetle\(media, sorgular,[\s\S]{0,200}?\bcumleler\b/.test(idx));
kontrol("yedek tur da cümleleri veriyor",
  /gorselleriDenetle\(yeni, sorgular, \{[\s\S]{0,120}?cumleler \}/.test(idx),
  "burada logFn: () => {} var — `[^}]*` ilk süslü parantezde takılıyor");
kontrol("aday denetimi cümleleri veriyor",
  /adaylariDenetle\(secilenler,[\s\S]{0,140}cumleler: secimCumlesi/.test(idx));
kontrol("ön sıralama sorgu→cümle haritası kuruyor",
  /sorguCumlesi\[q\] = b\.seg\?\.text \|\| ""/.test(idx) &&
  /adaylariSirala\(candidates, \{[^}]*sorguCumlesi \}/.test(idx));

// ---------------------------------------------------------------------------
// 4) ESKİ DAVRANIŞ GERİ GELMEMELİ
// ---------------------------------------------------------------------------
kontrol("etiket artık yalnız 'aranma amacı' değil",
  !/etiket: `GÖRSEL \$\{i \+ 1\} — aranma amacı: "\$\{p\.sorgu\}"`/.test(dnt),
  "bu satır geri gelirse denetim yine sorguya bakar ve kusur aynen döner");

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
