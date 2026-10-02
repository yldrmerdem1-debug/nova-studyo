// BÖLÜME GÖRE MÜZİK — plan mantığı + GERÇEK ffmpeg ses ölçümü.
//
// Ölçülen kusur: dört yatak parçanın dördü de 4:00. Video başına tek parça
// seçildiği için 12 dakikalık videoda aynı dört dakika üç kez, 20 dakikalıkta
// beş kez tekrar ediyordu.
//
// Bu paketin ikinci yarısı ses zincirini GERÇEKTEN çalıştırıyor: üç ayrı
// frekansta yatak üretiliyor (220 / 440 / 880 Hz), zincirden geçiriliyor,
// sonra çıktının farklı anlarında hangi frekansın baskın olduğu bandpass +
// volumedetect ile ölçülüyor. Yani "müzik değişti" iddiası kulakla değil
// ölçümle doğrulanıyor.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";
import {
  akisIndeksi, parcaSec, bolumSureleri, muzikPlani, muzikZinciri,
  CAPRAZ, EN_KISA_BLOK, EN_COK_BLOK, MUZIK_AKISI,
} from "../src/pipeline/muzik.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const st = getSettings();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-muzik-"));
const YATAKLAR = ["fixture-gerilim.mp3", "fixture-notr.mp3", "fixture-derin.mp3", "fixture-ilham.mp3"];

// ---------------------------------------------------------------------------
// 1) KONUM → ROL
// ---------------------------------------------------------------------------
kontrol("ilk bölüm kanca yatağını alır", akisIndeksi(0, 5) === 0);
kontrol("son bölüm kapanış yatağını alır", akisIndeksi(4, 5) === 3);
kontrol("tek bölümlü videoda indeks 0", akisIndeksi(0, 1) === 0);
kontrol("üç bölümde orta bölüm doruk olur", akisIndeksi(1, 3) === 2,
  "kanca → doruk → kapanış yayı; 'notr' araya girerse video düzleşiyor");
{
  const alti = [0, 1, 2, 3, 4, 5].map((i) => akisIndeksi(i, 6));
  kontrol("altı bölümde indeksler artan sırada", alti.every((v, i) => i === 0 || v >= alti[i - 1]),
    JSON.stringify(alti));
  kontrol("altı bölümde dört rolün hepsi kullanılır", new Set(alti).size === 4, JSON.stringify(alti));
}

// ---------------------------------------------------------------------------
// 2) PARÇA SEÇİMİ
// ---------------------------------------------------------------------------
kontrol("anahtar dosya adında geçiyorsa o parça seçilir",
  parcaSec("derin", YATAKLAR, 7, 2) === "fixture-derin.mp3");
{
  // Kullanıcı YouTube Audio Library'den rastgele adlı parçalar atarsa hiçbir
  // anahtar eşleşmez. O zaman bile dört rol dört FARKLI parçaya düşmeli.
  const isimsiz = ["a.mp3", "b.mp3", "c.mp3", "d.mp3"];
  const secim = [0, 1, 2, 3].map((k) => parcaSec("gerilim", isimsiz, 3, k));
  kontrol("isimsiz parçalarda bile roller farklı dosyalara düşer",
    new Set(secim).size === 4, JSON.stringify(secim));
}
{
  const a = parcaSec("gerilim", YATAKLAR, 11, 0);
  const b = parcaSec("gerilim", YATAKLAR, 11, 0);
  kontrol("seçim kararlı (aynı iş hep aynı müziği alır)", a === b);
}

// ---------------------------------------------------------------------------
// 3) BÖLÜM SÜRELERİ
// ---------------------------------------------------------------------------
{
  const flat = [
    { sectionIndex: 0, dur: 10 }, { sectionIndex: 0, dur: 5 },
    { sectionIndex: 1, dur: 20 },
    { sectionIndex: 2, dur: 7.5 },
  ];
  const s = bolumSureleri(flat);
  kontrol("bölüm süreleri segmentlerden toplanır",
    s.length === 3 && s[0] === 15 && s[1] === 20 && s[2] === 7.5, JSON.stringify(s));
}
kontrol("boş segment listesi çökmez", bolumSureleri([]).length === 0);
kontrol("sectionIndex yoksa tek bölüm sayılır",
  bolumSureleri([{ dur: 9 }, { dur: 1 }]).length === 1);

