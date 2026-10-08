// Stateless: every strike is a function of scene seconds, so a paused resort banks no
// strikes and two bench runs flash on the same frames.

import { mixColor, type SkyState } from '../../lighting/domain/dayNight';
import { mix, unitOf } from '../../random/domain/hash';

// STRIKE_SPREAD plus FLASH_SECONDS must stay inside the gap, so flashAt only needs the current window.
const STRIKE_GAP = 11;
const STRIKE_SPREAD = 7;

const FLASH_SECONDS = 0.45;

const WEAKEST = 0.45;

const hash01 = (value: number): number => unitOf(mix(value));

const strikeAt = (n: number): number => n * STRIKE_GAP + hash01(n * 2) * STRIKE_SPREAD;
const strikeStrength = (n: number): number => WEAKEST + (1 - WEAKEST) * hash01(n * 2 + 1);

export interface Strike {
  readonly at: number;
  readonly strength: number;
}

// In (from, to], for the thunder to be scheduled off the same strikes the sky flashes for.
export function strikesBetween(from: number, to: number): Strike[] {
  const strikes: Strike[] = [];
  const first = Math.max(0, Math.floor((from - STRIKE_SPREAD) / STRIKE_GAP));
  for (let n = first; n * STRIKE_GAP <= to; n++) {
    const at = strikeAt(n);
    if (at > from && at <= to) strikes.push({ at, strength: strikeStrength(n) });
  }
  return strikes;
}

// Flickers on the decay: a bolt is a train of strokes, and a single clean fade reads as a dimmer.
function shapeOf(through: number): number {
  return (1 - through) * (0.6 + 0.4 * Math.cos(through * Math.PI * 6));
}

export function flashAt(seconds: number): number {
  if (seconds < 0) return 0;
  const strike = Math.floor(seconds / STRIKE_GAP);
  const through = (seconds - strikeAt(strike)) / FLASH_SECONDS;
  if (through < 0 || through >= 1) return 0;
  return shapeOf(through) * strikeStrength(strike);
}

// Blue, not white: a pure white flash over a slate sky reads as a camera fault.
const FLASH_WHITE = 0xd6e2ff;

const FLASH_LIGHT = 1.7;

// Only ambient and background: swinging the sun would rake every shadow sideways, and
// routing the flash through lampFactor would blink every lit window. Ambient is added
// to, not replaced, so a flash lights midnight as much as noon.
export function flashSky(sky: SkyState, flash: number): SkyState {
  return litSky(sky, {
    bolt: flash,
    color: FLASH_WHITE,
    ambient: FLASH_LIGHT,
    ambientMix: 0.8,
    skyMix: 0.7,
  });
}

export interface SkyLight {
  readonly bolt: number;
  readonly color: number;
  readonly ambient: number;
  readonly ambientMix: number;
  readonly skyMix: number;
}

export function litSky(sky: SkyState, light: SkyLight): SkyState {
  const bolt = Math.min(1, Math.max(0, light.bolt));
  if (bolt === 0) return sky;
  return {
    ...sky,
    ambientColor: mixColor(sky.ambientColor, light.color, bolt * light.ambientMix),
    ambientIntensity: sky.ambientIntensity + bolt * light.ambient,
    skyColor: mixColor(sky.skyColor, light.color, bolt * light.skyMix),
  };
}
