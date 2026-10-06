/*
 * VOICE DIRECTOR — how each line is performed (ElevenLabs v4 / v3: inline audio tags,
 * "..." as a held breath, continuous stability on v4).
 *
 * User (Oct 2026): "ElevenLabs 4 gelmiş ... tonlaması, emotion hepsini ince ayarla entegre et;
 * nerede nasıl tonlama vereceğini iyi bilmeli, adeta bir ses sanatçısı gibi."
 *
 * What a documentary narrator does, line by line:
 *   - the film opens low and steady (gravity before information);
 *   - the scene's emotion sets the colour (dread hushed, tension quiet and tight, a reveal slow
 *     and weighted, sorrow soft, a triumph rising) — v4 reads descriptive direction
 *     ("[low, hushed voice]") as well as single tags;
 *   - a short punch line (a slam, four words or fewer) is said firmly, never whispered;
 *   - a question is asked, with curiosity, unless the scene is dread;
 *   - the last line of a chapter lands softer and slower (the music breathes after it);
 *   - a reveal holds its breath before its last clause ("..." replaces the final comma);
 *   - variety: the same colour twice in a row drops its tag on the second line (the performance
 *     carries over through request stitching on v4) — a tag on every line sounds acted.
 * The writer's own direction (a line that starts with a tag) always wins: the director only
 * fills in what the writer left open.
 */

/** v4's colour for a scene emotion (descriptive direction; v3 gets its single tags). */
export const V4_MOOD = {
  curious: '[curious]',
  calm: '[warm, unhurried]',
  tension: '[quiet, tense]',
  dread: '[low, hushed voice]',
  reveal: '[slowly, with weight]',
  sad: '[softly, with sorrow]',
  triumph: '[confident, rising]',
};
export const V3_MOOD = {
  curious: '[curious]',
  calm: '[warmly]',
  tension: '[quietly]',
  dread: '[whispers]',
  reveal: '[dramatic]',
  sad: '[sad]',
  triumph: '[confident]',
};
/**
 * v4 stability is continuous (v3: only 0 / 0.5 / 1). Lower = more expressive and more varied;
 * never below 0.35 (ElevenLabs: very low stability drifts and hallucinates on long reads).
 */
export const V4_STABILITY = { curious: 0.5, calm: 0.55, tension: 0.42, dread: 0.4, reveal: 0.38, sad: 0.45, triumph: 0.45, punch: 0.58, open: 0.5 };

export const isTagModel = (model) => /eleven_v[34]/.test(String(model || ''));
export const isV4 = (model) => /eleven_v4/.test(String(model || ''));
const TAG_AT_START = /^\s*\[[^\]]*\]/;
export const stripTags = (t) => String(t || '').replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();
const words = (t) => stripTags(t).split(/\s+/).filter(Boolean);

/**
 * One line's performance.
 * @param {object} scene {say, mood, type}
 * @param {object} at {index, first, chapterEnd, prevMood, prevTag}
 * @returns {{text: string, stability: number, tag: string}} text as sent (tags + punctuation), the
 *          line's stability (v4) and the tag it carries ('' when none) — for the next line's variety.
 */
