// TAKILAN BİR ALT SÜREÇ UYGULAMAYI DONDURMAMALI.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, iş 20261024-373aaf): ana süreç 48 dk dondu (bkz. ana-surec-kilitlenmez). Aynı
// denetimde ana süreçte zamanlayıcısız eşzamanlı çağrılar bulundu: spawnSync çocuk bitene kadar Node olay döngüsünü
// durdurur — takılan tek bir ffmpeg/yt-dlp arayüzü, API'yi ve iş günlüğünü sonsuza dek dondururdu. ffprobeDuration
// eşzamanlı değil ama zamanlayıcısı yoktu: takılan ffprobe sözü hiç çözmüyor, adım sonsuza dek bekliyordu.
//
// KURAL: ana süreçteki her eşzamanlı alt süreç çağrısının işine uygun bir tavanı (timeout) var, dolunca SIGKILL ile
// öldürülür (SIGTERM'i yok sayan süreçte spawnSync yine beklerdi), pencere açmaz; ffmpeg girdiden tuş beklemez
// (-nostdin). Zaman aşımı mevcut hata yolundan geçer; yarım çıktı ölçü ya da dolu dosya sayılmaz.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { spawn } from "node:child_process";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-zaman-asimi-"));
process.env.NOVA_HOME = HOME;
const { ffprobeDuration } = await import("../src/util.js");

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};
const oku = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** Kaynaktaki spawnSync/execFileSync/execSync çağrıları: satır, ilk argüman, parantezleri dengeli tam metin. */
function cagrilar(src) {
  const out = [];
  const re = /\b(spawnSync|execFileSync|execSync)\s*\(/g;
  for (let m; (m = re.exec(src)); ) {
    let i = m.index + m[0].length, derin = 1;
    while (i < src.length && derin > 0) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        i++;
        while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      } else if (c === "(") derin++;
      else if (c === ")") derin--;
      i++;
    }
    const metin = src.slice(m.index, i);
    out.push({ satir: src.slice(0, m.index).split("\n").length, ilk: (/^\w+\s*\(\s*([\w.]+)/.exec(metin) || [])[1] || "", metin });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1) Her eşzamanlı alt süreç çağrısının tavanı var
// ---------------------------------------------------------------------------
const DOSYALAR = [
  "src/pipeline/source-clips.js",
  "src/pipeline/docu-pick-inbox.js",
  "src/pipeline/replicate-video.js",
  "src/pipeline/grade.js",
  "src/pipeline/voice.js",
  "src/pipeline/inbox-commons.js",
  "src/pipeline/docu-shorts.js",
  "src/pipeline/docu-shorts-pictures.js",
  "src/util.js",
];
for (const f of DOSYALAR) {
  const src = oku(f);
  const cs = cagrilar(src);
  if (f !== "src/util.js") kontrol(`${f}: eşzamanlı çağrı bulundu (tarayıcı çalışıyor)`, cs.length > 0);
  for (const c of cs) {
    const yer = `${f}:${c.satir}`;
    const t = /\btimeout:\s*(\d+|[A-Za-z_$][\w$]*)/.exec(c.metin);
    kontrol(`${yer} zaman aşımı var`, !!t, c.metin.slice(0, 140));
    if (t && /^\d+$/.test(t[1])) kontrol(`${yer} zaman aşımı makul (1-300 sn)`, +t[1] >= 1000 && +t[1] <= 300000, t[1]);
    kontrol(`${yer} SIGKILL ile öldürülüyor`, /killSignal:\s*["']SIGKILL["']/.test(c.metin));
    kontrol(`${yer} pencere açmıyor`, /windowsHide:\s*true/.test(c.metin));
    if (/ffmpeg/i.test(c.ilk) || c.ilk === "ff") {
      // Argümanlar bir değişkende kurulduysa (spawnSync(ffmpeg, args, …)), o dizinin tanımı -nostdin ile başlamalı.
      const degisken = /^\w+\s*\(\s*[\w.]+\s*,\s*([A-Za-z_$][\w$]*)\s*,/.exec(c.metin)?.[1];
      const onceki = src.split("\n").slice(Math.max(0, c.satir - 120), c.satir).join("\n");
      const tanim = degisken && [...onceki.matchAll(new RegExp(`const ${degisken} = \\[[^\\n]*`, "g"))].at(-1)?.[0];
      kontrol(`${yer} ffmpeg -nostdin`, /["']-nostdin["']/.test(c.metin) || /\[\s*["']-nostdin["']/.test(tanim || ""), tanim || c.metin.slice(0, 120));
    }
  }
}
{
  // yt-dlp çalıştırıcısının tavanı değişkenden gelir: varsayılan ve her çağıranın verdiği süre sınırlı.
  const sc = oku("src/pipeline/source-clips.js");
  kontrol("yt-dlp çalıştırıcısının varsayılan tavanı var", /return \(args, \{ timeoutMs = \d+ \} = \{\}\) =>/.test(sc));
  const sureler = [...sc.matchAll(/timeoutMs(?::| =) (\d+)/g)].map((m) => +m[1]);
  kontrol("yt-dlp tavanları ≤ 300 sn", sureler.length >= 5 && sureler.every((s) => s > 0 && s <= 300000), sureler.join(","));
}

// ---------------------------------------------------------------------------
// 2) Zaman aşımı mevcut hata yolundan geçiyor, yarım çıktı kullanılmıyor
// ---------------------------------------------------------------------------
{
  const sc = oku("src/pipeline/source-clips.js");
  const probe = sc.slice(sc.indexOf("function probe(ffmpeg, file)"), sc.indexOf("export function fetchClip"));
  kontrol("kaynak klip ölçümü: zaman aşımında ölçü yok", /if \(r\.error\) return parseProbe\(""\)/.test(probe));
  const fc = sc.slice(sc.indexOf("export function fetchClip"), sc.indexOf("/* ------------------------------------------------------------------ denetim"));
  kontrol("kaynak klip: kesik poster silinir", /if \(r\.error\) fs\.rmSync\(jpg, \{ force: true \}\)/.test(fc));
  kontrol("kaynak klip: kesik ses silinir", /if \(r\.error\) fs\.rmSync\(wav, \{ force: true \}\)/.test(fc));

  const ic = oku("src/pipeline/inbox-commons.js");
  const ib = ic.slice(ic.indexOf("const r = spawnSync(ffmpeg"), ic.indexOf("seçilen fotoğraf dönüştürülemedi"));
  kontrol("görsel kutusu: dönüştürülemeyen (zaman aşımı) PNG kutuda kalmaz", /if \(r\.status !== 0\) \{\s*fs\.rmSync\(png, \{ force: true \}\)/.test(ib));

  const pi = oku("src/pipeline/docu-pick-inbox.js");
  kontrol("seçim kutusu: kesik sayfa silinir", /if \(r\.error\) fs\.rmSync\(out, \{ force: true \}\)/.test(pi));

  const rv = oku("src/pipeline/replicate-video.js");
  kontrol("resimden video: ölçüm zaman aşımında süre 0", /const s = r\.error \? "" : String\(r\.stderr/.test(rv));
  kontrol("resimden video: başlangıç karesi hatası zaman aşımını da yazıyor", /r\.stderr \|\| r\.error\?\.message/.test(rv));

  const gr = oku("src/pipeline/grade.js");
  kontrol("renk ölçümü: zaman aşımında ölçülemedi (null)", /if \(r\.error\) return null;/.test(gr));

  const vo = oku("src/pipeline/voice.js");
  const kd = vo.slice(vo.indexOf("export async function kirpDuraklamalar"), vo.indexOf("if (!bulunan.length) return null;"));
  kontrol("duraklama kırpma: zaman aşımında yarım sessizlik listesiyle kırpılmaz", kd.indexOf("if (r.error) throw r.error;") > 0 && kd.indexOf("if (r.error) throw r.error;") < kd.indexOf("matchAll"));
}

// ---------------------------------------------------------------------------
// 3) ffprobeDuration: takılan süreç öldürülür, 0 döner
// ---------------------------------------------------------------------------
const kapandi = (p, ms = 5000) =>
  new Promise((r) => {
    if (p.exitCode !== null || p.signalCode !== null) return r(true);
    const t = setTimeout(() => r(false), ms);
    p.once("close", () => { clearTimeout(t); r(true); });
  });
{
  let cocuk = null;
  const takilan = (cmd, args, opts) => (cocuk = spawn(process.execPath, ["-e", "setTimeout(()=>{},60000)"], opts));
  const t0 = Date.now();
  let bekci;
  const sure = await Promise.race([
    ffprobeDuration(path.join(HOME, "yok-ffprobe.exe"), path.join(HOME, "a.mp4"), { timeoutMs: 400, spawnFn: takilan }),
    new Promise((r) => (bekci = setTimeout(() => r("ASILI"), 8000))),
  ]);
  clearTimeout(bekci);
  const gecen = Date.now() - t0;
  kontrol("ffprobeDuration sahte (takılan) süreci başlattı", !!cocuk);
  kontrol("takılan ffprobe'da söz çözülüyor ve 0 dönüyor", sure === 0, String(sure));
  kontrol("tavanda dönüyor (≈400 ms)", gecen >= 350 && gecen < 5000, `${gecen} ms`);
  kontrol("takılan süreç öldürüldü", !!cocuk && (await kapandi(cocuk)) && cocuk.killed);
  if (cocuk && cocuk.exitCode === null && cocuk.signalCode === null) try { cocuk.kill("SIGKILL"); } catch {}
}
{
  // Olağan yol değişmedi: süre okunuyor ve zamanlayıcı temizleniyor (60 sn'lik zamanlayıcı test sürecini tutmaz).
  const once = process.getActiveResourcesInfo?.().filter((x) => x === "Timeout").length ?? 0;
  const yazan = (cmd, args, opts) => spawn(process.execPath, ["-e", "process.stdout.write('12.5\\n')"], opts);
  const sure = await ffprobeDuration("ffprobe", "a.mp4", { spawnFn: yazan });
  kontrol("olağan yolda süre okunuyor", sure === 12.5, String(sure));
  const sonra = process.getActiveResourcesInfo?.().filter((x) => x === "Timeout").length ?? 0;
  kontrol("olağan yolda zamanlayıcı temizlendi", sonra <= once, `${once} → ${sonra}`);
  const hatali = () => { const p = spawn(path.join(HOME, "yok.exe"), [], { windowsHide: true }); return p; };
  kontrol("başlatılamayan ffprobe yine 0", (await ffprobeDuration("x", "a.mp4", { spawnFn: hatali })) === 0);
  const u = oku("src/util.js");
  const v = /export async function ffprobeDuration\(ffprobe, file, \{ timeoutMs = (\d+)/.exec(u);
  kontrol("ffprobeDuration varsayılan tavanı var (≤ 120 sn)", !!v && +v[1] > 0 && +v[1] <= 120000, v?.[1]);
}

try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
