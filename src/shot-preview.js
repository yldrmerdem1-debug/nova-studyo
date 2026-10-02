// TEK PLAN ÖNİZLEMESİ — kararı kaydetmeden önce yalnızca o planı görmek.
//
// Editörde verilen taslak karar (kamera, ekran yazısı, kesme noktası, klip
// başlangıcı) teslim edilen kurgu planındaki kompozisyonun üstüne uygulanır ve
// sadece o plan kodlanır. Ses, final videonun aynı zaman aralığından alınır.
// Kaynak dosyalar dışarı verilmez: klip başlangıcı seçerken yalnızca tek bir
// JPEG kare döner.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readJson, run, mapLimit, ffprobeDuration } from './util.js';
import { getJobSettings } from './config.js';
import { getJob, jobDir } from './store.js';
import { sanitizeShotEdit, applyShotEditsToBeats, MIN_ROLL_SHOT } from './pipeline/shot-edits.js';
import { planEditorialShot, renderEditorialShot } from './pipeline/editorial-shots.js';
import { getStyleProfile } from './pipeline/style-profile.js';
import { gradeHaritasi } from './pipeline/grade.js';
import ffprobe from 'ffprobe-static';

const busy = new Set();
const PREVIEW_KEEP = 12;
const MEDIA_EXT = /\.(jpe?g|png|webp|mp4|mov|webm|mkv|m4v)$/i;

function previewError(message, statusCode = 400) { const e = new Error(message); e.statusCode = statusCode; return e; }

/** Teslim edilen kurgu planı ve plan sırası. */
export function shotContext(jobId, beatId) {
  const job = getJob(jobId);
  if (!job) throw previewError('İş bulunamadı.', 404);
  const dir = jobDir(jobId), plan = readJson(path.join(dir, 'edit-plan.json'));
  const index = Array.isArray(plan?.scenes) ? plan.scenes.findIndex((s) => s.id === beatId) : -1;
  if (index < 0 || !Number(plan.fps)) throw previewError('Plan bulunamadı; önce videonun bir kez render edilmesi gerekiyor.', 404);
  const start = plan.scenes.slice(0, index).reduce((t, s) => t + s.frames / plan.fps, 0);
  return { job, dir, plan, index, scene: plan.scenes[index], start, fps: plan.fps };
}

/** Planın gerçekten gösterdiği medya kaydı (render kardeş görsel seçmiş olabilir). */
export function shotMedia(dir, scene) {
  const media = readJson(path.join(dir, 'media.json'), {});
  const entries = Object.values(media).filter((m) => m && typeof m === 'object');
  const found = (scene.mediaFile && entries.find((m) => m.file === scene.mediaFile))
    || (scene.sourceId && entries.find((m) => [m.sourceId, m.kaynakId, m.file].includes(scene.sourceId)))
    || media[scene.id];
  if (!found?.file || !MEDIA_EXT.test(found.file) || !fs.existsSync(found.file)) return null;
  return structuredClone(found);
}

export async function shotSource(jobId, beatId) {
  const { dir, scene, fps } = shotContext(jobId, beatId);
  const m = shotMedia(dir, scene);
  if (!m) throw previewError('Bu planın kaynak dosyası bulunamadı.', 404);
  const st = getJobSettings(getJob(jobId));
  const duration = m.type === 'video' ? await ffprobeDuration(st.ffprobePath || ffprobe.path, m.file) : null;
  const start = Number(scene.composition?.sourceStartFrame) / fps || 0;
  return { type: m.type, duration: Number.isFinite(duration) ? +duration.toFixed(2) : null, start: +start.toFixed(2), shotDuration: +(scene.frames / fps).toFixed(2) };
}

