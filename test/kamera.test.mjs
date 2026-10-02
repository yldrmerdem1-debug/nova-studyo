// KAMERA HAREKETİ KARENİN İÇERİĞİNE GÖRE SEÇİLİR.
//
// ÖNCEKİ DAVRANIŞ: altı hareketten biri sırf SIRA NUMARASINA göre atanıyordu
// (`variants[(i * 7 + 3) % 6]`). Bir portre ile bir harita aynı muameleyi
// görüyordu; hangisine ne düşeceği kurgu sırasına bağlıydı.
//
// Elle kurgulayan biri bunu yapmaz:
//   YÜZE yaklaşır, hareket boyunca yüzü kadrajda tutar
//   MANZARADA yana kayar — yakınlaşmak geniş açının anlamını öldürür
//   BELGEDE neredeyse durur — kayan kamerada yazı okunmaz
//   KALABALIKTA geri çekilir — ölçek ancak açılırken anlaşılır
//
// Bilgi bedava geliyor: denetim zaten her görselin önünde ve ücreti ödeniyor.
//
// BU TEST İDDİAYI FFMPEG'LE DE ÖLÇÜYOR: ifadelerin farklı yazılmış olması
// hareketin gerçekten farklı olduğunu KANITLAMAZ. Alt bölümde gerçek kareler
// üretilip ilk/son kare karşılaştırılıyor.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { hareketSec, kameraFiltresi } from "../src/pipeline/kamera.js";
import { KADRAJ_TURLERI, ODAK_YONLERI } from "../src/pipeline/gorseldenetim.js";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const N = 90;

