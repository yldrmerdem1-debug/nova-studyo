// SHORTS LOOKS — every Short dressed for its own subject.
//
// User (Oct 2026): "shortslarda hep sarı ve vurucu şey geliyor, farklılık şart ... hepsi kendi içinde
// farklı edit, yazı tipi, vurgu, anlatılan konuya göre değişiklik göstermeli". Every Short used one
// look: Impact captions, a yellow keyword, yellow slam boxes, a white flash, one grade. A mystery, an
// empire and a market crash looked the same.
//
// A look sets the type (Windows fonts libass reads: no downloads), the caption case and keyword
// colour, how a slam lands (printed box, stamp, carved serif, glow, outline), the flash on the cuts,
// the picture grade and grain, and the camera's speed. pickLook chooses by the subject's genre and
// mood and steps away from the looks the last Shorts used.
//
// ASS colours are &HAABBGGRR (alpha, blue, green, red).

const bgr = (hex, a = "00") => {
  const h = hex.replace("#", "");
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

/** The least colour a look's grade keeps (eq saturation); hue=s=0 (mono) counts as 0. */
export const MIN_LOOK_SATURATION = 0.85;
/** The eq saturation a look's grade leaves the picture (1 when it does not set one, 0 for hue=s=0). */
export function lookSaturation(id) {
  const g = String(SHORT_LOOKS[id]?.grade || "");
  if (/hue=s=0(?![.\d])/.test(g)) return 0;
  const m = g.match(/saturation=([\d.]+)/);
  return m ? Number(m[1]) : 1;
}

export const SHORT_LOOKS = {
  // The channel's punch: Impact, yellow keyword, printed yellow boxes. For a fast, loud fact.
  punch: {
    name: "Punch", font: "Impact", capSize: 118, upper: true, bold: 0, ink: "#ffffff", key: "#ffd400", capStyle: "outline",
    slamFont: "Impact", slamSize: 150, slam: "box", slamInk: "#111111", slamBox: "#ffd400", slamAngle: -3,
    flash: "white", grade: "eq=contrast=1.06:saturation=0.98", grain: 6, vignette: "PI/5", push: 0.07, genres: ["documentary"],
  },
  // A case file: typewriter captions on dark tape, a red keyword, slams stamped and tilted. Cool, grainy — in colour.
  // Every look keeps the picture's colour (saturation >= 0.85, MIN_LOOK_SATURATION): Dossier was 0.55 and Noir
  // hue=s=0 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: the channel measured saturation 2.5-7.5).
  dossier: {
    name: "Dossier", font: "Courier New", capSize: 84, upper: false, bold: 1, ink: "#f2efe6", key: "#ff3b30", capStyle: "tape", tape: "#0c0c0c",
    slamFont: "Courier New", slamSize: 132, slam: "stamp", slamInk: "#ff3b30", slamAngle: -7,
    flash: "black", grade: "colorbalance=bs=0.06:bm=0.03:rs=-0.02,eq=contrast=1.10:saturation=0.9", grain: 12, vignette: "PI/4", push: 0.05, genres: ["crime"],
  },
  // An empire: carved classical serif, letter-spaced, gold. Warm, slow.
  empire: {
    name: "Empire", font: "Linux Libertine G", capSize: 96, upper: true, bold: 1, ink: "#f6efe0", key: "#e8b64f", capStyle: "shadow", spacing: 3,
    slamFont: "Linux Libertine G", slamSize: 170, slam: "carved", slamInk: "#e8b64f", slamAngle: 0, slamSpacing: 8,
    flash: "warm", grade: "colorbalance=rs=0.07:gs=0.02:bs=-0.06,eq=contrast=1.10:saturation=0.9", grain: 8, vignette: "PI/4", push: 0.05, genres: ["epic"],
  },
  // A ledger: condensed DIN numerals, amber, a near-black slab under the slam. Crisp, cool.
  // (Was neon green on a dark-green slab — the user, Oct 2026: "yeşil siyah çok dandik durmuş".)
  ledger: {
    name: "Ledger", font: "Bahnschrift", capSize: 112, upper: true, bold: 1, ink: "#ffffff", key: "#ffb020", capStyle: "outline",
    slamFont: "Bahnschrift", slamSize: 160, slam: "box", slamInk: "#ffb020", slamBox: "#0b0b0d", slamAngle: 0,
    flash: "white", grade: "colorbalance=bs=0.05:gs=0.03,eq=contrast=1.08:saturation=0.85", grain: 5, vignette: "PI/5", push: 0.06, genres: ["finance"],
  },
  // Noir: italic serif in sentence case, a blood-red keyword, slams glowing out of black. Contrasty colour, not mono
  // (was hue=s=0 and brightness -0.03 under a PI/3.4 vignette: black on a phone).
  noir: {
    name: "Noir", font: "Georgia", capSize: 96, upper: false, bold: 1, italic: 1, ink: "#f4f4f4", key: "#e01e2b", capStyle: "shadow",
    slamFont: "Georgia", slamSize: 160, slam: "glow", slamInk: "#ffffff", slamGlow: "#c1121f", slamAngle: 0, slamItalic: 1,
    flash: "black", grade: "colorbalance=rs=0.04:bs=0.03,eq=contrast=1.14:saturation=0.88", grain: 14, vignette: "PI/4", push: 0.045, genres: ["horror"],
  },
  // Clean: rounded modern sans, cyan, slams on white printed cards. Bright, quick.
  clean: {
    name: "Clean", font: "Rubik", capSize: 104, upper: false, bold: 1, ink: "#ffffff", key: "#38d9ff", capStyle: "outline",
    slamFont: "Rubik", slamSize: 150, slam: "box", slamInk: "#0b1220", slamBox: "#ffffff", slamAngle: -2,
    flash: "white", grade: "eq=contrast=1.06:saturation=1.08", grain: 4, vignette: "PI/6", push: 0.08, genres: ["science"],
  },
  // Editorial: a bookish serif, warm orange keyword, slams set large in italic. Warm, human.
  editorial: {
    name: "Editorial", font: "Cambria", capSize: 98, upper: false, bold: 1, ink: "#fffaf0", key: "#ff8a3d", capStyle: "shadow",
    slamFont: "Cambria", slamSize: 158, slam: "carved", slamInk: "#ffffff", slamAngle: 0, slamItalic: 1,
    flash: "warm", grade: "colorbalance=rs=0.06:gs=0.03:bs=-0.03,eq=contrast=1.04:saturation=0.95", grain: 6, vignette: "PI/5", push: 0.06, genres: ["inspire"],
  },
  // Tabloid: heavy black sans, white on a red slab, thick outline. Bizarre history, loud.
  tabloid: {
    name: "Tabloid", font: "Arial Black", capSize: 100, upper: true, bold: 0, ink: "#ffffff", key: "#ff2a1f", capStyle: "outline",
    slamFont: "Arial Black", slamSize: 140, slam: "box", slamInk: "#ffffff", slamBox: "#e3191b", slamAngle: -4,
    flash: "white", grade: "eq=contrast=1.12:saturation=1.15", grain: 6, vignette: "PI/5", push: 0.08, genres: ["documentary"],
  },
};

/** The opening shapes a Short may take (the planner writes it; the renderer sets it). */
export const OPENINGS = {
  // Oct 2026 channel data: cryptic fragments lost ~40% of Shorts viewers in 12 s — the triple now names the story plainly.
  triple: "one plain sentence that names who or what, where or when, and the stake ('In June 1812, Napoleon crossed a river with 600,000 men. Six months later, almost none came back.'), its key number slammed",
  question: "one sharp question the Short then answers ('Why did 400 men walk into a frozen river on purpose?'), set big on the first picture",
  number: "one shocking number said first ('Twenty-one thousand gallons.'), the number slammed huge, then what it means",
  quote: "a real, attributed quote from someone in the story, set in italics with who said it, then the story",
  statement: "one flat, unbelievable statement of fact ('In 1518, a whole town could not stop dancing.'), set big, then the proof",
};

/**
 * The look for a Short: its genre's own (or a near one), never the look of the last two Shorts.
 * `want` forces one (a valid id).
 */
export function pickLook({ genre = "documentary", recent = [], want = null, seed = 0 } = {}) {
  if (want && SHORT_LOOKS[want]) return want;
  const ids = Object.keys(SHORT_LOOKS);
  const avoid = new Set(recent.slice(-2));
  const fit = ids.filter((id) => SHORT_LOOKS[id].genres.includes(genre) && !avoid.has(id));
  const pool = fit.length ? fit : ids.filter((id) => !avoid.has(id));
  return pool[Math.abs(seed) % pool.length] || "punch";
}

/** The [V4+ Styles] lines of a look (Cap, Hook, Slam, Open, Fig, End). */
export function lookStyles(id) {
  const L = SHORT_LOOKS[id] || SHORT_LOOKS.punch;
  const ink = bgr(L.ink);
  const dark = "&H00000000";
  const sh = "&H64000000";
  // Captions: outlined (borderstyle 1), on a tape strip (3), or with a deep soft shadow.
  const cap =
    L.capStyle === "tape"
      ? `Style: Cap,${L.font},${L.capSize},${ink},${ink},${bgr(L.tape, "30")},&H00000000,${L.bold},${L.italic || 0},0,0,100,100,${L.spacing || 0},0,3,16,0,2,70,70,300,1`
      : L.capStyle === "shadow"
        ? `Style: Cap,${L.font},${L.capSize},${ink},${ink},${dark},&H96000000,${L.bold},${L.italic || 0},0,0,100,100,${L.spacing || 0},0,1,4,6,2,60,60,300,1`
        : `Style: Cap,${L.font},${L.capSize},${ink},${ink},${dark},${sh},${L.bold},${L.italic || 0},0,0,100,100,${L.spacing || 1},0,1,9,4,2,60,60,300,1`;
  const s = L.slam;
  const slamInk = bgr(L.slamInk);
  const slam =
    s === "box"
      ? `Style: Slam,${L.slamFont},${L.slamSize},${slamInk},${slamInk},${bgr(L.slamBox)},&H00000000,0,${L.slamItalic || 0},0,0,100,100,2,${L.slamAngle || 0},3,30,0,5,60,60,0,1`
      : s === "stamp"
        ? // The stamp sits on a dark translucent slip: a bare red outline read thin over a photo.
          `Style: Slam,${L.slamFont},${L.slamSize},${slamInk},${slamInk},${bgr("#000000", "50")},&H00000000,1,0,0,0,100,100,4,${L.slamAngle || 0},3,22,0,5,60,60,0,1`
        : s === "glow"
          ? `Style: Slam,${L.slamFont},${L.slamSize},${slamInk},${slamInk},${bgr(L.slamGlow || L.key)},&H00000000,1,${L.slamItalic || 0},0,0,100,100,1,0,1,6,0,5,60,60,0,1`
          : `Style: Slam,${L.slamFont},${L.slamSize},${slamInk},${slamInk},${dark},&H96000000,1,${L.slamItalic || 0},0,0,100,100,${L.slamSpacing || 2},0,1,3,8,5,60,60,0,1`;
  // The opening line (question / statement / quote): big, centred, the look's caption face.
  const open = `Style: Open,${L.font},${Math.round(L.capSize * 1.05)},${ink},${ink},${dark},&H96000000,1,${L.italic || 0},0,0,100,100,${L.spacing || 0},0,1,5,6,5,90,90,0,1`;
  const fig = slam.replace("Style: Slam,", "Style: Fig,");
  // The hook label: the look's printed box, its tape strip, or its key colour set bold and large enough to read.
  const hook =
    s === "box"
      ? `Style: Hook,${L.slamFont},74,${slamInk},${slamInk},${bgr(L.slamBox)},&H00000000,0,0,0,0,100,100,1,${L.slamAngle || 0},3,20,0,8,90,90,250,1`
      : L.capStyle === "tape"
        ? `Style: Hook,${L.font},70,${bgr(L.key)},${bgr(L.key)},${bgr(L.tape, "10")},&H00000000,1,0,0,0,100,100,2,0,3,16,0,8,90,90,250,1`
        : `Style: Hook,${L.font},76,${bgr(L.key)},${bgr(L.key)},${dark},&H96000000,1,0,0,0,100,100,${(L.spacing || 0) + 3},0,1,4,5,8,90,90,250,1`;
  const end =
    s === "box"
      ? `Style: End,${L.slamFont},62,${slamInk},${slamInk},${bgr(L.slamBox)},&H00000000,0,0,0,0,100,100,1,0,3,18,0,2,90,90,520,1`
      : `Style: End,${L.font},58,${bgr(L.key)},${bgr(L.key)},${dark},&H96000000,1,0,0,0,100,100,${(L.spacing || 0) + 3},0,1,3,4,2,90,90,520,1`;
  return [cap, hook, slam, open, fig, end];
}

/** The keyword colour override for a caption word. */
export const keyTag = (id) => `{\\c${bgr((SHORT_LOOKS[id] || SHORT_LOOKS.punch).key)}&}`;
export const inkTag = (id) => `{\\c${bgr((SHORT_LOOKS[id] || SHORT_LOOKS.punch).ink)}&}`;

/** How a slam word lands, as ASS override tags (scale punch, stamp jolt, carved rise, glow bloom). */
export function slamTags(id) {
  const s = (SHORT_LOOKS[id] || SHORT_LOOKS.punch).slam;
  if (s === "stamp") return "{\\fscx135\\fscy135\\t(0,70,\\fscx100\\fscy100)\\fad(0,60)}";
  if (s === "carved") return "{\\alpha&HFF&\\t(0,180,\\alpha&H00&)\\fscx108\\fscy108\\t(0,260,\\fscx100\\fscy100)\\fad(0,120)}";
  if (s === "glow") return "{\\blur6\\t(0,200,\\blur2)\\fscx115\\fscy115\\t(0,140,\\fscx100\\fscy100)\\fad(0,120)}";
  return "{\\fscx150\\fscy150\\t(0,90,\\fscx100\\fscy100)\\fad(0,80)}";
}

/** The flash a look puts on its opening (ffmpeg fade colour). */
export const flashColour = (id) => ({ white: "white", black: "black", warm: "0xfff1d6" })[(SHORT_LOOKS[id] || SHORT_LOOKS.punch).flash] || "white";

/** The picture treatment of a look (ffmpeg filter chain after the crop). */
export function pictureFilter(id) {
  const L = SHORT_LOOKS[id] || SHORT_LOOKS.punch;
  return `${L.grade},noise=alls=${L.grain}:allf=t,vignette=angle=${L.vignette}`;
}
