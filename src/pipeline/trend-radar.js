// GÜNDEM RADARI — which big, fresh story should the channel explain now?
//
// What the channel learned (Oct 2026): a 16.7k-subscriber channel's "Nepal Floods 2026 Explained" took
// 4M views in a month. Not quality — timing and confusion: everyone was talking about it and nobody
// knew what had happened. So a topic is measured against that benchmark: Google Trends interest on
// the same scale (the benchmark's peak = its score), how fresh it is, how confused people are, and
// whether a real explainer already exists (the news clips do not count).
//
//   fetchTrending(geo)        Google's public "trending now" RSS: searches, approx. traffic, news headlines
//   compareInterest(terms)    Google Trends interest over 90 days, the benchmark included (unofficial
//                             endpoints, best effort: null when Google refuses)
//   evaluateTrending(...)     Claude: fit for the channels, confusion, bigness, title, angle, safety line
//   newsGate(pick)            the go/no-go every news pick must pass before a video is made (below)
//
// The channel's own numbers (Behind the Headline, 27 Oct 2026, long videos): France curfew 3,527
// impressions / 607 views, Panama 7.7 quake 1,839 / 4.9% CTR / 7:11 avg — an ESCALATING or unfolding
// story, huge for the English-speaking world, with one open why/how question. Lula's fourth term: 92
// impressions on day one — a ONE-OFF result; "lula wins fourth term" on YouTube was CNN, Bloomberg x3,
// ABC, France 24 and AFP within 11-23 h. El Niño and the Red Sea cables (abstract, 1.2% CTR) stopped at
// 342 impressions. YouTube tests a new video on a few hundred people and stops when nobody clicks.
import { callJSON } from "../llm.js";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };
/** The story the radar measures against: a small channel's explainer that took 4M views. */
export const DEFAULT_BENCHMARK = { term: "Nepal flood", note: "\"Nepal Floods 2026 Explained\" — a 16.7k-subscriber channel, 4M views in a month" };

