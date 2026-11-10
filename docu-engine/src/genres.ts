import type { Genre, GenreId } from './types';

/**
 * Genre presets.
 *
 * Built from frame-by-frame analysis of reference edits (MagnatesMedia "The
 * CRAZY Truth About McDonald's" / "The INSANE Truth About TikTok"):
 *  - the palette is the SUBJECT's palette on every frame; photos go through a
 *    two-colour duotone so nothing breaks the colour world
 *  - turning points are covered by light (3-frame flash, measured); cuts
 *    inside a run of the same chapter and mood are hard cuts, and each genre's
 *    `transition` is its signature, spent on chapter cards (Engine.tsx)
 *  - photos are printed cards on a textured board, not full-screen stills
 *  - something happens roughly every second
 *  - transitions land on the music, text lands on the voice
 *
 * The music/SFX prompts feed ElevenLabs; they are tuned per genre because a
 * finance video and a horror video should not share an impact sound.
 * `stinger` is the dread shock layered on dread slams (horror/crime only);
 * `thud` is the quiet body under an ordinary blackout — neither is a story hit.
 *
 * Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026 (luma 52-75, 21-39% of frames under luma 40):
 * `vignette` is at most ~0.4 here and the engine caps it at 0.35 (looks/resolve.ts VIGNETTE_MAX); `letterbox`
 * is only the genre's taste — the bars are drawn when the script asks (script.letterbox === true, Engine.tsx
 * resolveGenre), and photos fall back to colour, not the duotone (looks/resolve.ts sceneGrade).
 */