/** Kaynağın istenen anından tek kare (klip başlangıcı seçimi için). */
export async function shotSourceFrame(jobId, beatId, at) {
  const { dir, scene } = shotContext(jobId, beatId);
  const m = shotMedia(dir, scene);
  if (!m || m.type !== 'video') throw previewError('Bu plan video değil.', 400);
  const t = Math.max(0, Number(at) || 0);
  const out = path.join(dir, 'editor-frames', `src-${beatId}-${Math.round(t * 10)}.jpg`);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await run(getJobSettings(getJob(jobId)).ffmpegPath, ['-ss', t.toFixed(2), '-i', m.file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', '-y', out], { timeoutMs: 30000 });
  }
  return out;
}

/** Kayıttan önce, klip başlangıcının kaynağa sığdığını doğrular. */
export async function validateSourceStart(jobId, beatId, sourceStart) {
  const src = await shotSource(jobId, beatId);
  if (src.type !== 'video') throw previewError(`${beatId}: klip başlangıcı yalnızca video planlarında seçilebilir.`);
  const latest = Math.max(0, (src.duration || 0) - src.shotDuration - 0.5);
  if (!(sourceStart <= latest)) throw previewError(`${beatId}: kaynak ${src.duration} sn; bu plan için en geç ${latest.toFixed(1)}. saniyeden başlayabilir.`);
}

/** Taslak kararla tek planı kodlar, final videonun sesini ekler. */
export async function previewShot(jobId, beatId, draft) {
  const { job, dir, plan, index, scene, start, fps } = shotContext(jobId, beatId);
  if (['running', 'queued'].includes(job.status)) throw previewError('Video işlenirken önizleme yapılamaz.', 409);
  if (!scene.composition) throw previewError('Önizleme yalnızca Editoryal kurgu stilindeki videolarda yapılabilir.');
  if (busy.has(jobId)) throw previewError('Bu iş için bir önizleme zaten hazırlanıyor.', 409);
  const edit = sanitizeShotEdit(draft ?? null) || {};
  if (Number.isFinite(edit.sourceStart)) await validateSourceStart(jobId, beatId, edit.sourceStart);
  busy.add(jobId);
  try {
    const W = scene.composition.width, H = scene.composition.height;
    let slotStart = start, duration = scene.frames / fps;
    // Kesme noktası: yalnızca aynı cümlenin önceki planıyla sınır kayar.
    const prev = plan.scenes[index - 1], segOf = (s) => s?.segIndex ?? Number(String(s?.id).match(/^s(\d+)b/)?.[1]);
    if (edit.roll && prev && segOf(prev) === segOf(scene)) {
      const r = Math.max(MIN_ROLL_SHOT - prev.frames / fps, Math.min(duration - MIN_ROLL_SHOT, edit.roll));
      slotStart += r; duration -= r;
    }
    const media = shotMedia(dir, scene);
    const beat = { id: beatId, dur: duration, query: beatId, media, isVideoStart: index === 0, isVideoEnd: index === plan.scenes.length - 1 };
    const { roll, ...rest } = edit;
    applyShotEditsToBeats([beat], { [beatId]: rest });
    const p = structuredClone(scene.composition);
    Object.assign(p, { duration, renderLeadIn: 0, sourceContinuous: false });
    delete p.fallbackSourceStartFrame;
    const profile = getStyleProfile(job.theme, job.editIntensity);
    if (edit.camera || edit.overlay) {
      const fresh = planEditorialShot({ director: job.mediaKind === 'director', canvas: { w: W, h: H }, index, profile, beat, words: [] });
      if (edit.camera) p.camera = fresh.camera;
      if (edit.overlay) Object.assign(p, { textBlocks: fresh.textBlocks, layout: fresh.layout, overlayPosition: fresh.overlayPosition, events: fresh.events, focus: fresh.focus });
    }
    for (const b of p.textBlocks || []) b.end = Math.min(b.end, duration - 0.2);
    if (media?.type === 'video' && Number.isFinite(beat.media?.sourceStart) && beat.media.userSourceStart) p.sourceStartFrame = Math.round(beat.media.sourceStart * fps);

    const st = { ...getJobSettings(job), preset: 'veryfast' };
    const frames = Math.max(2, Math.round(duration * fps));
    const key = createHash('sha1').update(JSON.stringify({ p, frames, file: media?.file, edit, v: 1 })).digest('hex').slice(0, 16);
    const folder = path.join(dir, 'editor-preview'), name = `${beatId}-${key}.mp4`, out = path.join(folder, name);
    if (!fs.existsSync(out)) {
      fs.mkdirSync(folder, { recursive: true });
      let gradeF = null;
      if (media?.file && st.cinemaGrade !== false) {
        try { gradeF = (await gradeHaritasi([{ id: media.file, src: media.file, video: media.type === 'video' }], { ffmpegPath: st.ffmpegPath, tema: job.theme, mapLimit, concurrency: 1 }))[media.file] || null; } catch {}
      }
      const silent = path.join(folder, `${beatId}-${key}-v.mp4`);
      await renderEditorialShot({ st, canvas: { w: W, h: H }, media, plan: p, frames, outFile: silent, killer: { cancelled: false, add() {}, remove() {} }, crf: 23, gradeF });
      const video = path.join(dir, 'output.mp4');
      if (fs.existsSync(video)) {
        await run(st.ffmpegPath, ['-i', silent, '-ss', slotStart.toFixed(3), '-t', duration.toFixed(3), '-i', video, '-map', '0:v', '-map', '1:a?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', '-y', out], { timeoutMs: 120000 });
        fs.rmSync(silent, { force: true });
      } else fs.renameSync(silent, out);
      // Yalnızca son önizlemeler tutulur.
      const old = fs.readdirSync(folder).filter((f) => f.endsWith('.mp4')).map((f) => ({ f, t: fs.statSync(path.join(folder, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(PREVIEW_KEEP);
      for (const o of old) fs.rmSync(path.join(folder, o.f), { force: true });
    }
    return { url: `/api/jobs/${jobId}/preview/${name}`, duration: +duration.toFixed(2), start: +slotStart.toFixed(2) };
  } finally { busy.delete(jobId); }
}
