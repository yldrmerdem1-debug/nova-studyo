// TEKRAR BÜTÇESİ — AI Yönetmen'in "bilinçli tekrar" istisnası gerçekten istisna kalsın.
//
// Ölçüldü (20260923-8aab9f, Midway, 87 plan): 94 medya kaydının 92'sinde
// reusePurpose doluydu. Şema bu alanı her sahne için istediğinden model onu
// neredeyse her karara yazıyor ve tekrar koruması fiilen kapanıyordu; sonuçta
// 23 planda aynı kaynak yeniden göründü, aynı tayfa masası fotoğrafı üç kez.
//
// Tekrarın ölçüsü "aynı görüntü": aynı fotoğraf ya da aynı videonun aynı anı.
// Uzun bir arşiv filminin başka, görülmemiş bir anı tekrar sayılmaz.
// Bir video boyunca en fazla birkaç gerçek geri dönüşe (özet, karşılaştırma)
// izin verilir ve ilk kullanımdan yeterince uzak olmalıdır.

const clean = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();

export const REUSE_MIN_GAP_SHOTS = 8;
/** Uzun videoda planların ~%4'ü, kısa videoda en az bir geri dönüş. */
export const reuseBudget = (shotCount) => Math.max(1, Math.floor(shotCount * 0.04));

export const sourceIdentity = (m) =>
  m?.kaynakId || m?.sourceId || m?.adayId || (m?.file ? `file:${m.file}` : null);

const startSec = (m, fps = 30) => Number.isFinite(m?.sourceStartFrame) ? m.sourceStartFrame / fps : Number(m?.sourceStart) || 0;
/** Aynı görüntü mü: aynı fotoğraf ya da aynı videonun 2 saniyeden yakın anı. */
export function sameImage(a, b, fps = 30) {
  const id = sourceIdentity(a);
  if (!id || id !== sourceIdentity(b)) return false;
  if (a.type !== 'video' && b.type !== 'video') return true;
  return a.type === b.type && Math.abs(startSec(a, fps) - startSec(b, fps)) < 2;
}

/**
 * Sıradaki kararlar arasında bütçe dışı kalan tekrarları bulur.
 * decisions: validateDecision çıktıları (id, action, reusePurpose).
 * @returns {violations: [{id, firstId, reason}], allowed: [id]}
 */
export function auditReuse(beats, media, decisions) {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const shown = [], violations = [], allowed = [];
  const budget = reuseBudget(beats.length);
  beats.forEach((b, i) => {
    const d = byId.get(b.id);
    if (!d || d.action !== 'keep') return;
    const m = media[b.id];
    if (!sourceIdentity(m)) return;
    const seen = shown.find((x) => sameImage(x.media, m));
    if (!seen) { shown.push({ id: b.id, index: i, media: m }); return; }
    const gap = i - seen.index;
    const purpose = clean(d.reusePurpose);
    if (purpose && allowed.length < budget && gap >= REUSE_MIN_GAP_SHOTS) { allowed.push(b.id); return; }
    violations.push({
      id: b.id, firstId: seen.id,
      reason: !purpose ? 'gerekçesiz tekrar'
        : gap < REUSE_MIN_GAP_SHOTS ? `ilk kullanıma çok yakın (${gap} plan)`
        : `tekrar bütçesi (${budget}) doldu`,
    });
  });
  return { violations, allowed, budget };
}

/** Onarım turunda modele verilecek açıklama. */
export function reuseRepairBrief(violations) {
  return 'These scenes repeat an image or the same moment of a video that the viewer has already seen. ' +
    'A long documentary may revisit a source only rarely, for a real recap or comparison, and far from its first use. ' +
    'For each listed scene choose a different verified source moment, a literal ai-image/ai-video reconstruction when the narration allows it, ' +
    'or keep it only with a concrete recap reason. Never fabricate evidence. Repeats: ' +
    violations.map((v) => `${v.id} repeats ${v.firstId} (${v.reason})`).join('; ');
}
