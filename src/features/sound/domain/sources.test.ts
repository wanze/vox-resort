import { describe, expect, it } from 'vitest';
import type { SoundKind } from '../../../../voxel-gen/voxelgen.ts';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SOUND_KINDS } from './bank';
import { kindAt } from './hearing';
import { gatherSources, hearGuests, shoreDistance, soundSourcesOf } from './sources';

const SOUNDS: { readonly [id: string]: SoundKind } = { cafe: 'cafe', palm: 'trees' };
const soundOf = (id: string): SoundKind | null => SOUNDS[id] ?? null;

const placed = (key: string, id: string, tileX: number, tileZ: number, tilesX = 1, tilesZ = 1) => ({
  key,
  id,
  tileX,
  tileZ,
  tilesX,
  tilesZ,
});

// Straight: no wave, so the water starts on row 40 of every column.
const SHORE: Shore = { spec: { inset: 20, beach: 4, wave: 0, seed: 1 }, tilesX: 60, tilesZ: 61 };

describe('soundSourcesOf', () => {
  it('lists only what sounds, by its kind, with the venue it is', () => {
    const sources = soundSourcesOf(
      [placed('a', 'cottage', 0, 0), placed('b', 'cafe', 4, 4, 3, 3), placed('c', 'palm', 9, 1)],
      soundOf,
      [{ key: 'x' }, { key: 'b' }],
    );
    expect(sources.count).toBe(2);
    expect([...sources.kind]).toEqual([kindAt('cafe'), kindAt('trees')]);
    expect([...sources.venue]).toEqual([1, -1]);
  });

  it("stands a source at its footprint's centre", () => {
    const sources = soundSourcesOf([placed('b', 'cafe', 4, 6, 3, 2)], soundOf, []);
    expect(sources.x[0]).toBe(5.5);
    expect(sources.z[0]).toBe(7);
    expect(sources.half[0]).toBe(1);
  });

  it('hears a closed venue as near but not open', () => {
    const sources = soundSourcesOf(
      [placed('b', 'cafe', 4, 4), placed('d', 'cafe', 6, 4)],
      soundOf,
      [{ key: 'b' }, { key: 'd' }],
    );
    const near = new Float32Array(SOUND_KINDS.length);
    const open = new Float32Array(SOUND_KINDS.length);
    gatherSources(sources, { x: 4.5, z: 4.5, radius: 8 }, (venue) => venue === 1, near, open);
    expect(near[kindAt('cafe')]).toBeGreaterThan(1);
    expect(open[kindAt('cafe')]).toBeGreaterThan(0);
    expect(open[kindAt('cafe')]).toBeLessThan(0.5);
    gatherSources(sources, { x: 40, z: 40, radius: 8 }, () => true, near, open);
    expect(near[kindAt('cafe')]).toBe(0);
  });
});

describe('shoreDistance', () => {
  it('measures straight ahead to the water', () => {
    expect(waterStartZ(SHORE, 10)).toBe(40);
    expect(shoreDistance(SHORE, 10, 30, 20)).toBe(10);
    expect(shoreDistance(SHORE, 10, 45, 20)).toBe(0);
  });

  it('finds a shore off to the side', () => {
    const bay: Shore = { ...SHORE, spec: { ...SHORE.spec, wave: 6 } };
    const column = 25;
    const ahead = waterStartZ(bay, column) - 5;
    const distance = shoreDistance(bay, column + 0.5, ahead, 12);
    expect(distance).toBeLessThanOrEqual(5);
    expect(distance).toBeGreaterThan(0);
  });

  it('is infinite with no shore in reach, or none at all', () => {
    expect(shoreDistance(SHORE, 10, 0, 20)).toBe(Infinity);
    expect(shoreDistance(null, 10, 39, 20)).toBe(Infinity);
  });
});

describe('hearGuests', () => {
  it('counts the guests in reach, the children among them and those in the water', () => {
    const crowd = {
      count: 4,
      x: Float32Array.from([10, 10, 10, 10].map((tile) => tile * 16)),
      z: Float32Array.from([30, 31, 20, 2].map((tile) => tile * 16)),
      // The third is drawn swimming, out where the cast has them.
      shown: Uint8Array.from([0, 0, 1, 0]),
      placedX: Float32Array.from([0, 0, 10 * 16, 0]),
      placedZ: Float32Array.from([0, 0, 41 * 16, 0]),
      offPlot: Uint8Array.from([0, 0, 0, 0]),
      present: Uint8Array.from([1, 1, 1, 1]),
      child: Uint8Array.from([0, 1, 1, 0]),
      isAsleep: () => false,
    };
    const heard = { guests: 0, children: 0, swimmers: 0 };
    hearGuests(crowd, SHORE, { x: 10, z: 35, radius: 8 }, heard);
    expect(heard).toEqual({ guests: 3, children: 2, swimmers: 1 });
  });

  it('does not hear the guests asleep', () => {
    const crowd = {
      count: 2,
      x: Float32Array.from([10 * 16, 10 * 16]),
      z: Float32Array.from([30 * 16, 31 * 16]),
      shown: Uint8Array.from([0, 0]),
      placedX: new Float32Array(2),
      placedZ: new Float32Array(2),
      offPlot: Uint8Array.from([0, 0]),
      present: Uint8Array.from([1, 1]),
      child: Uint8Array.from([0, 1]),
      isAsleep: (person: number) => person === 1,
    };
    const heard = { guests: 0, children: 0, swimmers: 0 };
    hearGuests(crowd, SHORE, { x: 10, z: 35, radius: 8 }, heard);
    expect(heard).toEqual({ guests: 1, children: 0, swimmers: 0 });
  });
});
