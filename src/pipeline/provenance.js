const clean = value => String(value || '').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
export const safeSourceUrl = value => /^https?:\/\/[^\s<>]+$/i.test(String(value || '')) ? String(value) : '';
/*
 * The author a Commons credit names. Houthi–Saudi news, 28 Oct 2026: "File:2026. Yahya Saree.jpg" has the Artist
 * field "You may select the license of your choice." and the real credit, "Tasnim News Agency", only in Attribution;
 * the description printed the licence sentence as the author. An empty or boilerplate Artist yields to Attribution.
 */
export function commonsAuthor(em = {}) {
  const artist = clean(em.Artist?.value);
  const attribution = clean(em.Attribution?.value);
  const boiler = !artist || /\b(?:select the licen[cs]e|licen[cs]e of your choice|see (?:below|the licen[cs]e)|unknown author|author unknown)\b/i.test(artist);
  return boiler && attribution ? attribution : artist;
}
/*
 * One photo, one key. Gimli Glider, 28 Oct 2026: "C-GAUN … Toronto, July 14 1984. (5530418110).jpg" and its
 * "(cropped)" copy counted as two files, so the same Toronto photo filled scenes 0, 20, 33 and the inbox slot for 133.
 */
export function commonsKey(title = '') {
  return String(title).toLowerCase().replace(/^(?:file|image):/, '').replace(/_/g, ' ')
    .replace(/\s*\((?:cropped|crop|edited|edit|retouched|restored)(?:[^)]*)\)/g, '')
    .replace(/\.(?:jpe?g|png|tiff?|webp|gif)$/, '').replace(/\s+/g, ' ').trim();
}
export function commonsMetadata(info, title = '') {
  const em = info.extmetadata || {};
  const source = em.Artist?.value || '';
  const metadata = {
    lisans:clean(em.LicenseShortName?.value || em.License?.value),
    lisansUrl:safeSourceUrl(clean(em.LicenseUrl?.value)),
    sahip:commonsAuthor(em),
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
