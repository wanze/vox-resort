import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { ROTATIONS, type Rotation } from '../../layout/domain/rotation';
import type { TerrainEdit } from '../../layout/domain/terrain';
import { cleanName, cleanResortName, resortNameFor } from '../../naming/domain/resortName';
import { MAX_VENUE_NAME } from '../../naming/domain/venueNames';
import { TERRAIN_SPREAD } from '../../rendering/domain/terrainSurface';
import { savedWorldSchema } from '../../resort-prep/domain/savedWorld';
import { sharedHeaderSchema, type SharedHeader, type SharedResort } from './sharedResort';
import { worldMisfits } from './worldFits';

export type ShareFailure = 'malformed' | 'invalid' | 'misfit' | 'too-big';

// The detail is for the console only: a player can do nothing with a zod path.
export class ShareError extends Error {
  readonly reason: ShareFailure;
  readonly detail: readonly string[];

  constructor(reason: ShareFailure, detail: readonly string[] = []) {
    super(`The resort link is ${reason}`);
    this.name = 'ShareError';
    this.reason = reason;
    this.detail = detail;
  }
}

const SURFACES = ['grass', 'sand', 'water'] as const;

// Zig-zag doubles a number, which must stay a safe integer to come back exact.
const LARGEST = 2 ** 52;
const LONGEST_VARINT = 8;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder('utf-8', { fatal: true });

interface Writer {
  int(value: number): void;
  raw(bytes: Uint8Array): void;
  text(value: string): void;
  done(): Uint8Array;
}

function writer(): Writer {
  let bytes = new Uint8Array(4096);
  let length = 0;
  const room = (extra: number): void => {
    if (length + extra <= bytes.length) return;
    const grown = new Uint8Array(Math.max(bytes.length * 2, length + extra));
    grown.set(bytes.subarray(0, length));
    bytes = grown;
  };
  const raw = (more: Uint8Array): void => {
    room(more.length);
    bytes.set(more, length);
    length += more.length;
  };
  const int = (value: number): void => {
    if (!Number.isSafeInteger(value) || Math.abs(value) > LARGEST) {
      throw new Error(`${value} is not an integer a link can carry`);
    }
    room(LONGEST_VARINT);
    let rest = value >= 0 ? value * 2 : -value * 2 - 1;
    while (rest >= 0x80) {
      bytes[length++] = (rest % 0x80) + 0x80;
      rest = Math.floor(rest / 0x80);
    }
    bytes[length++] = rest;
  };
  return {
    int,
    raw,
    text(value) {
      const encoded = ENCODER.encode(value);
      int(encoded.length);
      raw(encoded);
    },
    done: () => bytes.slice(0, length),
  };
}

interface Reader {
  int(): number;
  // At most `most`, and never more than the bytes left: every entry takes at least one.
  count(most: number): number;
  raw(length: number): Uint8Array;
  text(): string;
  end(): void;
}

const malformed = (why: string): ShareError => new ShareError('malformed', [why]);

function reader(bytes: Uint8Array): Reader {
  let at = 0;
  const left = (): number => bytes.length - at;
  const int = (): number => {
    let value = 0;
    for (let step = 0; step < LONGEST_VARINT; step++) {
      if (at >= bytes.length) throw malformed('the body ends early');
      const byte = bytes[at++]!;
      value += (byte & 0x7f) * 2 ** (7 * step);
      if (byte < 0x80) return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
    }
    throw malformed('a number too long');
  };
  const count = (most: number): number => {
    const value = int();
    if (value < 0 || value > most || value > left()) throw malformed(`a count of ${value}`);
    return value;
  };
  const raw = (length: number): Uint8Array => {
    if (length > left()) throw malformed('the body ends early');
    at += length;
    return bytes.slice(at - length, at);
  };
  return {
    int,
    count,
    raw,
    text() {
      const encoded = raw(count(Number.POSITIVE_INFINITY));
      try {
        return DECODER.decode(encoded);
      } catch {
        throw malformed('text that is not UTF-8');
      }
    },
    end() {
      if (left() > 0) throw malformed(`${left()} bytes past the end`);
    },
  };
}

