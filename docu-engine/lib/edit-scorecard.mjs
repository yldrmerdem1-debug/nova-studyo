/*
 * EDIT SCORECARD (1.16.16): the measures the outlier study compared, printed
 * before the render so a slow, map-less, text-heavy cut is seen in the log
 * (and by the critic) instead of on YouTube. Targets from 21 outlier videos
 * frame by frame and 38 transcripts (Oct 2026); ours before the study in
 * brackets: El Niño, Hastings, Saudi–Houthi, Hungary 1956.
 *
 *   wpm      narration words per minute of film      ≥ 140   (106-124)
 *   maps     map scenes                               ≥ 2     (0)
 *   text     scenes whose picture is a text card     ≤ 15%   (24-30%)
 *   small    photos shown as a small card            ≤ 10%   (10-20%)
 *   minutes  film length                              ≤ 14    (Studio, Oct 2026: 11-13 min kept 33-45%;
 *            El Niño 18:42 and 1066 15:08 lost viewers in ~20 s)
 */
import { spokenWords } from './pace.mjs';

export const SCORE_TARGETS = { wpm: 140, maps: 2, text: 0.15, small: 0.1, maxMinutes: 14 };

/*
 * NARRATION VOICE (1.16.16): 15 small-channel breakouts' FULL transcripts against our last 8 scripts. Breakouts: mean
 * sentence 14.7 words (median 13), 29% of sentences ≤ 8 words, 0.3 questions a minute, "you" 1.0 per 100 words. Ours:
 * 8.9 words, 48% short, 0.8 questions a minute, "you" 0.2 — choppy, teasing, never talking to the viewer.
 * The breakouts are FIVE different voices (documentary story, host explainer, evidence/investigation, calm news,
 * comic), so only what separates every one of them from our trailer voice is a target: mean sentence ≥ 10.5 words
 * (theirs 9.6-24.2, nearly all ≥ 11.2; our best 9.8) and questions ≤ 0.9 a minute (ours up to 1.4). Short-sentence
 * share (theirs 6-53%) and "you" (theirs 0.04-2.8) depend on the voice: printed, never a miss.
 */
export const STYLE_TARGETS = { sent: 10.5, qpm: 0.9, attr: 0.07, dpm: 2.0 };

/*
 * DATES (1.16.16, second outside analysis + measurement): breakouts say 0-1.6 dates a minute, ours 2.5-5.4 (El Niño
 * 5.4, Red Sea 4.0, Saudi 3.2; Jim Bakker 26 dates in 14 minutes). Half our films opened on a date ("October 29th,
 * 1929, 10:00."). "May" counts only next to a day number or after "in" (the Saudi film said "we may").
 */
const DATE = /\b(?:1[0-9]{3}|20[0-9]{2})\b|\b(?:January|February|March|April|June|July|August|September|October|November|December)\b|\bMay\s+\d|\d+(?:st|nd|rd|th)?\s+May\b|\bin May\b/g;

/*
 * HONESTY (1.16.16, the channel's own transcripts): the narrator read our research process to the viewer (El Niño:
 * "These figures were not in our original research file", 22 s average view) and attributed every line (Saudi–Houthi:
 * 12% of sentences "according to…/Reuters reported"; breakouts at most 6.6%, mostly 0-1.5%).
 */
