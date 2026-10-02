import type { Backdrop, FontKey, Genre, GenreId, Grade, TextStyle } from '../types';

/*
 * LOOK VARIANTS — each genre's visual identities. A genre used to be ONE look
 * (crime = police-tape yellow on steel blue, every video, every chapter). A
 * variant re-dresses it: ground, ink, accents, duotone, faces, texture,
 * collage/letterbox, a default photo grade, a default ground for text scenes
 * and a palette of text styles (the first is its signature; the others rotate
 * in by chapter so a long video keeps changing its typography).
 *
 * Every genre has at least one LIGHT variant (dark ink on paper) and one full
 * COLOUR variant (natural or graded colour footage instead of a duotone).
 * The first variant of each genre is its original look, unchanged.
 *
 * Chosen per video with script.look = { variant: '<id>' }. Unknown or absent
 * = the genre's original look, so old scripts render exactly as before.
 * Pure data: no React, no fonts (scripts/dump-looks.mjs bundles it).
 */

/** The Genre fields a variant may re-dress (sound, transitions and ids stay the genre's). */
export type VariantOverrides = Partial<
  Pick<
    Genre,
    | 'look'
    | 'titleInk'
    | 'bg'
    | 'ink'
    | 'accent'
    | 'accent2'
    | 'duoShadow'
    | 'duoHighlight'
    | 'headline'
    | 'body'
    | 'grain'
    | 'vignette'
    | 'flicker'
    | 'dust'
    | 'letterbox'
    | 'leak'
    | 'pattern'
    | 'collage'
    | 'paper'
    | 'labelBg'
    | 'labelInk'
  >
>;

export interface LookVariant {
  id: string;
  genre: GenreId;
  name: string;
  description: string;
  /** Light theme: dark ink on a light ground. */
  light?: boolean;
  /** Photos in colour (a non-duotone default grade). */
  colour?: boolean;
  set: VariantOverrides;
  grade: Grade;
  backdrop?: Backdrop;
  textStyles: TextStyle[];
  /** What kind of story it suits (for the art director). */
  suits: string;
}

const V = (v: LookVariant) => v;

