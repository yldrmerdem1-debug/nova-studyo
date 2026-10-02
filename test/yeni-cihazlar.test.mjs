// YENİ KURGU CİHAZLARI: tam ekran devralma + alt bant etiketi.
//
// Köşedeki küçük öğe sürekli aynı yerde durunca dekora dönüşüyordu. İki yeni
// araç bunun panzehiri:
//   DEVRALMA  — öğe vuruş anında ekranı kaplar, sonra yerine döner.
//   ALT BANT  — ekrandaki kişi/yer kim olduğunu söyler ("X · unvanı").
//
// Test kod okumakla yetinmez: GERÇEKTEN render eder, kareyi ölçer.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ff from "ffmpeg-static";
import { renderScene } from "../src/pipeline/motion.js";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { altBant } from "../src/pipeline/graphics.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const D = fs.mkdtempSync(path.join(os.tmpdir(), "nova-yc-"));
const st = { ffmpegPath: ff, preset: "veryfast", crf: 24, fps: 30 };
const KILL = { cancelled: false, add() {}, remove() {}, delete() {} };
const kanvas = makeCanvas("16:9");

// Renkli bir kaynak — köşede/tam ekranda kapladığı alanı ölçebilelim.
const kaynak = path.join(D, "kaynak.png");
execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "color=c=0xFF3B30:s=600x600",
  "-frames:v", "1", "-y", kaynak]);

/** Karedeki KIRMIZI piksel oranı — öğenin kapladığı alan. */
function kirmiziOran(mp4, an) {
  const png = mp4.replace(".mp4", `-${String(an).replace(".", "_")}.png`);
  execFileSync(ff, ["-v", "error", "-ss", String(an), "-i", mp4, "-frames:v", "1", "-y", png]);
  const rapor = "_yc.txt";
  execFileSync(ff, ["-v", "error", "-i", png,
    // kirmiziyi beyaza cevir, kalani siyah; ortalama parlaklik = oran
    "-vf", "format=rgb24,geq=r='if(gt(r(X,Y),150)*lt(g(X,Y),90)*lt(b(X,Y),90),255,0)'" +
      ":g='if(gt(r(X,Y),150)*lt(g(X,Y),90)*lt(b(X,Y),90),255,0)'" +
      ":b='if(gt(r(X,Y),150)*lt(g(X,Y),90)*lt(b(X,Y),90),255,0)',format=gray," +
      "signalstats,metadata=print:file=" + rapor,
    "-f", "null", "-"]);
  const s = fs.readFileSync(rapor, "utf8");
  const m = s.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  fs.rmSync(rapor, { force: true });
  return m ? +m[1] / 255 : 0;
}

// ---------- 1. DEVRALMA: öğe büyüyüp yerine dönüyor ----------
{
  const out = path.join(D, "devral.mp4");
  await renderScene({
    st, kanvas,
    arkaplan: { tur: "renk", renk: "0x0E1218" },
    katmanlar: [{
      tur: "gorsel", src: kaynak, x: 0.82, y: 0.24, en: 0.16,
      bas: 0.2, sure: 7.0, giris: "otur", girisSure: 0.4, cikisSure: 0.3,
      devral: { bas: 2.5, girisSure: 0.45, sure: 1.2, cikisSure: 0.45 },
    }],
    frames: 240, outFile: out, killer: KILL,
  });

  const kose = kirmiziOran(out, 1.6);   // devralmadan ÖNCE
  const tam = kirmiziOran(out, 3.4);    // devralma ORTASINDA
  const geri = kirmiziOran(out, 6.0);   // devralmadan SONRA

  kontrol("devralma oncesi oge KOSEDE kucuk", kose > 0.002 && kose < 0.06, `oran=${kose.toFixed(4)}`);
  kontrol("devralma sirasinda EKRANI kapliyor", tam > kose * 4, `kose=${kose.toFixed(4)} tam=${tam.toFixed(4)}`);
  kontrol("devralmadan sonra YERINE donuyor", Math.abs(geri - kose) < kose * 0.6 + 0.01,
    `kose=${kose.toFixed(4)} geri=${geri.toFixed(4)}`);
}

// ---------- 2. Devralma İSTENMEZSE hiçbir şey değişmiyor ----------
{
  const out = path.join(D, "sabit.mp4");
  await renderScene({
    st, kanvas,
    arkaplan: { tur: "renk", renk: "0x0E1218" },
    katmanlar: [{
      tur: "gorsel", src: kaynak, x: 0.82, y: 0.24, en: 0.16,
      bas: 0.2, sure: 7.0, giris: "otur", girisSure: 0.4, cikisSure: 0.3,
    }],
    frames: 240, outFile: out, killer: KILL,
  });
  const a = kirmiziOran(out, 1.6), b = kirmiziOran(out, 3.4);
  kontrol("devralma yoksa oge sabit kaliyor", Math.abs(a - b) < 0.01, `${a.toFixed(4)} vs ${b.toFixed(4)}`);
}

// ---------- 3. ALT BANT: ekranda gerçekten görünüyor ----------
{
  const bant = altBant("Jacques Piccard", "Denizaltı mühendisi", 7, "0xFFD23F", "tr", kanvas);
  kontrol("alt bant bindirmesi uretiliyor", !!bant && bant.length > 60, String(bant).slice(0, 40));

  const out = path.join(D, "bant.mp4");
  await renderScene({
    st, kanvas, arkaplan: { tur: "renk", renk: "0x14181e" },
    katmanlar: [], frames: 210, outFile: out, killer: KILL, bindirme: bant,
  });

  // Alt bant bolgesinde murekkep var mi? (kadrajin alt-orta seridi)
  const png = path.join(D, "bant.png");
  execFileSync(ff, ["-v", "error", "-ss", "3.0", "-i", out, "-frames:v", "1", "-y", png]);
  const rapor = "_yc2.txt";
  execFileSync(ff, ["-v", "error", "-i", png,
    "-vf", "crop=iw*0.6:ih*0.18:0:ih*0.72,format=gray,signalstats,metadata=print:file=" + rapor,
    "-f", "null", "-"]);
  const s = fs.readFileSync(rapor, "utf8");
  const g = (k) => { const m = s.match(new RegExp("lavfi\\.signalstats\\." + k + "=([\\d.]+)")); return m ? +m[1] : NaN; };
  const yayilim = g("YMAX") - g("YMIN");
  fs.rmSync(rapor, { force: true });
  kontrol("alt bant EKRANDA gorunuyor", yayilim > 80, `yayilim=${yayilim}`);

  // Rolsuz de calismali
  kontrol("rol bos olsa da bant ciziliyor", !!altBant("Kilauea", "", 7, "0xFFD23F", "tr", kanvas));
  kontrol("ad bos ise bant CIZILMIYOR", altBant("", "unvan", 7, "0xFFD23F", "tr", kanvas) === "");
  kontrol("cok kisa sahnede bant cizilmiyor", altBant("X Y", "z", 1.5, "0xFFD23F", "tr", kanvas) === "");
}

fs.rmSync(D, { recursive: true, force: true });
console.log(hata === 0 ? "\nYENI CIHAZ TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