const ATTRIBUTION = /according to|reported|told reporters|said in a statement|\b(?:Reuters|Axios|CNN|CBS|Al Jazeera|AP|BBC|Bloomberg)\b/i;
const BACKSTAGE = /\b(?:research (?:file|brief|dossier|notes?)|our (?:original )?research|our (?:sources|source|file|files|brief|notes|team)\b|the brief (?:for|also|says|names|mentions|calls|describes)|this brief\b|(?:for|before) (?:broadcast|publication)\b|flagged for (?:checking|review|verification)|fact[- ]?check(?:ed|ing|ers?)?\b|editorial (?:frame|framing)|(?:sources|reports) we could (?:check|find|verify)|we (?:could|can)(?:not|n't) (?:verify|confirm|find)|could not be verified by us)/i;

/** Sentence length, share of short sentences, questions a minute and "you" per 100 words of the narration. */
export function narrationStyle(scenes, minutes) {
  const text = (scenes || [])
    .map((s) => String(s?.say || '').replace(/\[[^\]]*\]/g, ' ').trim())
    .filter(Boolean)
    .map((t) => (/[.!?…]["”']?$/.test(t) ? t : `${t}.`))
    .join(' ');
  const sents = (text.match(/[^.!?…]+[.!?…]+["”']?/g) || []).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 2);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!sents.length || !words) return null;
  const lens = sents.map((s) => s.split(/\s+/).length);
  return {
    sent: +(words / sents.length).toFixed(1),
    short: +(lens.filter((l) => l <= 8).length / lens.length).toFixed(2),
    qpm: minutes > 0 ? +(sents.filter((s) => /\?["”']?$/.test(s)).length / minutes).toFixed(1) : 0,
    you: +(((text.match(/\b(you|your|you're|you've|you'll|you'd)\b/gi) || []).length / words) * 100).toFixed(2),
    attr: +(sents.filter((s) => ATTRIBUTION.test(s)).length / sents.length).toFixed(3),
    backstage: sents.filter((s) => BACKSTAGE.test(s)).length,
    dpm: minutes > 0 ? +((text.match(DATE) || []).length / minutes).toFixed(1) : 0,
    firstDate: dryDateOpening(sents[0]),
  };
}

/*
 * A DRY date opening is the habit we banned ("October fifth, 1989.", "October 29th, 1929, 10:00."): the date stands
 * alone as a heading. A MOMENT is allowed — the date or clock inside a sentence where something happens (deep study,
 * 20 Oct 2026: "At 37 minutes past 8 in the morning on the 26th of August, a mountain… came apart." opened the 4.1M-view
 * Nepal explainer; "February 2026, the United States kills Iran's supreme leader."). Dry = fewer than 6 words besides
 * the date and the numbers.
 */
function dryDateOpening(first) {
  if (!first || !new RegExp(DATE.source).test(first)) return false;
  const rest = first
    .replace(new RegExp(DATE.source, 'g'), ' ')
    .replace(/\b\d+(?:st|nd|rd|th)?\b|\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\w+teenth|twentieth|thirtieth)\b/gi, ' ')
    .split(/\s+/)
    .filter((w) => /[a-z]/i.test(w)).length;
  return rest < 6;
}

/** A scene the viewer sees as text on a card: slams, and words scenes that print their line. */
const isTextCard = (s) => s?.type === 'slam' || (s?.type === 'words' && s.textMode !== 'none');

export function editScorecard(script, fps = 30, placed = null) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const sec = placed?.length ? placed.reduce((n, p) => n + p.frames, 0) / fps : scenes.reduce((n, s) => n + Math.max(Number(s.dur) || 0, (s.voiceDur ?? 0) + 0.4), 0);
  const words = scenes.reduce((n, s) => n + spokenWords(s.say), 0);
  const story = scenes.filter((s) => !(s.type === 'title' && s.chapterCard));
  const photos = story.filter((s) => s.type === 'photo');
  const card = {
    minutes: +(sec / 60).toFixed(1),
    wpm: sec > 0 ? Math.round(words / (sec / 60)) : 0,
    maps: scenes.filter((s) => s.type === 'map').length,
    text: story.length ? +(story.filter(isTextCard).length / story.length).toFixed(3) : 0,
    small: photos.length ? +(photos.filter((s) => s.fit === 'contain').length / photos.length).toFixed(3) : 0,
  };
  const style = narrationStyle(scenes, sec / 60);
  if (style) card.style = style;
  const S = STYLE_TARGETS;
  const T = SCORE_TARGETS;
  card.misses = [
    card.minutes > T.maxMinutes ? `süre ${card.minutes} dk (hedef 11-${T.maxMinutes})` : null,
    card.wpm < T.wpm ? `tempo ${card.wpm} kelime/dk (hedef ≥ ${T.wpm})` : null,
    card.maps < T.maps ? `harita ${card.maps} (hedef ≥ ${T.maps})` : null,
    card.text > T.text ? `yazı kartı %${Math.round(card.text * 100)} (hedef ≤ %${Math.round(T.text * 100)})` : null,
    card.small > T.small ? `küçük kart fotoğraf %${Math.round(card.small * 100)} (hedef ≤ %${Math.round(T.small * 100)})` : null,
    style && style.sent < S.sent ? `cümle ort. ${style.sent} kelime (hedef ≥ ${S.sent}; tutmuşlar 9,6-24,2, ortalama 14,7)` : null,
    style && style.qpm > S.qpm ? `dakikada ${style.qpm} soru (hedef ≤ ${S.qpm}; tutmuşlar ~0,3)` : null,
    style && style.attr > S.attr ? `kaynak atfı %${Math.round(style.attr * 100)} cümle (hedef ≤ %${Math.round(S.attr * 100)}; tutmuşlar %0-6,6)` : null,
    style && style.backstage > 0 ? `${style.backstage} cümle kamera arkasını anlatıyor (araştırma dosyası/brief/kaynaklarımız)` : null,
    style && style.dpm > S.dpm ? `dakikada ${style.dpm} tarih (hedef ≤ ${S.dpm}; tutmuşlar 0-1,6)` : null,
    style && style.firstDate ? 'ilk cümle tarihle açılıyor (çatışma/sonuçla aç, yıl 2-3. cümlede)' : null,
  ].filter(Boolean);
  return card;
}

/** One log line: the card, then what misses the outlier targets. */
export function scorecardLine(card) {
  const st = card.style ? ` · cümle ${card.style.sent} kelime · kısa %${Math.round(card.style.short * 100)} · ${card.style.qpm} soru/dk · you ${card.style.you}` : '';
  const head = `kurgu karnesi: ${card.minutes} dk · ${card.wpm} kelime/dk · ${card.maps} harita · yazı kartı %${Math.round(card.text * 100)} · küçük fotoğraf %${Math.round(card.small * 100)}${st}`;
  return card.misses.length ? `${head} — hedef dışı: ${card.misses.join('; ')}` : `${head} — tutmuş kanalların ölçülerinde`;
}
