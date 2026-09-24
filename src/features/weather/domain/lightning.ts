// Stateless: every strike is a function of scene seconds, so a paused resort banks no
// strikes and two bench runs flash on the same frames.

import { mixColor, type SkyState } from '../../lighting/domain/dayNight';
import { mix } from '../../sim/domain/night';

// STRIKE_SPREAD plus FLASH_SECONDS must stay inside the gap, so flashAt only needs the current window.
const STRIKE_GAP = 11;
const STRIKE_SPREAD = 7;

const FLASH_SECONDS = 0.45;

const WEAKEST = 0.45;

const hash01 = (value: number): number => mix(value) / 4_294_967_296;

const strikeAt = (n: number): number => n * STRIKE_GAP + hash01(n * 2) * STRIKE_SPREAD;
const strikeStrength = (n: number): number => WEAKEST + (1 - WEAKEST) * hash01(n * 2 + 1);

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
  const bolt = Math.min(1, Math.max(0, flash));
  if (bolt === 0) return sky;
  return {
    ...sky,
    ambientColor: mixColor(sky.ambientColor, FLASH_WHITE, bolt * 0.8),
    ambientIntensity: sky.ambientIntensity + bolt * FLASH_LIGHT,
    skyColor: mixColor(sky.skyColor, FLASH_WHITE, bolt * 0.7),
  };
}
