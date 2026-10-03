// INSERTS — the cutaways of a climax.
//
// A documentary editor does not hold one still for eight seconds while the narrator says "Then the
// guns opened, and for fourteen hours they hardly stopped": the cannon, the smoke, the men, a new
// picture every two seconds, each cut landing on a word. Nova's picture scene showed one picture
// per sentence; its "quick" pace only re-cropped the same picture, which the eye does not read as
// a new shot (Napoleon, Borodino: the cannon 8 s, "Wave after wave ... Great Redoubt" 8 s).
//
// planInserts picks the film's most intense picture lines and, for each, one or two moments
// (spoken content words) where a new, full-frame picture of the same moment cuts in: a close
// view, then a wide one. produce.mjs makes the pictures (after the narration, when word times are
// known) and stores them as scene.inserts = [{ src, at, imgW, imgH }]; the photo scene cuts to
// each at its time and holds it to the next.
//
// Never on a person's scene (a name card or caption would sit on someone else's picture), an
// annotated still, footage, a collage board or a line under four seconds.

const STOP = new Set(`a an the and or but nor of in on at to for from with by as is was were be been being are am it its this that these those he she his her him they them their we our you your i me my not no so then than there here what who whom whose which when where why how into onto over under after before just only even very also some any all every each more most much many still now ever never would could should can will shall may might must has have had do does did done up out down off about again like back last first later soon once yet too well almost nothing one two three four five six seven eight nine ten hundred thousand million`.split(/\s+/));

const ACTION = /\b(guns?|cannons?|artillery|volleys?|charge[ds]?|charging|attack(ed|s)?|assault|storm(ed|ing)?|waves?|fire[ds]?|firing|burn(ed|ing|s)?|flames?|blaz(e|ing)|smoke|battle|fought|fighting|killed|slaughter|bayonets?|cavalry|horsemen|explo\w*|blizzard|frozen|froze|stampede|crash(ed)?|panic|riot|collaps\w*|sank|shot|massacre|siege|breach(ed)?|drowned)\b/i;

const energyOf = (s) => (Number.isFinite(Number(s?.energy)) ? Number(s.energy) : 3);
const spoken = (s) => (s?.wordTimes ?? []).filter((w) => !/^\[.*\]$/.test(w.word));
const clean = (t) => String(t ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

/** How much a picture line wants cutaways: the art director's energy and pace, and what it says. */
export function insertScore(s) {
  let n = 0;
  if (energyOf(s) >= 4) n += 2;
  if (s?.pace === 'rapid') n += 2;
  else if (s?.pace === 'quick') n += 1;
  if (ACTION.test(clean(s?.say))) n += 2;
  if (s?.mood === 'tension' || s?.mood === 'triumph' || s?.mood === 'dread') n += 1;
  return n;
}

/**
 * A scene that may take cutaways: a full-frame picture line about a moment, not a person — a photo,
 * or a key-word card over a picture (the word stays, the picture behind it changes). Never a held,
 * deliberate still (pace hold, energy 1), never a full-sentence card, never under three seconds.
 */
export function insertable(s) {
  const card = s?.type === 'words' && (s.textMode === 'key' || s.textMode === 'none');
  if ((s?.type !== 'photo' && !card) || !s.image || s.video || s.annotate || s.name || s.caption || s.images?.length) return false;
  if (s.cast?.length || s.inserts?.length || s.layers || s.pace === 'hold' || energyOf(s) <= 1) return false;
  return (s.voiceDur ?? 0) >= 3;
}

/** A climax line: it speaks of action (guns, fire, a charge, a blizzard) or the director made it rapid. */
export const climaxLine = (s) => ACTION.test(clean(s?.say)) || s?.pace === 'rapid' || energyOf(s) >= 5;

/**
 * Where the cuts land: content words the narrator says, the first after ~1.1 s and the last
 * ~1 s before the line ends, at least 1.4 s apart, near 55% of the line (one) or 38% / 72% (two).
 */
export function insertMoments(s, n) {
  const words = spoken(s);
  const dur = s?.voiceDur ?? 0;
  const ok = words.filter((w) => {
    const bare = w.word.toLowerCase().replace(/[^\p{L}]/gu, '');
    return bare.length >= 4 && !STOP.has(bare) && w.t >= 1.1 && w.t <= dur - 1.0;
  });
  if (!ok.length) return [];
  const aims = n >= 2 ? [0.38, 0.72] : [0.55];
  const out = [];
  for (const a of aims) {
    const want = a * dur;
    const pick = ok
      .filter((w) => out.every((t) => Math.abs(w.t - t) >= 1.4))
      .sort((x, y) => Math.abs(x.t - want) - Math.abs(y.t - want))[0];
    if (pick) out.push(pick.t);
  }
  return out.sort((x, y) => x - y).map((t) => +Math.max(0, t - 0.04).toFixed(3));
}

const VIEWS = [
  'A closer view of the same moment: faces, hands and detail, a different angle',
  'A wide view of the same moment: the scale of it, smoke and distance',
];

/**
 * The film's cutaway plan: [{ i, at: [seconds], prompts: [..] }], strongest lines first, at most
 * one climax line per ~70 s of film (4..14), each with 1 picture (2 on a line of 6 s or more).
 */
export function planInserts(script, { max } = {}) {
  const scenes = script?.scenes ?? [];
  const total = scenes.reduce((a, s) => a + Math.max(Number(s.dur) || 0, (s.voiceDur ?? 0) + 0.4), 0);
  const cap = max ?? Math.max(4, Math.min(14, Math.round(total / 70)));
  const picked = scenes
    .map((s, i) => ({ s, i, score: insertScore(s) }))
    .filter(({ s, score }) => insertable(s) && climaxLine(s) && score >= 3)
    .sort((a, b) => b.score - a.score || (b.s.voiceDur ?? 0) - (a.s.voiceDur ?? 0) || a.i - b.i)
    .slice(0, cap);
  const out = [];
  for (const { s, i } of picked.sort((a, b) => a.i - b.i)) {
    const at = insertMoments(s, (s.voiceDur ?? 0) >= 6 ? 2 : 1);
    if (!at.length) continue;
    const base = clean(s.imagePrompt) || clean(s.say);
    out.push({ i, at, prompts: at.map((_, k) => `${base}. ${VIEWS[k % VIEWS.length]}. The moment: "${clean(s.say)}"`) });
  }
  return out;
}
