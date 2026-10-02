// GÖRSEL İSABETİNİN TAVANI: CÜMLELERİN KAÇINDA GÖSTERİLEBİLİR BİR ŞEY VAR.
//
// ÖLÇÜLEN ZİNCİR (üç İngilizce video):
//   görsel isabeti  %41-45
//   cümle düzeyinde çapa oranı  %32-49     ← neredeyse birebir aynı
//   segment düzeyinde çapa oranı  %100     ← hiçbir şey söylemiyor
//
// Yani darboğaz medya seçiminde değil: anlatım, gösterilecek bir şey
// vermediğinde hiçbir arama/denetim katmanı bunu kurtaramaz. "Sayılar
// acımasızdır" cümlesinin arşiv fotoğrafı yoktur.
//
// KURAL ÖNCE YANLIŞ GRANÜLARİTEYE YAZILDI. İlk hâli "her SEGMENTTE somut bir
// şey olsun"du ve hiçbir işe yaramadı — ölçüldü, segment düzeyinde oran zaten
// %100'dü. Segment 35-55 kelime; bir yerinde rakam geçmesi yetiyor. Oysa
// görsel TEK BİR CÜMLENİN okunduğu ana denk geliyor.
import fs from "node:fs";
import assert from "node:assert";
import { capaOraniniBildir } from "../src/pipeline/script.js";
import { somutCapaVar } from "../src/pipeline/cumlehizasi.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------------------------------------------------------------------------
// 1) ÖLÇÜM CÜMLE DÜZEYİNDE Mİ
// ---------------------------------------------------------------------------
{
  // Tek segment, iki cümle: biri çapalı biri değil. Segment düzeyinde ölçen
  // bir ölçüt %100 der; cümle düzeyinde ölçen %50.
  const script = { sections: [{ segments: [{
    text: "In 2004 Matthew Nagle played Pong with ninety-six electrodes. The numbers are merciless and everything changes.",
  }] }] };
  const oran = capaOraniniBildir(script);
  kontrol("ölçüm cümle düzeyinde (segment düzeyi %100 derdi)",
    oran !== null && oran > 0.3 && oran < 0.9, `oran ${oran}`);
}
{
  const hepsiSomut = { sections: [{ segments: [{
    text: "In 2004 Matthew Nagle played Pong. Colorado and California followed in 2024.",
  }] }] };
  kontrol("tamamen somut metin yüksek oran veriyor", capaOraniniBildir(hepsiSomut) === 1);
}
{
  const hepsiSoyut = { sections: [{ segments: [{
    text: "The numbers are merciless. Everything changes eventually. Nobody really knows.",
  }] }] };
  kontrol("tamamen soyut metin sıfır oran veriyor", capaOraniniBildir(hepsiSoyut) === 0);
}
kontrol("boş senaryo çökertmiyor",
  capaOraniniBildir({}) === null && capaOraniniBildir({ sections: [] }) === null);

// ---------------------------------------------------------------------------
// 2) DÜŞÜK ORAN KULLANICIYA SÖYLENİYOR
// ---------------------------------------------------------------------------
{
  const satirlar = [];
  capaOraniniBildir({ sections: [{ segments: [{
    text: "The numbers are merciless. Everything changes eventually. Nobody really knows.",
  }] }] }, (m) => satirlar.push(m));
  kontrol("çapa oranı her işte raporlanıyor", satirlar.some((m) => /Çapa denetimi:/.test(m)));
  kontrol("düşük oranda uyarı basılıyor", satirlar.some((m) => /DİKKAT.*soyut/.test(m)),
    "sayı düşükse görsellerin neden zayıf olacağı önceden bilinmeli");
}
{
  const satirlar = [];
  capaOraniniBildir({ sections: [{ segments: [{
    text: "In 2004 Matthew Nagle played Pong. Colorado and California followed in 2024.",
  }] }] }, (m) => satirlar.push(m));
  kontrol("iyi oranda gereksiz uyarı basılmıyor", !satirlar.some((m) => /DİKKAT/.test(m)));
}