// ---------------------------------------------------------------------------
// 1) HER KARE TÜRÜ KENDİ HAREKETİNİ ALIYOR
// ---------------------------------------------------------------------------
{
  const y = hareketSec("yuz", "orta", 0, N, 30);
  const m = hareketSec("manzara", "orta", 0, N, 30);
  const b = hareketSec("belge", "orta", 0, N, 30);
  const k = hareketSec("kalabalik", "orta", 0, N, 30);
  const n = hareketSec("nesne", "orta", 0, N, 30);

  // Katsayılar artık SÜREDEN türetiliyor (hız × süre), o yüzden kontroller
  // sabit sayı aramıyor — DAVRANIŞA bakıyor.
  const kat = (ifade) => parseFloat(ifade.match(/([\d.]+)\*on\//)?.[1] ?? "0");

  kontrol("yüzde yaklaşma var", /^1\+[\d.]+\*on\//.test(y.z) && kat(y.z) > 0, y.z);
  kontrol("yüzde yatay kayma YOK", !y.x.includes("on/"),
    "kayarsa yüz kadrajdan çıkar");
  kontrol("yüzde kadraj üst yarıya çekiliyor", y.y.includes("0.38"),
    "yüzler kadrajın üst yarısında oturur");

  kontrol("manzarada zoom sabit", !m.z.includes("on/"),
    "yakınlaşmak geniş açının anlamını öldürür");
  kontrol("manzarada yatay kayma var", m.x.includes("on/"));

  kontrol("belgede yaklaşma SIFIR DEĞİL", kat(b.z) > 0, b.z);
  kontrol("belge en yavaş yaklaşan tür", kat(b.z) < kat(y.z) && kat(b.z) < kat(n.z),
    `belge ${kat(b.z)} / yuz ${kat(y.z)} / nesne ${kat(n.z)}`);
  kontrol("belgede kayma yok", !b.x.includes("on/"), "kayan kamerada yazı okunmaz");

  kontrol("kalabalıkta geri çekiliyor", /^1\.\d+-[\d.]+\*on\//.test(k.z), k.z);
  kontrol("nesnede yaklaşma var", /^1\+[\d.]+\*on\//.test(n.z) && kat(n.z) > 0, n.z);

  // Beşi de birbirinden farklı olmalı — yoksa ayrım kâğıt üstünde kalır.
  const imzalar = new Set([y, m, b, k, n].map((v) => v.z + "|" + v.x + "|" + v.y));
  kontrol("beş kare türü beş farklı hareket veriyor", imzalar.size === 5, String(imzalar.size));
}


// ---------------------------------------------------------------------------
// 1b) HAREKET SÜREYE GÖRE ÖLÇEKLENİYOR (sabit mesafe değil, sabit hız)
// ---------------------------------------------------------------------------
// Eski ifadeler `on/(N-1)` ile normalize edilmişti: toplam yol plan süresinden
// BAĞIMSIZDI, yani 20 saniyelik plan 4 saniyelik planla aynı mesafeyi kat
// ediyordu. Kare birebir kopya olmasa da uzun planda hareket durgunlaşıyor.
//
// DÜRÜSTLÜK NOTU: bu değişiklik ölçülen %18,5'lik donmayı AÇIKLAMIYOR — izole
// ölçümde eski kamera dalları da %0 donuk verdi. Donmanın ölçülen kaynağı
// graphics.js/punchZoom'du (10 sn'lik planda %48,3). Buradaki kural yine de
// kendi başına doğru ve kilitleniyor.
{
  const kat = (ifade) => parseFloat(ifade.match(/([\d.]+)\*on\//)?.[1] ?? "0");
  const kisa = hareketSec("nesne", "orta", 0, 3 * 30, 30);
  const orta = hareketSec("nesne", "orta", 0, 10 * 30, 30);
  const uzun = hareketSec("nesne", "orta", 0, 20 * 30, 30);
  kontrol("uzun plan kısa plandan çok yol alıyor", kat(uzun.z) > kat(kisa.z),
    `3sn ${kat(kisa.z)} -> 20sn ${kat(uzun.z)}`);
  kontrol("yol süreyle birlikte artıyor", kat(orta.z) > kat(kisa.z) && kat(uzun.z) >= kat(orta.z));
  kontrol("üst sınır var (aşırı zoom kırpar)", kat(uzun.z) <= 0.35, String(kat(uzun.z)));
  kontrol("alt sınır var (kısa planda hareket görünmez kalmasın)", kat(kisa.z) >= 0.04, String(kat(kisa.z)));
  // Manzarada kayma payı da süreyle büyümeli.
  const mk = (v) => parseFloat(v.x.match(/([\d.]+)\*on\//)?.[1] ?? "0");
  kontrol("manzarada kayma payı süreyle büyüyor",
    mk(hareketSec("manzara", "orta", 0, 20 * 30, 30)) > mk(hareketSec("manzara", "orta", 0, 3 * 30, 30)));
  // fps verilmezse çökmemeli (varsayılan 30).
  kontrol("fps verilmezse çökmüyor", !!hareketSec("nesne", "orta", 0, 300).z);
}

// ---------------------------------------------------------------------------
// 2) ODAK YATAY ÇAPAYI DEĞİŞTİRİYOR
// ---------------------------------------------------------------------------
{
  const sol = hareketSec("yuz", "sol", 0, N, 30);
  const orta = hareketSec("yuz", "orta", 0, N, 30);
  const sag = hareketSec("yuz", "sag", 0, N, 30);
  kontrol("sol odak sola çapalanıyor", sol.x.includes("0.18"), sol.x);
  kontrol("sağ odak sağa çapalanıyor", sag.x.includes("0.82"), sag.x);
  kontrol("orta odak ortada", orta.x === "(iw-iw/zoom)/2", orta.x);
  kontrol("üç odak üç farklı çapa", new Set([sol.x, orta.x, sag.x]).size === 3);
  // Uçlara yapıştırma: konu kadrajın tam kenarına dayanırsa kırpılmış görünür.
  // Çarpan 0 ile 1 arasında OLMALI ama uçlarda değil.
  const carpan = (ifade) => parseFloat(ifade.match(/\*([\d.]+)$/)?.[1] ?? "NaN");
  kontrol("sol çapa kenara yapışmıyor", carpan(sol.x) >= 0.1 && carpan(sol.x) <= 0.3,
    String(carpan(sol.x)));
  kontrol("sağ çapa kenara yapışmıyor", carpan(sag.x) >= 0.7 && carpan(sag.x) <= 0.9,
    String(carpan(sag.x)));
}

// ---------------------------------------------------------------------------
// 3) BİLGİ YOKKEN BOZULMUYOR
// ---------------------------------------------------------------------------
{
  const bos = hareketSec("", "", 0, N, 30);
  kontrol("kadraj bilinmiyorsa genel harekete düşülüyor", bos.ad.includes("genel"));
  kontrol("tanınmayan kadraj çökertmiyor", !!hareketSec("acayip", "acayip", 0, N, 30).z);
  kontrol("tanınmayan odak ortaya düşüyor",
    hareketSec("yuz", "acayip", 0, N, 30).x === "(iw-iw/zoom)/2");
  kontrol("N=1 çökertmiyor (sıfıra bölme)", !hareketSec("yuz", "orta", 0, 1, 30).z.includes("/0"));
  kontrol("N=0 çökertmiyor", !hareketSec("manzara", "orta", 0, 0, 30).x.includes("/0"));
}

// ---------------------------------------------------------------------------
// 4) ARDIŞIK AYNI TÜR KARELER AYNI YÖNE KAYMIYOR
// ---------------------------------------------------------------------------
{
  const a = hareketSec("manzara", "orta", 0, N, 30);
  const b = hareketSec("manzara", "orta", 1, N, 30);
  kontrol("ardışık manzaralar ters yöne kayıyor", a.x !== b.x,
    "hepsi aynı yöne kayarsa kurgu makine işi gibi durur");
  // Ama yüzde alternatif OLMAMALI: yüz hareketi içeriğe bağlı, sıraya değil.
  kontrol("yüz hareketi sıraya göre değişmiyor",
    hareketSec("yuz", "sol", 0, N, 30).x === hareketSec("yuz", "sol", 1, N, 30).x);
}

// ---------------------------------------------------------------------------
// 5) DENETİM BU ALANLARI GERÇEKTEN İSTİYOR MU
// ---------------------------------------------------------------------------
{
  const gd = fs.readFileSync(new URL("../src/pipeline/gorseldenetim.js", import.meta.url), "utf8");
  kontrol("şemada kadraj alanı var", /kadraj: \{[\s\S]{0,200}?enum: \["yuz", "manzara"/.test(gd));
  kontrol("şemada odak alanı var", /odak: \{[\s\S]{0,160}?enum: \["sol", "orta", "sag"\]/.test(gd));
  // Zorunlu listeye sonradan alan eklendi (yer kimliği). Kontrol tam eşleşme
  // değil, İKİ KAMERA ALANININ VARLIĞINI arıyor.
  kontrol("iki alan da zorunlu",
    /required: \[[^\]]*"kadraj"[^\]]*\]/.test(gd) && /required: \[[^\]]*"odak"[^\]]*\]/.test(gd));
  kontrol("istemde ne oldukları anlatılıyor", /SON İKİ ALAN KAMERA HAREKETİ İÇİN/.test(gd));
  // ODAK BİR KONUM ÖLÇÜMÜ — kategori seçimi değil.
  //
  // İlk hâlinde "konu yayılmışsa ya da tam ortadaysa 'orta' yaz" deniyordu ve
  // bu bir kaçış yolu bıraktı: ölçüldü (20260817-b05a7a), 98 karenin 96'sına
  // "orta" dendi. Yatay çapalama pratikte hiç çalışmadı. Soru artık uzamsal:
  // kareyi üçe böl, ağırlık merkezi hangi dilimde?
  kontrol("odak üçe bölme sorusuyla soruluyor",
    /KAREYİ ÜÇE BÖL, asıl konunun ağırlık merkezi hangi dilimde/.test(gd));
  kontrol("emin olunmadığı için 'orta' yazılması yasak",
    /Emin olamadığın için "orta"\s*\n?YAZMA/.test(gd),
    "kaçış yolu bırakılınca model hep ortayı seçiyor");
  kontrol("ölçülen kusur istemde hatırlatılıyor",
    /98 karenin 96'sına "orta" dendi/.test(gd));
  kontrol("şema açıklaması da konum ölçümü diyor",
    /Konum ölçümüdür/.test(gd),
    "şema ile istem çelişirse model şemaya bakar");
  kontrol("kullanıcı biçim örneğinde de yer alıyorlar",
    /"kadraj":"<yuz\|manzara\|belge\|nesne\|kalabalik>"/.test(gd),
    "şema bu hesapta uygulanmıyor — biçim örneğinde yoksa model doldurmaz");
  kontrol("tanınmayan değer yazılmıyor",
    /KADRAJ_TURLERI\.has\(String\(s\?\.kadraj\)\)/.test(gd),
    "render bilinmeyen bir dala düşerdi");
  kontrol("üçüncü bakış alanları düşürmüyor",
    /kadraj: su\.kadraj \|\| u\.kadraj/.test(gd),
    "yeniden kurulurken silinirse hareket sessizce genele düşer");
  kontrol("sabit kümeler dışa açık", KADRAJ_TURLERI.size === 5 && ODAK_YONLERI.size === 3);
}

// ---------------------------------------------------------------------------
// 6) RENDER GERÇEKTEN KULLANIYOR MU
// ---------------------------------------------------------------------------
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("render kamera modülüne tür profilini iletiyor", /kameraFiltresi\(kadraj, odak, i, N, fps, kanvas, profile\)/.test(r));
  kontrol("medya kaydındaki alanlar veriliyor",
    /kenBurns\(index, N, fps, kanvas, media\.kadraj, media\.odak, profile\)/.test(r));
  kontrol("eski sıra tabanlı seçim kalmadı", !/\(i \* 7 \+ 3\) % variants\.length/.test(r),
    "içerik bilinirken sıraya göre hareket atamak eski kusurdu");

  const idx = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
  kontrol("alanlar medya kaydına yazılıyor", /if \(p\.kadraj\) media\[beatId\]\.kadraj = p\.kadraj/.test(idx));
  // Yedek turlarda kayıt yeniden kuruluyor; alanlar taşınmazsa sessizce düşer.
  const tasima = (idx.match(/kadraj: p\.kadraj \|\| ""/g) || []).length;
  kontrol("yedek/AI turlarında da taşınıyor", tasima >= 3, tasima + " yerde");
}

// ---------------------------------------------------------------------------
// 7) FFMPEG ÖLÇÜMÜ — hareket GERÇEKTEN farklı mı
// ---------------------------------------------------------------------------
// İfadelerin farklı yazılmış olması yetmez. Gerçek kareler üretilip ilk ve son
// kare karşılaştırılıyor: belge neredeyse sabit, manzara yatay kaymış olmalı.
{
  const st = getSettings();
  const kanvas = { w: 640, h: 360 };
  const D = path.join(os.tmpdir(), "nova-kamera-test");
  fs.rmSync(D, { recursive: true, force: true });
  fs.mkdirSync(D, { recursive: true });

  let ffmpegVar = true;
  const kaynak = path.join(D, "kaynak.png");
  try {
    // YATAY PARLAKLIK RAMPASI: solda siyah, sağda beyaz. Kadraj yana kayınca
    // ortalama parlaklık ölçülebilir biçimde değişir; sabit dururken değişmez.
    // (`gradients` filtresi denendi, bu sürümde düz beyaz üretti — geq kesin.)
    await run(st.ffmpegPath, ["-y", "-f", "lavfi", "-i", "color=c=gray:s=1920x1080",
      "-vf", "geq=lum='X/W*255':cb=128:cr=128", "-frames:v", "1", kaynak],
      { timeoutMs: 60000 });
  } catch { ffmpegVar = false; }

  if (!ffmpegVar || !fs.existsSync(kaynak)) {
    console.log("ATLA  ffmpeg yok — hareket ölçümü çalıştırılmadı");
  } else {
    // Bir hareketin ilk ve son karesini üret, ortalama parlaklıklarını ölç.
    const kareler = async (kadraj, odak) => {
      const f = kameraFiltresi(kadraj, odak, 0, N, 30, kanvas);
      const out = path.join(D, `${kadraj || "genel"}_%03d.png`);
      await run(st.ffmpegPath, ["-y", "-loop", "1", "-i", kaynak, "-vf", f,
        "-frames:v", String(N), "-r", "30", out], { timeoutMs: 90000 });
      // ORTALAMA PARLAKLIK — kareyi 1x1'e indirip tek baytı oku.
      //
      // `metadata=print:file=` denendi ve Windows'ta kullanılamıyor: ffmpeg
      // filtre seçeneklerinde ":" ayraç olduğu için "C:\..." yolu parse
      // edilemiyor ("Unable to parse option value"). 1x1 rawvideo hem
      // platformdan bağımsız hem de tam olarak istediğimiz sayıyı veriyor.
      const oku = async (no) => {
        const p = path.join(D, `${kadraj || "genel"}_${String(no).padStart(3, "0")}.png`);
        const ham = path.join(D, `${kadraj || "genel"}_${no}.raw`);
        await run(st.ffmpegPath, ["-y", "-i", p, "-vf", "scale=1:1,format=gray",
          "-f", "rawvideo", ham], { timeoutMs: 30000 });
        return fs.readFileSync(ham)[0];
      };
      return { ilk: await oku(1), son: await oku(N) };
    };

    const belge = await kareler("belge", "orta");
    const manzara = await kareler("manzara", "orta");
    const belgeFark = Math.abs(belge.son - belge.ilk);
    const manzaraFark = Math.abs(manzara.son - manzara.ilk);

    console.log(`     ölçüm: belge ilk=${belge.ilk.toFixed(1)} son=${belge.son.toFixed(1)} (fark ${belgeFark.toFixed(1)})`);
    console.log(`     ölçüm: manzara ilk=${manzara.ilk.toFixed(1)} son=${manzara.son.toFixed(1)} (fark ${manzaraFark.toFixed(1)})`);

    // Yatay gradyanda kayma parlaklığı değiştirir; sabit duruş değiştirmez.
    kontrol("manzara gerçekten yana kayıyor", manzaraFark > 8,
      `parlaklık farkı ${manzaraFark.toFixed(1)} — kayma yoksa fark ~0 olurdu`);
    kontrol("belge neredeyse sabit duruyor", belgeFark < 3,
      `parlaklık farkı ${belgeFark.toFixed(1)} — yazı okunacaksa kadraj oynamamalı`);
    kontrol("ikisi ölçülebilir biçimde farklı", manzaraFark > belgeFark * 3);
  }
  fs.rmSync(D, { recursive: true, force: true });
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