export function directLine(scene, { model = 'eleven_v4', first = false, chapterEnd = false, prevTag = '', punctuation = true } = {}) {
  const say = String(scene?.say || '').trim();
  const mood = scene?.mood || 'curious';
  if (!isTagModel(model)) return { text: stripTags(say), stability: 0.45, tag: '' };
  const v4 = isV4(model);
  const MOOD = v4 ? V4_MOOD : V3_MOOD;
  const bare = stripTags(say);
  const n = words(bare).length;
  const punch = scene?.type === 'slam' || (n > 0 && n <= 4);
  const question = /\?\s*["”']?$/.test(bare);
  // The writer directed this line: keep it as written.
  if (TAG_AT_START.test(say)) {
    const tag = say.match(TAG_AT_START)[0].trim();
    return { text: say, stability: v4 ? (punch ? V4_STABILITY.punch : V4_STABILITY[mood] ?? 0.5) : 0.5, tag };
  }
  let tag;
  let stab = V4_STABILITY[mood] ?? 0.5;
  if (first) {
    tag = v4 ? '[low, steady voice]' : '[quietly]';
    stab = V4_STABILITY.open;
  } else if (punch) {
    tag = v4 ? '[firmly]' : '[serious]';
    stab = V4_STABILITY.punch;
  } else if (question && mood !== 'dread') {
    tag = MOOD.curious;
  } else if (chapterEnd && ['calm', 'sad', 'reveal', 'dread'].includes(mood)) {
    tag = v4 ? '[softly, slower]' : '[softly]';
  } else {
    tag = MOOD[mood] ?? '';
  }
  // Variety: the same colour on two lines in a row is said once (stitching carries it on v4).
  if (v4 && tag && tag === prevTag && !punch) tag = '';
  let body = bare;
  // A reveal holds its breath before its last clause.
  if (punctuation && mood === 'reveal' && !/\.\.\.|…/.test(body)) {
    const i = body.lastIndexOf(', ');
    if (i > body.length * 0.45) body = `${body.slice(0, i)}... ${body.slice(i + 2)}`;
  }
  return { text: tag ? `${tag} ${body}` : body, stability: v4 ? stab : 0.5, tag: tag || prevTag };
}

/**
 * A whole narration (the lines of a film, or a Short's beats): each line directed with its
 * neighbours known. `chapterOf(scene)` marks the last line of each chapter.
 */
export function directLines(scenes, { model = 'eleven_v4', chapterOf = (s) => s?.chapter ?? 0, punctuation = true } = {}) {
  let prevTag = '';
  const lines = scenes.map((s, i) => {
    const next = scenes[i + 1];
    const d = directLine(s, { model, first: i === 0, chapterEnd: !next || chapterOf(next) !== chapterOf(s), prevTag, punctuation });
    prevTag = d.tag;
    return d;
  });
  return isTagModel(model) ? budgetQuiet(lines, scenes, chapterOf) : lines;
}

/*
 * QUIET BUDGET. A narrator speaks clearly and with presence; the hushed voice is an effect, kept
 * for a few moments. The Black Death film had 42% of its lines tagged quietly / whispers / hushed /
 * slowly (mostly the writer's own tags) and the whole narration sounded whispered — the user: "sürekli
 * kısık sesle anlatıyor, belli yerlerde böyle yapmalı, full yaparsa tuhaf durur".
 * At most QUIET_SHARE of the lines (at least 2) keep a quiet colour, never two in a row, chosen by
 * where it means most: the film's first line, chapter ends, reveals, dread. Whispers once per film.
 * Every other quiet tag — the writer's too — is dropped: that line is read in the clear narrator voice.
 */
export const QUIET_SHARE = 0.15;
const QUIET = /quiet|hush|whisper|soft|low|murmur|slow|breath/i;
export function budgetQuiet(lines, scenes = [], chapterOf = (s) => s?.chapter ?? 0) {
  const tagOf = (t) => (String(t).match(TAG_AT_START) || [''])[0].trim();
  const quiet = lines.map((d) => QUIET.test(tagOf(d.text)));
  const budget = Math.max(2, Math.round(lines.length * QUIET_SHARE));
  const score = (i) => {
    const s = scenes[i] || {};
    const next = scenes[i + 1];
    if (i === 0) return 100;
    if (!next || chapterOf(next) !== chapterOf(s)) return 80;
    if (s.mood === 'reveal') return 60;
    if (s.mood === 'dread') return 50;
    return 10;
  };
  const keep = new Set();
  const order = lines.map((_, i) => i).filter((i) => quiet[i]).sort((a, b) => score(b) - score(a) || a - b);
  for (const i of order) {
    if (keep.size >= budget) break;
    if (keep.has(i - 1) || keep.has(i + 1)) continue;
    keep.add(i);
  }
  let whispered = false;
  return lines.map((d, i) => {
    if (!quiet[i]) return d;
    const tag = tagOf(d.text);
    const body = d.text.slice(d.text.indexOf(tag) + tag.length).trim();
    if (!keep.has(i)) return { ...d, text: body, tag: '' };
    // One whisper per film; the others keep a quiet colour without whispering.
    if (/whisper/i.test(tag)) {
      if (whispered) return { ...d, text: `[quietly] ${body}`, tag: '[quietly]' };
      whispered = true;
    }
    return d;
  });
}

/**
 * Alignment of a tagged text mapped back onto the untagged text: tag spans (and the space after
 * them) are dropped, so character offsets match the plain narration again (Shorts time their beats,
 * slams and figures by offset into the joined plain text).
 */
export function untagAlignment(a) {
  const chars = [];
  const s = [];
  const e = [];
  let inTag = false;
  let skipSpace = false;
  a.characters.forEach((ch, i) => {
    if (ch === '[') inTag = true;
    if (inTag) {
      if (ch === ']') {
        inTag = false;
        skipSpace = true;
      }
      return;
    }
    if (skipSpace && /\s/.test(ch)) {
      skipSpace = false;
      return;
    }
    skipSpace = false;
    chars.push(ch);
    s.push(a.character_start_times_seconds[i]);
    e.push(a.character_end_times_seconds[i]);
  });
  return { characters: chars, character_start_times_seconds: s, character_end_times_seconds: e };
}