// ---------------------------------------------------------------------------
// 4) PLAN
// ---------------------------------------------------------------------------
{
  const p = muzikPlani({ theme: "belgesel", id: "x1" }, [120, 120, 120, 120], YATAKLAR);
  kontrol("dört bölümlü belgeselde dört ayrı yatak", p.length === 4 && new Set(p.map((b) => b.dosya)).size === 4,
    p.map((b) => b.dosya).join(","));
  kontrol("plan süresi videonun toplam süresini korur",
    Math.abs(p.reduce((a, b) => a + b.sure, 0) - 480) < 0.001);
  kontrol("belgesel kancası gerilim yatağıyla açılır", p[0].dosya.includes("gerilim"));
  kontrol("belgesel ilhamla kapanır", p[p.length - 1].dosya.includes("ilham"));
}
{
  // Aynı parçaya düşen ARDIŞIK bölümler birleşmeli — yoksa parça kendi kendine
  // çapraz geçiş yapar ve izleyici baştan başladığını duyar.
  const p = muzikPlani({ theme: "haber", id: "x2" }, [100, 100, 100, 100, 100], YATAKLAR);
  const ardisikTekrar = p.some((b, i) => i > 0 && b.dosya === p[i - 1].dosya);
  kontrol("ardışık aynı parça birleştirilir", !ardisikTekrar, p.map((b) => b.dosya).join(","));
}
{
  // 8 saniyelik bir bölüm kendi yatağını hak etmez: 3 sn çapraz geçiş bloğun
  // kendisinden uzun olurdu.
  const p = muzikPlani({ theme: "belgesel", id: "x3" }, [200, 8, 200], YATAKLAR);
  kontrol("çok kısa bölüm komşusuna katılır", p.every((b) => b.sure >= EN_KISA_BLOK),
    JSON.stringify(p.map((b) => Math.round(b.sure))));
  kontrol("kısa bölüm katılınca süre kaybolmuyor",
    Math.abs(p.reduce((a, b) => a + b.sure, 0) - 408) < 0.001);
}
{
  const cok = Array.from({ length: 14 }, () => 60);
  const p = muzikPlani({ theme: "analiz", id: "x4" }, cok, YATAKLAR);
  kontrol("blok sayısı tavanı aşılmıyor", p.length <= EN_COK_BLOK, `${p.length} blok`);
  kontrol("14 bölümde bile süre korunuyor",
    Math.abs(p.reduce((a, b) => a + b.sure, 0) - 840) < 0.001);
}
// UZUN VİDEODA TEK PARÇA TEKRARA DÜŞMESİN.
//
// Ölçülen kusur: 30 dk / 7 bölüm benzetiminde 2., 3. ve 4. bölümün üçü de
// "notr" rolüne düşüyor, üçü de aynı dosyayı alıyor ve tek bir 771 saniyelik
// bloğa yapışıyordu. 2:17'lik parça o blokta 5,6 kez tekrarlıyor — yani
// giderilmek istenen monotonluk uzun videoda aynen geri geliyordu.
{
  // ADLAR BİLEREK "yatak-<rol>.mp3" DEĞİL. O dört çıplak ad kurulumla gelen
  // YER TUTUCU yataklara ayrılmış (üretilmiş sub-bas drone'lar, bkz. muzik.js
  // YER_TUTUCU) ve gerçek parça varken hiç seçilmiyorlar. Fixture olarak
  // kullanılırlarsa havuz yarıya iniyor ve bu test yanlış yere kırılıyor.
  const GENIS = [
    "yatak-gerilim-a.mp3", "yatak-gerilim-b.mp3",
    "yatak-notr-a.mp3", "yatak-notr-b.mp3",
    "yatak-derin-a.mp3", "yatak-derin-b.mp3",
    "yatak-ilham-a.mp3", "yatak-ilham-b.mp3",
  ];
  const yedi = Array.from({ length: 7 }, () => 257);
  const p = muzikPlani({ theme: "belgesel", id: "uzun" }, yedi, GENIS);
  const ardisik = p.some((b, i) => i > 0 && b.dosya === p[i - 1].dosya);
  kontrol("geniş havuzda ardışık bölümler farklı yatak alır", !ardisik,
    p.map((b) => b.dosya).join(","));
  const enUzun = Math.max(...p.map((b) => b.sure));
  kontrol("geniş havuzda hiçbir blok aşırı uzamıyor", enUzun < 400,
    `en uzun blok ${Math.round(enUzun)} sn — 771 sn'lik kusur geri döndü mü?`);
  kontrol("30 dk / 7 bölüm en az 6 yatak duyuruyor", p.length >= 6, `${p.length} yatak`);
  kontrol("geniş havuzda süre yine korunuyor",
    Math.abs(p.reduce((a, b) => a + b.sure, 0) - 7 * 257) < 0.001);
}
{
  // Rol başına TEK parça varsa yapacak bir şey yok: eski davranış (birleşme)
  // korunmalı, havuzda olmayan bir dosya uydurulmamalı.
  const p = muzikPlani({ theme: "belgesel", id: "dar" },
    Array.from({ length: 7 }, () => 257), YATAKLAR);
  kontrol("dar havuzda ardışık aynı rol yine birleşir", p.length < 7, `${p.length} blok`);
  kontrol("dar havuzda yalnızca havuzdaki dosyalar kullanılır",
    p.every((b) => YATAKLAR.includes(b.dosya)));
}
kontrol("music/ boşsa plan boş döner (müziksiz dal)",
  muzikPlani({ theme: "belgesel", id: "x5" }, [100, 100], []).length === 0);
