/*
 * NOTHING FROM AFTER THE STORY (Hastings, Oct 2026): a ChatGPT still of "a hand on a map by candlelight" for 1066
 * came back with a brass spyglass on the table — invented five centuries later. "No modern objects" did not cover
 * it: to the image model a telescope is old. A scene's era now names the things that did not exist yet. Only the
 * request text carries it, never the cache key, so pictures already made stay theirs.
 */

/** The year a scene's era names ("1066", "c. 1066", "1066 AD", "44 BC" → -44); null when none. */
export function yearOfEra(era) {
  const s = String(era ?? '');
  const m = s.match(/(\d{1,4})\s*(BC|BCE)?/i);
  if (!m) return null;
  const y = Number(m[1]);
  return m[2] ? -y : y;
}

/*
 * THE PICTURE'S OWN YEAR (Houthi–Saudi news, 28 Oct 2026): "soldiers walking through rugged mountain terrain in the
 * 1960s" (Egypt's war in Yemen, "lured in the sixties") sat in a scene whose era was the story's 2026, and the still
 * was asked with "Set in 2026: vehicles, uniforms and equipment as they look in 2026". A year or decade the prompt
 * itself names is what the picture shows; it wins over the scene's era. A decade counts as its middle (1960s → 1965).
 */
export function promptYear(prompt) {
  const s = String(prompt ?? '');
  const dec = s.match(/\b(1[0-9]\d|20[0-4])0s\b/);
  const yr = s.match(/\b(?:in|of|from|during|circa|c\.)\s+(?:the\s+)?(?:year\s+)?(1[0-9]\d{2}|20[0-4]\d)\b(?!s)/i);
  const at = (m) => (m ? m.index : Infinity);
  if (!dec && !yr) return null;
  return at(dec) <= at(yr) ? Number(dec[1]) * 10 + 5 : Number(yr[1]);
}

/** The things that would be anachronistic in a picture of that year (empty from 1900 on, or with no year). */
export function periodNegative(year) {
  if (year == null || !Number.isFinite(year) || year >= 1900) return '';
  const not = [];
  if (year < 1608) not.push('telescopes or spyglasses');
  if (year < 1500) not.push('pocket watches or clocks');
  if (year < 1450) not.push('printed books or printed maps');
  if (year < 1290) not.push('eyeglasses');
  if (year < 1330) not.push('guns or cannons');
  if (year < 1800) not.push('glass light bulbs or oil lamps with glass chimneys');
  if (year >= 1800) not.push('electric lights, plastic or photographs of later decades');
  return ` Nothing that did not exist by ${year < 0 ? `${-year} BC` : year}: no ${not.join(', no ')}.`;
}
