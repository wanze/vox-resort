import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { terrainFor } from '../../layout/domain/terrain';
import { MAX_VENUE_NAME } from '../../naming/domain/venueNames';
import { prepareResort } from '../../resort-prep/domain/prepareResort';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { savedWorldOf } from '../../resort-prep/domain/savedWorld';
import { packShared, ShareError, unpackShared, type ShareFailure } from './layoutCodec';
import { formatLink } from './shareLink';
import { sharedHeaderSchema, type PostcardView, type SharedResort } from './sharedResort';
import { worldMisfits } from './worldFits';

function sharedFor(kind: 'generate' | 'clear', tiles: number, tilesZ: number, seed: number) {
  const params = { tilesX: tiles, tilesZ, density: 0.6, seed };
  const prepared = prepareResort({ source: { kind, params }, repeat: 1, view: null });
  const world = savedWorldOf(
    prepared.plan,
    terrainFor(prepared.plan),
    prepared.plot,
    prepared.plan.land ?? null,
  );
  return { world, params, name: 'Coral Cove', names: [] } satisfies SharedResort;
}

// Shared because the bake is not free.
const GROWN = sharedFor('generate', 112, 100, 1);
const BARE = sharedFor('clear', 256, 256, 4);
const REFERENCE: SharedResort = {
  world: referenceWorldOf(referenceJson),
  params: { tilesX: 256, tilesZ: 256, density: 0.6, seed: 4 },
  name: 'Coral Cove',
  names: [],
};

function refusal(bytes: Uint8Array): ShareFailure {
  try {
    unpackShared(bytes);
  } catch (cause: unknown) {
    if (!(cause instanceof ShareError)) throw cause;
    return cause.reason;
  }
  throw new Error('The body was read');
}

const varint = (value: number): number[] => {
  const bytes: number[] = [];
  let rest = value >= 0 ? value * 2 : -value * 2 - 1;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) + 0x80);
    rest = Math.floor(rest / 0x80);
  }
  return [...bytes, rest];
};

const text = (value: string): number[] => {
  const encoded = [...new TextEncoder().encode(value)];
  return [...varint(encoded.length), ...encoded];
};

const HEADER = {
  tilesX: 1,
  tilesZ: 1,
  shore: null,
  elevation: null,
  land: null,
  params: { tilesX: 48, tilesZ: 48, density: 0.6, seed: 5 },
  name: 'Coral Cove',
  names: [],
};

const EMPTY_LIST = [0, 0];

const bodyOf = (header: unknown, ...rest: number[][]): Uint8Array =>
  Uint8Array.from([...text(JSON.stringify(header)), ...varint(0), ...rest.flat()]);

// One path at 0,0 with the given id index, in the columns' order.
const onePath = (idIndex: number): number[] => [
  ...varint(1),
  ...varint(1),
  ...text('path'),
  ...[idIndex, 0, 0, 1, 1, 0, 0, 0, 0, TILE_VOXELS, TILE_VOXELS, 0].flatMap(varint),
];

describe('packShared and unpackShared', () => {
  it('give back a generated world with its shore, piers and rails, in order', () => {
    expect(GROWN.world.shore).not.toBeNull();
    expect(GROWN.world.rails.length).toBeGreaterThan(0);
    const back = unpackShared(packShared(GROWN));
    expect(back).toEqual(GROWN);
    expect(back.world.placements.map((one) => one.key)).toEqual(
      GROWN.world.placements.map((one) => one.key),
    );
  });

  it('give back a bare world with its land', () => {
    expect(BARE.world.land).toBeDefined();
    expect(unpackShared(packShared(BARE))).toEqual(BARE);
  });

  it('give back the reference resort whole, as a hand-built resort that fits its plot', () => {
    const back = unpackShared(packShared(REFERENCE));
    expect(back).toEqual(REFERENCE);
    expect(worldMisfits(back.world)).toEqual([]);
  });

  it('give back terrain edits past the plot and a key of no usual form', () => {
    const [first, ...rest] = GROWN.world.placements;
    const world = {
      ...GROWN.world,
      terrain: [
        ...GROWN.world.terrain,
        { tileX: -256, tileZ: -3, level: 2, surface: 'water' as const },
        { tileX: 300, tileZ: 2, level: 3, surface: 'sand' as const },
      ],
      placements: [{ ...first!, key: 'hand-laid gate' }, ...rest],
    };
    const shared = { ...GROWN, world, names: [['hand-laid gate', 'The Gate']] as const };
    expect(unpackShared(packShared(shared))).toEqual(shared);
  });

  it('refuse to write a number that is not an integer', () => {
    const [first, ...rest] = GROWN.world.placements;
    const world = { ...GROWN.world, placements: [{ ...first!, y: 1.5 }, ...rest] };
    expect(() => packShared({ ...GROWN, world })).toThrow();
  });

  it('keep a link to a generated plot small', () => {
    const link = formatLink('', deflateRawSync(packShared(GROWN)));
    expect(link.length).toBeLessThan(14_000);
  });

  it('keep a link to the reference resort small', () => {
    const link = formatLink('', deflateRawSync(packShared(REFERENCE)));
    // Measured at 6 998 characters.
    expect(link.length).toBeLessThan(8_000);
  });
});

