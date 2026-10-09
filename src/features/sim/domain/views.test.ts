import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { objectTypeById, objectTypeTop, sceneryOf } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { sceneryFieldFor, sceneryItemsOf, SCENERY_REACH } from './scenery';
import { TICKS_PER_DAY } from './simClock';
import { venuesOn } from './venues';
import {
  headingFor,
  momentAt,
  scenicAt,
  subjectAt,
  VIEW_REACH,
  viewsFor,
  type Moment,
  type Views,
} from './views';

const SIZE = 20;

const placed = (key: string, tileX: number, tileZ: number): Placement => ({
  key,
  id: key,
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x: tileX * 8,
  z: tileZ * 8,
  y: 0,
  width: 8,
  depth: 8,
});

const STRENGTHS: Record<string, number> = { fountain: 1, statue: 1, small: 0.5, mosaic: 0.05 };

function viewsOn(
  isWater: (tileX: number, tileZ: number) => boolean,
  placements: readonly Placement[] = [],
  venues: Parameters<typeof viewsFor>[0]['venues'] = [],
  isSea = isWater,
): Views {
  const strengthOf = (id: string) => STRENGTHS[id] ?? 0;
  return viewsFor({
    tilesX: SIZE,
    tilesZ: SIZE,
    scenery: sceneryFieldFor(sceneryItemsOf(placements, strengthOf), SIZE, SIZE),
    placements,
    standing: placements,
    strengthOf,
    labelOf: (id) => id,
    topOf: () => 4,
    levelOf: () => 0,
    isWater,
    isSea,
    venues,
  });
}

const seaFrom15 = (_tileX: number, tileZ: number) => tileZ >= 15;

const pond = (tileX: number, tileZ: number) => tileX >= 8 && tileX < 12 && tileZ >= 8 && tileZ < 11;

function bruteSea(isWater: (tileX: number, tileZ: number) => boolean, x: number, z: number) {
  let count = 0;
  for (let dz = -VIEW_REACH; dz <= VIEW_REACH; dz++) {
    for (let dx = -VIEW_REACH; dx <= VIEW_REACH; dx++) count += isWater(x + dx, z + dz) ? 1 : 0;
  }
  return Math.min(1, count / ((2 * VIEW_REACH + 1) * VIEW_REACH));
}

const at = (x: number, z: number) => z * SIZE + x;

const tickAt = (hours: number) => Math.round((hours / 24) * TICKS_PER_DAY);

const NOON: Moment = momentAt(tickAt(12), 'clear', false);

const nobodyShowing = () => false;

