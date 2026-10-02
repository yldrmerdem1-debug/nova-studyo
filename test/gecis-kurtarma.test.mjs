// TEK BİR GEÇİŞ ÇÖKMESİ İŞİ ÖLDÜRMEMELİ.
//
// ÖLÇÜLEN KUSUR (20260811-cfc49f): geçiş parçası p0001'i yazan ffmpeg
// 0xC0000005 (erişim ihlali) ile çöktü. transitions.js'te `if (!r.ok) throw`
// vardı ve 25 dakikalık işin TAMAMI düştü — araştırma, senaryo, medya,
// seslendirme, 26 kesme, hepsi çöpe. Diskte kalan p0001.mp4 yarımdı
// ("moov atom not found").
//
// Kesme aşamasında bu vaka için yedek kart yolu vardı; geçişte hiçbir şey yoktu.
//
// ÖNEMLİ AYRIM: çökme paralellik sayısının basit fonksiyonu değil. Aynı
// kliplerle aynı makinede 10 paralel × 1 iş parçacığı yerelde 10/10 başarılı
// geçti. Yani "paralelliği düşür" tek başına çözüm değil — eksik olan
// KURTARMA YOLUYDU. Bu paket kurtarmanın gerçekten çalıştığını, sahte bir
// başarısızlık enjekte ederek doğruluyor.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { getSettings } from "../src/config.js";
import { run, mapLimit } from "../src/util.js";
import { buildPieces } from "../src/pipeline/transitions.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const st = getSettings();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gecis-"));
const parcaDir = path.join(DIR, "parca");
fs.mkdirSync(parcaDir, { recursive: true });

// --- gerçek klipler üret (render'ın çıkardıklarına denk: 1080p, 30fps) ---
const KLIP = 4, KARE = 60;
const klipler = [];
for (let i = 0; i < KLIP; i++) {
  const f = path.join(DIR, `s${i}.mp4`);
  await run(st.ffmpegPath, ["-y", "-f", "lavfi",
    "-i", `testsrc2=size=1920x1080:duration=2:rate=30`,
    "-frames:v", String(KARE), "-r", "30", "-c:v", "libx264", "-preset", "ultrafast",
    "-crf", "24", "-threads", "1", "-pix_fmt", "yuv420p", "-an", f], { timeoutMs: 180000 });
  klipler.push(f);
}
kontrol("test klipleri üretildi", klipler.every((f) => fs.existsSync(f)));

// --- geçiş planı: hepsi yumuşak geçiş olsun ki gerçek xfade yolu çalışsın ---
const plan = klipler.map(() => ({ tip: "fade", sure: 0.4 }));
const layout = {
  g: klipler.map((_, i) => (i < klipler.length - 1 ? 12 : 0)), // geçiş kareleri
  L: klipler.map(() => KARE),                                   // kesme uzunlukları
  parca: klipler.map(() => KARE),                               // parça uzunlukları
};

// ---------------------------------------------------------------------------
// 1) NORMAL AKIŞ
// ---------------------------------------------------------------------------
{
  const { listFile } = await buildPieces({
    st, clipFiles: klipler, plan, layout, outDir: parcaDir,
    mapLimit, logFn: () => {},
  });
  kontrol("geçiş parçaları normal koşulda üretiliyor", fs.existsSync(listFile));
}

