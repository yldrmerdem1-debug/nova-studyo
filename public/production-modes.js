// Shared by the form and pipeline: a selected mode has one meaning everywhere.
export function productionMode(form = {}) {
  return form.mediaKind === 'director' ? 'director' : form.visualStyle === 'kolaj' ? 'kolaj' : ['image','mixed','ai','fullai','docu'].includes(form.mediaKind) ? form.mediaKind : 'mixed';
}
/** Sinematik Belgesel: kendi motoru (docu-engine) — arşiv, kolaj ve AI bütçesi ayarları uygulanmaz. */
export function isDocu(form = {}) { return productionMode(form) === 'docu'; }
export function isGenerated(form) { return ['kolaj','fullai'].includes(productionMode(form)); }
export function usesStockVideo(form = {}) { return ['mixed','ai','director'].includes(productionMode(form)); }
export function usesAutomaticEditor(form = {}) { return productionMode(form) === 'director' || (form.aiSupport === 'auto' && ['mixed','ai'].includes(productionMode(form))); }
const DIRECTOR_LOCKED_FIELDS = new Set(['visualStyle','aiSupport']);
export function setProductionPreference(form,field,value) {
  if (productionMode(form) === 'director' && DIRECTOR_LOCKED_FIELDS.has(field)) return false;
  form[field] = value;
  return true;
}
const PRODUCTION_FIELDS = ['docuSource','docuGenre','docuMapMode','mediaKind','visualStyle','mediaMode','collageMode','aiButce','aiClips','aiFill','aiSupport','aiSupportBudgetUsd','costBudgetUsd','transitions','ratio','yaziModu','gorselDenetim','useWebSearch','editIntensity','soundDesign','sfxVolume','subtitleMode'];
export function restoreProductionForm(form,job={}) {
  for (const field of PRODUCTION_FIELDS) if (job[field] !== undefined) form[field] = job[field];
  // "✨ Otomatik" stil iş kaydında alan olarak yok; formda önceki elle seçim kalmasın.
  if (job.mediaKind === 'docu' && job.docuGenre === undefined) delete form.docuGenre;
  return form;
}
export function aiAllowance(form = {}) {
  if (form.aiSupport === 'auto' || form.aiSupport === 'off') return 0;
  if (productionMode(form) === 'image' || productionMode(form) === 'docu' || isGenerated(form)) return 0;
  return Math.max(0, Math.min(30, parseInt(form.aiButce ?? Math.max(parseInt(form.aiClips)||0,parseInt(form.aiFill)||0))||0));
}
export function plannedAiAllowance(form) {
  return productionMode(form) === 'ai' ? Math.max(aiAllowance(form)>0?1:0, Math.floor(aiAllowance(form)*0.67)) : 0;
}
const directorPreferences = new WeakMap();
export function selectProductionMode(form, mode) {
  if (!['image','mixed','ai','director','kolaj','fullai','docu'].includes(mode)) return;
  if (productionMode(form) === 'director' && mode !== 'director') {
    Object.assign(form,directorPreferences.get(form) || {});
    directorPreferences.delete(form);
  }
  if (mode === 'director') {
    if (productionMode(form) !== 'director') directorPreferences.set(form,{
      visualStyle:form.visualStyle,aiSupport:form.aiSupport,mediaMode:form.mediaMode,
      aiClips:form.aiClips,aiFill:form.aiFill,
    });
    form.mediaKind = 'director';
    form.visualStyle = 'editorial';
    form.aiSupport = 'auto';
    form.mediaMode = 'auto';
    return;
  }
  if (mode === 'kolaj') {
    if (form.visualStyle !== 'kolaj') form.stockVisualStyle = form.visualStyle;
    form.visualStyle = 'kolaj';
    form.mediaKind = 'mixed';
  } else {
    if (form.visualStyle === 'kolaj') form.visualStyle = form.stockVisualStyle || 'editorial';
    if (form.visualStyle === 'hareket' && mode !== 'image') form.visualStyle = 'editorial';
    form.mediaKind = mode;
  }
  form.collageMode ||= 'hibrit';
  form.aiClips = aiAllowance(form);
  form.aiFill = aiAllowance(form);
}
export function animationCount(count, mode) {
  return mode === 'kapali' ? 0 : mode === 'hibrit' ? Math.round(count*0.4) : count;
}
