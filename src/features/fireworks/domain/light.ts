import type { SkyState } from '../../lighting/domain/dayNight';
import { litSky } from '../../weather/domain/lightning';
import { lifeOf, LONGEST_LIFE, MAX_RISE } from './shells';
import { firstLaunchedFrom, type Show } from './show';

const LIGHT_SECONDS = 2;
const LIGHT_DECAY = 0.5;
// For a shell of the usual radius; a finale shell, bigger, lights more.
const BURST_LIGHT = 0.5;
const USUAL_RADIUS = 55;
// While anything is in the air the sand stays lit, warm, so the crowd watching can be seen between
// the bursts and not only in the finale.
const AIRBORNE_GLOW = 0.2;
const AIRBORNE_COLOUR = 0xffd9a8;
// About half a lightning flash at full strength: a burst lights the plot, a bolt floods it.
const FIREWORK_LIGHT = 0.9;

export interface ShowLight {
  readonly strength: number;
  readonly color: number;
}

export const DARK: ShowLight = { strength: 0, color: 0 };

const channel = (colour: number, shift: number): number => (colour >> shift) & 0xff;

const LOOK_BACK = MAX_RISE + Math.max(LIGHT_SECONDS, LONGEST_LIFE);

interface Mix {
  strength: number;
  r: number;
  g: number;
  b: number;
}

function add(mix: Mix, colour: number, weight: number): void {
  mix.strength += weight;
  mix.r += channel(colour, 16) * weight;
  mix.g += channel(colour, 8) * weight;
  mix.b += channel(colour, 0) * weight;
}

// The colour is the bursts' own, weighted by how bright each still is, over the airborne glow.
export function showLightAt(show: Show, playhead: number, stopAt = Infinity): ShowLight {
  const mix: Mix = { strength: 0, r: 0, g: 0, b: 0 };
  let airborne = false;
  const first = firstLaunchedFrom(show.shells, playhead - LOOK_BACK);
  for (let index = first; index < show.shells.length; index++) {
    const shell = show.shells[index]!;
    if (shell.launchAt > playhead || shell.launchAt > stopAt) break;
    const age = playhead - shell.launchAt - shell.rise;
    airborne ||= age < lifeOf(shell.kind);
    if (age < 0 || age >= LIGHT_SECONDS) continue;
    add(
      mix,
      shell.colour,
      BURST_LIGHT * (shell.radius / USUAL_RADIUS) * Math.exp(-age / LIGHT_DECAY),
    );
  }
  if (airborne && playhead < show.length) add(mix, AIRBORNE_COLOUR, AIRBORNE_GLOW);
  if (mix.strength === 0) return DARK;
  const { strength, r, g, b } = mix;
  const color =
    (Math.round(r / strength) << 16) | (Math.round(g / strength) << 8) | Math.round(b / strength);
  return { strength: Math.min(1, strength), color };
}

export function fireworksSky(sky: SkyState, light: ShowLight): SkyState {
  return litSky(sky, {
    bolt: light.strength,
    color: light.color,
    ambient: FIREWORK_LIGHT,
    ambientMix: 0.35,
    skyMix: 0.25,
  });
}