// ---------------------------------------------------------------------------
// 2) BİR PARÇA ÇÖKERSE
// ---------------------------------------------------------------------------
// mapLimit sarmalanıyor: ilk iş BİR KEZ gerçek bir hata alıyor, sonra
// kurtarma turunda normal çalışıyor. Gerçek çökmenin (0xC0000005) yerine
// aynı şekle sahip bir hata konuyor — ffmpeg'i kasten çökertmek taşınabilir
// değil, ama kodun gördüğü şey birebir aynı: reddedilen bir söz.
{
  const parca2 = path.join(DIR, "parca2");
  fs.mkdirSync(parca2, { recursive: true });
  let dusurulen = 0;
  const bozukMapLimit = async (liste, limit, fn) =>
    mapLimit(liste, limit, async (is, ...kalan) => {
      if (is.i === 1 && dusurulen === 0) {
        dusurulen++;
        throw new Error("ffmpeg çıkış kodu 3221225477: erişim ihlali (test)");
      }
      return fn(is, ...kalan);
    });

  let kurtarmaSatiri = "";
  let listFile = null, patladi = null;
  try {
    ({ listFile } = await buildPieces({
      st, clipFiles: klipler, plan, layout, outDir: parca2,
      mapLimit: bozukMapLimit,
      logFn: (m) => { if (/tekrar deneniyor/.test(m)) kurtarmaSatiri = m; },
    }));
  } catch (e) { patladi = e; }

  kontrol("bir parça çökse de iş DÜŞMÜYOR", !patladi,
    patladi ? String(patladi.message).slice(0, 90) : "");
  kontrol("düşen parça gerçekten enjekte edildi", dusurulen === 1, String(dusurulen));
  kontrol("kurtarma kullanıcıya bildiriliyor", /tekrar deneniyor/.test(kurtarmaSatiri),
    kurtarmaSatiri || "log satırı yok — sessiz kurtarma teşhisi zorlaştırır");
  kontrol("liste dosyası yine üretiliyor", !!listFile && fs.existsSync(listFile));

  if (listFile && fs.existsSync(listFile)) {
    const satirlar = fs.readFileSync(listFile, "utf8").split(/\r?\n/).filter(Boolean);
    kontrol("listede parça sayısı eksilmemiş", satirlar.length === klipler.length,
      `${satirlar.length}/${klipler.length}`);
    // Kurtarılan parça diskte GERÇEKTEN var ve çözülebilir olmalı — yarım
    // dosya ("moov atom not found") kabul edilemez.
    const yollar = satirlar.map((l) => (l.match(/^file '(.+)'$/) || [])[1]).filter(Boolean);
    let cozulen = 0;
    for (const y of yollar) {
      try {
        await run(st.ffmpegPath, ["-v", "error", "-i", y, "-f", "null", "-"], { timeoutMs: 120000 });
        cozulen++;
      } catch {}
    }
    kontrol("kurtarılan parçalar dâhil hepsi çözülebiliyor", cozulen === yollar.length,
      `${cozulen}/${yollar.length} — yarım dosya kaldıysa birleştirme sonra patlar`);
  }
}

// ---------------------------------------------------------------------------
// 3) KAYNAK KONTROLÜ
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(new URL("../src/pipeline/transitions.js", import.meta.url), "utf8");
  kontrol("koşulsuz 'throw r.error' kaldırıldı", !/if \(!r\.ok\) throw r\.error;/.test(src));
  kontrol("kurtarma paralel yük olmadan yapılıyor",
    /parcaUret\(isler\[k\], false\)/.test(src),
    "kurtarma da paralel koşarsa aynı bellek baskısına düşer");
  kontrol("iptal edilmişse kurtarma denenmiyor",
    /if \(killer\?\.cancelled\) throw r\.error;/.test(src),
    "kullanıcı iptal ettiyse yeniden denemek zaman ve para kaybı");
}

// ---------------------------------------------------------------------------
// 4) AYNI KORUMA KESME AŞAMASINDA DA OLMALI
// ---------------------------------------------------------------------------
// Ölçülen kusur (20260812-798d89, 12 dakikalık iş): 84 kesmenin 72'si
// bittikten sonra bir ffmpeg 0xC0000005 ile çöktü ve `if (failedClip) throw`
// bütün işi düşürdü — 81 dakika, 4109 aday, 105 medya, seslendirme, hepsi
// çöpe. Geçiş aşamasında bu koruma vardı; kesme aşamasında yoktu.
{
  const rd = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("kesme aşamasında koşulsuz throw kaldırıldı",
    !/const failedClip = clipResults\.find\(\(r\) => !r\.ok\);\s*\n\s*if \(failedClip\) throw failedClip\.error;/.test(rd),
    "tek kesme çökmesi tüm işi öldürmemeli");
  kontrol("düşen kesme tek başına tekrar deneniyor",
    /klipUret\(b, k\)/.test(rd) && /paralel yük olmadan tekrar deneniyor/.test(rd));
  kontrol("tekrar da düşerse yedek kart üretiliyor",
    /yedek kart üretiliyor[\s\S]{0,400}?renderBeatClip\(\{[\s\S]{0,200}?media: null/.test(rd),
    "kart, sahnenin görselsiz kalması demek — videoyu tamamen kaybetmekten iyi");
  kontrol("kurtarmada süre/kare korunuyor",
    /dur: uzunluk\[k\], frames: layout\.L\[k\]/.test(rd),
    "süre değişirse tüm kurgu sesle kayar");
  kontrol("iptal edilmişse kurtarma denenmiyor",
    /if \(killer\.cancelled\) throw clipResults\[k\]\.error;/.test(rd));
}

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
