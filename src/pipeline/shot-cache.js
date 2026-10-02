// AKILLI YENİDEN RENDER — değişmeyen plan yeniden kodlanmaz.
//
// Editörde tek bir planın yazısı ya da geçişi değişince bütün video baştan
// render ediliyordu: 12 dakikalık, 87 planlık bir işte her plan için zoompan
// + derecelendirme + yazı yeniden kodlanıyor, AI Yönetmen işinde de bütün
// final kareler ücretli görsel modele yeniden denetletiliyordu.
//
// Her planın render girdileri (kompozisyon planı, kare sayısı, kaynak dosyanın
// kendisi, renk filtresi, kodlayıcı ayarları, render sürümü) tek bir anahtara
// indirgenir. Anahtar aynıysa çıktı birebir aynıdır; önbellekteki klip kullanılır.
// Önbellek iş klasöründedir (attempt klasöründe değil), yalnızca son render'ın
// kullandığı kayıtlar tutulur.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const KEY_RE = /^[0-9a-f]{40}\.mp4$/;
const sha = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');

/** Kaynak dosyanın kimliği: yol + boyut + değişiklik zamanı (içerik değişirse anahtar değişir). */
function fileStamp(file) {
  if (!file) return null;
  try { const s = fs.statSync(file); return { file: path.resolve(file), size: s.size, mtime: Math.round(s.mtimeMs) }; }
  catch { return { file: path.resolve(file), missing: true }; }
}

export function shotCacheKey({ version, plan, frames, fps, canvas, crf, grade, media, encoder }) {
  return sha({
    kind: 'shot', version, plan, frames, fps, canvas: { w: canvas?.w, h: canvas?.h }, crf, grade: grade || null,
    media: media?.file ? { type: media.type, ...fileStamp(media.file), odak: media.odak || null, sourceStart: media.sourceStart ?? null, sourceStartFrame: media.sourceStartFrame ?? null } : null,
    encoder,
  });
}

export function pieceCacheKey({ previousKey, key, transition, frames, previousFrames, encoder }) {
  return sha({ kind: 'piece', previousKey, key, transition, frames, previousFrames, encoder });
}

export class ShotCache {
  constructor(dir) { this.dir = dir; this.used = new Set(); this.hits = 0; this.misses = 0; }
  file(key) { return path.join(this.dir, `${key}.mp4`); }
  /** Önbellekte varsa hedefe bağlar/kopyalar; true döner. */
  restore(key, target) {
    if (!key) return false;
    const src = this.file(key);
    try {
      if (!fs.statSync(src).size) return false;
      fs.rmSync(target, { force: true });
      try { fs.linkSync(src, target); } catch { fs.copyFileSync(src, target); }
      this.used.add(key); this.hits++;
      return true;
    } catch { return false; }
  }
  /** Yeni üretilen klibi önbelleğe atomik olarak koyar. */
  store(key, source) {
    if (!key) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = `${this.file(key)}.${process.pid}.${Date.now()}.tmp`;
      fs.copyFileSync(source, tmp);
      fs.renameSync(tmp, this.file(key));
      this.used.add(key); this.misses++;
    } catch { /* önbellek bir hızlandırmadır; yazılamazsa render sürer */ }
  }
  /** Bu render'da kullanılmayan eski kayıtları siler; disk tek sürüm kadar yer tutar. */
  prune() {
    let removed = 0;
    try {
      for (const name of fs.readdirSync(this.dir)) {
        const key = name.slice(0, 40);
        if ((KEY_RE.test(name) && !this.used.has(key)) || name.endsWith('.tmp')) { fs.rmSync(path.join(this.dir, name), { force: true }); removed++; }
      }
    } catch { /* klasör yoksa temizlenecek bir şey yok */ }
    // Kullanım zamanı: iş başına önbellek sınırı (pruneShotCaches) en son kullanılanları tutar.
    try { const now = new Date(); fs.utimesSync(this.dir, now, now); } catch {}
    return removed;
  }
}

/** Final kare denetimi önbelleği: plan ve komşu geçişleri aynıysa önceki karar geçerlidir. */
export function reviewCacheKey({ shotKey, transitionIn, transitionOut, narration, spokenMoment, policyVersion, reviewVersion }) {
  return shotKey ? sha({ kind: 'review', shotKey, transitionIn, transitionOut, narration, spokenMoment, policyVersion, reviewVersion }) : null;
}
