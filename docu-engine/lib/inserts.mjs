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
// annotated still, footage, a collage board, a held picture, a named real photo (commons) or a line
// under four seconds; a cutaway's prompt never comes from the narration alone.

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
  // s.cutaway: Nova's preview gate found this line inside a held shot (hook still past 5 s, a still past 15 s) — it
  // is cut whatever its tempo, and its caption (a place/date line) stays true over a closer view of the same moment.
  // France, Oct 2026: the director's 'hold' on three hook lines left 6-7 s stills the critic only saw after render.
  // s.noInserts: Nova's preview gate found this line's cutaway wrong (another country's plate, a fake landmark): no cutaway.
  if (s?.noInserts) return false;
  const forced = !!s?.cutaway;
  // A title the gate cut: the title stays, the picture under it changes (scenes.tsx PlainTitle, as on a key-word card).
  // Eagle's Nest fire, Oct 2026: "It Burned Down in One Night" held 6.2 s in the hook through four preview rounds. Chapter
  // and countdown cards draw no cutaways (their pictures would be paid for and never seen).
  const titled = forced && s?.type === 'title' && !s.chapterCard && !s.rankCard;
  if ((s?.type !== 'photo' && !card && !titled) || !s.image || s.video || s.annotate || s.name || (s.caption && !forced) || s.images?.length) return false;
  if (s.cast?.length || s.inserts?.length || s.layers) return false;
  // 2009 submarine collision, Oct 2026: a line held on the picture before it (bg prev/next — often one the AI cap took
  // the picture from) got two new AI pictures back, and the real Commons photo of the Bugaled Breizh was cut with an AI
  // "battered fishing trawler". Neither is cut unless the preview gate asks for it (s.cutaway).
  if (!forced && (s.heldBg || s.bg === 'prev' || s.bg === 'next' || (s.commons && s.archived))) return false;
  if (!forced && (s.pace === 'hold' || energyOf(s) <= 1)) return false;
  return (s.voiceDur ?? 0) >= (forced ? FORCED_MIN_SEC : 3);
}

/** A forced cutaway (s.cutaway) fits a shorter line: one cut needs a word ~0.8 s in and ~0.6 s before the end. */
export const FORCED_MIN_SEC = 2.4;

/** A climax line: it speaks of action (guns, fire, a charge, a blizzard) or the director made it rapid. */
export const climaxLine = (s) => ACTION.test(clean(s?.say)) || s?.pace === 'rapid' || energyOf(s) >= 5;

/**
 * Where the cuts land: content words the narrator says, the first after ~1.1 s and the last
 * ~1 s before the line ends, at least 1.4 s apart, near 55% of the line (one) or 38% / 72% (two).
 */