function writeDeltas(out: Writer, values: readonly number[]): void {
  let previous = 0;
  for (const value of values) {
    out.int(value - previous);
    previous = value;
  }
}

function readColumn(input: Reader, count: number): number[] {
  return Array.from({ length: count }, () => input.int());
}

function readDeltas(input: Reader, count: number): number[] {
  let previous = 0;
  return readColumn(input, count).map((delta) => (previous += delta));
}

function writeTerrain(out: Writer, edits: readonly TerrainEdit[]): void {
  out.int(edits.length);
  writeDeltas(
    out,
    edits.map((edit) => edit.tileZ),
  );
  writeDeltas(
    out,
    edits.map((edit) => edit.tileX),
  );
  for (const edit of edits) out.int(edit.level);
  for (const edit of edits) out.int(SURFACES.indexOf(edit.surface));
}

function readTerrain(input: Reader, most: number): TerrainEdit[] {
  const count = input.count(most);
  const tileZ = readDeltas(input, count);
  const tileX = readDeltas(input, count);
  const level = readColumn(input, count);
  return readColumn(input, count).map((index, at) => {
    const surface = SURFACES[index];
    if (surface === undefined) throw malformed(`a surface ${index}`);
    return { tileX: tileX[at]!, tileZ: tileZ[at]!, level: level[at]!, surface };
  });
}

const tileKeyOf = (entry: Placement): string => `${entry.id}@${entry.tileX},${entry.tileZ}`;

// Forms rather than the keys themselves: nearly every key is its id and tile, a rail's its turn.
const TILE_KEY = 0;
const TURNED_KEY = 1;
const LITERAL_KEY = 2;

function keyFormOf(entry: Placement): number {
  const tileKey = tileKeyOf(entry);
  if (entry.key === tileKey) return TILE_KEY;
  return entry.key === `${tileKey}:${entry.rotation}` ? TURNED_KEY : LITERAL_KEY;
}

// Column by column, as deflate finds a run of zeros far better than interleaved records.
function writeList(out: Writer, list: readonly Placement[]): void {
  const ids = [...new Set(list.map((entry) => entry.id))];
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  out.int(list.length);
  out.int(ids.length);
  for (const id of ids) out.text(id);
  const column = (value: (entry: Placement) => number): void => {
    for (const entry of list) out.int(value(entry));
  };
  column((entry) => indexOf.get(entry.id)!);
  writeDeltas(
    out,
    list.map((entry) => entry.tileZ),
  );
  writeDeltas(
    out,
    list.map((entry) => entry.tileX),
  );
  column((entry) => entry.tilesX);
  column((entry) => entry.tilesZ);
  column((entry) => entry.rotation);
  column((entry) => entry.x - entry.tileX * TILE_VOXELS);
  column((entry) => entry.z - entry.tileZ * TILE_VOXELS);
  column((entry) => entry.y);
  column((entry) => entry.width);
  column((entry) => entry.depth);
  const forms = list.map(keyFormOf);
  for (const form of forms) out.int(form);
  list.forEach((entry, at) => {
    if (forms[at] === LITERAL_KEY) out.text(entry.key);
  });
}

const isRotation = (value: number): value is Rotation => ROTATIONS.includes(value as Rotation);

