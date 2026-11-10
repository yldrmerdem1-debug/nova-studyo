import fs from "node:fs";
import path from "node:path";
import { JOBS_DIR, readJson, writeJson } from "./util.js";
import { emit } from "./bus.js";

const cache = new Map(); // id -> job
const deleted = new Set(); // silinmiş işler: geç gelen updateJob çağrıları hayalet kayıt bırakmasın

const ID_RE = /^\d{8}-[0-9a-f]{6}$/;

/** İş klasörü. Kimlik biçimi doğrulanmazsa "../.." gibi bir değer JOBS_DIR dışına çıkar. */
export function jobDir(id) {
  if (!ID_RE.test(String(id))) throw new Error(`geçersiz iş kimliği: ${id}`);
  const dir = path.join(JOBS_DIR, id);
  if (!path.resolve(dir).startsWith(path.resolve(JOBS_DIR) + path.sep)) {
    throw new Error("iş klasörü kök dizinin dışında");
  }
  return dir;
}
export function jobFile(id) { return path.join(jobDir(id), "job.json"); }

export function loadAllJobs() {
  const out = [];
  for (const name of fs.existsSync(JOBS_DIR) ? fs.readdirSync(JOBS_DIR) : []) {
    if (!ID_RE.test(name) || deleted.has(name)) continue; // yabancı klasörleri atla
    const j = readJson(jobFile(name));
    if (j) { cache.set(j.id, j); out.push(j); }
  }
  out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return out;
}

export function getJob(id) {
  if (deleted.has(id)) return null;
  if (cache.has(id)) return cache.get(id);
  if (!ID_RE.test(String(id))) return null;
  const j = readJson(jobFile(id));
  if (j) cache.set(id, j);
  return j;
}

export function createJob(job) {
  fs.mkdirSync(jobDir(job.id), { recursive: true });
  cache.set(job.id, job);
  writeJson(jobFile(job.id), job);
  emit("job", { job: publicJob(job) });
  return job;
}

export function updateJob(id, patch) {
  // İş silindikten sonra iptal edilen ffmpeg'in geç gelen hata yolu buraya düşebilir.
  if (deleted.has(id)) return null;
  const previous=getJob(id) || {};
  const j = { ...previous, ...patch, id };
  if(previous.status !== 'running' && j.status === 'running') j.activeSince=Date.now();
  if(previous.status === 'running' && j.status !== 'running') {
    if(Number.isFinite(previous.activeSince)) j.processingMs=(Number(previous.processingMs)||0)+Math.max(0,Date.now()-previous.activeSince);
    j.activeSince=null;
  }
  try {
    writeJson(jobFile(id), j);
  } catch (e) {
    if (e.code === "ENOENT") { cache.delete(id); deleted.add(id); return null; } // klasör yok olmuş
    // Diske yazılamadı ama iş sürüyor: durum bellekte doğru, bir an sonra yeniden yazılır. Fırlatmak işi çağıranın
    // (motorun stdout dinleyicisi) içinde patlatıp ana süreci durdurmuştu (20261024-373aaf, 25 Ekim 2026).
    console.warn(`job.json yazılamadı (${id}): ${e.code || e.message} — yeniden denenecek`);
    retryWrite(id);
  }
  cache.set(id, j);
  emit("job", { job: publicJob(j) });
  return j;
}

const pendingWrites = new Map();
/** Yazılamayan iş durumunu bir kez, ~2 sn sonra en son haliyle yeniden yazar (arada gelen yazımlar birleşir). */
function retryWrite(id) {
  if (pendingWrites.has(id)) return;
  const t = setTimeout(() => {
    pendingWrites.delete(id);
    const j = cache.get(id);
    if (!j || deleted.has(id)) return;
    try { writeJson(jobFile(id), j); } catch (e) { console.warn(`job.json yine yazılamadı (${id}): ${e.code || e.message}`); }
  }, 2000);
  t.unref?.();
  pendingWrites.set(id, t);
}

export function log(id, line) {
  const metin = String(line).slice(0, 500);
  emit("log", { jobId: id, line: metin });
  // DİSKE DE YAZ. Log yalnızca SSE ile arayüze gidiyordu; uygulama kapanınca ya da
  // iş arka planda patlayınca geriye hiçbir iz kalmıyordu (bir iş %59'da kesildi,
  // nedenini anlamak için tek satır log yoktu). Hata ayıklamanın önkoşulu.
  try {
    fs.appendFileSync(
      path.join(jobDir(id), "job.log"),
      `${new Date().toISOString()}  ${metin}\n`,
      "utf8"
    );
  } catch { /* dizin henüz yoksa veya kilitliyse sessizce geç — log akışı kritik değil */ }
}

// UI'ya giden hafif kopya (büyük alanlar hariç)
export function publicJob(j) {
  if (!j) return null;
  const { candidates, ...rest } = j;
  return rest;
}

export async function deleteJob(id) {
  const dir = jobDir(id); // geçersiz kimlikte fırlatır
  cache.delete(id);
  deleted.add(id);
  emit("jobDeleted", { jobId: id });
  // Windows'ta ffmpeg tutamağı geç bırakabilir → yeniden dene
  try {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (e) {
    if (e.code !== "ENOENT") throw new Error(`Klasör tamamen silinemedi (${e.code}). Uygulama kapandığında kalanlar temizlenir.`);
  }
}
