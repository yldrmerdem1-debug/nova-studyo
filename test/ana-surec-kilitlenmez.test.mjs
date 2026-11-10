// BİR DOSYA YAZIMI İŞİ VE ANA SÜRECİ DONDURMAMALI.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, iş 20261024-373aaf): ön izleme kapısının 2. turu
// 17:10:41'de job.json'ı yazarken durdu ve 48 dk hiçbir şey olmadı: log yok,
// motor süreci bitmiş, CPU sıfır, http://127.0.0.1:4545 cevapsız. job.json.tmp
// diskte kalmıştı (yeni içerik yazılmış, rename olmamış). Zincir:
//   writeJson → fs.renameSync EPERM (başka bir okuyucu hedefi silme izni
//   vermeden açık tutuyordu) → updateJob fırlattı → motorun stdout dinleyicisi
//   → uncaughtException → dialog.showErrorBox: EŞZAMANLI, KİPLİ pencere, arkada
//   kaldı; Node olay döngüsü o pencere kapanana kadar durdu.
//
// DÜZELTME: rename kısa aralıklarla yeniden deneniyor, olmazsa üstüne kopyalanıyor;
// updateJob yazamazsa fırlatmıyor, sonra yeniden yazıyor; ana süreçteki hata
// yakalayıcı artık beklemeyen bir pencere açıyor ve hatayı dosyaya yazıyor.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kilit-"));
process.env.NOVA_HOME = HOME;
const { writeJson, RENAME_WAITS } = await import("../src/util.js");
const store = await import("../src/store.js");

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const asilRename = fs.renameSync;
const asilKopya = fs.copyFileSync;
const mesgul = (code = "EPERM") => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });

// ---------------------------------------------------------------------------
// 1) writeJson: meşgul hedef
// ---------------------------------------------------------------------------
{
  const f = path.join(HOME, "a.json");
  writeJson(f, { v: 1 });
  let kalan = 2;
  fs.renameSync = (...a) => { if (kalan-- > 0) throw mesgul(); return asilRename(...a); };
  try { writeJson(f, { v: 2 }); } catch (e) { kontrol("iki kez EPERM sonrası yazım fırlatmıyor", false, e.message); }
  fs.renameSync = asilRename;
  kontrol("iki kez EPERM sonrası yeni içerik yerinde", JSON.parse(fs.readFileSync(f, "utf8")).v === 2);
  kontrol("geçici dosya kalmadı", !fs.existsSync(f + ".tmp"));
}
{
  const f = path.join(HOME, "b.json");
  writeJson(f, { v: 1 });
  fs.renameSync = () => { throw mesgul("EBUSY"); };
  const t0 = Date.now();
  try { writeJson(f, { v: 3 }); } catch (e) { kontrol("rename hiç olmazsa kopyayla yazılıyor", false, e.message); }
  const sure = Date.now() - t0;
  fs.renameSync = asilRename;
  kontrol("rename hiç olmazsa kopyayla yazılıyor", JSON.parse(fs.readFileSync(f, "utf8")).v === 3);
  kontrol("kopya sonrası geçici dosya silindi", !fs.existsSync(f + ".tmp"));
  const tavan = RENAME_WAITS.reduce((a, b) => a + b, 0);
  kontrol(`bekleme sınırlı (~${tavan} ms)`, sure < tavan + 1500, `${sure} ms`);
}
{
  const f = path.join(HOME, "c.json");
  fs.renameSync = () => { throw mesgul("ENOSPC"); };
  let atti = false;
  try { writeJson(f, { v: 1 }); } catch { atti = true; }
  fs.renameSync = asilRename;
  kontrol("meşguliyet dışı hata (ENOSPC) yine fırlatılıyor", atti);
}

// ---------------------------------------------------------------------------
// 2) updateJob: diske yazılamasa da iş durumu ilerliyor, fırlatmıyor
// ---------------------------------------------------------------------------
{
  const id = "20261025-abc123";
  store.createJob({ id, status: "running", stage: "media", progress: 16 });
  fs.renameSync = () => { throw mesgul(); };
  fs.copyFileSync = () => { throw mesgul(); };
  let j = null;
  try { j = store.updateJob(id, { progress: 17, message: "Ön izleme 2/6" }); } catch (e) { kontrol("updateJob yazamayınca fırlatmıyor", false, e.message); }
  fs.renameSync = asilRename;
  fs.copyFileSync = asilKopya;
  kontrol("updateJob yazamayınca fırlatmıyor ve durumu döndürüyor", j?.progress === 17);
  kontrol("bellekteki durum güncel", store.getJob(id)?.progress === 17);
  // Ertelenmiş yeniden yazım diske de geçiriyor.
  await new Promise((r) => setTimeout(r, 2600));
  const disk = JSON.parse(fs.readFileSync(path.join(HOME, "data", "jobs", id, "job.json"), "utf8"));
  kontrol("ertelenmiş yazım son durumu diske geçirdi", disk.progress === 17 && disk.message === "Ön izleme 2/6", JSON.stringify(disk));
}

// ---------------------------------------------------------------------------
// 3) Ana süreç hata yakalayıcısı kipli pencere açmıyor
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const h = src.slice(src.indexOf('process.on("uncaughtException"'), src.indexOf('process.on("unhandledRejection"'));
  kontrol("uncaughtException yakalayıcısı bulundu", h.length > 40);
  kontrol("yakalayıcı showErrorBox (kipli, eşzamanlı) kullanmıyor", !/showErrorBox/.test(h));
  kontrol("yakalayıcı hatayı dosyaya yazıyor", /appendFileSync/.test(h) && /ana-surec-hatalari\.log/.test(h));
  kontrol("yakalayıcı en çok bir pencere açıyor", /crashShown/.test(h) && /showMessageBox/.test(h));
}

try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