function readList(input: Reader, most: number): Placement[] {
  const count = input.count(most);
  const ids = Array.from({ length: input.count(count) }, () => input.text());
  const idIndex = readColumn(input, count);
  const tileZ = readDeltas(input, count);
  const tileX = readDeltas(input, count);
  const [tilesX, tilesZ, rotation, offsetX, offsetZ, y, width, depth, form] = Array.from(
    { length: 9 },
    () => readColumn(input, count),
  ) as [number[], number[], number[], number[], number[], number[], number[], number[], number[]];
  return idIndex.map((index, at) => {
    const id = ids[index];
    const turn = rotation[at]!;
    if (id === undefined) throw malformed(`an id index ${index}`);
    if (!isRotation(turn)) throw malformed(`a rotation ${turn}`);
    const entry = {
      key: '',
      id,
      tileX: tileX[at]!,
      tileZ: tileZ[at]!,
      tilesX: tilesX[at]!,
      tilesZ: tilesZ[at]!,
      rotation: turn,
      x: tileX[at]! * TILE_VOXELS + offsetX[at]!,
      z: tileZ[at]! * TILE_VOXELS + offsetZ[at]!,
      y: y[at]!,
      width: width[at]!,
      depth: depth[at]!,
    };
    const keyForm = form[at]!;
    if (keyForm === TILE_KEY) entry.key = tileKeyOf(entry);
    else if (keyForm === TURNED_KEY) entry.key = `${tileKeyOf(entry)}:${turn}`;
    else if (keyForm === LITERAL_KEY) entry.key = input.text();
    else throw malformed(`a key form ${keyForm}`);
    return entry;
  });
}

function headerOf(text: string): SharedHeader {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ShareError('invalid', ['a header that is not JSON']);
  }
  const parsed = sharedHeaderSchema.safeParse(json);
  if (!parsed.success) throw new ShareError('invalid', issuesOf(parsed.error.issues));
  return parsed.data;
}

const issuesOf = (
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): string[] => issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);

// Every placement field is written, even those that look derivable, and in order: a key cannot
// always be derived, a rail sits off its tile and fleets follow placement order.
export function packShared(shared: SharedResort): Uint8Array {
  const { world } = shared;
  const out = writer();
  out.text(
    JSON.stringify({
      tilesX: world.tilesX,
      tilesZ: world.tilesZ,
      shore: world.shore,
      elevation: world.elevation,
      land: world.land ? { parcelsX: world.land.parcelsX, parcelsZ: world.land.parcelsZ } : null,
      params: shared.params,
      name: shared.name,
      names: shared.names,
    }),
  );
  if (world.land) out.raw(world.land.owned);
  writeTerrain(out, world.terrain);
  for (const list of [world.placements, world.props, world.paths, world.rails]) {
    writeList(out, list);
  }
  return out.done();
}

function namesOf(header: SharedHeader): (readonly [string, string])[] {
  return header.names.flatMap(([key, typed]) => {
    const name = cleanName(typed, MAX_VENUE_NAME);
    return name === null ? [] : [[key, name] as const];
  });
}

// A link is the first way data from outside reaches a world, so it is checked past its shape.
export function unpackShared(bytes: Uint8Array): SharedResort {
  const input = reader(bytes);
  const header = headerOf(input.text());
  const { land } = header;
  const owned = land ? input.raw(land.parcelsX * land.parcelsZ) : null;
  const tiles = header.tilesX * header.tilesZ;
  // Edits reach past the plot as far as the terrain is drawn.
  const terrain = readTerrain(input, tiles * TERRAIN_SPREAD ** 2);
  const [placements, props, paths, rails] = Array.from({ length: 4 }, () =>
    readList(input, tiles * 4),
  );
  input.end();
  const parsed = savedWorldSchema.safeParse({
    tilesX: header.tilesX,
    tilesZ: header.tilesZ,
    shore: header.shore,
    elevation: header.elevation,
    terrain,
    placements,
    props,
    paths,
    rails,
    ...(land && owned ? { land: { ...land, owned } } : {}),
  });
  if (!parsed.success) throw new ShareError('invalid', issuesOf(parsed.error.issues));
  const misfits = worldMisfits(parsed.data);
  if (misfits.length > 0) throw new ShareError('misfit', misfits);
  return {
    world: parsed.data,
    params: header.params,
    name: cleanResortName(header.name) ?? resortNameFor(header.params.seed),
    names: namesOf(header),
  };
}
