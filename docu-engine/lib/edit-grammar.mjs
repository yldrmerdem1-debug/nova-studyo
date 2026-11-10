// EDIT GRAMMAR — which transition, effect and camera may come when.
//
// The art director picks per scene from the whole catalogue; this pass makes the cut obey the
// story's gravity and the moment's meaning before the engine draws it (produce.mjs):
//  - a grave story (war, death, collapse, crime) never gets vlog/trailer devices: no light leaks,
//    glitches, pixel or spin wipes, chroma splits, bokeh, VHS;
//  - loud devices (whip, zoom punch, slide, flash, zoom-blur, shake, speed-ramp, dolly-zoom) are
//    accents: they land on an impact (energy 4-5, a slam, a reveal) or a chapter turn, a few times
//    per film, never on a quiet, sad or grieving beat;
//  - a quiet beat opens on a cut or a fade to black, and its camera holds, drifts or pushes slowly.
//  - a text card never re-prints the sentence the narrator is reading (an echo caption): it
//    prints its key word, big (Napoleon: "MORE THAN FORTY-SEVEN FRENCH GENERALS WERE KILLED OR
//    WOUNDED." in a box under the voice).
// User (1453): "ciddiyet var ... kamera, edit, geçiş, hepsine ince ayar".

export const GRAMMAR_VERSION = 2;

const norm = (t) => String(t ?? '').replace(/\[[^\]]*\]/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Breath after a line that must land. Every scene ended 0.4 s after its last word (Napoleon: the
 * median gap before every one of 173 cuts), so a chapter's last line, a death toll or a grieving
 * beat was cut off as fast as an aside. An editor lets those sit: the end of a chapter longest,
 * then a number or a slam, then a quiet or a turning line. Raises scene.dur (seconds) once the
 * narration is known; returns { scenes, added } for the log.
 */
export function breathAfter(s, next) {
  if (!next) return 0;
  if (next.chapterCard || (next.chapter != null && s.chapter != null && next.chapter !== s.chapter)) return 1.4;
  // 1.16.16: shorter than before (1.0 / 0.9 / 0.9 / 0.8) — the outliers speak ~165 wpm and only stop at a chapter turn.
  if (s.type === 'counter' || s.type === 'stat') return 0.7;
  if (s.type === 'slam') return 0.6;
  if (isQuiet(s)) return 0.7;
  if (next.mood && s.mood && next.mood !== s.mood && ['sad', 'dread', 'reveal'].includes(s.mood)) return 0.6;
  return 0;
}

/**
 * NO WAITING ON A PICTURE (1.16.16). The writer's length estimate stayed the
 * floor of a scene after the voice was known: El Niño (Oct 2026) held photo
 * and words scenes 34 s longer in total than their narration — dead air after
 * the line, every few scenes. A plain picture or text line now ends with its
 * voice (+ the timeline's 0.4 s); held shots (pace 'hold'), devices,
 * counters and animations keep their own length. Returns { scenes, saved }.
 */
export const TIGHT_TYPES = new Set(['photo', 'words']);
export function tightenToVoice(script, { tail = 0.4 } = {}) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  let n = 0;
  let saved = 0;
  for (const s of scenes) {
    if (!TIGHT_TYPES.has(s?.type) || !(s.voiceDur > 0) || s.pace === 'hold' || s.chapterCard || s.outro) continue;
    const want = +(s.voiceDur + tail).toFixed(3);
    if ((Number(s.dur) || 0) > want + 0.05) {
      saved += s.dur - want;
      s.dur = want;
      n++;
    }
  }
  return { scenes: n, saved: +saved.toFixed(1) };
}

/*
 * MUSIC WINDOWS (27 Ekim 2026, müzik denetimi). The mix opens the score fully in a pause of >= 3 s after an
 * emotional peak line (timeline.js MIX.windowMin) — but breaths were capped at 1.4 s, so on Eagle's Nest, Chernobyl
 * and France the window fired 0 times and the music was up front 0.6-2% of the runtime: under the voice the whole
 * film, never heard after "The work killed twelve" or "Borys Baranov died". About one line every WINDOW_EVERY
 * seconds — a death line first, then a full-energy line, a sad one, a reveal — gets WINDOW_BREATH of air after its
 * last word, and the score speaks there (Murch: let the line land). Never in the hook, never next to a chapter card
 * (the card opens the music anyway), never before a slam (it has its own stop-down).
 */