const decode = (s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const tag = (block, name) => decode((block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1]);

/** Parse Google's trending RSS (exported for tests). */
export function parseTrendingRss(xml) {
  const items = [];
  for (const block of String(xml || "").split("<item>").slice(1)) {
    const traffic = tag(block, "ht:approx_traffic");
    const news = block.split("<ht:news_item>").slice(1).map((n) => ({
      title: tag(n, "ht:news_item_title"),
      url: tag(n, "ht:news_item_url"),
      source: tag(n, "ht:news_item_source"),
    })).filter((n) => n.title);
    items.push({
      title: tag(block, "title"),
      traffic,
      trafficN: Number(String(traffic).replace(/[^\d]/g, "")) || 0,
      pubDate: tag(block, "pubDate"),
      picture: tag(block, "ht:picture"),
      news,
    });
  }
  return items.filter((i) => i.title);
}

export async function fetchTrending({ geo = "US", fetchFn = (...a) => fetch(...a) } = {}) {
  const r = await fetchFn(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, { headers: UA });
  if (!r.ok) throw new Error(`Google Trends RSS HTTP ${r.status}`);
  return parseTrendingRss(await r.text()).map((i) => ({ ...i, geo }));
}

/**
 * Google News top stories (world + the country): the trending RSS lists only the latest ~10 searches,
 * so a big story can be missing from it (the Siberian plague-lab death was) — the headlines catch it.
 */
export async function fetchHeadlines({ geo = "US", fetchFn = (...a) => fetch(...a) } = {}) {
  const q = `hl=en-${geo}&gl=${geo}&ceid=${geo}:en`;
  const out = [];
  for (const url of [`https://news.google.com/rss/headlines/section/topic/WORLD?${q}`, `https://news.google.com/rss?${q}`]) {
    try {
      const r = await fetchFn(url, { headers: UA });
      if (!r.ok) continue;
      for (const block of (await r.text()).split("<item>").slice(1)) {
        const title = tag(block, "title");
        if (title && !out.some((x) => x.title === title)) out.push({ title, pubDate: tag(block, "pubDate"), source: tag(block, "source") });
      }
    } catch {}
  }
  return out.slice(0, 50);
}

const unwrap = (t) => JSON.parse(t.slice(t.indexOf("{")));

/**
 * Interest over the last 90 days on ONE scale (max 5 terms, the benchmark first): for every term its
 * peak and its latest day, and its peak relative to the benchmark's peak (1 = as big as the benchmark).
 * Unofficial endpoints: null when Google refuses (rate limit) — the radar then works without it.
 */
export async function compareInterest(terms, { geo = "US", benchmark = DEFAULT_BENCHMARK.term, property = "", time = "today 3-m", fetchFn = (...a) => fetch(...a) } = {}) {
  const list = [benchmark, ...terms.filter((t) => t && t !== benchmark)].slice(0, 5);
  try {
    const home = await fetchFn(`https://trends.google.com/trends/?geo=${geo}`, { headers: UA });
    const cookie = (home.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    // property "youtube" = YouTube search (Trends' gprop): what a YouTube channel is actually found by.
    const req = { comparisonItem: list.map((keyword) => ({ keyword, geo, time })), category: 0, property };
    const ex = await fetchFn(`https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`, { headers: { ...UA, cookie } });
    if (!ex.ok) return null;
    const w = unwrap(await ex.text()).widgets.find((x) => x.id === "TIMESERIES");
    if (!w) return null;
    const ml = await fetchFn(`https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${w.token}`, { headers: { ...UA, cookie } });
    if (!ml.ok) return null;
    const data = unwrap(await ml.text()).default.timelineData || [];
    if (!data.length) return null;
    const peaks = list.map((_, i) => Math.max(...data.map((d) => d.value[i] || 0)));
    const bench = peaks[0] || 1;
    return list.map((term, i) => ({
      term, peak: peaks[i], last: data.at(-1).value[i] || 0, vsBenchmark: +(peaks[i] / bench).toFixed(2),
      rising: data.length > 3 && data.at(-1).value[i] > data.at(-3).value[i],
    }));
  } catch {
    return null;
  }
}

const VERDICT = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      description: "the trending searches worth a video for these channels, best first (at most 8; skip sport results, celebrity gossip, product recalls, shopping)",
      items: {
        type: "object",
        properties: {
          trend: { type: "string", description: "the trending search or headline it comes from" },
          story: { type: "string", description: "what actually happened, one sentence, from the headlines" },
          channel: { type: "string", description: "which of the user's channels it fits (history, war, finance, what-if, mystery/ranking)" },
          confusion: { type: "integer", description: "0-5: how confused / misinformed people are (competing versions, rumours, fear, unanswered question)" },
          bigness: { type: "integer", description: "0-5: how big it is for an English-speaking audience" },
          freshness: { type: "string", description: "how recent, e.g. 'today', '2 days'" },
          ageHours: { type: "integer", description: "hours since the story broke (from the headline dates)" },
          arc: { type: "string", enum: ["escalating", "unfolding", "one-off"], description: "escalating = still growing day by day (riots spreading, a war widening, curfews added); unfolding = one event whose aftermath is still being reported (a quake's damage and rescue); one-off = complete the moment it is reported (an election result, a verdict, a score, a launch, an earnings number)" },
          explainerGap: { type: "integer", description: "0-5: how much the broadcasters' news clips (CNN, BBC, Bloomberg, AFP…) leave the main why/how question unanswered; 0 = their clips already answer it, 5 = everyone reports it and nobody explains it" },
          question: { type: "string", description: "the one question millions are asking" },
          title: { type: "string", description: "max 65 characters: <the place or event by its searchable name> (+ a concrete number): Why/How/What …? — e.g. \"Panama's 7.7 Earthquake: Why Wasn't It Worse?\", \"France Under Curfew: What Really Set Off the Riots?\". Never a recap of the result (\"Lula Wins Fourth Term…\")" },
          thumbnail: { type: "string", description: "2-4 word thumbnail line" },
          angle: { type: "string", description: "the explainer's angle in 2-3 sentences: what it will make clear that the headlines don't" },
          neverSay: { type: "string", description: "the one claim the video must NOT make (unconfirmed, panic, defamation)" },
          searchTerm: { type: "string", description: "a 1-3 word English Google search term for this story, to compare its interest" },
        },
        required: ["trend", "story", "channel", "confusion", "bigness", "freshness", "ageHours", "arc", "explainerGap", "question", "title", "thumbnail", "angle", "neverSay", "searchTerm"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
};

/** Claude: which of the trending searches deserve an explainer on these channels, and how to make it. */
export async function evaluateTrending({ items, headlines = [], channels = "history, war, finance, 'Then What' what-if, mystery/ranking", settings = {}, usage = null, logFn = () => {}, llm = callJSON }) {
  const list = items.slice(0, 40).map((i, k) => `${k + 1}. "${i.title}" — ${i.traffic || "?"} searches (${i.geo}, ${i.pubDate})${i.news.length ? ` · headlines: ${i.news.slice(0, 3).map((n) => `${n.title} (${n.source})`).join(" | ")}` : ""}`).join("\n")
    + (headlines.length ? `\n\nTop news headlines right now (a big story can be missing from the searches above):\n${headlines.slice(0, 50).map((h) => `- ${h.title} (${h.pubDate})`).join("\n")}` : "");
  const res = await llm({
    system: "You pick the news stories an English-language YouTube documentary channel should explain RIGHT NOW. Return only the JSON.",
    user: [
      `The channels: ${channels}. English, global audience, cinematic documentary explainers and Shorts.`,
      `What works (measured): a small channel's "Nepal Floods 2026 Explained" took 4M views because everyone was talking about it and nobody knew what had happened. Timing and confusion beat polish. News clips from broadcasters are not competition; a clear explainer is.`,
      `Our own channel (11 subscribers): France's riots and curfews (escalating, huge in the English-speaking world, "what really set them off?") and Panama's 7.7 quake (unfolding, "why wasn't it worse?") were pushed by YouTube; Lula's election win (a one-off result CNN, Bloomberg and AFP covered within hours) and abstract stories (El Niño's numbers, Red Sea cables) were not. Prefer escalating or unfolding stories with an open why/how question the broadcasters' clips do not answer.`,
      "",
      "Trending searches now:",
      list,
      "",
      "Pick the stories worth an explainer for these channels: big, fresh (1-3 days), and confusing (competing versions, rumours, fear, an unanswered question). Skip sport results, gossip, recalls and shopping. For each: the honest curiosity title, the angle, and the one thing the video must never claim.",
    ].join("\n"),
    schema: VERDICT,
    model: settings.docuFastModel || "claude-sonnet-5-5",
    maxTokens: 6000,
    usage,
    logFn,
  });
  return res?.picks || [];
}

/** The go/no-go thresholds (Behind the Headline's numbers, header). */
export const NEWS_GATE = { minBigness: 4, minGap: 3, maxAgeHours: 48, fadeRatio: 0.4 };

/**
 * A news title must ask the question the video answers; a recap of the result is the broadcasters'
 * search ("Lula Wins Fourth Term: From 2.3M Behind to 4.4M Ahead", 2.2% CTR, 92 impressions).
 */
export function newsTitleErrors(title) {
  const t = String(title || "").trim();
  if (!t) return ["başlık yok"];
  if (/\?|\b(why|how|what)\b/i.test(t)) return [];
  return [`"${t}" sonucun özeti: o aramayı büyük haber kanalları saatler içinde alıyor (Lula, %2,2 tıklama). Yer/olay adı + "Why/How/What …?" sorusu olsun ("Panama's 7.7 Earthquake: Why Wasn't It Worse?", %4,9)`];
}

/**
 * Should the channel make this story now? Every failed rule is a reason in Turkish; the score orders
 * the stories that pass (bigness counts double: it is what YouTube's first test audience reacts to).
 */
export function newsGate(p, g = NEWS_GATE) {
  const big = Number(p?.bigness) || 0, conf = Number(p?.confusion) || 0, gap = Number(p?.explainerGap) || 0;
  const fails = [];
  if (big < g.minBigness) fails.push(`İngilizce konuşan dünya için yeterince büyük değil (büyüklük ${big}/5, en az ${g.minBigness})`);
  if (p?.arc === "one-off" && !(gap >= 4 && conf >= 4)) fails.push("tek seferlik sonuç (seçim, karar, skor, duyuru): haberini büyük kanallar saatler içinde verdi, arama onların");
  if (gap < g.minGap) fails.push(`büyük kanalların klipleri soruyu zaten cevaplıyor (açıklama boşluğu ${gap}/5, en az ${g.minGap})`);
  if (Number.isFinite(p?.ageHours) && p.ageHours > g.maxAgeHours) fails.push(`${p.ageHours} saat önce çıktı: video ilk 24 saatte yayında olamaz, ilgi geçmiş olur`);
  if (Number(p?.interest) > 0 && Number.isFinite(p?.interestLast) && p.interestLast < g.fadeRatio * p.interest && !p.rising) fails.push(`ilgi sönüyor (Google'da son gün ${p.interestLast}, tepe ${p.interest})`);
  const score = big * 2 + conf + gap + ({ escalating: 2, unfolding: 1 }[p?.arc] || 0) + Math.min(3, (Number(p?.vsBenchmark) || 0) * 3);
  return { pass: !fails.length, score: +score.toFixed(2), fails, titleErrors: newsTitleErrors(p?.title) };
}

/** Passing stories first, then by score. */
export function rankByGate(picks) {
  for (const p of picks) p.gate = newsGate(p);
  return picks.sort((x, y) => Number(y.gate.pass) - Number(x.gate.pass) || y.gate.score - x.gate.score);
}
