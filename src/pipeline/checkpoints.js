import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readJson, writeJson } from "../util.js";

export const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Billing metadata never changes a paid creative result or rendered pixels. */
export function creativeSettings(snapshot) {
  if (snapshot == null) return snapshot;
  const { modelRates, costBudgetUsd, budgetUsd, ...creative } = snapshot;
  return Object.keys(creative).length ? creative : undefined;
}
export function fileAvailable(file) {
  try { return typeof file === 'string' && fs.statSync(file).isFile() && fs.statSync(file).size > 0; } catch { return false; }
}
export function scriptScenes(script) {
  let index = 0;
  if (Array.isArray(script?.beats)) return script.beats.filter(b=>b && typeof b.id === "string").map((segment, i) => ({ segId: `s${i}`, sectionIndex: 0, segmentIndex: i, segment, beatIds: [segment.id] }));
  return (Array.isArray(script?.sections) ? script.sections : []).flatMap((section, sectionIndex) => (Array.isArray(section?.segments) ? section.segments.filter(Boolean) : []).map((segment, segmentIndex) => {
    const segId = `s${index++}`;
    const visuals = Array.isArray(segment.visuals) && segment.visuals.length ? segment.visuals : [segment.visual || {}];
    return { segId, sectionIndex, segmentIndex, segment, beatIds: visuals.map((_, i) => `${segId}b${i}`) };
  }));
}
export function validScript(script) { const scenes = scriptScenes(script); return scenes.length > 0 && scenes.every(s => typeof s.segment.text === 'string' && s.segment.text.trim()); }
export function validVoice(entry, text) {
  return entry && entry.text === text && fileAvailable(entry.audio) && Number.isFinite(entry.duration) && entry.duration > 0 && Array.isArray(entry.words);
}
export function validMedia(entry) { return entry?.type === 'card' || (['image','video'].includes(entry?.type) && fileAvailable(entry.file)); }
export function readCheckpoint(dir, stage, input) {
  const all = readJson(path.join(dir, 'checkpoints.json'), {});
  const c = all[stage];
  return c?.key === fingerprint(input) ? c.value : null;
}
export function checkpoint(dir, stage, input, value) {
  const file = path.join(dir, 'checkpoints.json');
  writeJson(file, { ...readJson(file, {}), [stage]: { key: fingerprint(input), savedAt: new Date().toISOString(), value } });
  return value;
}
export function invalidateCheckpoints(dir, stages) {
  const file = path.join(dir, 'checkpoints.json');
  const c = readJson(file, {}); for (const stage of stages) delete c[stage]; writeJson(file, c);
}

// Render to a private attempt. A failed replacement can never overwrite the published video.
export async function renderRevision(dir, input, render, isCancelled = () => false) {
  const saved = readCheckpoint(dir, 'render', input);
  if (saved && fileAvailable(path.join(saved.dir, 'output.mp4'))) return saved;
  const attempt = path.join(dir, 'attempts', `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(attempt, { recursive: true });
  const result = await render(attempt);
  if (isCancelled()) throw new Error('cancelled');
  if (!fileAvailable(path.join(attempt, 'output.mp4'))) throw new Error('Render çıktısı eksik. Kaynaklar korundu; yeniden render başlatın.');
  return checkpoint(dir, 'render', input, { dir: attempt, ...result });
}
export function publishRevision(dir, result) {
  // Backups preserve the preceding final even if Windows locks one target during promotion.
  const editedCover = readJson(path.join(dir, 'cover.json'));
  const preserveCover = name => editedCover && /^(thumbnail|thumb_[abc])\.jpg$/.test(name) && fileAvailable(path.join(dir,name));
  const files = fs.readdirSync(result.dir, { withFileTypes: true }).filter(e => e.isFile() && !e.name.endsWith('.tmp') && !preserveCover(e.name)).map(e => e.name);
  const backup = path.join(dir, 'previous', path.basename(result.dir));
  for (const name of files) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) { fs.mkdirSync(backup, { recursive: true }); fs.copyFileSync(target, path.join(backup, name)); }
    fs.copyFileSync(path.join(result.dir, name), `${target}.promoting`);
  }
  // Publish video last: ancillary files are ready when the new video becomes visible.
  files.sort((a,b) => (a === 'output.mp4') - (b === 'output.mp4'));
  for (const name of files) fs.renameSync(path.join(dir, `${name}.promoting`), path.join(dir, name));
}
