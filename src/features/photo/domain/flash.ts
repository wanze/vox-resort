import { SUNSET_TIME } from '../../lighting/domain/dayNight';
import type { PhotoPixels } from './photoPixels';

const MINUTES_PER_DAY = 1440;

const SUNSET = SUNSET_TIME * MINUTES_PER_DAY;

// The hour the first walkers are out (views.ts), when a phone stops needing one.
const DAWN = 7 * 60;

const RAMP = 20;

// Doubles the middle of the frame at full strength; the edges, mostly sky, barely move.
const FLASH_LIFT = 1;

const BYTES_PER_PIXEL = 4;

const minutesFrom = (from: number, to: number): number =>
  (((to - from) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export function flashFor(minute: number): number {
  const sinceSunset = minutesFrom(SUNSET - RAMP, minute);
  const night = minutesFrom(SUNSET - RAMP, DAWN + RAMP);
  if (sinceSunset >= night) return 0;
  const rise = sinceSunset / RAMP;
  const fall = (night - sinceSunset) / RAMP;
  return Math.min(1, rise, fall);
}

// Squared, so the lift falls off quickly towards the edges, as a phone's flash does.
const falloff = (r: number): number => Math.max(0, 1 - r * r);

export function flashed(pixels: PhotoPixels, strength: number): PhotoPixels {
  if (!(strength > 0)) return pixels;
  const { width, height, data } = pixels;
  const halfX = width / 2;
  const halfY = height / 2;
  const reach = Math.hypot(halfX, halfY);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(x + 0.5 - halfX, y + 0.5 - halfY) / reach;
      const gain = 1 + strength * FLASH_LIFT * falloff(r);
      const at = (y * width + x) * BYTES_PER_PIXEL;
      // A clamped array clamps on write, so a lit pixel tops out at white.
      data[at] = data[at]! * gain;
      data[at + 1] = data[at + 1]! * gain;
      data[at + 2] = data[at + 2]! * gain;
    }
  }
  return pixels;
}
