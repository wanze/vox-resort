import { NO_ZONE, ZONES } from '../../sim/domain/zones';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Teal, yellow and magenta-red stay apart for every common colour blindness, and the paving is
// sand, so neither end may be a warm brown that sinks into it.
const GOOD = { r: 0x1a / 255, g: 0x9e / 255, b: 0xa8 / 255 };
const MIDDLE = { r: 0xf5 / 255, g: 0xd0 / 255, b: 0x2a / 255 };
const BAD = { r: 0xb0 / 255, g: 0x1a / 255, b: 0x5e / 255 };

const between = (from: number, to: number, t: number): number => from + (to - from) * t;

// Writes into out, so recolouring three thousand tiles allocates nothing.
export function rampInto(value: number, out: Rgb): boolean {
  if (Number.isNaN(value)) return false;
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  const low = clamped < 0.5;
  const from = low ? GOOD : MIDDLE;
  const to = low ? MIDDLE : BAD;
  const t = low ? clamped * 2 : clamped * 2 - 1;
  out.r = between(from.r, to.r, t);
  out.g = between(from.g, to.g, t);
  out.b = between(from.b, to.b, t);
  return true;
}

// Blue, orange, green and violet: none is a heat stop, so a zone view never reads as a heat map,
// and none is a brown that sinks into the sand of the paving.
export const ZONE_COLOURS: readonly number[] = [0x2f6fe4, 0xf27a1c, 0x5bbf3a, 0x9b5de5];

export function zoneColourInto(zone: number, out: Rgb): boolean {
  if (zone === NO_ZONE || zone < 0 || zone >= ZONES) return false;
  const hex = ZONE_COLOURS[zone]!;
  out.r = ((hex >> 16) & 0xff) / 255;
  out.g = ((hex >> 8) & 0xff) / 255;
  out.b = (hex & 0xff) / 255;
  return true;
}
