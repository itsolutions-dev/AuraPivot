// Tonal swatch ramps (50 → 900) derived from a single seed hex by overriding
// HSL lightness while preserving hue and saturation. Intended to populate
// theme.palette.primary / .secondary / .tertiary so PivotTable (and any other
// consumer) can read theme.palette.<role>[<tone>] from the ambient MUI theme.

export const TONE_STOPS = [
  900, 800, 700, 600, 500, 400, 300, 200, 100, 50,
] as const;

const TONE_LIGHTNESS: Record<number, number> = {
  50: 96,
  100: 90,
  200: 80,
  300: 70,
  400: 60,
  500: 50,
  600: 42,
  700: 34,
  800: 26,
  900: 18,
};

function hexToRgb(hex: string): [number, number, number] {
  const h = String(hex || '').replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (v.length !== 6) return [0, 0, 0];
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

export function buildSwatches(hex: string): Record<number, string> {
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  const out: Record<number, string> = {};
  for (const stop of TONE_STOPS) {
    out[stop] = hslToHex(h, s, TONE_LIGHTNESS[stop]);
  }
  return out;
}

// Variant shape: { palette: { primary, secondary, tertiary, ... }, ... }
export function variantSwatches(variant: {
  palette: { primary: string; secondary: string; tertiary: string };
}): Record<string, Record<number, string>> {
  return {
    primary: buildSwatches(variant.palette.primary),
    secondary: buildSwatches(variant.palette.secondary),
    tertiary: buildSwatches(variant.palette.tertiary),
  };
}
