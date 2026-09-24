import { describe, expect, it } from 'vitest';
import { elevationFor, type ElevationSpec } from './elevation';
import { riverEditsFor, type RiverParts } from './river';
import { shoreFor, type ShoreSpec } from './shoreline';
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

const parts = (over: Partial<RiverParts> = {}): RiverParts => {
  const plan = { tilesX: 40, tilesZ: 60, shore: SHORE, elevation: HILL };
  return {
    shore: shoreFor(plan),
    elevation: elevationFor(plan),
    tilesX: 40,
    tilesZ: 60,
    seed: 3,
    ...over,
  };
};

const flooded = (edits: readonly TerrainEdit[], made: RiverParts) =>
  createTerrain({
    shore: made.shore,
    elevation: made.elevation,
    tilesX: made.tilesX,
    tilesZ: made.tilesZ,
    edits,
  });

const channelOf = (edits: readonly TerrainEdit[]) =>
  edits.filter((edit) => edit.surface === 'water');

describe('riverEditsFor', () => {
  it('gives a plot with no sea no river, because there is nowhere for it to go', () => {
    expect(riverEditsFor(parts({ shore: null, elevation: null }))).toEqual([]);
  });

  it('is the same river for the same seed, and a different one for another', () => {
    expect(riverEditsFor(parts())).toEqual(riverEditsFor(parts()));
    expect(riverEditsFor(parts({ seed: 4 }))).not.toEqual(riverEditsFor(parts()));
  });

  it('runs from the back of the plot down to the water', () => {
    const made = parts();
    const channel = channelOf(riverEditsFor(made));
    const rows = new Set(channel.map((tile) => tile.tileZ));
    expect(rows.has(0)).toBe(true);
    const mouth = Math.max(...rows);
    const terrain = createTerrain({ ...made, edits: [] });
    expect(terrain.isSea(channel[channel.length - 1]!.tileX, mouth + 1)).toBe(true);
  });

  it('is an unbroken channel: every row between the source and the mouth', () => {
    const channel = channelOf(riverEditsFor(parts()));
    const rows = [...new Set(channel.map((tile) => tile.tileZ))].toSorted((a, b) => a - b);
    expect(rows).toEqual(Array.from({ length: rows.length }, (_, index) => index));
  });

  it('never paints the sea, which is nobody’s to change', () => {
    const made = parts();
    const terrain = createTerrain({ ...made, edits: [] });
    for (const edit of riverEditsFor(made)) {
      expect(terrain.isSea(edit.tileX, edit.tileZ)).toBe(false);
    }
  });

  it('moves no ground: every tile keeps the level it stood at', () => {
    const made = parts();
    const bare = createTerrain({ ...made, edits: [] });
    for (const edit of riverEditsFor(made)) {
      expect(edit.level).toBe(bare.levelOf(edit.tileX, edit.tileZ));
    }
  });

  it('falls down the hill rather than cutting through it', () => {
    const channel = channelOf(riverEditsFor(parts()));
    const levels = new Set(channel.map((edit) => edit.level));
    expect(levels.size).toBeGreaterThan(1);
  });

  it('banks the channel in sand, at the channel’s own level', () => {
    const made = parts();
    const edits = riverEditsFor(made);
    const terrain = flooded(edits, made);
    const banks = edits.filter((edit) => edit.surface === 'sand');
    expect(banks.length).toBeGreaterThan(0);
    for (const bank of banks) {
      const beside = [
        terrain.tileAt(bank.tileX - 1, bank.tileZ),
        terrain.tileAt(bank.tileX + 1, bank.tileZ),
      ];
      expect(beside.some((tile) => tile.surface === 'water' && tile.level === bank.level)).toBe(
        true,
      );
    }
  });

  it('stays clear of the plot’s own sides', () => {
    const made = parts();
    for (const edit of riverEditsFor(made)) {
      expect(edit.tileX).toBeGreaterThan(0);
      expect(edit.tileX).toBeLessThan(made.tilesX - 1);
    }
  });

  it('gives a plot too narrow to hold a channel no river at all', () => {
    expect(riverEditsFor(parts({ tilesX: 6 }))).toEqual([]);
  });
});