const VIEW: PostcardView = {
  position: [120.5, 64, 410.25],
  target: [200, 2, 300],
  fov: 42,
  time: 21.25 / 24,
};

describe('a postcard view', () => {
  it('comes back with the link that carries it', () => {
    const shared = { ...GROWN, view: VIEW };
    expect(unpackShared(packShared(shared))).toEqual(shared);
  });

  it('leaves a link without one exactly as it was', () => {
    const header = new TextDecoder().decode(packShared(GROWN));
    expect(header).not.toContain('"view"');
    expect(unpackShared(packShared(GROWN))).not.toHaveProperty('view');
  });

  it('is dropped by a reader that does not know it', () => {
    const header = { ...HEADER, view: VIEW };
    const old = sharedHeaderSchema.omit({ view: true }).parse(header);
    expect(old).not.toHaveProperty('view');
    expect(old.name).toBe(HEADER.name);
  });

  it('refuses a lens out of range or a number that is not one', () => {
    const lens = bodyOf({ ...HEADER, view: { ...VIEW, fov: 500 } });
    expect(refusal(lens)).toBe('invalid');
    // JSON writes NaN as null.
    const lost = bodyOf({ ...HEADER, view: { ...VIEW, position: [Number.NaN, 0, 0] } });
    expect(refusal(lost)).toBe('invalid');
    expect(refusal(bodyOf({ ...HEADER, view: { ...VIEW, time: 1 } }))).toBe('invalid');
  });
});

describe('unpackShared refuses', () => {
  const packed = packShared(GROWN);

  it('a body cut short anywhere', () => {
    for (let length = 0; length <= 64; length++) {
      expect(refusal(packed.subarray(0, length))).toBe('malformed');
    }
    expect(refusal(packed.subarray(0, packed.length - 1))).toBe('malformed');
  });

  it('bytes past the end', () => {
    expect(refusal(Uint8Array.from([...packed, 0]))).toBe('malformed');
  });

  it('a list longer than its plot could hold', () => {
    const five = [...varint(5), ...varint(0), ...Array.from({ length: 200 }, () => 0)];
    expect(refusal(bodyOf(HEADER, five))).toBe('malformed');
  });

  it('an id index past its table', () => {
    const fine = unpackShared(bodyOf(HEADER, EMPTY_LIST, EMPTY_LIST, onePath(0), EMPTY_LIST));
    expect(fine.world.paths).toHaveLength(1);
    expect(refusal(bodyOf(HEADER, EMPTY_LIST, EMPTY_LIST, onePath(1), EMPTY_LIST))).toBe(
      'malformed',
    );
  });

  it('a header that is not JSON, or not a header', () => {
    expect(refusal(Uint8Array.from(text('{nope')))).toBe('invalid');
    expect(refusal(bodyOf({ ...HEADER, tilesX: 'wide' }))).toBe('invalid');
    expect(refusal(bodyOf({ ...HEADER, tilesX: 100_000 }))).toBe('invalid');
  });

  it('an object the catalogue does not have', () => {
    const [first, ...rest] = GROWN.world.props;
    const world = { ...GROWN.world, props: [{ ...first!, id: 'retired-statue' }, ...rest] };
    expect(refusal(packShared({ ...GROWN, world }))).toBe('invalid');
  });

  it('a layout that does not fit its plot', () => {
    const [first, ...rest] = GROWN.world.placements;
    const off = { ...first!, tileX: GROWN.world.tilesX };
    const world = { ...GROWN.world, placements: [off, ...rest] };
    expect(refusal(packShared({ ...GROWN, world }))).toBe('misfit');
  });

  it('terrain higher than any ground the game makes', () => {
    const terrain = [{ tileX: 3, tileZ: 3, level: 2 ** 40, surface: 'grass' as const }];
    expect(refusal(packShared({ ...GROWN, world: { ...GROWN.world, terrain } }))).toBe('invalid');
  });

  it('a placement far from where its model stands', () => {
    const [first, ...rest] = GROWN.world.placements;
    const moved = { ...first!, x: first!.x + 2 ** 40 };
    const world = { ...GROWN.world, placements: [moved, ...rest] };
    expect(refusal(packShared({ ...GROWN, world }))).toBe('misfit');
  });

  it('a rail laid twice', () => {
    const rails = [GROWN.world.rails[0]!, ...GROWN.world.rails];
    expect(refusal(packShared({ ...GROWN, world: { ...GROWN.world, rails } }))).toBe('misfit');
  });
});

describe('the names a link brings', () => {
  it('are cleaned as the rename fields clean them', () => {
    const [bar, cafe] = GROWN.world.placements;
    const long = 'A very long name for a small bar by the sea';
    const shared = {
      ...GROWN,
      name: '   ',
      names: [
        [bar!.key, '   '],
        [cafe!.key, long],
      ] as const,
    };
    const back = unpackShared(packShared(shared));
    expect(back.names).toEqual([[cafe!.key, long.slice(0, MAX_VENUE_NAME).trimEnd()]]);
    expect(back.name).not.toBe('');
  });
});