describe('viewsFor', () => {
  it('reads the water fully on the shore, less inland and nothing far from it', () => {
    const views = viewsOn(seaFrom15);
    expect(views.water[at(10, 14)]).toBe(1);
    expect(views.water[at(10, 10)]).toBeLessThan(1);
    expect(views.water[at(10, 10)]).toBeGreaterThan(0);
    expect(views.water[at(10, 4)]).toBe(0);
    expect(views.water[at(10, 0)]).toBe(0);
  });

  it('counts the water as a brute force over every square does', () => {
    for (const isWater of [seaFrom15, pond]) {
      const views = viewsOn(isWater);
      for (let z = 0; z < SIZE; z++) {
        for (let x = 0; x < SIZE; x++) {
          expect(views.water[at(x, z)], `${x},${z}`).toBeCloseTo(bruteSea(isWater, x, z), 5);
        }
      }
    }
  });

  it('sees the sea across open ground, and faces the nearest water', () => {
    const views = viewsOn(seaFrom15);
    expect(views.sea[at(10, 6)]).toBe(1);
    expect(views.sea[at(10, 0)], 'the diagonals leave the plot').toBeCloseTo(1 / 3);
    expect(views.seaHeading[at(10, 14)]).toBeCloseTo(0);
    const inland = viewsOn(pond, [], [], () => false);
    expect(inland.sea[at(1, 1)]).toBe(0);
    expect(Number.isNaN(inland.seaHeading[at(1, 1)]!)).toBe(true);
  });

  it('names a fountain as the sight within the scenery reach, and nothing beyond', () => {
    const views = viewsOn(() => false, [placed('fountain', 5, 5)]);
    expect(views.sights[views.sight[at(5 + SCENERY_REACH, 5)]!]?.key).toBe('fountain');
    expect(views.sight[at(5 + SCENERY_REACH + 1, 5)]).toBe(-1);
  });

  it('picks the nearer of two equal sights and the stronger at equal distance', () => {
    const near = viewsOn(() => false, [placed('fountain', 2, 5), placed('statue', 8, 5)]);
    expect(near.sights[near.sight[at(4, 5)]!]?.key).toBe('fountain');
    expect(near.sights[near.sight[at(7, 5)]!]?.key).toBe('statue');
    const strong = viewsOn(() => false, [placed('small', 3, 5), placed('fountain', 7, 5)]);
    expect(strong.sights[strong.sight[at(5, 5)]!]?.key).toBe('fountain');
  });

  it('lifts the tiles around a sight beyond what its scenery alone gives', () => {
    const plaza = viewsOn(() => false, [placed('fountain', 5, 5)]);
    const plain = viewsOn(() => false, [placed('mosaic', 5, 5)]);
    const beside = at(6, 5);
    expect(plaza.sightScore[beside]).toBeCloseTo(0.8);
    expect(plain.sightScore[beside]).toBe(0);
    // The scenery a fountain spreads one tile away, 0.8, saturates to 0.8 / 2.8.
    expect(plaza.base[beside]).toBeCloseTo(0.7 * (0.8 / 2.8) + 0.3 * 0.8);
  });

  it('counts a pond as water of its own, not as the sea', () => {
    const views = viewsOn(pond, [], [], () => false);
    const bank = at(10, 12);
    expect(views.pond[bank]).toBe(1);
    expect(views.sea[bank]).toBe(0);
    expect(views.base[bank]).toBeCloseTo(0.4);
    expect(views.pond[at(1, 1)]).toBe(0);
    expect(subjectAt(views, bank, NOON, nobodyShowing, [])).toMatchObject({
      kind: 'water',
      label: 'Water',
    });
    const evening = momentAt(tickAt(21), 'clear', false);
    expect(subjectAt(views, bank, evening, nobodyShowing, []).kind).toBe('water');
  });

  it('never makes a mosaic a sight', () => {
    const views = viewsOn(() => false, [placed('mosaic', 5, 5)]);
    expect(views.sights).toHaveLength(0);
    expect(views.sight.every((sight) => sight === -1)).toBe(true);
  });

  it('times the reference resort under 50 ms', () => {
    const world = referenceWorldOf(referenceJson);
    const plan = planOfWorld(world);
    const terrain = terrainFor(plan);
    const placements = [...world.placements, ...world.props, ...world.paths];
    const scenery = sceneryFieldFor(
      sceneryItemsOf(placements, sceneryOf),
      plan.tilesX,
      plan.tilesZ,
    );
    const venues = venuesOn(world.placements);
    const build = () =>
      viewsFor({
        tilesX: plan.tilesX,
        tilesZ: plan.tilesZ,
        scenery,
        placements,
        standing: [...world.placements, ...world.props],
        strengthOf: sceneryOf,
        labelOf: (id) => objectTypeById(id).label,
        topOf: objectTypeTop,
        levelOf: (tileX, tileZ) => terrain.levelOf(tileX, tileZ),
        isWater: (tileX, tileZ) => terrain.surfaceOf(tileX, tileZ) === 'water',
        isSea: (tileX, tileZ) => terrain.isSea(tileX, tileZ),
        venues,
      });
    build();
    const started = performance.now();
    const views = build();
    const took = performance.now() - started;
    console.log(`viewsFor on the reference resort: ${took.toFixed(1)} ms`);
    expect(took).toBeLessThan(50);
    expect(views.sea.some((sea) => sea === 1)).toBe(true);
    expect(views.sights.length).toBeGreaterThan(0);
  });
});

describe('momentAt', () => {
  it('is daylight at noon with no golden hour', () => {
    expect(NOON).toEqual({ wet: false, daylight: true, golden: 0, fireworks: false });
  });

  it('is golden at nine on a clear evening, but not in the rain', () => {
    const clear = momentAt(tickAt(21), 'clear', false);
    expect(clear.golden).toBeGreaterThan(0);
    expect(clear.golden).toBeLessThan(1);
    const rain = momentAt(tickAt(21), 'rain', false);
    expect(rain.wet).toBe(true);
    expect(rain.golden).toBe(0);
  });

  it('is not daylight at eleven at night', () => {
    expect(momentAt(tickAt(23), 'clear', false).daylight).toBe(false);
  });
});