export const GENRES: Record<GenreId, Genre> = {
  documentary: {
    id: 'documentary',
    look: 'label',
    bg: '#2a1810',
    ink: '#f6efe1',
    accent: '#f2c230',
    accent2: '#d0241f',
    duoShadow: '#1a130e',
    duoHighlight: '#f1e7d0',
    headline: 'anton',
    body: 'inter',
    grain: 0.24,
    vignette: 0.35,
    flicker: false,
    dust: true,
    letterbox: false,
    leak: 0.12,
    transition: 'flash',
    pattern: 'dots',
    collage: true,
    paper: '#efe6d3',
    labelBg: '#f2c230',
    labelInk: '#b3151a',
    musicPrompt:
      'Modern investigative documentary score for a YouTube business story. Driving pulsing synth bass, ' +
      'tight modern percussion, cinematic strings building tension, clear strong downbeats every bar, ' +
      'occasional big hits and drops, confident and curious, no vocals.',
    sfxPrompts: {
      hit: 'Punchy cinematic documentary impact hit, deep sub boom with a sharp transient and short reverb tail',
      whoosh: 'Fast clean air whoosh transition swipe, modern and crisp',
      riser: 'Short tense cinematic riser building up for two seconds, ending abruptly',
      ticks: 'Fast mechanical counter ticking, rolling numbers, clicky',
      glitch: 'Short digital glitch stutter transition',
      swell: 'Soft warm cinematic swell, reverse cymbal into a reveal',
      snap: 'Short sharp analog camera shutter and film advance click, crisp',
      stinger: 'Tense cinematic string stab with a low boom, sudden and short',
      thud: 'Soft low muffled thud, like a heavy book closing on a wooden desk, short and quiet',
    },
  },
  finance: {
    id: 'finance',
    look: 'terminal',
    bg: '#06140e',
    ink: '#e9fff3',
    accent: '#19e07a',
    accent2: '#ff3b4a',
    duoShadow: '#021009',
    duoHighlight: '#b4f8d3',
    headline: 'oswald',
    body: 'plexMono',
    grain: 0.1,
    vignette: 0.32,
    flicker: false,
    dust: false,
    letterbox: false,
    leak: 0.05,
    transition: 'glitch',
    pattern: 'grid',
    collage: false,
    paper: '#e9fff3',
    labelBg: '#19e07a',
    labelInk: '#04140c',
    musicPrompt:
      'Dark tense financial thriller score, ticking hi-hats, deep synth bass pulses, suspenseful electronic ' +
      'textures, Wall Street crisis mood, steady strong beat, builds in intensity, no vocals.',
    sfxPrompts: {
      hit: 'Heavy electronic sub drop impact, dark and clean, modern trailer',
      whoosh: 'Digital data whoosh swipe transition, synthetic',
      riser: 'Electronic tension riser, pitch rising, two seconds',
      ticks: 'Fast stock ticker data beeps and clicks',
      glitch: 'Digital data glitch burst, corrupted signal, short',
      swell: 'Dark electronic swell into silence',
      snap: 'Short digital camera shutter snap, clean and sharp',
      stinger: 'Sharp dark synth stab with a sub drop, sudden, short',
      thud: 'Soft low electronic thump, muted and short',
    },
  },
  horror: {
    id: 'horror',
    look: 'glow',
    bg: '#0b0706',
    ink: '#ebe3d4',
    accent: '#c1121f',
    accent2: '#ebe3d4',
    duoShadow: '#000000',
    duoHighlight: '#bdb4a1',
    headline: 'cinzel',
    body: 'crimson',
    grain: 0.4,
    vignette: 0.4,
    flicker: true,
    dust: true,
    letterbox: true,
    leak: 0,
    transition: 'blackout',
    pattern: 'scan',
    collage: false,
    paper: '#d9d0bd',
    labelBg: '#1a0506',
    labelInk: '#ebe3d4',
    musicPrompt:
      'Slow unsettling horror documentary underscore, low drones, detuned piano notes, distant metallic ' +
      'scrapes, creeping dread, sparse heartbeat pulse, dynamic swells and sudden silences, no vocals.',
    sfxPrompts: {
      hit: 'Deep heavy horror braam impact, low and dark with a long reverb tail',
      whoosh: 'Dark ghostly whoosh, breathy and eerie',
      riser: 'Creepy horror riser with rising strings and whispers, two seconds, cuts off suddenly',
      ticks: 'Slow old clock ticking in an empty room',
      glitch: 'Distorted static burst, broken radio',
      swell: 'Ominous low drone swell',
      snap: 'Short eerie flash bulb pop with a faint distorted crackle',
      stinger: 'Sudden horror string stinger, dissonant violin screech with a low boom, short sharp shock',
      thud: 'Soft deep muffled thud, like a door closing far away in an empty house',
    },
  },
  /*
   * True crime: a case file on a cold desk. Steel-blue duotone, evidence
   * photos as paper cards, police-tape yellow labels, typewriter captions,
   * hard cuts into black. Suspense lives in the silences.
   */
  crime: {
    id: 'crime',
    look: 'label',
    bg: '#0b0f14',
    ink: '#e8ecef',
    accent: '#f2c318',
    accent2: '#c0392b',
    duoShadow: '#06090d',
    duoHighlight: '#c8d5de',
    headline: 'bebas',
    body: 'courier',
    grain: 0.3,
    vignette: 0.38,
    flicker: false,
    dust: false,
    letterbox: true,
    leak: 0,
    transition: 'blackout',
    pattern: 'scan',
    collage: true,
    paper: '#e6e1d4',
    labelBg: '#f2c318',
    labelInk: '#0b0f14',
    musicPrompt:
      'Dark true-crime documentary score, ticking pulse, sparse low piano notes, cold ambient synth pads, ' +
      'tense heartbeat rhythm, subtle glitchy textures, investigative and unsettling, no vocals.',
    sfxPrompts: {
      hit: 'Heavy dark true-crime impact, deep thud with a camera shutter snap and short cold reverb',
      whoosh: 'Cold fast whoosh like a case file sliding across a metal desk, crisp',
      riser: 'Tense dark riser with a quickening heartbeat and strings, two seconds, cuts off abruptly',
      ticks: 'Old typewriter keys clacking quickly, short',
      glitch: 'Short VHS tape glitch with static crackle',
      swell: 'Low ominous swell fading into silence',
      snap: 'Police evidence camera flash pop and shutter click',
      stinger: 'Sharp dissonant string stab with a cold low hit, sudden, true-crime reveal',
      thud: 'Soft dull thud, like a case file dropped on a metal desk, short',
    },
  },
  /*
   * Epic history / war: bronze and gold, Cinzel carved-stone titles that
   * glow like firelight, war drums under every reveal, letterboxed like a
   * film epic, dust and light leaks from torches.
   */
  epic: {
    id: 'epic',
    look: 'glow',
    titleInk: '#e8b64f',
    bg: '#1a1109',
    ink: '#f3e6c8',
    accent: '#d9a441',
    accent2: '#a31d1d',
    duoShadow: '#130b05',
    duoHighlight: '#ecd196',
    headline: 'cinzel',
    body: 'lora',
    grain: 0.26,
    vignette: 0.38,
    flicker: false,
    dust: true,
    letterbox: true,
    leak: 0.16,
    transition: 'zoom',
    pattern: 'none',
    collage: false,
    paper: '#e8d9b5',
    labelBg: '#d9a441',
    labelInk: '#1a1109',
    musicPrompt:
      'Epic historical war documentary score, thunderous taiko and war drums, deep brass, heroic choir swells, ' +
      'driving ostinato strings, battle momentum and tragedy, no lyrics.',
    sfxPrompts: {
      hit: 'Massive epic war drum and distant cannon boom impact with a long cinematic tail',
      whoosh: 'Heavy sword swing swoosh with rushing wind',
      riser: 'Epic orchestral riser with choir building for two seconds then cutting off',
      ticks: 'Marching soldiers boots stamping in rhythm, short',
      glitch: 'Clash of steel swords, a short bright metallic ring',
      swell: 'Heroic brass swell rising into a reveal',
      snap: 'Single sharp war drum hit with a wooden crack',
      stinger: 'Sudden brass and choir stab with a low drum hit, short and dramatic',
      thud: 'Soft distant war drum thud, low and muffled, short',
    },
  },
  /*
   * Science / space: deep navy and cyan, a faint measurement grid behind
   * everything, glowing Exo titles, airy synth score. Awe, not tension.
   */
  science: {
    id: 'science',
    look: 'glow',
    bg: '#030814',
    ink: '#e6f4ff',
    accent: '#38d9ff',
    accent2: '#ff7a3d',
    duoShadow: '#020611',
    duoHighlight: '#aee6ff',
    headline: 'exo',
    body: 'inter',
    grain: 0.12,
    vignette: 0.35,
    flicker: false,
    dust: false,
    letterbox: false,
    leak: 0.08,
    transition: 'leak',
    pattern: 'grid',
    collage: false,
    paper: '#e6f4ff',
    labelBg: '#38d9ff',
    labelInk: '#030814',
    musicPrompt:
      'Awe-inspiring space and science documentary score, slow evolving ambient synth pads, shimmering arpeggios, ' +
      'deep sub bass, sense of infinite scale and rising wonder, no vocals.',
    sfxPrompts: {
      hit: 'Deep cinematic sub boom with a shimmering sci-fi tail',
      whoosh: 'Smooth airy sci-fi whoosh, clean and wide',
      riser: 'Shimmering sci-fi riser with a rising synth, two seconds, cuts off',
      ticks: 'Soft digital data blips and computer beeps, short',
      glitch: 'Short radio signal static burst from deep space',
      swell: 'Vast airy synth swell opening up',
      snap: 'Soft digital shutter click with a sparkling chime',
      stinger: 'Sudden shimmering synth stab with a low sub hit, short',
      thud: 'Soft low sub thump with a faint airy tail, short',
    },
  },
  /*
   * Biography / inspiration: warm golden light, photographs as keepsake
   * cards, Playfair titles, piano growing into strings. The turning points
   * get the hits; the ending gets the swell.
   */
  inspire: {
    id: 'inspire',
    look: 'label',
    bg: '#1c1410',
    ink: '#fff6ea',
    accent: '#ffb347',
    accent2: '#e8553a',
    duoShadow: '#1a110b',
    duoHighlight: '#ffe6c2',
    headline: 'playfair',
    body: 'lora',
    grain: 0.16,
    vignette: 0.3,
    flicker: false,
    dust: false,
    letterbox: false,
    leak: 0.26,
    transition: 'leak',
    pattern: 'none',
    collage: true,
    paper: '#fbf3e4',
    labelBg: '#ffb347',
    labelInk: '#2a1a10',
    musicPrompt:
      'Uplifting inspirational biography documentary score, gentle solo piano building into soaring strings and ' +
      'warm cinematic percussion, hopeful, emotional crescendos, no vocals.',
    sfxPrompts: {
      hit: 'Warm cinematic impact with a soft low piano chord and blooming reverb',
      whoosh: 'Soft warm whoosh like a photo album page turning in the wind',
      riser: 'Hopeful orchestral riser swelling for two seconds',
      ticks: 'Old film camera winding clicks, short',
      glitch: 'Soft vinyl crackle and a gentle tape stop',
      swell: 'Emotional warm string swell',
      snap: 'Vintage camera shutter with a soft flash pop',
      stinger: 'Sudden emotional string stab with a soft low piano chord, short',
      thud: 'Soft warm low thud, like a closing piano lid, muted and short',
    },
  },
};
