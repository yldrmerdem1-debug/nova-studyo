// KÜÇÜK GÖRSEL PERDESİ — gerçek ffmpeg çalıştırır, çıktıyı ölçer.
//
// Vaka: Baba Vanga'nın yüzünün serbest lisanslı fotoğrafı yok; Wikipedia
// maddesindeki gerçek fotoğrafı 220x314. Ham büyütme 8,7 kat olur ve lapa
// görünür. Perde: aynı görselin bulanık büyütmesi arka planda, keskin
// orijinal ortada.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { perdeyeOturt, kucukleriPerdele } from "../src/pipeline/kucukgorsel.js";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const ff = getSettings().ffmpegPath;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-perde-test-"));

/** 220x314'lük sahte bir "arşiv portresi" üret. */
const kucuk = path.join(tmp, "kucuk.jpg");
await run(ff, ["-y", "-f", "lavfi", "-i", "testsrc=size=220x314:duration=1:rate=1",
  "-frames:v", "1", kucuk], { timeoutMs: 45000 });
kontrol("hazırlık: küçük kaynak üretildi", fs.existsSync(kucuk) && fs.statSync(kucuk).size > 0);

// run() çözümlenirken çıktı döndürmüyor; satırlar onLine ile toplanır.
async function olcu(dosya) {
  let cikti = "";
  await run(getSettings().ffprobePath,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-of", "csv=p=0", dosya], { timeoutMs: 30000, onLine: (s) => { cikti += s; } });
  const [w, h] = cikti.trim().split(/[\s,]+/).map(Number);
  return { w, h };
}

// --------------------------------------------------------------- 16:9
const cikis = path.join(tmp, "perde.jpg");
const sonuc = await perdeyeOturt(ff, kucuk, cikis, { w: 1920, h: 1080 });
kontrol("perde: dosya üretildi", !!sonuc && fs.existsSync(cikis));
const o = await olcu(cikis);
kontrol("perde: tam kanvas boyutunda", o.w === 1920 && o.h === 1080, `${o.w}x${o.h}`);
kontrol("perde: kaynaktan büyük dosya (içerik dolduruldu)",
  fs.statSync(cikis).size > fs.statSync(kucuk).size);

// --------------------------------------------------------------- 9:16
const dikey = path.join(tmp, "perde_dikey.jpg");
await perdeyeOturt(ff, kucuk, dikey, { w: 1080, h: 1920 });
const od = await olcu(dikey);
kontrol("perde: dikey kanvas da doldurulur", od.w === 1080 && od.h === 1920, `${od.w}x${od.h}`);

// ------------------------------------------------------- KAYIT GÜNCELLEME
const media = {
  s0b0: { beatId: "s0b0", file: kucuk, type: "image", kucuk: true },
  s0b1: { beatId: "s0b1", file: kucuk, type: "image", kucuk: false },
};
const eskiB1 = media.s0b1.file;
const n = await kucukleriPerdele(media, { ffmpegPath: ff, w: 1920, h: 1080 });
kontrol("toplu: yalnızca küçük işaretli olan işlenir", n === 1, `işlenen: ${n}`);
kontrol("toplu: işlenen kaydın dosyası değişti ve işaretlendi",
  media.s0b0.file !== kucuk && media.s0b0.perdelendi === true);
kontrol("toplu: işaretsiz kayda dokunulmadı",
  media.s0b1.file === eskiB1 && !media.s0b1.perdelendi);
const op = await olcu(media.s0b0.file);
kontrol("toplu: yeni dosya tam kanvas", op.w === 1920 && op.h === 1080);

// --------------------------------------------------------- BAŞARISIZLIK
// Bozuk kaynakta ESKİ dosya korunmalı: küçük ama doğru görsel, hiç görsel
// olmamasından iyidir.
const bozuk = path.join(tmp, "bozuk.jpg");
fs.writeFileSync(bozuk, "bu bir jpeg değil");
const m2 = { s1b0: { beatId: "s1b0", file: bozuk, type: "image", kucuk: true } };
const n2 = await kucukleriPerdele(m2, { ffmpegPath: ff, w: 1920, h: 1080, logFn: () => {} });
kontrol("başarısızlık: sayılmaz ve eski dosya korunur",
  n2 === 0 && m2.s1b0.file === bozuk && !m2.s1b0.perdelendi);

// Video kaydı bu yoldan geçmemeli (Ken Burns'ü bozar).
const m3 = { s2b0: { beatId: "s2b0", file: kucuk, type: "video", kucuk: true } };
kontrol("video kaydı perdelenmez",
  (await kucukleriPerdele(m3, { ffmpegPath: ff })) === 0 && m3.s2b0.file === kucuk);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
