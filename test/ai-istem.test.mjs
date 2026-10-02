// AI GÖRSEL İSTEMİ — SORGUDAN DEĞİL, ANLATILAN CÜMLEDEN.
//
// ÖLÇÜLEN KUSUR (20260815-07e514, 104 görsel): AI sistemdeki EN KÖTÜ kaynaktı.
//
//   pexels    %91 alakalı / %55 tam isabet
//   openverse %83 / %50
//   pixabay   %80 / %33
//   AI        %69 / %8
//
// Sebep: istem "<arama sorgusu>. Context: <cümle>" biçiminde kuruluyordu.
// Arama sorgusu ARŞİVDE TARAMAK için yazılmış kısa bir anahtar kelime öbeği;
// başa konunca görsel modeli onu KONU sanıp cümleyi arka plan sayıyor. Çıkan
// kareler ölçüldü: "SECURE LOGIN PORTAL" yazılı monitör (1), "UNSOLVED"
// damgalı klasör yığını (1), mezuniyet töreninde öğrenci (0). Üçü de SEMBOL,
// hiçbiri SAHNE değil; ikisinde kareye yazı basılmış.
import fs from "node:fs";
import assert from "node:assert";
import { kuralliIstem, yanitiOku } from "../src/pipeline/aiistem.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const kaynak = fs.readFileSync(new URL("../src/pipeline/aiistem.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) KURALLI İSTEM — model çağrısı patladığında devreye giren son çare
// ---------------------------------------------------------------------------
{
  const cumle = "Investigators uploaded the killer's DNA profile to a public genealogy site.";
  const sorgu = "GEDmatch genealogy website screen";
  const p = kuralliIstem(cumle, sorgu);

  kontrol("cümle isteme giriyor", p.includes("public genealogy site"));
  kontrol("cümle sorgudan ÖNCE geliyor", p.indexOf("Investigators") < p.indexOf("GEDmatch"),
    "sorgu başta durursa model onu konu sanıyor — ölçülen kusur bu");
  kontrol("sorgu yalnızca ipucu olarak duruyor", /\(subject: /.test(p));
  kontrol("yazı yasağı var", /no text/i.test(p) && /no signage/i.test(p),
    "üretilen karelere yazı basılıyordu ve model harfleri bozuk çiziyor");
  kontrol("logo yasağı var", /no logos/i.test(p));

  // Eski biçim geri gelmesin.
  kontrol("eski 'Context:' biçimi kullanılmıyor", !/\. Context: /.test(p));

  // Cümle yoksa elde yalnızca sorgu var — onu döndürmek boş istemden iyidir.
  kontrol("cümle yoksa sorguya düşüyor", kuralliIstem("", sorgu) === sorgu);
  kontrol("ikisi de yoksa boş", kuralliIstem("", "") === "");

  // Uzunluk: aivideo.js istemi 420 harfte kesiyor, sinematik sarmalayıcı da
  // ekleniyor. Kurallı istem taşarsa yasak cümlesi kesilip düşerdi.
  const uzun = kuralliIstem("x".repeat(900), "y".repeat(200));
  kontrol("uzun cümle kırpılıyor", uzun.length <= 400, uzun.length + " harf");
}

// ---------------------------------------------------------------------------
// 2) MODEL YANITINI HOŞGÖRÜLÜ OKUMA
// ---------------------------------------------------------------------------
// Bu hesapta yapılandırılmış çıktı UYGULANMIYOR: model sarmalayıcı adını da
// iç alan adlarını da değiştiriyor. gorseldenetim.js'te ölçüldü — katı okuma
// yüzünden 23 görselin 23'ü birden kaybolmuştu.
{
  const liste = [{ id: "b1" }, { id: "b2" }];
  const iyi = "A forensic technician in a windowless county records room lifts a sealed evidence envelope from a steel drawer.";

  kontrol("beklenen biçim okunuyor",
    yanitiOku({ sahleyok: 1, sahneler: [{ no: 1, sahne: iyi }] }, liste).b1 === iyi);
  kontrol("İngilizce sarmalayıcı adı okunuyor",
    yanitiOku({ scenes: [{ no: 1, scene: iyi }] }, liste).b1 === iyi);
  kontrol("çıplak dizi okunuyor",
    yanitiOku([{ no: 2, sahne: iyi }], liste).b2 === iyi);
  kontrol("alan adı 'prompt' olsa da okunuyor",
    yanitiOku({ sahneler: [{ no: 1, prompt: iyi }] }, liste).b1 === iyi);
  kontrol("'no' gelmezse dizi sırasına düşülüyor",
    yanitiOku({ sahneler: [{ sahne: iyi }, { sahne: iyi }] }, liste).b2 === iyi);

  // Çöp yanıtlar kurallı istemi EZMEMELİ.
  kontrol("kısa/boş yanıt reddediliyor",
    Object.keys(yanitiOku({ sahneler: [{ no: 1, sahne: "lab" }] }, liste)).length === 0,
    "tek kelimelik yanıt kurallı istemden kötüdür");
  kontrol("tanınmayan biçim çökmüyor", Object.keys(yanitiOku({ acayip: 5 }, liste)).length === 0);
  kontrol("null çökmüyor", Object.keys(yanitiOku(null, liste)).length === 0);
  kontrol("listeden uzun yanıt taşmıyor",
    Object.keys(yanitiOku({ sahneler: [1, 2, 3, 4].map((n) => ({ no: n, sahne: iyi })) }, liste)).length === 2);
}

// ---------------------------------------------------------------------------
// 3) SİSTEM İSTEMİ — ölçülen her kusur için bir kural olmalı
// ---------------------------------------------------------------------------
kontrol("ölçüt olarak CÜMLE gösteriliyor", /THE SENTENCE IS THE BRIEF/.test(kaynak));
kontrol("sorgunun konu olmaması söyleniyor",
  /Never let the query become\s*\n?\s*the subject/.test(kaynak));
kontrol("yazı/harf/tabela yasağı", /NO text, letters, signage/.test(kaynak));
kontrol("sembol yasağı", /NO symbolic stand-ins/.test(kaynak));
kontrol("stok klişe yasağı", /NO stock-photo clich/.test(kaynak));
kontrol("kelime örtüşmesi yasağı", /merely shares a WORD/.test(kaynak));
kontrol("marka yerine gerçek nesne kuralı", /ORDINARY REAL-WORLD OBJECT OR PLACE/.test(kaynak));
kontrol("ikinci turda farklı sahne isteniyor", /clearly DIFFERENT and more literal/.test(kaynak));

// Yasakların hepsi GERÇEK vakadan geliyor; örnekleri istemde dursun ki
// model neyin reddedildiğini bilsin.
kontrol("gerçek vaka örneği: yazılı monitör", /SECURE LOGIN PORTAL/.test(kaynak));
kontrol("gerçek vaka örneği: UNSOLVED damgası", /UNSOLVED/.test(kaynak));
kontrol("gerçek vaka örneği: mezuniyet töreni", /graduation ceremony is not/.test(kaynak));

// ---------------------------------------------------------------------------
// 4) BOZULMAYA KARŞI — harita HER ZAMAN dolu dönmeli
// ---------------------------------------------------------------------------
// Üretim adımı istemi boş gelen sahneyi atlıyor. Bir sahne için istem hiç
// üretilemezse o sahne sessizce kaybolur; kurallı istem bunu engelliyor.
kontrol("çıktı önce kurallı istemle dolduruluyor",
  /for \(const x of liste\) cikti\[x\.id\] = kuralliIstem/.test(kaynak));
kontrol("çağrı patlarsa kurallı istem kalıyor",
  /catch \(e\)[\s\S]{0,200}istemler arama sorgusundan kuruldu/.test(kaynak));
kontrol("eksik yazım kullanıcıya bildiriliyor", /istendi, \$\{yazilan\} yazıldı/.test(kaynak));

// ---------------------------------------------------------------------------
// 5) HAT BAĞLANTISI — istem gerçekten üretime gidiyor mu
// ---------------------------------------------------------------------------
{
  const media = fs.readFileSync(new URL("../src/pipeline/media.js", import.meta.url), "utf8");
  kontrol("media.js istemi modele yazdırıyor", /await sahneIstemleri\(/.test(media));
  kontrol("yalnızca arşiv kurtarmaları yeniden yazılıyor",
    /beats\.filter\(\(b\) => !cachedOk\(b\.id\) && b\.visual\?\.aiFill && b\.visual\?\.aiCumle\)/.test(media),
    "senaryonun bilerek işaretlediği AI sahnelerin istemini o yazdı, üstüne yazmak bilgi kaybı");
  kontrol("eski sorgu+Context biçimi media.js'ten kalktı",
    !/\$\{beat\.visual\.query\}\. Context: \$\{baglam\}/.test(media));
  kontrol("AI kaydına sorgu yazılıyor",
    /beatId: b\.id, \.\.\.aiClips\[b\.id\][\s\S]{0,120}sorgu: b\.visual\?\.query/.test(media),
    "ölçüldü: 13 AI görselin 13'ünde de sorgu alanı boştu");
  kontrol("istem yazımı patlarsa iş durmuyor",
    /AI sahne tarifi adımı atlandı/.test(media));

  const aivideo = fs.readFileSync(new URL("../src/pipeline/aivideo.js", import.meta.url), "utf8");
  kontrol("yazı yasağı HER istemde uygulanıyor",
    /const yasak = /.test(aivideo) && /return p \+ yasak/.test(aivideo),
    "eski kod 'shot/camera' geçen istemde yasağı düşürüyordu — yeni tarifler o kelimeleri içeriyor");
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
