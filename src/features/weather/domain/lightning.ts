/**
 * The lightning in a storm: when it goes off, and what it does to the sky.
 *
 * ## Nothing is stored, for `weather.ts`'s reason
 *
 * A strike is not scheduled and no countdown is ticked down. The whole sequence
 * is a function of the seconds the scene has been running: strike `n` goes off
 * at a hashed moment inside its own window, and asking whether anything is
 * flashing *now* is two windows' worth of arithmetic. So a paused resort does
 * not bank a dozen strikes to let off at once, two runs of `pnpm bench` flash on
 * the same frames, and there is no state for a resort rebuild to get wrong.
 *
 * ## The sky, and nothing else
 *
 * A flash is one function over a `SkyState`, in the shape `overcastSky` is and
 * for its reasons - the sun's position is astronomy, the cloud over it is
 * weather, and the bolt through the cloud is weather too. It moves the ambient
 * and the background and leaves the sun alone: a bolt lights the whole sky at
 * once from no particular direction, which is exactly what the ambient is, and
 * swinging the sun to point at it would rake every shadow on the plot sideways
 * for a fifth of a second.
 */

import { mixColor, type SkyState } from '../../lighting/domain/dayNight';
import { mix } from '../../sim/domain/night';

/**
 * Seconds from one strike's window to the next, and how far into its own window
 * a strike may fall.
 *
 * Mean eleven seconds or so between them: often enough that a storm is a storm
 * rather than a grey afternoon, rare enough that it is still an event when it
 * happens.
 *
 * **The spread and the flash together must stay inside the gap.** That is what
 * lets {@link flashAt} answer from the current window alone rather than
 * searching: a strike drawn into window `n` has gone out before window `n + 1`
 * begins, so no window has to look at the one before it.
 */
const STRIKE_GAP = 11;
const STRIKE_SPREAD = 7;

/** How long one flash lasts, in seconds: about as long as a real one looks. */
const FLASH_SECONDS = 0.45;

/** The dimmest a strike is drawn, as a share of the brightest. */
const WEAKEST = 0.45;

/** A 0..1 number from a strike's index; `night.ts`'s hash, as `weather.ts` uses it. */
const hash01 = (value: number): number => mix(value) / 4_294_967_296;

/**
 * How bright strike `n` is, and when in its window it goes off.
 *
 * Two draws off the same index rather than a generator, so the thousandth
 * strike costs what the first one does and nothing has to be advanced to reach
 * it.
 */
const strikeAt = (n: number): number => n * STRIKE_GAP + hash01(n * 2) * STRIKE_SPREAD;
const strikeStrength = (n: number): number => WEAKEST + (1 - WEAKEST) * hash01(n * 2 + 1);

/**
 * The shape of one flash over its own life, 0..1 of the way through it.
 *
 * Brightest at the instant it strikes and decaying to nothing, with a flicker
 * riding on the decay: a bolt is a train of strokes down the same channel, and
 * a single clean fade reads as somebody turning a light up and down.
 */
function shapeOf(through: number): number {
  return (1 - through) * (0.6 + 0.4 * Math.cos(through * Math.PI * 6));
}

/**
 * How brightly it is flashing at this many seconds into the run, 0..1.
 *
 * Zero for all but a fraction of the time, which is the point: the caller may
 * test it against zero to skip re-applying a sky that has not changed. It is a
 * fixed handful of arithmetic however long the storm has been running - see
 * {@link STRIKE_SPREAD} for why one window is enough.
 */
export function flashAt(seconds: number): number {
  if (seconds < 0) return 0;
  const strike = Math.floor(seconds / STRIKE_GAP);
  const through = (seconds - strikeAt(strike)) / FLASH_SECONDS;
  if (through < 0 || through >= 1) return 0;
  return shapeOf(through) * strikeStrength(strike);
}

/**
 * The white a bolt lights the cloud from inside with.
 *
 * Blue rather than white: a storm cloud lit from within is the colour of the
 * daylight above it, and a pure white flash over a slate sky reads as a camera
 * fault.
 */
const FLASH_WHITE = 0xd6e2ff;

/** How much light one flash at full strength adds to the ambient. */
const FLASH_LIGHT = 1.7;

/**
 * The same sky with a bolt going off behind it.
 *
 * `flash` is 0 for every moment that is not one, at which this hands back the
 * state it was given - so a caller that never storms pays one compare. It is
 * clamped, and the ambient is *added* to rather than replaced, so a flash at
 * midnight lights the plot as far above its own darkness as one at noon does
 * above the day's.
 *
 * The lamps are left where they are. A bolt does not turn the street lights
 * off, and putting the flash through `lampFactor` would send it into the light
 * bake's uniform and the windows' as well - a whole plot of lit glass blinking
 * in time with the sky, which is a disco and not a storm.
 */
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
