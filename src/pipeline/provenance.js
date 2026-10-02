const clean = value => String(value || '').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
export const safeSourceUrl = value => /^https?:\/\/[^\s<>]+$/i.test(String(value || '')) ? String(value) : '';
export function commonsMetadata(info, title = '') {
  const em = info.extmetadata || {};
  const source = em.Artist?.value || '';
  const metadata = {
    lisans:clean(em.LicenseShortName?.value || em.License?.value),
    lisansUrl:safeSourceUrl(clean(em.LicenseUrl?.value)),
    sahip:clean(source),
    sahipUrl:safeSourceUrl(source.match(/href=["']([^"']+)/i)?.[1]),
    eser:clean(title.replace(/^File:/,'')),
    sayfa:safeSourceUrl(info.descriptionurl),
    attribution:clean(em.Attribution?.value),
    restrictions:clean(em.Restrictions?.value),
  };
  metadata.permissionVerified = permissionUsable({...metadata,provider:'wikimedia'});
  return metadata;
}
export function permissionUsable(m) {
  if (['yerel','local','ai'].includes(m?.provider)) return true; // user supplied/generated; no external license claim
  const license = String(m?.lisans || '');
  if (/\bNC\b|\bND\b|NonCommercial|NoDeriv|adil kullanım|fair use/i.test(license)) return false;
  if (!safeSourceUrl(m?.sayfa)) return false;
  if (/^(?:CC0\b|PDM\b|public\s*domain\b|kamu\s*malı\b)/i.test(license)) return true;
  if (/^(?:CC[ -]?)?BY(?:[ -]SA)?\s+\d/i.test(license)) return !!(m.sahip && safeSourceUrl(m.lisansUrl));
  if (['pexels','pixabay','unsplash'].includes(m?.provider)) return /^(Pexels License|Pixabay Content License|Unsplash License)$/i.test(license);
  // Mixkit (Envato): ücretsiz ticari kullanım, atıf gerekmez — yalnızca Mixkit'in kendi adresinden.
  if (m?.provider === 'mixkit') return /^Mixkit .*Free License/i.test(license) && /^https:\/\/mixkit\.co\//.test(String(m.sayfa || ''));
  return false;
}
export function selectedProvenance(c) {
  return {
    lisansUrl:c.lisansUrl || '', sahipUrl:c.sahipUrl || '', attribution:c.attribution || '',
    restrictions:c.restrictions || '', sourceUrl:c.sourceUrl || c.url || '',
    articleUrl:c.articleUrl || '', permissionVerified:permissionUsable(c),
    modifications:'Video düzeninde yeniden boyutlandırma/kadraj; seçilen kurguya göre hareket ve renk düzenlemesi uygulanabilir.',
  };
}
