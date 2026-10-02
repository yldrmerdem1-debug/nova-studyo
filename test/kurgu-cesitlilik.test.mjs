// SİNEMATİK MODDA GRAFİK/KART GERÇEKTEN ÇİZİLİYOR MU?
//
// graphics.js'teki emphasisOverlay (karşılaştırma barları, dev rakam) ve
// chapterOverlay yalnızca KLASİK modda kullanılıyordu; sinematik dalda hiç
// çağrılmıyordu. Senaryo modeli bu alanları zorunlu olarak dolduruyor, yani
// belgeselin en güçlü anı (sayı karşılaştırması) çöpe gidiyordu.
//
// Bu test kod okumakla yetinmez — GERÇEKTEN render eder ve ekrandaki
// mürekkep miktarını ölçer.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ff from "ffmpeg-static";
import { renderScene } from "../src/pipeline/motion.js";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { emphasisOverlay, chapterOverlay } from "../src/pipeline/graphics.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const D = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kc-"));
const st = { ffmpegPath: ff, preset: "veryfast", crf: 24, fps: 30 };
const K = { cancelled: false, add() {}, remove() {}, delete() {} };
const kanvas = makeCanvas("16:9");

/** Kadrajdaki mürekkep: düz zemine göre ne kadar değişti? */
function murekkep(mp4, an) {
  const png = mp4.replace(".mp4", `-${an}.png`);
  execFileSync(ff, ["-v", "error", "-ss", String(an), "-i", mp4, "-frames:v", "1", "-y", png]);
  const rapor = "_kc.txt";
  execFileSync(ff, ["-v", "error", "-i", png,
    "-vf", "format=gray,signalstats,metadata=print:file=" + rapor, "-f", "null", "-"]);
  const s = fs.readFileSync(rapor, "utf8");
  const g = (k) => { const m = s.match(new RegExp("lavfi\\.signalstats\\." + k + "=([\\d.]+)")); return m ? +m[1] : NaN; };
  fs.rmSync(rapor, { force: true });
  return { ort: g("YAVG"), yayilim: g("YMAX") - g("YMIN") };
}

async function sahne(ad, bindirme) {
  const out = path.join(D, ad + ".mp4");
  await renderScene({
    st, kanvas,
    arkaplan: { tur: "renk", renk: "0x14181e" },
    katmanlar: [], frames: 120, outFile: out, killer: K, bindirme,
  });
  return out;
}

// --- 1. Bindirmesiz sahne: düz zemin, mürekkep YOK ---
const bos = await sahne("bos", "");
const bosOlcu = murekkep(bos, 2.0);
kontrol("bindirmesiz sahne düz kalıyor", bosOlcu.yayilim < 20, JSON.stringify(bosOlcu));

// --- 2. compare (karşılaştırma barları) GERÇEKTEN çiziliyor ---
const cmp = emphasisOverlay(
  { type: "compare", value: "", label: "", items: [
    { label: "Lav", value: 3100 }, { label: "İnsan", value: 1010 }] },
  6, "0xFFD23F", "tr", kanvas);
kontrol("compare bindirmesi üretiliyor", !!cmp && cmp.length > 40, String(cmp).slice(0, 40));
if (cmp) {
  const v = await sahne("compare", cmp);
  const o = murekkep(v, 2.0);
  kontrol("compare EKRANDA görünüyor", o.yayilim > 60, JSON.stringify(o));
}

// --- 3. stat (dev rakam + açıklama) ---
const stat = emphasisOverlay({ type: "stat", value: "3.100 kg/m³", label: "lav yoğunluğu", items: [] },
  6, "0xFFD23F", "tr", kanvas);
if (stat) {
  const v = await sahne("stat", stat);
  const o = murekkep(v, 2.0);
  kontrol("stat EKRANDA görünüyor", o.yayilim > 60, JSON.stringify(o));
} else kontrol("stat bindirmesi üretiliyor", false, "bos dondu");

// --- 4. bölüm kartı ---
const kart = chapterOverlay(2, "Isı Transferi", "0xFFD23F", "tr", kanvas);
if (kart) {
  const v = await sahne("kart", kart);
  const o = murekkep(v, 1.5);
  kontrol("bölüm kartı EKRANDA görünüyor", o.yayilim > 60, JSON.stringify(o));
} else kontrol("bölüm kartı üretiliyor", false, "bos dondu");

// --- 5. render.js kararı: grafik varken kinetik vuruş KAPANIYOR ---
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("grafik/kart karari planlamada veriliyor", /b\.bindirmeVar = kartVar \|\| grafikVar/.test(r));
  kontrol("bindirme varken kinetik vurus cizilmiyor",
    /const sahneVurgu = b\.bindirmeVar \? null/.test(r));
  // Karar sirasi: arac once belirlenir, kesik/vurus ondan SONRA secilir.
  // Ters sirada kesik secimi henuz tanimlanmamis karara bakiyordu (gercek hata).
  kontrol("arac karari kesik seciminden ONCE veriliyor",
    r.indexOf("const k = kurgu.get(i)") < r.indexOf("const modelIster = k?.arac"));
  kontrol("sinematik render bindirmeyi geciriyor", /crf: kesmeCrf, bindirme,/.test(r));
}

fs.rmSync(D, { recursive: true, force: true });
console.log(hata === 0 ? "\nKURGU CESITLILIK TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