describe('scenicAt', () => {
  const views = viewsOn(seaFrom15);
  const shore = at(10, 14);

  it('gives a sea view nothing at night but the fireworks', () => {
    expect(scenicAt(views, shore, momentAt(tickAt(23), 'clear', false), nobodyShowing)).toBe(0);
    expect(scenicAt(views, shore, momentAt(tickAt(23), 'clear', true), nobodyShowing)).toBeCloseTo(
      0.8,
    );
  });

  it('gives nothing in the rain', () => {
    expect(scenicAt(views, shore, momentAt(tickAt(12), 'rain', true), nobodyShowing)).toBe(0);
  });

  it('adds a stage only while it is showing', () => {
    const stage = { key: 'stage', label: 'The Open Air', x: 44, z: 44, tileX: 5, tileZ: 5 };
    const venues = [{ ...stage, tilesX: 1, tilesZ: 1, stage: true }];
    const staged = viewsOn(() => false, [], venues);
    const night = momentAt(tickAt(23), 'clear', false);
    expect(scenicAt(staged, at(7, 5), night, nobodyShowing)).toBe(0);
    expect(scenicAt(staged, at(7, 5), night, (venue) => venue === 0)).toBeCloseTo(0.5);
    expect(subjectAt(staged, at(7, 5), night, (venue) => venue === 0, venues)).toMatchObject({
      kind: 'show',
      key: 'stage',
    });
  });
});

const bar = (label: string, kind: string, tileX: number) => ({
  key: `${label}#0`,
  label,
  kind,
  x: tileX * 16,
  z: 0,
  tileX,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
});

describe('subjectAt', () => {
  const views = viewsOn(seaFrom15, [placed('fountain', 10, 12)]);

  it('prefers the sunset to a sight on the shore in the golden hour', () => {
    const evening = momentAt(tickAt(21), 'clear', false);
    expect(subjectAt(views, at(10, 14), evening, nobodyShowing, [])).toMatchObject({
      kind: 'sunset',
      key: 'sunset@1,1',
    });
  });

  it('names the sight by day and faces it', () => {
    const subject = subjectAt(views, at(10, 14), NOON, nobodyShowing, []);
    expect(subject).toMatchObject({ kind: 'sight', key: 'fountain' });
    expect(headingFor(views, subject, at(10, 14), 84, 116, 0)).toBeCloseTo(Math.PI);
  });

  it('falls back on the sea, keyed by its cell', () => {
    expect(subjectAt(views, at(1, 14), NOON, nobodyShowing, [])).toMatchObject({
      kind: 'sea',
      key: 'sea@0,1',
      label: 'Sea',
    });
  });

  it('names a view after the nearest named venue, never a plain one', () => {
    const venues = [
      bar('Restrooms', 'Restrooms', 1),
      bar('Club Sabbia', 'Bar', 9),
      bar('Far', 'Bar', 19),
    ];
    expect(subjectAt(views, at(1, 14), NOON, nobodyShowing, venues).label).toBe(
      'Sea by Club Sabbia',
    );
    const night = momentAt(tickAt(23), 'clear', true);
    expect(subjectAt(views, at(1, 14), night, nobodyShowing, venues).label).toBe('Fireworks');
  });

  it('photographs the view from a height with no sea, facing downhill', () => {
    const hill = viewsFor({
      tilesX: SIZE,
      tilesZ: SIZE,
      scenery: sceneryFieldFor([], SIZE, SIZE),
      placements: [],
      standing: [],
      strengthOf: () => 0,
      labelOf: (id) => id,
      topOf: () => 0,
      levelOf: (_tileX, tileZ) => (tileZ < 10 ? 4 : 0),
      isWater: () => false,
      isSea: () => false,
      venues: [],
    });
    const top = at(10, 9);
    expect(hill.overlook[top]).toBe(1);
    expect(hill.base[top]).toBeCloseTo(0.5);
    const subject = subjectAt(hill, top, NOON, nobodyShowing, []);
    expect(subject).toMatchObject({ kind: 'view', key: 'view@1,1', label: 'View' });
    expect(headingFor(hill, subject, top, 0, 0, 2)).toBeCloseTo(0);
  });
});