export const VARIANTS: LookVariant[] = [
  /* ============================================================ DOCUMENTARY */
  V({
    id: 'magnates-label', genre: 'documentary', name: 'Magnates label',
    description: 'The original: warm brown ground, yellow printed labels with a red drop, sepia duotone cards on a dotted board.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'business rise-and-fall stories, corporate scandals; the classic YouTube explainer',
  }),
  V({
    id: 'swiss-editorial', genre: 'documentary', name: 'Swiss editorial', light: true,
    description: 'Off-white paper, black grotesk type, one hard signal red; black-and-white photos as clean prints. Magazine-grade restraint.',
    set: {
      look: 'label', bg: '#f1eee6', ink: '#111111', accent: '#e3311d', accent2: '#111111', titleInk: '#111111',
      duoShadow: '#141414', duoHighlight: '#f1eee6', headline: 'archivo', body: 'inter',
      grain: 0.07, vignette: 0.12, dust: false, leak: 0, pattern: 'none', collage: true, paper: '#ffffff',
      labelBg: '#e3311d', labelInk: '#ffffff', letterbox: false,
    },
    grade: 'mono', backdrop: { kind: 'solid', color: '#f1eee6' }, textStyles: ['underline', 'stack', 'lower-third'],
    suits: 'design, brands, architecture, tech companies; calm authoritative explainers',
  }),
  V({
    id: 'cobalt-brief', genre: 'documentary', name: 'Cobalt brief',
    description: 'Deep cobalt blue with tomato-red and ice accents, cobalt-to-ice duotone, modern grotesk. Crisp and confident.',
    set: {
      look: 'label', bg: '#0b1b4d', ink: '#f2f5ff', accent: '#ff5a36', accent2: '#8fd3ff', titleInk: '#f2f5ff',
      duoShadow: '#07123a', duoHighlight: '#dfeaff', headline: 'spacegrotesk', body: 'inter',
      grain: 0.12, vignette: 0.45, dust: false, leak: 0.06, pattern: 'grid', collage: true, paper: '#f2f5ff',
      labelBg: '#ff5a36', labelInk: '#ffffff',
    },
    grade: 'duotone', backdrop: { kind: 'gradient', color: '#1d3a8f', color2: '#08133a' }, textStyles: ['marker', 'outline', 'lower-third'],
    suits: 'tech, startups, economics, modern institutions',
  }),
  V({
    id: 'magazine-colour', genre: 'documentary', name: 'Magazine colour', colour: true,
    description: 'Full-colour photos, near-black ground, hot magenta and mint accents, huge condensed type. Energetic pop-culture feature.',
    set: {
      look: 'label', bg: '#121212', ink: '#ffffff', accent: '#ff3d7f', accent2: '#00c2a8', titleInk: '#ffffff',
      duoShadow: '#120a10', duoHighlight: '#ffe3ee', headline: 'anton', body: 'inter',
      grain: 0.1, vignette: 0.4, dust: false, leak: 0.1, pattern: 'none', collage: false, paper: '#ffffff',
      labelBg: '#ff3d7f', labelInk: '#ffffff',
    },
    grade: 'color', backdrop: { kind: 'gradient', color: '#5b1340', color2: '#121212' }, textStyles: ['stack', 'marker', 'outline'],
    suits: 'pop culture, celebrities, fast food, viral internet stories',
  }),
  V({
    id: 'kraft-archive', genre: 'documentary', name: 'Kraft archive', light: true,
    description: 'Brown kraft-paper ground, typewriter captions, red stamps, sepia prints. A box of old files opened on camera.',
    set: {
      look: 'label', bg: '#cdb08a', ink: '#1d140c', accent: '#b3151a', accent2: '#1d140c', titleInk: '#1d140c',
      duoShadow: '#2a1a0e', duoHighlight: '#f3e6cc', headline: 'playfair', body: 'lora',
      grain: 0.2, vignette: 0.35, dust: true, leak: 0, pattern: 'none', collage: true, paper: '#f4ead6',
      labelBg: '#1d140c', labelInk: '#f4ead6', letterbox: false,
    },
    grade: 'sepia', backdrop: { kind: 'paper', color: '#cdb08a' }, textStyles: ['typewriter', 'stamp', 'serif'],
    suits: 'history of a company or family, archival investigations, 20th-century stories',
  }),
  V({
    id: 'cinema-teal', genre: 'documentary', name: 'Cinema teal-orange', colour: true,
    description: 'Blockbuster teal-and-orange colour grade, letterboxed, broadcast lower thirds. Feels like a feature film.',
    set: {
      look: 'glow', bg: '#0c1416', ink: '#f4f1ea', accent: '#ff9b42', accent2: '#2ec4b6', titleInk: '#f4f1ea',
      duoShadow: '#061012', duoHighlight: '#ffe2c4', headline: 'bebas', body: 'inter',
      grain: 0.14, vignette: 0.6, dust: false, leak: 0.1, pattern: 'none', collage: false, letterbox: true,
      labelBg: '#ff9b42', labelInk: '#0c1416',
    },
    grade: 'teal-orange', backdrop: { kind: 'blur' }, textStyles: ['lower-third', 'underline', 'outline'],
    suits: 'big dramatic stories: disasters, heists, expeditions',
  }),

  /* ================================================================ FINANCE */
  V({
    id: 'terminal-green', genre: 'finance', name: 'Terminal green',
    description: 'The original: black-green trading terminal, mono data type, green/red, glitch cuts.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'market crashes, trading, crypto, hedge funds',
  }),
  V({
    id: 'wall-street-gold', genre: 'finance', name: 'Wall Street gold', colour: true,
    description: 'Black and gold, high-contrast serif headlines, warm-graded photos. Old money, private banks, luxury.',
    set: {
      look: 'label', bg: '#0d0b08', ink: '#f4ecd8', accent: '#d4af37', accent2: '#b22222', titleInk: '#e9cf7a',
      duoShadow: '#0d0904', duoHighlight: '#f1dfae', headline: 'dmserif', body: 'inter',
      grain: 0.12, vignette: 0.6, leak: 0.12, pattern: 'none', collage: true, paper: '#f6efdc',
      labelBg: '#d4af37', labelInk: '#0d0b08',
    },
    grade: 'warm', backdrop: { kind: 'gradient', color: '#2a2110', color2: '#050403' }, textStyles: ['serif', 'underline', 'lower-third'],
    suits: 'billionaires, dynasties, luxury brands, banking history',
  }),
  V({
    id: 'bloomberg-orange', genre: 'finance', name: 'Amber terminal',
    description: 'Pure black with amber data type and blue ticks, black-and-white photos, heavy grotesk. A professional terminal, not a hacker screen.',
    set: {
      look: 'terminal', bg: '#000000', ink: '#ffffff', accent: '#ff9500', accent2: '#3fa9f5', titleInk: '#ffffff',
      duoShadow: '#000000', duoHighlight: '#ffe0b0', headline: 'archivo', body: 'jetbrains',
      grain: 0.06, vignette: 0.35, leak: 0, pattern: 'grid', collage: false,
      labelBg: '#ff9500', labelInk: '#000000',
    },
    grade: 'mono', backdrop: { kind: 'solid', color: '#050505' }, textStyles: ['lower-third', 'glitch', 'stack'],
    suits: 'markets, data-heavy explainers, economic crises',
  }),
  V({
    id: 'clean-white-editorial', genre: 'finance', name: 'Clean white editorial', light: true, colour: true,
    description: 'White page, navy ink, one electric blue and one red, faint chart grid; natural-colour photos. The Economist / FT chart desk.',
    set: {
      look: 'label', bg: '#f7f7f4', ink: '#0e1a2b', accent: '#1463ff', accent2: '#e5243b', titleInk: '#0e1a2b',
      duoShadow: '#0e1a2b', duoHighlight: '#f7f7f4', headline: 'spacegrotesk', body: 'inter',
      grain: 0.05, vignette: 0.1, leak: 0, pattern: 'grid', collage: true, paper: '#ffffff',
      labelBg: '#1463ff', labelInk: '#ffffff', letterbox: false,
    },
    grade: 'color', backdrop: { kind: 'solid', color: '#f7f7f4' }, textStyles: ['underline', 'stack', 'marker'],
    suits: 'economics explainers, company analysis, anything with many numbers',
  }),
  V({
    id: 'money-red', genre: 'finance', name: 'Money red',
    description: 'Deep crimson ground, red duotone, hot red and gold accents, stamps and glitches. Fraud, bankruptcy, panic.',
    set: {
      look: 'label', bg: '#1a0306', ink: '#fff1f0', accent: '#ff2a3d', accent2: '#ffd166', titleInk: '#fff1f0',
      duoShadow: '#14000a', duoHighlight: '#ffc2c7', headline: 'anton', body: 'inter',
      grain: 0.14, vignette: 0.6, leak: 0.06, pattern: 'dots', collage: true, paper: '#fff1f0',
      labelBg: '#ff2a3d', labelInk: '#ffffff',
    },
    grade: 'duotone', backdrop: { kind: 'halftone', color: '#2a0508', color2: '#ff2a3d' }, textStyles: ['stamp', 'glitch', 'outline'],
    suits: 'fraud, Ponzi schemes, bankruptcies, collapses',
  }),
  V({
    id: 'salmon-paper', genre: 'finance', name: 'Salmon paper', light: true,
    description: 'Financial-newspaper salmon paper, claret and teal, serif headlines, warm photos. Serious long-form money journalism.',
    set: {
      look: 'label', bg: '#fbe9da', ink: '#33302e', accent: '#0d7680', accent2: '#990f3d', titleInk: '#33302e',
      duoShadow: '#33302e', duoHighlight: '#fbe9da', headline: 'dmserif', body: 'inter',
      grain: 0.08, vignette: 0.15, leak: 0, pattern: 'none', collage: true, paper: '#fff6ee',
      labelBg: '#990f3d', labelInk: '#fff6ee', letterbox: false,
    },
    grade: 'warm', backdrop: { kind: 'paper', color: '#fbe9da' }, textStyles: ['serif', 'underline', 'lower-third'],
    suits: 'business history, CEO profiles, deal stories',
  }),

  /* ================================================================= HORROR */
  V({
    id: 'candle-red', genre: 'horror', name: 'Candle red',
    description: 'The original: near-black, bone ink, blood-red glow, carved Cinzel titles, flicker and dust.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'hauntings, occult history, classic dread',
  }),
  V({
    id: 'found-footage-vhs', genre: 'horror', name: 'Found footage VHS', colour: true,
    description: 'Tape-colour footage with lifted blacks and red smear, REC-red and phosphor-green on-screen type, glitches.',
    set: {
      look: 'terminal', bg: '#050807', ink: '#e8ffe8', accent: '#ff2e2e', accent2: '#9dff9d', titleInk: '#e8ffe8',
      duoShadow: '#020403', duoHighlight: '#cfe8cf', headline: 'jetbrains', body: 'jetbrains',
      grain: 0.34, vignette: 0.7, flicker: true, dust: false, letterbox: false, leak: 0, pattern: 'scan', collage: false,
      labelBg: '#ff2e2e', labelInk: '#050807',
    },
    grade: 'vhs', backdrop: { kind: 'blur' }, textStyles: ['glitch', 'typewriter', 'lower-third'],
    suits: 'disappearances, internet mysteries, 80s-90s cases, paranormal recordings',
  }),
  V({
    id: 'bone-white-ritual', genre: 'horror', name: 'Bone white ritual', light: true,
    description: 'Bone-white paper, dried-blood red, black-and-white photos, carved serif titles. Folk horror in daylight.',
    set: {
      look: 'label', bg: '#e6ddc8', ink: '#1a0f0c', accent: '#8a0f14', accent2: '#1a0f0c', titleInk: '#1a0f0c',
      duoShadow: '#140a08', duoHighlight: '#ece4d2', headline: 'cinzel', body: 'crimson',
      grain: 0.22, vignette: 0.4, flicker: false, dust: true, letterbox: false, leak: 0, pattern: 'none', collage: true, paper: '#f3eee2',
      labelBg: '#8a0f14', labelInk: '#f3eee2',
    },
    grade: 'mono', backdrop: { kind: 'paper', color: '#e6ddc8' }, textStyles: ['serif', 'stamp', 'cutout'],
    suits: 'folk horror, cults, rural legends, witch trials',
  }),
  V({
    id: 'cyanotype-cold', genre: 'horror', name: 'Cyanotype cold',
    description: 'Prussian-blue prints, icy ink and one alarm red. Cold, clinical, hypothermic.',
    set: {
      look: 'glow', bg: '#031018', ink: '#d8f1ff', accent: '#7fe0ff', accent2: '#ff3b3b', titleInk: '#d8f1ff',
      duoShadow: '#021019', duoHighlight: '#bfe9ff', headline: 'bebas', body: 'crimson',
      grain: 0.3, vignette: 0.85, flicker: true, dust: true, letterbox: true, leak: 0, pattern: 'scan', collage: false,
      labelBg: '#7fe0ff', labelInk: '#031018',
    },
    grade: 'cyanotype', backdrop: { kind: 'gradient', color: '#0a2a3d', color2: '#01070b' }, textStyles: ['outline', 'neon', 'serif'],
    suits: 'mountain / polar / sea deaths, Dyatlov-type mysteries, hospitals',
  }),
  V({
    id: 'occult-neon', genre: 'horror', name: 'Occult neon',
    description: 'Violet-black with magenta and cyan neon, purple duotone. Modern urban horror.',
    set: {
      look: 'glow', bg: '#0a0412', ink: '#f4e9ff', accent: '#ff2fd0', accent2: '#3cf0ff', titleInk: '#f4e9ff',
      duoShadow: '#07010d', duoHighlight: '#f0b8ff', headline: 'exo', body: 'inter',
      grain: 0.26, vignette: 0.8, flicker: true, dust: false, letterbox: true, leak: 0.05, pattern: 'scan', collage: false,
      labelBg: '#ff2fd0', labelInk: '#0a0412',
    },
    grade: 'duotone', backdrop: { kind: 'gradient', color: '#2a0838', color2: '#05020a' }, textStyles: ['neon', 'glitch', 'outline'],
    suits: 'urban legends, internet horror, cults in cities',
  }),
  V({
    id: 'daguerreotype', genre: 'horror', name: 'Daguerreotype',
    description: 'Sepia plates, candle gold and dried red, Victorian serif type, dust and flicker. 19th-century dread.',
    set: {
      look: 'glow', bg: '#140d07', ink: '#efe0c4', accent: '#c9a15a', accent2: '#7a1c12', titleInk: '#e8c98c',
      duoShadow: '#0f0904', duoHighlight: '#e9d6ad', headline: 'playfair', body: 'lora',
      grain: 0.34, vignette: 0.85, flicker: true, dust: true, letterbox: true, leak: 0.04, pattern: 'none', collage: false,
      labelBg: '#c9a15a', labelInk: '#140d07',
    },
    grade: 'sepia', backdrop: { kind: 'texture', color: '#2a1b0e' }, textStyles: ['serif', 'typewriter', 'cutout'],
    suits: 'Victorian mysteries, asylums, spiritualism, old photographs',
  }),

  /* ================================================================== CRIME */
  V({
    id: 'evidence-yellow', genre: 'crime', name: 'Evidence yellow',
    description: 'The original: cold steel ground, police-tape yellow labels, steel duotone evidence prints, letterbox.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'classic true crime, FBI cases, heists',
  }),
  V({
    id: 'cold-blue-case', genre: 'crime', name: 'Cold blue case',
    description: 'Midnight blue, ice-blue labels and alarm red, cool-graded colour photos, broadcast supers. Procedural.',
    set: {
      look: 'label', bg: '#07111c', ink: '#e6f0f7', accent: '#4fc3f7', accent2: '#ff4d4d', titleInk: '#e6f0f7',
      duoShadow: '#03080f', duoHighlight: '#9fd3f5', headline: 'oswald', body: 'spacegrotesk',
      grain: 0.2, vignette: 0.7, letterbox: true, leak: 0, pattern: 'grid', collage: true, paper: '#e8eef2',
      labelBg: '#4fc3f7', labelInk: '#031018',
    },
    grade: 'cool', backdrop: { kind: 'gradient', color: '#0f2a44', color2: '#040a12' }, textStyles: ['lower-third', 'underline', 'glitch'],
    suits: 'police procedurals, cold cases, forensic science',
  }),
  V({
    id: 'red-thread', genre: 'crime', name: 'Red thread',
    description: 'Oxblood darkness, red-string red, bone-duotone prints, highlighter and ransom letters. The obsessive investigator.',
    set: {
      look: 'label', bg: '#120606', ink: '#f5e9e4', accent: '#e0201b', accent2: '#f5e9e4', titleInk: '#f5e9e4',
      duoShadow: '#0b0303', duoHighlight: '#e8c9bd', headline: 'bebas', body: 'courier',
      grain: 0.28, vignette: 0.75, letterbox: true, leak: 0, pattern: 'none', collage: true, paper: '#efe4da',
      labelBg: '#e0201b', labelInk: '#ffffff',
    },
    grade: 'duotone', backdrop: { kind: 'texture', color: '#2a0c0a' }, textStyles: ['marker', 'cutout', 'stamp'],
    suits: 'serial cases, obsessive investigations, conspiracies',
  }),
  V({
    id: 'newsprint-paper', genre: 'crime', name: 'Newsprint paper', light: true,
    description: 'Off-white newsprint, black ink, tabloid red; black-and-white halftone-feel prints, ransom cut-outs and stamps.',
    set: {
      look: 'label', bg: '#efeae0', ink: '#111111', accent: '#c8102e', accent2: '#111111', titleInk: '#111111',
      duoShadow: '#161616', duoHighlight: '#efeae0', headline: 'archivo', body: 'courier',
      grain: 0.14, vignette: 0.2, dust: false, letterbox: false, leak: 0, pattern: 'none', collage: true, paper: '#fbf8f1',
      labelBg: '#c8102e', labelInk: '#ffffff',
    },
    grade: 'mono', backdrop: { kind: 'paper', color: '#efeae0' }, textStyles: ['cutout', 'stamp', 'typewriter'],
    suits: 'tabloid-era cases (1920s-1980s), kidnappings, famous trials',
  }),
  V({
    id: 'color-noir', genre: 'crime', name: 'Colour noir', colour: true,
    description: 'Natural colour with a teal-orange grade, amber and red accents, letterbox, lower-third supers. A crime film.',
    set: {
      look: 'glow', bg: '#0b1012', ink: '#f3efe6', accent: '#ffb000', accent2: '#d7263d', titleInk: '#f3efe6',
      duoShadow: '#06090b', duoHighlight: '#f5deb8', headline: 'bebas', body: 'inter',
      grain: 0.2, vignette: 0.7, letterbox: true, leak: 0.04, pattern: 'none', collage: false,
      labelBg: '#ffb000', labelInk: '#0b1012',
    },
    grade: 'teal-orange', backdrop: { kind: 'blur' }, textStyles: ['lower-third', 'outline', 'underline'],
    suits: 'modern cases, cartels, con artists, Netflix-style true crime',
  }),
  V({
    id: 'vhs-tape', genre: 'crime', name: 'VHS evidence tape', colour: true,
    description: 'Tape colour, cyan and magenta OSD type, glitch hits, typed captions. Surveillance footage and 90s news.',
    set: {
      look: 'terminal', bg: '#0a0a0f', ink: '#ffffff', accent: '#00e5ff', accent2: '#ff2bd6', titleInk: '#ffffff',
      duoShadow: '#050508', duoHighlight: '#d8f7ff', headline: 'jetbrains', body: 'jetbrains',
      grain: 0.3, vignette: 0.6, letterbox: false, leak: 0, pattern: 'scan', collage: false,
      labelBg: '#00e5ff', labelInk: '#0a0a0f',
    },
    grade: 'vhs', backdrop: { kind: 'solid', color: '#0b0b12' }, textStyles: ['glitch', 'typewriter', 'lower-third'],
    suits: '80s-90s cases, surveillance, hackers, missing persons',
  }),

  /* =================================================================== EPIC */
  V({
    id: 'bronze-gold', genre: 'epic', name: 'Bronze and gold',
    description: 'The original: bronze darkness, gold carved titles that glow, war-drum reveals, letterbox, light leaks.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'empires, sieges, ancient and medieval war',
  }),
  V({
    id: 'marble-ivory', genre: 'epic', name: 'Marble ivory', light: true,
    description: 'Ivory marble ground, dark bronze ink, imperial red, warm prints; classical serif and quiet italics.',
    set: {
      look: 'label', bg: '#ebe5d8', ink: '#231b12', accent: '#8f6b1f', accent2: '#7d1c1c', titleInk: '#231b12',
      duoShadow: '#231b12', duoHighlight: '#efe8da', headline: 'cinzel', body: 'lora',
      grain: 0.1, vignette: 0.22, dust: false, letterbox: false, leak: 0, pattern: 'none', collage: true, paper: '#f7f2e8',
      labelBg: '#7d1c1c', labelInk: '#f7f2e8',
    },
    grade: 'warm', backdrop: { kind: 'texture', color: '#e6dfd0' }, textStyles: ['serif', 'underline', 'stack'],
    suits: 'Rome, Greece, Renaissance, philosophers and emperors',
  }),
  V({
    id: 'blood-and-iron', genre: 'epic', name: 'Blood and iron',
    description: 'Bleach-bypass photos, iron-black ground, blood red and brass, condensed stencil-like type, stamps. Modern war.',
    set: {
      look: 'label', bg: '#0e0c0b', ink: '#f0e6dc', accent: '#c1121f', accent2: '#d9a441', titleInk: '#f0e6dc',
      duoShadow: '#0a0808', duoHighlight: '#e4d9cc', headline: 'oswald', body: 'inter',
      grain: 0.3, vignette: 0.75, dust: true, letterbox: true, leak: 0.04, pattern: 'none', collage: false,
      labelBg: '#c1121f', labelInk: '#ffffff',
    },
    grade: 'bleach', backdrop: { kind: 'texture', color: '#1c1917' }, textStyles: ['stamp', 'outline', 'stack'],
    suits: 'World Wars, modern battles, military operations',
  }),
  V({
    id: 'imperial-purple', genre: 'epic', name: 'Imperial purple',
    description: 'Tyrian purple and gold, violet duotone, high-contrast serif. Dynasties, crowns, courts.',
    set: {
      look: 'glow', bg: '#140b20', ink: '#f3ecff', accent: '#e3b341', accent2: '#b07cff', titleInk: '#f1d58a',
      duoShadow: '#0c0514', duoHighlight: '#e6d3ff', headline: 'dmserif', body: 'lora',
      grain: 0.18, vignette: 0.7, dust: true, letterbox: true, leak: 0.14, pattern: 'none', collage: false,
      labelBg: '#e3b341', labelInk: '#140b20',
    },
    grade: 'duotone', backdrop: { kind: 'gradient', color: '#3a1c5c', color2: '#0b0512' }, textStyles: ['serif', 'lower-third', 'underline'],
    suits: 'royal dynasties, Byzantium, Ottomans, palace intrigue',
  }),
  V({
    id: 'kodachrome-epic', genre: 'epic', name: 'Kodachrome epic', colour: true,
    description: 'Saturated slide-film colour, orange and blue accents, big condensed type, letterbox. Epic in colour.',
    set: {
      look: 'label', bg: '#10141a', ink: '#fff8ec', accent: '#ff7a1a', accent2: '#1f6feb', titleInk: '#fff8ec',
      duoShadow: '#0a0d12', duoHighlight: '#ffe7c7', headline: 'anton', body: 'inter',
      grain: 0.16, vignette: 0.55, dust: false, letterbox: true, leak: 0.1, pattern: 'none', collage: false,
      labelBg: '#ff7a1a', labelInk: '#10141a',
    },
    grade: 'kodachrome', backdrop: { kind: 'blur' }, textStyles: ['stack', 'outline', 'lower-third'],
    suits: 'expeditions, explorers, 20th-century epics, space race',
  }),
  V({
    id: 'war-map-sepia', genre: 'epic', name: 'War-room sepia',
    description: 'Sepia prints on dark leather, brass and oxide red, typed dispatches and stamps. The general\'s map table.',
    set: {
      look: 'label', bg: '#1c140c', ink: '#f2e3c6', accent: '#e2b05c', accent2: '#8b2f1c', titleInk: '#f2e3c6',
      duoShadow: '#140d06', duoHighlight: '#efdcb4', headline: 'playfair', body: 'courier',
      grain: 0.28, vignette: 0.7, dust: true, letterbox: true, leak: 0.08, pattern: 'none', collage: true, paper: '#efe2c6',
      labelBg: '#e2b05c', labelInk: '#1c140c',
    },
    grade: 'sepia', backdrop: { kind: 'texture', color: '#2c1f12' }, textStyles: ['typewriter', 'stamp', 'serif'],
    suits: 'campaign histories, generals, colonial wars, telegrams and maps',
  }),

  /* ================================================================ SCIENCE */
  V({
    id: 'deep-space-cyan', genre: 'science', name: 'Deep space cyan',
    description: 'The original: deep navy, cyan glow, measurement grid, airy Exo titles.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'space, physics, cosmic scale',
  }),
  V({
    id: 'blueprint-lab', genre: 'science', name: 'Blueprint',
    description: 'Blueprint blue with white grid lines and signal yellow, cyanotype prints, technical grotesk and mono.',
    set: {
      look: 'glow', bg: '#0d3b73', ink: '#eaf4ff', accent: '#ffffff', accent2: '#ffcf3f', titleInk: '#ffffff',
      duoShadow: '#06244a', duoHighlight: '#d6ebff', headline: 'spacegrotesk', body: 'jetbrains',
      grain: 0.1, vignette: 0.4, leak: 0, pattern: 'grid', collage: false,
      labelBg: '#ffcf3f', labelInk: '#0d3b73',
    },
    grade: 'cyanotype', backdrop: { kind: 'blueprint', color: '#0d3b73' }, textStyles: ['outline', 'underline', 'lower-third'],
    suits: 'engineering, inventions, machines, how-it-works',
  }),
  V({
    id: 'clean-lab-white', genre: 'science', name: 'Clean lab white', light: true, colour: true,
    description: 'Lab-white ground, graphite ink, electric blue and coral, natural colour photos. Clear and friendly.',
    set: {
      look: 'label', bg: '#f4f6f8', ink: '#0b1320', accent: '#0066ff', accent2: '#ff5c39', titleInk: '#0b1320',
      duoShadow: '#0b1320', duoHighlight: '#f4f6f8', headline: 'spacegrotesk', body: 'inter',
      grain: 0.04, vignette: 0.1, leak: 0, pattern: 'grid', collage: true, paper: '#ffffff',
      labelBg: '#0066ff', labelInk: '#ffffff', letterbox: false,
    },
    grade: 'color', backdrop: { kind: 'solid', color: '#f4f6f8' }, textStyles: ['underline', 'stack', 'marker'],
    suits: 'biology, medicine, climate, everyday science',
  }),
  V({
    id: 'aurora', genre: 'science', name: 'Aurora', colour: true,
    description: 'Violet-to-teal gradients, aurora green and pink neon, full-colour photos. Wonder and beauty.',
    set: {
      look: 'glow', bg: '#0a0620', ink: '#f5f3ff', accent: '#7cffcb', accent2: '#ff6ad5', titleInk: '#f5f3ff',
      duoShadow: '#07041a', duoHighlight: '#d8fff0', headline: 'exo', body: 'inter',
      grain: 0.1, vignette: 0.55, leak: 0.1, pattern: 'none', collage: false,
      labelBg: '#7cffcb', labelInk: '#0a0620',
    },
    grade: 'color', backdrop: { kind: 'gradient', color: '#2a1070', color2: '#053b4a' }, textStyles: ['neon', 'stack', 'outline'],
    suits: 'northern lights, deep sea, nature wonders, astronomy for everyone',
  }),
  V({
    id: 'mars-orange', genre: 'science', name: 'Mars orange',
    description: 'Rust-dark ground, Mars orange and ice-blue, warm duotone, heavy grotesk. Planetary, dusty, bold.',
    set: {
      look: 'label', bg: '#1a0a05', ink: '#fff0e6', accent: '#ff6b2c', accent2: '#3ad0ff', titleInk: '#fff0e6',
      duoShadow: '#120502', duoHighlight: '#ffc7a3', headline: 'archivo', body: 'spacegrotesk',
      grain: 0.16, vignette: 0.6, leak: 0.08, pattern: 'dots', collage: false,
      labelBg: '#ff6b2c', labelInk: '#1a0a05',
    },
    grade: 'duotone', backdrop: { kind: 'split-color', color: '#ff6b2c', color2: '#1a0a05' }, textStyles: ['stack', 'lower-third', 'underline'],
    suits: 'Mars, rockets, deserts, energy, volcanoes',
  }),
  V({
    id: 'retro-nasa', genre: 'science', name: 'Retro mission', colour: true,
    description: 'Kodachrome mission photos, worm red and navy, typed telemetry, halftone grounds. The 1960s space program.',
    set: {
      look: 'label', bg: '#111418', ink: '#f1efe6', accent: '#fc3d21', accent2: '#5b8def', titleInk: '#f1efe6',
      duoShadow: '#0a0c10', duoHighlight: '#efe6d2', headline: 'oswald', body: 'courier',
      grain: 0.2, vignette: 0.5, dust: true, leak: 0.06, pattern: 'none', collage: true, paper: '#f1ece0',
      labelBg: '#fc3d21', labelInk: '#ffffff',
    },
    grade: 'kodachrome', backdrop: { kind: 'halftone', color: '#0b3d91', color2: '#5b8def' }, textStyles: ['typewriter', 'stamp', 'lower-third'],
    suits: 'Apollo, Cold War science, historic missions',
  }),

  /* ================================================================ INSPIRE */
  V({
    id: 'golden-hour', genre: 'inspire', name: 'Golden hour',
    description: 'The original: warm dark ground, golden light leaks, keepsake photo cards, Playfair titles.',
    set: {}, grade: 'duotone', textStyles: ['box'],
    suits: 'biographies, comebacks, founders',
  }),
  V({
    id: 'sunlit-paper', genre: 'inspire', name: 'Sunlit paper', light: true,
    description: 'Cream paper, warm ink, tangerine and deep teal, warm-graded photos, editorial serif and highlighter.',
    set: {
      look: 'label', bg: '#fbf6ec', ink: '#2b1d12', accent: '#e8702a', accent2: '#2b6f6b', titleInk: '#2b1d12',
      duoShadow: '#2b1d12', duoHighlight: '#fbf6ec', headline: 'dmserif', body: 'lora',
      grain: 0.08, vignette: 0.15, leak: 0, pattern: 'none', collage: true, paper: '#ffffff',
      labelBg: '#e8702a', labelInk: '#ffffff', letterbox: false,
    },
    grade: 'warm', backdrop: { kind: 'paper', color: '#fbf6ec' }, textStyles: ['serif', 'marker', 'underline'],
    suits: 'gentle life stories, artists, teachers, family histories',
  }),
  V({
    id: 'polaroid-colour', genre: 'inspire', name: 'Polaroid colour', colour: true,
    description: 'Saturated slide-film photos on white polaroid cards, sunflower and coral, scrapbook cut-outs. Joyful.',
    set: {
      look: 'label', bg: '#16110e', ink: '#ffffff', accent: '#ffcf33', accent2: '#ff5d73', titleInk: '#ffffff',
      duoShadow: '#120d0a', duoHighlight: '#fff0d6', headline: 'spacegrotesk', body: 'inter',
      grain: 0.12, vignette: 0.4, leak: 0.2, pattern: 'none', collage: true, paper: '#ffffff',
      labelBg: '#ffcf33', labelInk: '#16110e',
    },
    grade: 'kodachrome', backdrop: { kind: 'gradient', color: '#4a2412', color2: '#16110e' }, textStyles: ['marker', 'stack', 'cutout'],
    suits: 'athletes, musicians, youth, summer stories',
  }),
  V({
    id: 'blue-hour', genre: 'inspire', name: 'Blue hour',
    description: 'Dusk-blue ground, pale blue ink and apricot, cool-graded photos, elegant italic serif. Reflective.',
    set: {
      look: 'glow', bg: '#0b1424', ink: '#eef4ff', accent: '#ffb86b', accent2: '#9ec5ff', titleInk: '#eef4ff',
      duoShadow: '#070d18', duoHighlight: '#dbe8ff', headline: 'playfair', body: 'inter',
      grain: 0.12, vignette: 0.55, leak: 0.12, pattern: 'none', collage: false,
      labelBg: '#ffb86b', labelInk: '#0b1424',
    },
    grade: 'cool', backdrop: { kind: 'gradient', color: '#1b3358', color2: '#060b14' }, textStyles: ['serif', 'lower-third', 'outline'],
    suits: 'grief and recovery, writers, quiet genius, late-life success',
  }),
  V({
    id: 'monochrome-portrait', genre: 'inspire', name: 'Monochrome portrait',
    description: 'Black and white only, one red accent, high-contrast serif. Gallery portraits, timeless.',
    set: {
      look: 'label', bg: '#0e0e0e', ink: '#f5f5f5', accent: '#ffffff', accent2: '#e63946', titleInk: '#f5f5f5',
      duoShadow: '#0a0a0a', duoHighlight: '#f0f0f0', headline: 'dmserif', body: 'inter',
      grain: 0.16, vignette: 0.55, leak: 0, pattern: 'none', collage: false,
      labelBg: '#f5f5f5', labelInk: '#0e0e0e',
    },
    grade: 'mono', backdrop: { kind: 'solid', color: '#101010' }, textStyles: ['serif', 'underline', 'stack'],
    suits: 'legends, icons, photographers, classic Hollywood',
  }),
  V({
    id: 'scrapbook-kraft', genre: 'inspire', name: 'Scrapbook kraft', light: true,
    description: 'Kraft paper, cut-out letters, marker highlights, typed notes, sepia prints. A handmade memory book.',
    set: {
      look: 'label', bg: '#d9c4a0', ink: '#2a1c10', accent: '#d64933', accent2: '#2e5e4e', titleInk: '#2a1c10',
      duoShadow: '#2a1c10', duoHighlight: '#f6ecd8', headline: 'archivo', body: 'courier',
      grain: 0.18, vignette: 0.3, dust: false, leak: 0, pattern: 'none', collage: true, paper: '#fbf5e8',
      labelBg: '#d64933', labelInk: '#ffffff', letterbox: false,
    },
    grade: 'sepia', backdrop: { kind: 'paper', color: '#d9c4a0' }, textStyles: ['cutout', 'marker', 'typewriter'],
    suits: 'childhood stories, underdogs, self-made makers',
  }),
];

