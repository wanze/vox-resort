import { describe, expect, it } from 'vitest';
import { elevationFor, type ElevationSpec } from './elevation';
import { riverEditsFor, type RiverParts } from './river';
import { shoreFor, waterStartZ, type ShoreSpec } from './shoreline';
import { createTerrain, type TerrainEdit } from './terrain';

const SHORE: ShoreSpec = { inset: 10, beach: 6, wave: 2, seed: 5 };

const HILL: ElevationSpec = {
  terraces: [
    { level: 1, inset: 6, anchor: 'water', wave: 0, surface: 'sand' },
    { level: 2, inset: 10, anchor: 'water', wave: 0 },
    { level: 1, inset: 18, anchor: 'water', wave: 0 },
    { level: 0, inset: 24, anchor: 'water', wave: 0 },
  ],
  seed: 5,
};

const parts = (over: Partial<RiverParts> & { readonly hill?: boolean } = {}): RiverParts => {
  const { hill = true, ...rest } = over;
  const tilesZ = rest.tilesZ ?? 70;
  const plan = { tilesX: 40, tilesZ, shore: SHORE, ...(hill ? { elevation: HILL } : {}) };
  return {
    shore: shoreFor(plan),
    elevation: elevationFor(plan),
    tilesX: 40,
    tilesZ,
    seed: 3,
    ...rest,
  };
};

const bareOf = (made: RiverParts) => createTerrain({ ...made, edits: [] });

const channelOf = (edits: readonly TerrainEdit[]) =>
  edits.filter((edit) => edit.surface === 'water');

const rowsByColumn = (channel: readonly TerrainEdit[]) => {
  const rows = new Map<number, number[]>();
  for (const tile of channel) rows.set(tile.tileX, [...(rows.get(tile.tileX) ?? []), tile.tileZ]);
  return rows;
};

describe('riverEditsFor', () => {
  it('gives a plot with no sea no river, because there is no coast for it to follow', () => {
    expect(riverEditsFor(parts({ shore: null, elevation: null }))).toEqual([]);
  });

  it('is the same river for the same seed, and a different one for another', () => {
    expect(riverEditsFor(parts())).toEqual(riverEditsFor(parts()));
    expect(riverEditsFor(parts({ seed: 4 }))).not.toEqual(riverEditsFor(parts()));
  });

  it('crosses the plot from side to side, and on out past both edges', () => {
    const made = parts();
    const columns = rowsByColumn(channelOf(riverEditsFor(made)));
    for (let tileX = -1; tileX <= made.tilesX; tileX++) expect(columns.has(tileX)).toBe(true);
  });

  it('runs parallel to the coast rather than down to it', () => {
    const made = parts();
    const shore = made.shore!;
    const offsets = channelOf(riverEditsFor(made))
      .filter((tile) => tile.tileX >= 0 && tile.tileX < made.tilesX)
      .map((tile) => waterStartZ(shore, tile.tileX) - tile.tileZ);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThanOrEqual(8);
  });

  it('is an unbroken channel: each column shares a row with the one before', () => {
    const columns = rowsByColumn(channelOf(riverEditsFor(parts())));
    const xs = [...columns.keys()].toSorted((a, b) => a - b);
    for (let index = 1; index < xs.length; index++) {
      const before = new Set(columns.get(xs[index - 1]!));
      expect(xs[index]).toBe(xs[index - 1]! + 1);
      expect(columns.get(xs[index]!)!.some((row) => before.has(row))).toBe(true);
    }
  });

  it('never paints the sea, which is nobody’s to change', () => {
    const made = parts();
    const terrain = bareOf(made);
    for (const edit of riverEditsFor(made)) {
      expect(terrain.isSea(edit.tileX, edit.tileZ)).toBe(false);
    }
  });

  it('moves no ground: every tile keeps the level it stood at', () => {
    const made = parts();
    const bare = bareOf(made);
    for (const edit of riverEditsFor(made)) {
      expect(edit.level).toBe(bare.levelOf(edit.tileX, edit.tileZ));
    }
  });

  it('lies on the flat behind the hill instead of cutting across its steps', () => {
    const made = parts();
    const channel = channelOf(riverEditsFor(made));
    expect(new Set(channel.map((edit) => edit.level))).toEqual(new Set([0]));
    for (const tile of channel) {
      expect(waterStartZ(made.shore!, tile.tileX) - tile.tileZ).toBeGreaterThan(24);
    }
  });

  it('lies on the grass behind the beach when there is no hill', () => {
    const made = parts({ hill: false });
    const bare = bareOf(made);
    const channel = channelOf(riverEditsFor(made));
    expect(channel.length).toBeGreaterThan(0);
    for (const tile of channel) expect(bare.surfaceOf(tile.tileX, tile.tileZ)).toBe('grass');
  });

  it('floods the channel and nothing else, leaving grass right up to the water', () => {
    const edits = riverEditsFor(parts());
    expect(edits.length).toBeGreaterThan(0);
    expect(edits.every((edit) => edit.surface === 'water')).toBe(true);
  });

  it('stays clear of the plot’s back edge', () => {
    for (const edit of riverEditsFor(parts())) expect(edit.tileZ).toBeGreaterThan(0);
  });

  it('gives a plot too shallow to hold a channel behind its hill no river at all', () => {
    expect(riverEditsFor(parts({ tilesZ: 40 }))).toEqual([]);
  });
});
