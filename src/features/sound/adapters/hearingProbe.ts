import { soundOf, TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { skyStateFor } from '../../lighting/domain/dayNight';
import type { Shore } from '../../layout/domain/shoreline';
import type { Plot } from '../../resort-prep/domain/prepareResort';
import type { Router } from '../../sim/domain/router';
import { openNow } from '../../sim/domain/hours';
import type { Venue } from '../../sim/domain/venues';
import { weatherEffect, type Weather, type WeatherEffect } from '../../sim/domain/weather';
import { presentCount, type Guests } from '../../guests/domain/guests';
import type { Cast } from '../../choreography/domain/casting';
import type { CrowdField } from '../../crowd/adapters/crowdField';
import type { FireworksField } from '../../fireworks/adapters/fireworksField';
import type { SceneHandle } from '../../rendering/adapters/threeScene';
import { tilePxAt, type ViewSize } from '../../hud/adapters/screenAnchors';
import { SOUND_KINDS } from '../domain/bank';
import { hearingRadius, SURF_REACH, type HeardScene } from '../domain/hearing';
import {
  gatherSources,
  hearGuests,
  shoreDistance,
  soundSourcesOf,
  type HeardGuests,
  type SoundSources,
} from '../domain/sources';

interface HeardResort {
  readonly venues: readonly Venue[];
  readonly eventShowing: Uint8Array;
  readonly plot: Pick<Plot, 'placements' | 'paths'>;
  readonly shore: Shore | null;
  readonly crowd: Pick<CrowdField, 'crowd'>;
  readonly cast: Pick<Cast, 'shown' | 'x' | 'z'>;
  readonly guests: Guests;
  readonly router: Pick<Router, 'isAsleep' | 'asleepCount'>;
}

const HEAR_MS = 200;

interface HearingParts {
  readonly handle: SceneHandle;
  readonly resort: () => HeardResort;
  readonly clock: {
    readonly weather: Weather;
    readonly time: number;
    readonly running: number;
    readonly tickOfDay: number;
  };
  readonly view: ViewSize;
  readonly fireworks: FireworksField;
  readonly onHear: (scene: HeardScene) => void;
}

// A fire pit crackles only while its bonfire burns, not whenever it could take guests.
function heardOpen(resort: HeardResort, venue: number, effect: WeatherEffect, tickOfDay: number) {
  const declared = resort.venues[venue]!;
  if (declared.hearth === true) return resort.eventShowing[venue] === 1;
  return openNow(declared, effect, tickOfDay);
}

// The sources are listed again whenever the venues are replaced, which every new resort, settle
// and reanchor does; scanning thousands of placements at 5 Hz would not be.
export function createHearing({ handle, resort, clock, view, fireworks, onHear }: HearingParts) {
  const scene: HeardScene = {
    tilePx: 0,
    targetX: 0,
    targetZ: 0,
    night: 0,
    weather: clock.weather,
    stormSeconds: 0,
    show: null,
    showSeconds: 0,
    shore: Infinity,
    awake: 1,
    guests: 0,
    children: 0,
    swimmers: 0,
    near: new Float32Array(SOUND_KINDS.length),
    open: new Float32Array(SOUND_KINDS.length),
    late: new Float32Array(SOUND_KINDS.length),
  };
  const guests: HeardGuests = { guests: 0, children: 0, swimmers: 0 };
  let sources: SoundSources | null = null;
  let listedFor: readonly Venue[] | null = null;
  let heardAt = -Infinity;

  const sourcesOf = (now: HeardResort): SoundSources => {
    if (sources === null || listedFor !== now.venues) {
      sources = soundSourcesOf([...now.plot.placements, ...now.plot.paths], soundOf, now.venues);
      listedFor = now.venues;
    }
    return sources;
  };

  return (timeMs: number): void => {
    if (timeMs - heardAt < HEAR_MS) return;
    heardAt = timeMs;
    const now = resort();
    const target = handle.controls.target;
    const effect = weatherEffect(clock.weather);
    scene.tilePx = tilePxAt(handle.camera, target, view.width, view.height);
    const listener = {
      x: target.x / TILE_VOXELS,
      z: target.z / TILE_VOXELS,
      radius: hearingRadius(scene.tilePx),
    };
    scene.targetX = listener.x;
    scene.targetZ = listener.z;
    scene.night = skyStateFor(clock.time).lampFactor;
    scene.weather = clock.weather;
    scene.stormSeconds = clock.running;
    // Only what is still to launch: a show stopped mid-air is not heard bursting on.
    scene.show = fireworks.playing ? fireworks.show : null;
    scene.showSeconds = fireworks.playhead;
    scene.shore = shoreDistance(now.shore, listener.x, listener.z, SURF_REACH);
    const { crowd } = now.crowd;
    const { cast } = now;
    const heard = {
      count: Math.min(crowd.count, now.guests.count),
      x: crowd.x,
      z: crowd.z,
      shown: cast.shown,
      placedX: cast.x,
      placedZ: cast.z,
      offPlot: crowd.offPlot,
      present: now.guests.present,
      child: now.guests.child,
      isAsleep: (person: number) => now.router.isAsleep(person),
    };
    hearGuests(heard, now.shore, listener, guests);
    Object.assign(scene, guests);
    const present = presentCount(now.guests);
    scene.awake = present > 0 ? 1 - Math.min(present, now.router.asleepCount) / present : 1;
    const venues = {
      isOpen: (venue: number): boolean => heardOpen(now, venue, effect, clock.tickOfDay),
      keepsHours: (venue: number): boolean => now.venues[venue]!.hours !== undefined,
    };
    gatherSources(sourcesOf(now), listener, venues, scene);
    onHear(scene);
  };
}
