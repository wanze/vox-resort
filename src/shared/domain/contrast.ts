export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

// WCAG 2's floors: body text, then large text and the edges of bars, meters and controls.
const TEXT_CONTRAST = 4.5;
const NON_TEXT_CONTRAST = 3;

const HEX = /^#([\da-f]{3,8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;

function fromHex(digits: string): Rgba | null {
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
  if (full.length !== 6 && full.length !== 8) return null;
  const at = (i: number): number => Number.parseInt(full.slice(i, i + 2), 16);
  return { r: at(0), g: at(2), b: at(4), a: full.length === 8 ? at(6) / 255 : 1 };
}

// Only the two spellings a browser hands back for a computed colour, and hex for tests.
export function parseColour(text: string): Rgba | null {
  const value = text.trim();
  const hex = HEX.exec(value);
  if (hex) return fromHex(hex[1]!);
  const rgb = RGB.exec(value);
  if (!rgb) return null;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha };
}

export const over = (top: Rgba, ground: Rgba): Rgba => ({
  r: top.r * top.a + ground.r * (1 - top.a),
  g: top.g * top.a + ground.g * (1 - top.a),
  b: top.b * top.a + ground.b * (1 - top.a),
  a: 1,
});

const channel = (value: number): number => {
  const share = value / 255;
  return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }: Rgba): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

// A see-through colour is judged as it lands on the ground.
export function contrast(ink: Rgba, ground: Rgba): number {
  const a = luminance(over(ink, ground));
  const b = luminance(ground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type ContrastGrade = 'text' | 'large' | 'fail';

export const gradeOf = (ratio: number): ContrastGrade =>
  ratio >= TEXT_CONTRAST ? 'text' : ratio >= NON_TEXT_CONTRAST ? 'large' : 'fail';
