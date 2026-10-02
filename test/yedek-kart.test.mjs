// YEDEK KART SİYAH EKRAN OLMAMALI.
//
// Ölçülen kusur (20260810-210a05): videonun 18,9 saniyesi (%4,5) siyahtı —
// üç yerde 4,4 / 5,7 / 8,2 saniyelik bomboş kareler. Kullanıcı fark etti:
// "bazı kareler boş siyah ekran gözüküyordu".
//
// İki sebep vardı:
//   1) Zemin 0x0d1117 — neredeyse saf siyah.
//   2) `font && !overlay` koşulu: ekranda bir bindirme varsa yazı HİÇ
//      çizilmiyordu. Vox + "sadece vurgu" düzeninde vurgulanacak sayı/ad
//      olmayan sahnede bindirme de boşsa kare tamamen boşalıyordu.
//
// Bu paket gerçek ffmpeg ile kart üretip blackdetect'e sokuyor.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";
import { canvasOf } from "../src/pipeline/canvas.js";
import { metinPerdesi } from "../src/pipeline/graphics.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const st = getSettings();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kart-"));
const K = canvasOf({ ratio: "16:9" });

/** Kartı render.js'teki yedek yolun AYNI filtresiyle üret. */
async function kartUret(cardText, overlay, dosya) {
  const perde = metinPerdesi(cardText, "", 4, "0x22d3ee", "tr", K);
  const vf = `${K.dolgu("0x17202e")}${perde}${overlay},setsar=1,format=yuv420p`;
  await run(st.ffmpegPath, ["-y", "-f", "lavfi", "-i", `${K.renk("0x17202e")}:r=30`,
    "-vf", vf, "-frames:v", "120", "-r", "30", "-c:v", "libx264", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p", dosya], { timeoutMs: 120000 });
}

/** blackdetect'in siyah saydığı toplam süre. */
async function siyahSure(dosya) {
  let t = 0;
  await run(st.ffmpegPath, ["-i", dosya, "-vf", "blackdetect=d=0.1:pix_th=0.10", "-an", "-f", "null", "-"],
    { timeoutMs: 120000, onLine: (s) => {
      for (const m of String(s).matchAll(/black_duration:([\d.]+)/g)) t += parseFloat(m[1]);
    } });
  return t;
}

// 1) BİNDİRME YOKKEN — en sık vaka
const a = path.join(DIR, "bindirmesiz.mp4");
await kartUret("Ottoman Empire map Balkans", "", a);
const sa = await siyahSure(a);
kontrol("bindirme yokken kart SİYAH DEĞİL", sa === 0, `${sa.toFixed(2)} sn siyah`);

// 2) BİNDİRME VARKEN — eski kod burada yazıyı hiç çizmiyordu
const b = path.join(DIR, "bindirmeli.mp4");
await kartUret("Zemun school for the blind", ",drawbox=x=40:y=40:w=200:h=8:color=0x22d3ee@1:t=fill", b);
const sb = await siyahSure(b);
kontrol("bindirme VARKEN de kart siyah değil", sb === 0, `${sb.toFixed(2)} sn siyah`);

// 3) Metin boşsa bile zemin siyah olmamalı
const c = path.join(DIR, "metinsiz.mp4");
await kartUret("", "", c);
const sc2 = await siyahSure(c);
kontrol("metin boşken bile zemin siyah değil", sc2 === 0, `${sc2.toFixed(2)} sn siyah`);

// 4) Kaynak kodda eski kusurlar kalmamalı
const rd = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
kontrol("neredeyse siyah zemin (0x0d1117) kaldırıldı", !rd.includes('renk("0x0d1117")'));
// Not: aynı ifade AÇIKLAMA satırında geçiyor (hatanın kaydı). Aranan şey
// çalışan koddaki KULLANIMI — koşul ifadesi olarak kalmamalı.
kontrol("bindirme varken yazıyı susturan koşul kaldırıldı",
  !/const draw = font && !overlay/.test(rd),
  "bu koşul yüzünden vurgu yokken kare tamamen boşalıyordu");
kontrol("yedek kart tasarlanmış tipografiyi kullanıyor",
  rd.includes("const perde = metinPerdesi(cardText"));
kontrol("accent ve dil yedek karta geçiriliyor",
  rd.includes("accent, loc,") && rd.includes("accent = \"0x22d3ee\", loc = \"tr\""));

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
