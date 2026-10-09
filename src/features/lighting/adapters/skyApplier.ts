import { overcastSky, skyStateFor, type SkyState } from '../domain/dayNight';
import { weatherEffect, type Weather } from '../../sim/domain/weather';
import { flashAt, flashSky } from '../../weather/domain/lightning';
import { isWet } from '../../weather/domain/rainfall';
import { fireworksSky, type ShowLight } from '../../fireworks/domain/light';
import { furledShareAt } from '../../rendering/domain/canopyFurl';
import type { SceneHandle } from '../../rendering/adapters/threeScene';
import type { InstancedWorld } from '../../rendering/adapters/instancedWorld';
import type { BlobShadowField } from '../../rendering/adapters/blobShadowField';
import type { BakedLightVolume } from './bakedLightVolume';

export interface SkyResort {
  readonly world: Pick<InstancedWorld, 'setLampFactor' | 'setFurledShare' | 'setWet' | 'setSky'>;
  readonly shadows: Pick<BlobShadowField, 'applySky'>;
  readonly lighting: { readonly volume: Pick<BakedLightVolume, 'setLampFactor'> | null };
}

export interface SkyClock {
  readonly time: number;
  readonly weather: Weather;
  readonly running: number;
}

export interface SkyApplier {
  readonly lampFactor: number;
  readonly sky: SkyState;
  apply(clock: SkyClock): void;
  // A photo's hour: the sun, the dome, the shadows and the lamps follow it; which rooms are lit,
  // the parasols and the sim stay on the clock's. Null goes back to the clock's.
  setLookTime(time: number | null): void;
  // A new resort's volume and blobs start at zero whatever the time of day.
  reset(): void;
}

// Each a number, so a still frame is told apart from a changed one without a branch per input.
const sameSkyInputs = (a: readonly number[], b: readonly number[] | null): boolean =>
  b !== null && a.every((value, index) => value === b[index]);

export function createSkyApplier(parts: {
  readonly handle: Pick<SceneHandle, 'applySky'>;
  readonly resort: () => SkyResort;
  readonly glow: () => ShowLight;
}): SkyApplier {
  const { handle, resort, glow } = parts;
  let sky: SkyState | null = null;
  let applied: readonly number[] | null = null;
  let lookTime: number | null = null;
  const sunTimeAt = (time: number): number => lookTime ?? time;

  return {
    get lampFactor() {
      return sky?.lampFactor ?? 0;
    },
    get sky() {
      return sky ?? skyStateFor(lookTime ?? 0);
    },
    setLookTime(time) {
      lookTime = time;
    },
    apply(clock) {
      const { time, weather } = clock;
      const overcast = weatherEffect(weather).overcast;
      const flash = weather === 'storm' ? flashAt(clock.running) : 0;
      const lit = glow();
      // Overcast, flash and glow are in the guard too: the weather turns at midnight even while
      // paused, and a flash or a burst lasts under a second.
      const sunTime = sunTimeAt(time);
      const inputs = [time, sunTime, overcast, flash, lit.strength, lit.color];
      if (sameSkyInputs(inputs, applied)) return;
      sky = fireworksSky(flashSky(overcastSky(skyStateFor(sunTime), overcast), flash), lit);
      handle.applySky(sky);
      resort().lighting.volume?.setLampFactor(sky.lampFactor);
      resort().world.setLampFactor(sky.lampFactor);
      resort().world.setFurledShare(furledShareAt(time));
      resort().world.setWet(isWet(weather));
      resort().shadows.applySky(sky);
      // The pools use the sea's shader, so they need the sky too.
      resort().world.setSky(sky.skyColor);
      applied = inputs;
    },
    reset() {
      applied = null;
    },
  };
}