kontrol("süre yoksa plan boş döner",
  muzikPlani({ theme: "belgesel", id: "x6" }, [0, 0], YATAKLAR).length === 0);
kontrol("bilinmeyen tema varsayılan akışa düşer",
  muzikPlani({ theme: "boyle-bir-tema-yok", id: "x7" }, [100, 100], YATAKLAR).length === 2);
kontrol("her tema dört aşamalı akış tanımlıyor",
  Object.values(MUZIK_AKISI).every((a) => a.length === 4));

// ---------------------------------------------------------------------------
// 5) ZİNCİR BİÇİMİ
// ---------------------------------------------------------------------------
{
  const bloklar = [{ dosya: "a.mp3", sure: 60 }, { dosya: "b.mp3", sure: 40 }];
  const { girdiler, muzikZinciri: z } = muzikZinciri(bloklar,
    { narration: "n.wav", musicVolume: 0.16, toplamSure: 100 });
  kontrol("her blok kendi -stream_loop girdisini alır",
    girdiler.filter((x) => x === "-stream_loop").length === 2, girdiler.join(" "));
  kontrol("anlatım ilk girdi", girdiler[0] === "-i" && girdiler[1] === "n.wav");
  kontrol("bloklar arasında acrossfade var", z.includes(`acrossfade=d=${CAPRAZ}`));
  kontrol("zincir [mus] etiketiyle bitiyor (ducking çağıranda)", /\[mus\]$/.test(z));
  kontrol("ses seviyesi ayardan geliyor", z.includes("volume=0.16"));
  kontrol("çıkış fade'i videonun sonuna oturuyor", z.includes("st=96.50:d=3.5"));
  kontrol("bloklar çapraz geçiş payı kadar uzun kesiliyor",
    z.includes(`atrim=0:${(60 + CAPRAZ).toFixed(3)}`) && z.includes(`atrim=0:${(40 + CAPRAZ).toFixed(3)}`));
}
{
  const tek = muzikZinciri([{ dosya: "a.mp3", sure: 100 }],
    { narration: "n.wav", musicVolume: 0.2, toplamSure: 100 });
  kontrol("tek blokta çapraz geçiş yok", !tek.muzikZinciri.includes("acrossfade"));
  kontrol("tek blokta blok tam boyunda kesiliyor", tek.muzikZinciri.includes("atrim=0:100.000"));
}

// ---------------------------------------------------------------------------
// 6) GERÇEK SES: müzik gerçekten değişiyor mu?
// ---------------------------------------------------------------------------
// Üç yatak üç ayrı frekans. Blok başına 20 sn, yatakların kendisi 6 sn —
// yani her blok içinde parçanın DÖNGÜYE girmesi de gerekiyor.
const FREK = [220, 440, 880];
const YATAK_SN = 6;
const BLOK_SN = 20;

for (let i = 0; i < FREK.length; i++) {
  await run(st.ffmpegPath, ["-y", "-f", "lavfi",
    "-i", `sine=frequency=${FREK[i]}:duration=${YATAK_SN}:sample_rate=48000`,
    "-c:a", "pcm_s16le", path.join(DIR, `t${i}.wav`)], { timeoutMs: 120000 });
}
const anlatim = path.join(DIR, "narration.wav");
await run(st.ffmpegPath, ["-y", "-f", "lavfi",
  "-i", `anullsrc=r=48000:cl=mono:d=${BLOK_SN * 3}`, "-c:a", "pcm_s16le", anlatim],
  { timeoutMs: 120000 });

