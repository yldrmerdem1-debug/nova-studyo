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
  if (s.type === 'counter' || s.type === 'stat') return 1.0;
  if (s.type === 'slam') return 0.9;
  if (isQuiet(s)) return 0.9;
  if (next.mood && s.mood && next.mood !== s.mood && ['sad', 'dread', 'reveal'].includes(s.mood)) return 0.8;
  return 0;
}

export function applyBreath(script) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  let n = 0;
  let added = 0;
  scenes.forEach((s, i) => {
    const b = breathAfter(s, scenes[i + 1]);
    if (!b || !(s.voiceDur > 0)) return;
    const want = +(s.voiceDur + b).toFixed(3);
    if (want > (Number(s.dur) || 0)) {
      added += want - Math.max(Number(s.dur) || 0, s.voiceDur + 0.4);
      s.dur = want;
      n++;
    }
  });
  return { scenes: n, added: +added.toFixed(1) };
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

const FX_BANNED_GRAVE = new Set(['light-leak', 'bokeh', 'chroma', 'glitch', 'vhs', 'scan-lines', 'flare']);
const FX_LOUD = new Set(['flash-frame', 'shake', 'zoom-blur', 'speed-ramp', 'dolly-zoom']);
// Per film: how many times a loud device may appear (grave / open).
const FX_CAP = {
  grave: { 'flash-frame': 4, shake: 2, 'zoom-blur': 2, 'speed-ramp': 2, 'dolly-zoom': 1, 'film-burn': 1 },
  open: { 'flash-frame': 6, shake: 3, 'zoom-blur': 3, 'speed-ramp': 3, 'dolly-zoom': 1, 'film-burn': 2 },
};
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
      if (grave && T_BANNED_GRAVE.has(t)) want = turn ? 'blackout' : 'cut';
      else if (quiet && !T_QUIET_OK.has(t)) want = turn ? 'blackout' : 'cut';
      else if (T_ACCENT.has(t)) {
        const ch = s.chapter ?? -1;
        const used = accentByChapter.get(ch) ?? 0;
        const room = grave ? 1 : 2;
        // An accent lands on a hit or a chapter turn, once (twice in an open story) per chapter, never twice in a row of the same kind.
        if (!(impact || turn) || used >= room || lastAccent === t) want = turn && grave ? 'blackout' : 'cut';
        else {
          accentByChapter.set(ch, used + 1);
          lastAccent = t;
        }
      } else if (T_RARE[t] != null) {
        rare[t] = (rare[t] ?? 0) + 1;
        if (rare[t] > T_RARE[t]) want = turn ? 'blackout' : 'cut';
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
  if (grave) {
    if (Array.isArray(script.transitionPalette)) script.transitionPalette = script.transitionPalette.filter((k) => !T_BANNED_GRAVE.has(k));
    if (Array.isArray(script.fxPalette)) script.fxPalette = script.fxPalette.filter((k) => !FX_BANNED_GRAVE.has(k) && !FX_LOUD.has(k));
    if (Number.isFinite(script.fxDensity)) script.fxDensity = Math.min(script.fxDensity, 0.25);
  }
  script.editGrammar = { version: GRAMMAR_VERSION, gravity };
  if (log.transitions || log.fx || log.camera || log.text) log.notes.push(`kurgu dili (${gravity}): ${log.transitions} geçiş, ${log.fx} efekt, ${log.camera} kamera, ${log.text ?? 0} yankı yazısı düzeltildi`);
  return log;
}
