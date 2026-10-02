/* Small colour maths for the looks (pure). */

export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return [0, 0, 0];
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Relative luminance 0..1 (WCAG). */
export function lum(color: string): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(color);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const isLight = (color: string) => lum(color) > 0.4;

/** a -> b by t (0..1). */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** WCAG contrast ratio. */
export function contrast(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `color` pushed towards black or white until it reads on `ground` (>= `min`:1). */
export function readable(color: string, ground: string, min = 3): string {
  if (contrast(color, ground) >= min) return color;
  const to = isLight(ground) ? '#000000' : '#ffffff';
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const c = mix(color, to, t);
    if (contrast(c, ground) >= min) return c;
  }
  return to;
}

/** `#rrggbb` + alpha 0..1 as `#rrggbbaa`. */
export function alpha(color: string, a: number): string {
  return `${hex(rgb(color))}${Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0')}`;
}