const bloklar = FREK.map((_, i) => ({ dosya: path.join(DIR, `t${i}.wav`), sure: BLOK_SN }));
const mz = muzikZinciri(bloklar, { narration: anlatim, musicVolume: 1.0, toplamSure: BLOK_SN * 3 });
// render.js'teki zincirin AYNISI — ducking ve amix dâhil.
const zincir =
  `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[ses][yan];` +
  `${mz.muzikZinciri};` +
  `[mus][yan]sidechaincompress=threshold=0.02:ratio=10:attack=120:release=500[duck];` +
  `[ses][duck]amix=inputs=2:duration=first:normalize=0`;

const cikti = path.join(DIR, "mix.wav");
await run(st.ffmpegPath, ["-y", ...mz.girdiler, "-filter_complex", zincir,
  "-c:a", "pcm_s16le", cikti], { timeoutMs: 300000 });
kontrol("ses zinciri gerçek ffmpeg ile hatasız çalışıyor", fs.existsSync(cikti));

/** T anındaki 2 saniyede `f` Hz bandının ortalama gücü (dB). */
async function bandGucu(t, f) {
  let db = -99;
  await run(st.ffmpegPath, ["-ss", String(t), "-t", "2", "-i", cikti,
    "-af", `bandpass=f=${f}:width_type=h:w=30,volumedetect`, "-f", "null", "-"],
    { timeoutMs: 120000, onLine: (s) => {
      const m = String(s).match(/mean_volume:\s*(-?[\d.]+) dB/);
      if (m) db = parseFloat(m[1]);
    } });
  return db;
}

// Her bloğun ortasında KENDİ frekansı baskın olmalı, diğerleri değil.
for (let i = 0; i < 3; i++) {
  const t = i * BLOK_SN + 9; // blok ortası, çapraz geçişlerden uzak
  const kendi = await bandGucu(t, FREK[i]);
  const digerleri = [];
  for (let j = 0; j < 3; j++) if (j !== i) digerleri.push(await bandGucu(t, FREK[j]));
  const enYuksekDiger = Math.max(...digerleri);
  kontrol(`blok ${i + 1} ortasında ${FREK[i]} Hz baskın`,
    kendi - enYuksekDiger > 20,
    `kendi ${kendi.toFixed(1)} dB, en yüksek diğer ${enYuksekDiger.toFixed(1)} dB`);
}

// Yatak 6 sn, blok 20 sn: 19. saniyede hâlâ ses olması döngünün çalıştığını
// gösteriyor (üçüncü tur). Eski kodda da -stream_loop vardı, bu koruma testi.
{
  const gec = await bandGucu(BLOK_SN * 2 + 17, FREK[2]);
  kontrol("kısa yatak bloğu sonuna kadar döngüyle dolduruyor", gec > -40, `${gec.toFixed(1)} dB`);
}

// Çıktı süresi anlatımla aynı olmalı — çapraz geçiş payı videoyu uzatmamalı.
{
  let sure = 0;
  await run(st.ffmpegPath, ["-i", cikti, "-f", "null", "-"], { timeoutMs: 120000,
    onLine: (s) => {
      const m = String(s).match(/time=(\d+):(\d+):([\d.]+)/);
      if (m) sure = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
    } });
  kontrol("çapraz geçiş payı toplam süreyi uzatmıyor",
    Math.abs(sure - BLOK_SN * 3) < 0.5, `${sure.toFixed(2)} sn (beklenen ${BLOK_SN * 3})`);
}

// ---------------------------------------------------------------------------
// 7) render.js gerçekten bağlanmış mı
// ---------------------------------------------------------------------------
{
  const rd = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("render video başına tek parça seçmiyor", !/function pickMusic/.test(rd));
  kontrol("render bölüm sürelerini müziğe veriyor",
    rd.includes("muzikPlani(job, bolumSureleri(flat)"));
  kontrol("ducking ve amix korunmuş",
    rd.includes("sidechaincompress") && rd.includes("amix=inputs=2:duration=first:normalize=0"));
}

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
