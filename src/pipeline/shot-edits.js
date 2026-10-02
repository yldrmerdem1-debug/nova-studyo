// PLAN (SAHNE) DÜZENLEMELERİ — kullanıcının kurgu kararları.
//
// Editörde verilen plan kararları (geçiş, ekran yazısı, kamera) özgün
// media.json'a yazılmaz; ayrı bir dosyada durur ve render sırasında ilgili
// plana uygulanır. Böylece her karar tek tıkla geri alınabilir ve kaynak
// medya kaydı (lisans, denetim puanı, yönetmen gerekçesi) bozulmaz.
//
// Anahtar plan kimliğidir (s{segment}b{plan}); edit-plan.json'daki sahne
// kimlikleriyle aynıdır. Metin değişip plan sayısı değişirse eşleşmeyen
// kararlar render günlüğünde bildirilir, sessizce başka plana kaymaz.
import path from 'node:path';
import { readJson, writeJson } from '../util.js';

export const SHOT_CAMERAS = { hold: 'Sabit', push: 'Yaklaş', pull: 'Uzaklaş', 'pan-left': 'Sola kay', 'pan-right': 'Sağa kay' };
export const SHOT_TRANSITIONS = {
  cut: { name: 'Sert kesme', tip: '', sure: 0 },
  fade: { name: 'Çözülme', tip: 'fade', sure: 0.4 },
  dissolve: { name: 'Erime', tip: 'dissolve', sure: 0.45 },
  fadeblack: { name: 'Siyaha iniş', tip: 'fadeblack', sure: 0.7 },
  fadewhite: { name: 'Beyaz flaş', tip: 'fadewhite', sure: 0.28 },
  smoothleft: { name: 'Sola kayma', tip: 'smoothleft', sure: 0.36 },
  smoothright: { name: 'Sağa kayma', tip: 'smoothright', sure: 0.36 },
  wipeleft: { name: 'Sola silme', tip: 'wipeleft', sure: 0.45 },
  circleopen: { name: 'Daire açılış', tip: 'circleopen', sure: 0.55 },
};
export const OVERLAY_POSITIONS = ['left', 'right', 'center'];
/** Kesme noktası en fazla bu kadar kaydırılır; iki plan da en az MIN_ROLL_SHOT sürer. */
export const MAX_ROLL = 3;
export const MIN_ROLL_SHOT = 1.2;
const ID_RE = /^s\d{1,4}b\d{1,2}$/;

function shotError(message) { const e = new Error(message); e.statusCode = 400; return e; }
const text = (v, max, label) => {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f]/.test(v)) throw shotError(`${label} en fazla ${max} karakter, tek satır olmalı.`);
  return v.replace(/\s+/g, ' ').trim();
};

/** Tek bir plan kararını doğrular; boş karar null döner (= otomatiğe dön). */
export function sanitizeShotEdit(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw shotError('Plan düzenlemesi geçersiz.');
  for (const k of Object.keys(raw)) if (!['camera', 'transitionIn', 'overlay', 'roll', 'sourceStart'].includes(k)) throw shotError(`Bilinmeyen plan alanı: ${k}`);
  const out = {};
  if (raw.camera !== undefined && raw.camera !== 'auto') {
    if (!Object.hasOwn(SHOT_CAMERAS, raw.camera)) throw shotError('Kamera hareketi geçersiz.');
    out.camera = raw.camera;
  }
  if (raw.transitionIn !== undefined && raw.transitionIn !== null && raw.transitionIn !== 'auto') {
    const t = typeof raw.transitionIn === 'string' ? { type: raw.transitionIn } : raw.transitionIn;
    if (!t || typeof t !== 'object' || !Object.hasOwn(SHOT_TRANSITIONS, t.type)) throw shotError('Geçiş türü geçersiz.');
    const base = SHOT_TRANSITIONS[t.type];
    let duration = t.duration === undefined ? base.sure : Number(t.duration);
    if (t.type === 'cut') duration = 0;
    else if (!Number.isFinite(duration) || duration < 0.12 || duration > 1.5) throw shotError('Geçiş süresi 0,12–1,5 saniye olmalı.');
    out.transitionIn = { type: t.type, duration: +duration.toFixed(3) };
  }
  if (raw.overlay !== undefined && raw.overlay !== null && raw.overlay !== 'auto') {
    const o = raw.overlay;
    if (o === 'off' || o?.mode === 'off') out.overlay = { mode: 'off' };
    else if (o && typeof o === 'object' && o.mode === 'custom') {
      const value = text(o.value, 40, 'Ekran yazısı'), label = text(o.label, 60, 'Alt etiket');
      if (!value) throw shotError('Özel ekran yazısı boş olamaz.');
      const position = OVERLAY_POSITIONS.includes(o.position) ? o.position : 'left';
      out.overlay = { mode: 'custom', value, label, position };
    } else throw shotError('Ekran yazısı seçimi geçersiz.');
  }
  if (raw.roll !== undefined && raw.roll !== null && raw.roll !== 0) {
    const roll = Number(raw.roll);
    if (!Number.isFinite(roll) || Math.abs(roll) > MAX_ROLL) throw shotError(`Kesme noktası en fazla ±${MAX_ROLL} saniye kaydırılabilir.`);
    if (Math.abs(roll) >= 0.04) out.roll = +roll.toFixed(2);
  }
  if (raw.sourceStart !== undefined && raw.sourceStart !== null && raw.sourceStart !== 'auto') {
    const at = Number(raw.sourceStart);
    if (!Number.isFinite(at) || at < 0 || at > 86400) throw shotError('Klip başlangıcı geçersiz.');
    out.sourceStart = +at.toFixed(2);
  }
  return Object.keys(out).length ? out : null;
}