export const WINDOW_BREATH = 3.3;
export const WINDOW_EVERY = 150;
const WINDOW_HOOK = 60;
const WINDOW_CARD = 40;
const windowRank = (s) => (s.grief === true ? 0 : s.energy === 5 ? 1 : s.mood === 'sad' ? 2 : s.mood === 'reveal' ? 3 : -1);
function musicWindows(scenes) {
  const start = [];
  let t = 0;
  for (const s of scenes) {
    start.push(t);
    t += Math.max(Number(s?.dur) || 0, (Number(s?.voiceDur) || 0) + 0.4);
  }
  const cards = scenes.map((s, i) => (s?.chapterCard ? start[i] : null)).filter((x) => x !== null);
  const cands = scenes
    .map((s, i) => ({ s, i, r: windowRank(s ?? {}), at: start[i] + (Number(s?.voiceDur) || 0) }))
    .filter(({ s, i, r, at }) => {
      const next = scenes[i + 1];
      return r >= 0 && s.voiceDur > 0 && next && !next.chapterCard && next.type !== 'slam' && !s.silence && !next.silence
        && (next.chapter == null || s.chapter == null || next.chapter === s.chapter) && at >= WINDOW_HOOK
        && cards.every((c) => Math.abs(c - at) >= WINDOW_CARD);
    })
    .sort((x, y) => x.r - y.r || (Number(y.s.energy) || 0) - (Number(x.s.energy) || 0) || x.i - y.i);
  const picked = [];
  for (const c of cands) if (picked.every((p) => Math.abs(p.at - c.at) >= WINDOW_EVERY)) picked.push(c);
  return picked.map((p) => p.i);
}

export function applyBreath(script) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  let n = 0;
  let added = 0;
  const grow = (s, b) => {
    const want = +(s.voiceDur + b).toFixed(3);
    if (want > (Number(s.dur) || 0)) {
      added += want - Math.max(Number(s.dur) || 0, s.voiceDur + 0.4);
      s.dur = want;
      return true;
    }
    return false;
  };
  scenes.forEach((s, i) => {
    const b = breathAfter(s, scenes[i + 1]);
    if (!b || !(s.voiceDur > 0)) return;
    if (grow(s, b)) n++;
  });
  let windows = 0;
  for (const i of musicWindows(scenes)) {
    scenes[i].musicWindow = true;
    windows++;
    if (grow(scenes[i], WINDOW_BREATH)) n++;
  }
  return { scenes: n, added: +added.toFixed(1), windows };
}

/** The card prints (nearly) the line being read aloud: more than six words, all of them from the spoken line. */
export function echoesLine(s) {
  const text = norm(s?.text);
  const say = norm(s?.say);
  if (!text || !say) return false;
  const words = text.split(' ');
  if (words.length <= 6) return false;
  if (say.includes(text) || text.includes(say)) return true;
  const spoken = new Set(say.split(' '));
  return words.filter((w) => spoken.has(w)).length / words.length >= 0.85;
}

const T_BANNED_GRAVE = new Set(['leak', 'glitch', 'pixel', 'spin-blur', 'split-wipe']);
const T_ACCENT = new Set(['zoom', 'whip', 'slide', 'flash', 'light-sweep', 'paper-tear']);
const T_QUIET_OK = new Set(['cut', 'blackout', 'dip-color', 'ink']);
const T_RARE = { 'film-burn': 2, iris: 2 };
/*
 * GERÇEK GÖRÜNTÜNÜN KENARI (28 Ekim 2026, kanal sahibi: "o kısımda geçiş hataları var"). Husi–Suudi haberinde Ras
 * Tanura'nın gerçek klibinden başlık kartına "whip", Bloomberg satırının klibine "match" geçişiyle girildi. Gerçek
 * görüntüye giriş, ondan çıkış ve onun sürdüğü satırlar (footage-hold.js heldFootage) yalnızca kesme; bölüm dönüşünde karartma.
 */
const T_FOOTAGE_OK = new Set(['cut', 'blackout', 'dip-color']);
const realFootage = (x) => !!x && ((!!x.video && !!(x.archived || x.sourceLabel) && !x.sourceVoice && !x.aiVideo) || x.heldFootage != null);