const BY_ID = new Map(VARIANTS.map((v) => [v.id, v]));

/** The variant for a script (only one of the script's own genre counts), or undefined = original look. */
export function variantFor(genre: GenreId | string | undefined, id: string | undefined): LookVariant | undefined {
  if (!id) return undefined;
  const v = BY_ID.get(String(id));
  return v && v.genre === genre ? v : undefined;
}

/** A genre re-dressed by its variant (the variant's defaults ride along on the Genre). */
export function applyVariant(g: Genre, v: LookVariant | undefined): Genre {
  if (!v) return g;
  return {
    ...g,
    ...v.set,
    variant: v.id,
    light: !!v.light,
    grade: v.grade,
    backdrop: v.backdrop,
    textStyles: v.textStyles,
  };
}

/** Faces a text style sets itself (the rest use the look's headline/body). */
export const STYLE_FONTS: Partial<Record<TextStyle, FontKey[]>> = {
  serif: ['dmserif', 'playfair'],
  stamp: ['oswald'],
  neon: ['spacegrotesk'],
  glitch: ['jetbrains'],
  typewriter: ['courier'],
  cutout: ['anton', 'bebas', 'dmserif', 'courier', 'archivo', 'oswald', 'playfair'],
  'lower-third': [],
};

type ScriptLike = { genre?: string; look?: { variant?: string }; scenes?: { textStyle?: string }[] } | null | undefined;

/** Every text style a script may draw: its scenes' own plus the variant's palette. */
export function scriptTextStyles(script: ScriptLike): Set<TextStyle> {
  const out = new Set<TextStyle>();
  const v = variantFor(script?.genre, script?.look?.variant);
  for (const t of v?.textStyles ?? []) out.add(t);
  for (const s of script?.scenes ?? []) if (s?.textStyle) out.add(s.textStyle as TextStyle);
  return out;
}

/** Engine faces (FontKey) a script's look needs on top of its genre's: fonts.ts fetches only these. */
export function lookFontKeys(script: ScriptLike): FontKey[] {
  const out = new Set<FontKey>();
  const v = variantFor(script?.genre, script?.look?.variant);
  if (v?.set.headline) out.add(v.set.headline);
  if (v?.set.body) out.add(v.set.body);
  for (const t of scriptTextStyles(script)) for (const k of STYLE_FONTS[t] ?? []) out.add(k);
  return [...out];
}