export const shotEditsFile = (dir) => path.join(dir, 'shot-edits.json');

/** Kayıtlı kararlar; bozuk/eski girdiler atlanır, dosya yoksa boş. */
export function readShotEdits(dir) {
  const raw = readJson(shotEditsFile(dir), null);
  const shots = {};
  for (const [id, edit] of Object.entries(raw?.shots && typeof raw.shots === 'object' ? raw.shots : {})) {
    if (!ID_RE.test(id)) continue;
    try { const clean = sanitizeShotEdit(edit); if (clean) shots[id] = clean; } catch { /* eski/bozuk karar yok sayılır */ }
  }
  return shots;
}

/** Yamayı uygular: {id: karar | null}. null otomatiğe döndürür. */
export function mergeShotEdits(current, patch, validIds = null) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw shotError('Plan düzenlemeleri nesne olmalı.');
  const next = { ...current };
  for (const [id, edit] of Object.entries(patch)) {
    if (!ID_RE.test(id) || (validIds && !validIds.has(id))) throw shotError(`Plan bulunamadı: ${id}`);
    const clean = sanitizeShotEdit(edit);
    if (clean) next[id] = clean; else delete next[id];
  }
  return next;
}

export function writeShotEdits(dir, shots) {
  writeJson(shotEditsFile(dir), { version: 1, updatedAt: new Date().toISOString(), shots });
}

/**
 * Kararları render kesme listesine uygular. Medya nesneleri planlar arasında
 * paylaşılabildiği için dokunulan her plan kendi kopyasını alır.
 * @returns {applied, unmatched}
 */
export function applyShotEditsToBeats(beats, shots = {}) {
  const ids = new Set(beats.map((b) => b.id));
  let applied = 0;
  beats.forEach((b, i) => {
    // Kesme noktası: aynı cümlenin iki planı arasındaki sınır kayar. Cümlenin
    // toplam süresi değişmez, konuşma ve altyazı senkronu korunur.
    const roll = shots[b.id]?.roll, prev = beats[i - 1];
    if (!roll || !prev || prev.segIndex !== b.segIndex) return;
    const r = Math.max(MIN_ROLL_SHOT - prev.dur, Math.min(b.dur - MIN_ROLL_SHOT, roll));
    if (Math.abs(r) < 0.01) return;
    prev.dur += r; b.dur -= r;
    if (Number.isFinite(prev.icSon)) prev.icSon += r;
    if (Number.isFinite(b.icBas)) b.icBas += r;
  });
  for (const b of beats) {
    const e = shots[b.id];
    if (!e) continue;
    applied++;
    if (b.media?.type === 'video' && Number.isFinite(e.sourceStart)) {
      const auto = Number.isFinite(b.media.sourceStartFrame) ? { autoSourceStartFrame: b.media.sourceStartFrame } : Number.isFinite(b.media.sourceStart) ? { autoSourceStart: b.media.sourceStart } : {};
      const { sourceStartFrame, ...rest } = b.media;
      b.media = { ...rest, ...auto, sourceStart: e.sourceStart, userSourceStart: true };
    }
    if (!b.media || (!e.camera && !e.overlay)) continue;
    const editorial = { ...(b.media.editorial && typeof b.media.editorial === 'object' ? b.media.editorial : {}) };
    if (e.camera) { editorial.camera = e.camera; editorial.userCamera = true; }
    if (e.overlay?.mode === 'off') { editorial.overlay = null; editorial.overlayOff = true; }
    if (e.overlay?.mode === 'custom') {
      editorial.overlay = { value: e.overlay.value, label: e.overlay.label, position: e.overlay.position, anchorQuote: editorial.overlay?.anchorQuote || '' };
      editorial.overlayOff = false;
    }
    b.media = { ...b.media, editorial };
  }
  return { applied, unmatched: Object.keys(shots).filter((id) => !ids.has(id)) };
}

/** planTransitions için: plan i+1'e giren geçiş kararı → sınır i. */
export function transitionOverrides(beats, shots = {}) {
  const out = new Map();
  beats.forEach((b, i) => {
    const t = shots[b.id]?.transitionIn;
    if (i > 0 && t) out.set(i - 1, { tip: SHOT_TRANSITIONS[t.type].tip, sure: t.duration });
  });
  return out;
}