const FX_BANNED_GRAVE = new Set(['light-leak', 'bokeh', 'chroma', 'glitch', 'vhs', 'scan-lines', 'flare']);
const FX_LOUD = new Set(['flash-frame', 'shake', 'zoom-blur', 'speed-ramp', 'dolly-zoom']);
// Per film: how many times a loud device may appear (grave / open).
const FX_CAP = {
  // Halved Oct 2026 (user: "heryere vuruculuğu kesip uyumlu editler").
  grave: { 'flash-frame': 2, shake: 1, 'zoom-blur': 1, 'speed-ramp': 1, 'dolly-zoom': 1, 'film-burn': 1 },
  open: { 'flash-frame': 3, shake: 1, 'zoom-blur': 2, 'speed-ramp': 2, 'dolly-zoom': 1, 'film-burn': 1 },
};
/*
 * VIGNETTE-PULSE (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: luma 52-56, doygunluk 2,5-6; kanal sahibi
 * "her video siyah, karanlık; anlık efektler doğal değil"). The pulse sat on calm charts, sad lines and every slam: a black
 * ring breathing over pictures that were already dark. Now at most VIGNETTE_PULSE_CAP per film, only on an impact whose
 * mood is dread or tension — a heartbeat on the line that earns it, nowhere else.
 */
export const VIGNETTE_PULSE_CAP = 2;
const VIGNETTE_PULSE_MOODS = new Set(['dread', 'tension']);
/*
 * Hit-timed devices without a hit (29 Ekim 2026, same videos): the engine landed a glitch or a chroma split on "the
 * stressed word" of any line, so a quiet informative shot jolted for no reason. They stay only where the line has a
 * real beat to land on: an impact, a slam or the scene's keyword.
 */
const FX_HIT_TIMED = new Set(['chroma', 'glitch']);
/*
 * A rejected transition at a chapter turn used to become a fade to black ('blackout'): with a black chapter card next to
 * it, every turn of Gimli / Kartal Yuvası went black twice (29 Ekim 2026: %21-39 of frames at luma < 40). A rejected
 * device now falls back to a plain cut; a blackout or dip-color the plan chose itself stays where it is allowed.
 */
export const TURN_FALLBACK = 'cut';
const CAM_QUIET = new Set(['static', 'drift', 'push-in', 'pull-out', 'tilt-down', 'tilt-up', 'rack-focus', 'parallax']);

const energyOf = (s) => (Number.isFinite(Number(s?.energy)) ? Number(s.energy) : 3);

/** An impact: a hit the cut may underline. */
export function isImpact(s) {
  return energyOf(s) >= 4 || s?.type === 'slam' || (s?.mood === 'reveal' && energyOf(s) >= 3);
}

/** A quiet beat: grief, calm, a held document or a still face. */
export function isQuiet(s) {
  return s?.mood === 'sad' || s?.mood === 'calm' || energyOf(s) <= 1 || s?.pace === 'hold' || s?.type === 'quote';
}

const chapterTurn = (s, prev) => !prev || (s?.type === 'title' && s?.chapterCard) || (s?.chapter != null && prev?.chapter != null && s.chapter !== prev.chapter);

/** Share of scenes that still carry an effect (two decimals, as docu-art-director.js writes fxDensity). */
export function keptFxShare(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  return +(list.filter((s) => Array.isArray(s?.fx) && s.fx.length).length / Math.max(1, list.length)).toFixed(2);
}

/**
 * Rewrites script.scenes[*].transition / fx / camera and the per-film palettes in place.
 * gravity: 'grave' | 'open' (see storyGravity in audio-director.mjs). Returns a change log.
 */