export function insertMoments(s, n) {
  const words = spoken(s);
  const dur = s?.voiceDur ?? 0;
  const [from, tail] = s?.cutaway ? [0.8, 0.6] : [1.1, 1.0];
  const ok = words.filter((w) => {
    const bare = w.word.toLowerCase().replace(/[^\p{L}]/gu, '');
    return bare.length >= 4 && !STOP.has(bare) && w.t >= from && w.t <= dur - tail;
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

/** The hook's cutaway window and how many of its lines get one. */
export const OPENING_SEC = 45;
export const OPENING_MAX = 3;
/** A still line this long gets a cutaway wherever it is (the long-video critic's "long hold"). */
export const LONG_HOLD_SEC = 8;
export const LONG_HOLD_MAX = 6;

/*
 * NOTHING THE PICTURE DOES NOT HAVE (2009 submarine collision, Oct 2026): "faces, hands and detail" was added to an
 * underwater silhouette with "no detail visible", "smoke and distance" to an empty Atlantic in a story without a fire.
 * The views name only a distance and an angle; what is in them comes from the line's own picture.
 */
const VIEWS = [
  'A closer view of the same moment: one detail of it, a different angle',
  'A wider view of the same moment: the place and its scale',
];

/**
 * The film's cutaway plan: [{ i, at: [seconds], prompts: [..] }], strongest lines first, at most
 * one climax line per ~70 s of film (4..14), each with 1 picture (2 on a line of 6 s or more).
 */
export function planInserts(script, { max } = {}) {
  const out = [];
  const scenes = script?.scenes ?? [];
  for (const { s, i } of insertLines(script, { max })) {
    const at = insertMoments(s, (s.voiceDur ?? 0) >= 6 ? 2 : 1);
    if (!at.length) continue;
    const prompts = insertPromptsFor(s, at.length, heldSource(scenes, i));
    if (!prompts.length) continue;
    out.push({ i, at, prompts });
  }
  return out;
}

/**
 * The cutaway pictures' prompts for a line (the same text before and after the voice: the inbox key holds).
 * What the picture shows comes from a visual description — the line's own prompt or search, else (a held line the
 * preview gate cut) the picture it holds — never the narration alone: a line the AI cap took the prompt from asked
 * for "While France spoke, the British boat was still in the Atlantic, damaged.. A closer view…". None: no cutaway.
 */
export function insertPromptsFor(s, n, held = null) {
  const base = clean(s.imagePrompt) || clean(s.search) || clean(held?.imagePrompt) || clean(held?.search);
  if (!base) return [];
  return Array.from({ length: n }, (_, k) => `${base}. ${VIEWS[k % VIEWS.length]}. The moment: "${clean(s.say)}"`);
}

/** The scene whose picture a held line (bg prev/next) shows: the nearest one with that picture of its own. */
function heldSource(scenes, i) {
  const s = scenes[i];
  if (!s?.image || !(s.heldBg || s.bg === 'prev' || s.bg === 'next')) return null;
  for (let d = 1; d < scenes.length; d++) {
    for (const j of s.bg === 'next' ? [i + d, i - d] : [i - d, i + d]) {
      const p = scenes[j];
      // A borrowed picture is another line's (its own prompt went to the AI cap): never the source.
      if (p && p !== s && p.image === s.image && !p.heldBg && !p.bg && !p.borrowed) return p;
    }
  }
  return null;
}

/** An estimated line this long gets both cutaway pictures ahead (the real 2-cutaway threshold is 6 s). */
export const AHEAD_TWO_SEC = 4.5;

/** Spoken seconds of a line before it is voiced (~2.6 words a second, the narration's pace). */
export const estimateVoiceDur = (s) => +(String(s?.say ?? '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length / 2.6).toFixed(2);

/**
 * CUTAWAYS BEFORE THE VOICE (Hastings, Oct 2026): with ChatGPT stills (manual inbox) the cutaways were planned
 * after the voice, their pictures went to the inbox and the render went on without them — the hook kept three
 * 5-7 s holds the plan had already cut. The same lines are planned on estimated voice lengths, so their prompts
 * join the first inbox list; after the voice the real plan finds them there.
 */
export function insertPicturesAhead(script, { max } = {}) {
  const scenes = (script?.scenes ?? []).map((s) => (s.voiceDur != null ? s : { ...s, voiceDur: estimateVoiceDur(s) }));
  // The estimate runs short of the real read (a 5.4 s guess was read in 6.3 s): from AHEAD_TWO_SEC the second
  // cutaway is asked for too — an unused ChatGPT still costs nothing, a missing one stops the render.
  return insertLines({ ...script, scenes }, { max })
    .map(({ s, i }) => ({ i, prompts: insertPromptsFor(s, s.voiceDur >= AHEAD_TWO_SEC ? 2 : 1, heldSource(scenes, i)) }))
    .filter((p) => p.prompts.length);
}

function insertLines(script, { max } = {}) {
  const scenes = script?.scenes ?? [];
  const total = scenes.reduce((a, s) => a + Math.max(Number(s.dur) || 0, (s.voiceDur ?? 0) + 0.4), 0);
  const cap = max ?? Math.max(4, Math.min(14, Math.round(total / 70)));
  const picked = scenes
    .map((s, i) => ({ s, i, score: insertScore(s) }))
    .filter(({ s, score }) => insertable(s) && climaxLine(s) && score >= 3)
    .sort((a, b) => b.score - a.score || (b.s.voiceDur ?? 0) - (a.s.voiceDur ?? 0) || a.i - b.i)
    .slice(0, cap);
  /*
   * THE HOOK IS CUT FAST (Oct 2026 study: MagnatesMedia ~40 picture changes a minute in its first three minutes,
   * ColdFusion and Moon close behind). A picture line that starts in the first OPENING_SEC seconds and lasts
   * 3.5 s or more gets a cutaway too — whatever it says — up to OPENING_MAX lines, on top of the climax ones.
   */
  let t = 0;
  const starts = scenes.map((s) => { const at = t; t += Math.max(Number(s.dur) || 0, (s.voiceDur ?? 0) + 0.4); return at; });
  const taken = new Set(picked.map((p) => p.i));
  const opening = scenes
    .map((s, i) => ({ s, i, score: insertScore(s) }))
    .filter(({ s, i }) => !taken.has(i) && starts[i] < OPENING_SEC && insertable(s) && (s.voiceDur ?? 0) >= 3.5)
    .slice(0, OPENING_MAX);
  picked.push(...opening);
  /*
   * NO STILL HELD PAST LONG_HOLD_SEC (Oct 2026, long-video critic: "Nova benden iyi çıkarmalı"): a calm picture line of
   * 8 s or more gets a cutaway too, wherever it sits — single stills held 10-18 s were left alone because only climax
   * lines and the hook were cut. Longest lines first, at most LONG_HOLD_MAX.
   */
  /*
   * FORCED CUTS (s.cutaway, Nova's preview gate): every marked line, beyond the caps — the gate only marks lines
   * inside a held shot, so there are few, and a hook still past 5 s is exactly what this module exists to cut.
   */
  const marked = new Set(picked.map((p) => p.i));
  picked.push(...scenes.map((s, i) => ({ s, i, score: insertScore(s) })).filter(({ s, i }) => s.cutaway && !marked.has(i) && insertable(s)));
  const held = new Set(picked.map((p) => p.i));
  const holds = scenes
    .map((s, i) => ({ s, i, score: insertScore(s) }))
    .filter(({ s, i }) => !held.has(i) && insertable(s) && (s.voiceDur ?? 0) >= LONG_HOLD_SEC)
    .sort((a, b) => (b.s.voiceDur ?? 0) - (a.s.voiceDur ?? 0) || a.i - b.i)
    .slice(0, LONG_HOLD_MAX);
  picked.push(...holds);
  return picked.sort((a, b) => a.i - b.i);
}