// ---------------------------------------------------------------------------
// 3) İSTEM KURALI DOĞRU GRANÜLARİTEDE
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  kontrol("istemde çapa kuralı CÜMLE cümle isteniyor",
    /ÇAPA KURALI — CÜMLE CÜMLE/.test(src),
    "segment düzeyinde istemek ölçüldü ve hiçbir şey değiştirmedi (%100 zaten sağlanıyordu)");
  kontrol("yorumun ayrı cümle yapılmaması söyleniyor",
    /Yorumu AYRI bir cümle yapma/.test(src),
    "yorum yasaklanmıyor; somut sahneyle aynı cümlede birleşmesi isteniyor");
  kontrol("kapanış cümlesine istisna tanınıyor", /SON cümlesi soyut olabilir/.test(src));
  kontrol("eski segment düzeyi kuralı kalmadı", !/ÇAPA KURALI — HER SEGMENTTE/.test(src));
}

// ---------------------------------------------------------------------------
// 4) somutCapaVar GERÇEK CÜMLELERDE DOĞRU ÇALIŞIYOR
// ---------------------------------------------------------------------------
// (Ölçümde "soyut/felsefi" diye işaretlenen GERÇEK cümleler.)
{
  const soyut = [
    "So forget mind control. The real danger is duller and much closer.",
    "Boosting existing code, not uploading kung fu.",
    "The numbers are merciless.",
    "Now imagine that same patch note applying to your desires.",
  ];
  const somut = [
    "In 2004 a paralyzed man named Matthew Nagle played Pong with ninety-six electrodes.",
    "Colorado and California followed in 2024.",
  ];
  kontrol("gerçek soyut cümlelerin hiçbiri çapalı görülmüyor",
    soyut.every((c) => !somutCapaVar(c)), soyut.filter((c) => somutCapaVar(c)).join(" | "));
  kontrol("gerçek somut cümlelerin hepsi çapalı görülüyor",
    somut.every((c) => somutCapaVar(c)));
}

// ---------------------------------------------------------------------------
// 5) EŞİK — ÖLÇÜMLE SEÇİLDİ, TAHMİNLE DEĞİŞTİRİLMESİN
// ---------------------------------------------------------------------------
// Eşik bir zamanlar 0,55'ti ve gerekçesi iki videoluk bir karşılaştırmaydı
// ("çapa %58 → isabet %62, çapa %32 → isabet %54"). İki nokta ilişki kanıtlamaz.
// Üç bitmiş işte SEGMENT düzeyinde ölçüldüğünde ilişki çıkmadı — görsel zaten
// segment başına aranıyor, cümle başına değil:
//
//   iş        çapasız segment   çapasızın isabeti   çapalının isabeti
//   07e514         %14            %100 / tam %40      %79 / tam %42
//   a46ab2         %17             %83 / tam %67      %88 / tam %54
//   af4f58         %17             %83 / tam %50      %76 / tam %54
//
// Hiç çapası olmayan segmentler çapalılar kadar isabetli görsel alıyor; arama +
// yeni açı + AI zinciri farkı kapatıyor. Maliyet ise gerçekti: gerçek işlerin
// bölüm oranları %19-58 arasında, yani 0,55 her işte bölümlerin 4-5'ini
// 32.000 tavanlı bir çağrıyla yeniden yazdırıyordu.
//
// BU KONTROL BİLEREK KATI: eşiği yükseltmek isteyen önce ölçüm yapmak zorunda
// kalsın. Test kırıldığında doğru tepki sayıyı değiştirmek değil, yukarıdaki
// tabloyu yenilemektir.
{
  const src = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  const m = src.match(/const CAPA_ALT_SINIR = ([\d.]+)/);
  kontrol("eşik kaynakta bulunuyor", !!m);
  const esik = m ? parseFloat(m[1]) : NaN;
  kontrol("eşik 0,30", esik === 0.30, String(esik));
  kontrol("eşik yükseltilmemiş", !(esik > 0.30),
    "yükseltmeden önce çapa-isabet ilişkisini yeniden ölç — son ölçümde ilişki YOKTU");
  kontrol("gerekçe kaynakta yazılı", /YÜKSELTMEDEN ÖNCE ÖLÇ/.test(src),
    "sayının neden bu olduğu koda yazılmazsa bir sonraki tahminle değişir");
  // Mekanizmanın kendisi duruyor mu: eşiğin altındaki bölüm yeniden yazdırılıyor
  // ve yalnızca GERÇEKTEN iyileştiyse kabul ediliyor.
  kontrol("eşik altı bölüm somutlaştırılıyor", /oran < CAPA_ALT_SINIR && kelime > 0/.test(src));
  kontrol("yeniden yazım ancak iyileştirirse kabul ediliyor",
    /yeniOran > oran && yeniKelime >= kelime \* 0\.8/.test(src),
    "yoksa elde iyi metin varken kötüsüyle değiştirilir");
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