export function applyEditGrammar(script, { gravity = 'open' } = {}) {
  const grave = gravity === 'grave';
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const log = { transitions: 0, fx: 0, camera: 0, notes: [] };
  const fxUsed = {};
  const rare = {};
  const accentByChapter = new Map();
  let lastAccent = null;

  scenes.forEach((s, i) => {
    const prev = scenes[i - 1];
    const quiet = isQuiet(s);
    const impact = isImpact(s) && !quiet;
    const turn = chapterTurn(s, prev);

    // --- transition into this scene
    const t = s.transition;
    if (t && t !== 'cut') {
      let want = t;
      if ((realFootage(s) || realFootage(prev)) && !T_FOOTAGE_OK.has(t)) want = turn ? TURN_FALLBACK : 'cut';
      else if (grave && T_BANNED_GRAVE.has(t)) want = turn ? TURN_FALLBACK : 'cut';
      else if (quiet && !T_QUIET_OK.has(t)) want = turn ? TURN_FALLBACK : 'cut';
      else if (T_ACCENT.has(t)) {
        const ch = s.chapter ?? -1;
        const used = accentByChapter.get(ch) ?? 0;
        const room = grave ? 1 : 2;
        // An accent lands on a hit or a chapter turn, once (twice in an open story) per chapter, never twice in a row of the same kind.
        if (!(impact || turn) || used >= room || lastAccent === t) want = turn && grave ? TURN_FALLBACK : 'cut';
        else {
          accentByChapter.set(ch, used + 1);
          lastAccent = t;
        }
      } else if (T_RARE[t] != null) {
        rare[t] = (rare[t] ?? 0) + 1;
        if (rare[t] > T_RARE[t]) want = turn ? TURN_FALLBACK : 'cut';
      }
      if (want !== t) {
        s.transition = want;
        log.transitions++;
      }
    }

    // --- effects on this scene
    if (Array.isArray(s.fx) && s.fx.length) {
      const kept = s.fx.filter((f) => {
        const k = typeof f === 'string' ? f : f?.kind ?? f?.type;
        if (grave && FX_BANNED_GRAVE.has(k)) return false;
        if (k === 'vignette-pulse') {
          // A text montage is the art director's impact scene too (docu-art-director.js isImpactScene).
          const hitLine = impact || (s.type === 'montage' && !!s.text && !quiet);
          if (!hitLine || !VIGNETTE_PULSE_MOODS.has(s.mood) || (fxUsed[k] ?? 0) >= VIGNETTE_PULSE_CAP) return false;
          fxUsed[k] = (fxUsed[k] ?? 0) + 1;
          return true;
        }
        if (FX_HIT_TIMED.has(k) && !(impact || s.keyword || s.type === 'slam')) return false;
        if (FX_LOUD.has(k) || k === 'film-burn') {
          if (quiet && k !== 'film-burn') return false;
          if (k !== 'film-burn' && !impact) return false;
          if (k === 'dolly-zoom' && !['dread', 'tension', 'reveal'].includes(s.mood)) return false;
          const cap = FX_CAP[grave ? 'grave' : 'open'][k] ?? 99;
          if ((fxUsed[k] ?? 0) >= cap) return false;
          fxUsed[k] = (fxUsed[k] ?? 0) + 1;
        }
        return true;
      });
      if (kept.length !== s.fx.length) {
        log.fx += s.fx.length - kept.length;
        s.fx = kept;
      }
    }

    // --- text: the key word, never the sentence the viewer is hearing
    if (s.type === 'words' && s.textMode !== 'key' && s.textMode !== 'none' && echoesLine(s)) {
      s.textMode = 'key';
      log.text = (log.text ?? 0) + 1;
    }

    // --- camera: a quiet beat holds or moves slowly; a handheld jolt belongs to action
    if (s.camera && quiet && !CAM_QUIET.has(s.camera)) {
      s.camera = s.camera === 'detail-punch' ? 'push-in' : 'drift';
      log.camera++;
    } else if (grave && s.camera === 'handheld' && !impact) {
      s.camera = 'drift';
      log.camera++;
    }
  });

  // The engine's own picks (scenes without an explicit choice) come from these palettes.
  const explicit = scenes.some((s) => Array.isArray(s?.fx));
  if (grave) {
    if (Array.isArray(script.transitionPalette)) script.transitionPalette = script.transitionPalette.filter((k) => !T_BANNED_GRAVE.has(k));
    if (Array.isArray(script.fxPalette)) script.fxPalette = script.fxPalette.filter((k) => !FX_BANNED_GRAVE.has(k) && !FX_LOUD.has(k));
    if (Number.isFinite(script.fxDensity) && !explicit) script.fxDensity = Math.min(script.fxDensity, 0.25);
  }
  /*
   * fxDensity is DERIVED (29 Ekim 2026, görünüş düzeltmesi): the art director writes it as the share of scenes carrying
   * fx (docu-art-director.js), then this pass drops some of them, and the script (and the render cache key) kept the old
   * share. With explicit per-scene fx it is recomputed here from what was kept.
   */
  if (explicit && Number.isFinite(script.fxDensity)) script.fxDensity = keptFxShare(scenes);
  script.editGrammar = { version: GRAMMAR_VERSION, gravity };
  if (log.transitions || log.fx || log.camera || log.text) log.notes.push(`kurgu dili (${gravity}): ${log.transitions} geçiş, ${log.fx} efekt, ${log.camera} kamera, ${log.text ?? 0} yankı yazısı düzeltildi`);
  return log;
}
