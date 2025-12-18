export type Rgb = { r: number; g: number; b: number };

export function normalizeHexColor(input: string): string | null {
  const value = input.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(value)) return value;

  if (/^#[0-9a-f]{3}$/.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);

  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

export function rgbToCss(rgb: Rgb): string {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

function hslToRgb(hsl: { h: number; s: number; l: number }): Rgb {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp01(hsl.s);
  const l = clamp01(hsl.l);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
  else if (h < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
  else if (h < 180) [rPrime, gPrime, bPrime] = [0, c, x];
  else if (h < 240) [rPrime, gPrime, bPrime] = [0, x, c];
  else if (h < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
  else [rPrime, gPrime, bPrime] = [c, 0, x];

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255)
  };
}

export function adjustHexLightness(hex: string, delta: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const hsl = rgbToHsl(rgb);
  const adjusted = hslToRgb({ ...hsl, l: clamp01(hsl.l + delta) });
  return `#${[adjusted.r, adjusted.g, adjusted.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

