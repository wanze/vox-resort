import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export type Run = 'x' | 'z';

export interface ArcadeOptions {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly y: number;
  readonly along: Run;
  readonly bays: number;
  readonly pier?: number;
  readonly height?: number;
  readonly rise?: number;
  readonly wall?: Ramp;
  readonly trim?: Ramp;
  readonly skirting?: number;
}

type Bay = readonly [number, number];

// Piers stay exactly `pier` wide and the bays absorb the remainder: an uneven bay
// does not show on a whitewashed elevation, an uneven pier does.
function baySpans(length: number, pier: number, bays: number): readonly Bay[] {
  const pitch = (length - pier) / bays;
  if (Math.round(pitch) - pier < 1) {
    throw new Error(`An arcade ${length} long has no room for ${bays} bays past its piers`);
  }
  return Array.from({ length: bays }, (_, bay): Bay => [
    Math.round(bay * pitch) + pier,
    Math.round((bay + 1) * pitch) - 1,
  ]);
}

// A half-ellipse head, sampled per course: stepping a voxel a course reads as a gable.
function carveBay(
  clear: (column: number, y: number) => void,
  [from, to]: Bay,
  y: number,
  springing: number,
  rise: number,
): void {
  const half = (to - from + 1) / 2;
  const centre = from + half;
  for (let column = from; column <= to; column++) {
    for (let layer = y; layer < springing; layer++) clear(column, layer);
  }
  for (let course = 0; course < rise; course++) {
    const halfWidth = half * Math.sqrt(1 - ((course + 1) / (rise + 0.5)) ** 2);
    for (let column = from; column <= to; column++) {
      if (Math.abs(column + 0.5 - centre) < halfWidth) clear(column, springing + course);
    }
  }
}

export function arcade(b: VoxelBuilder, o: ArcadeOptions): number {
  const alongX = o.along === 'x';
  const length = alongX ? o.w : o.d;
  const across = alongX ? o.d : o.w;
  const pier = o.pier ?? 3;
  const height = o.height ?? 8;
  if (o.bays < 1) throw new Error('An arcade has at least one bay');
  if (pier < 1) throw new Error('An arcade stands on piers at least one voxel wide');
  if (across < 1) throw new Error('An arcade is at least one voxel deep');
  if (height < 1) throw new Error('An arcade has at least one clear layer under its arches');

  const bays = baySpans(length, pier, o.bays);
  const [from, to] = bays[0]!;
  // A third of the bay, not half: a small bay has few distinct widths, and rising
  // further repeats a width and reads as a stilted arch.
  const rise = o.rise ?? Math.max(1, Math.floor((to - from + 2) / 3));

  const wall = o.wall ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.stone;
  const skirting = o.skirting ?? 2;
  const runOrigin = alongX ? o.x : o.z;
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;
  const springing = o.y + height;
  const crown = springing + rise;

  const course = (y: number, color: Color): void => b.box(o.x, x1, y, y, o.z, z1, color);

  const clear = (column: number, y: number): void => {
    for (let cross = 0; cross < across; cross++) {
      const x = alongX ? runOrigin + column : o.x + cross;
      const z = alongX ? o.z + cross : runOrigin + column;
      b.del(x, y, z);
    }
  };

  b.box(o.x, x1, o.y, crown, o.z, z1, wall.base);
  for (let layer = o.y; layer < o.y + skirting; layer++) course(layer, trim.base);
  course(springing - 1, trim.light);
  for (const bay of bays) carveBay(clear, bay, o.y, springing, rise);
  course(crown + 1, wall.light);
  return crown + 2;
}

export interface BalustradeOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly w: number;
  readonly along: Run;
  readonly depth?: number;
  readonly height?: number;
  readonly pitch?: number;
  readonly rail?: Ramp;
}

// The gaps are real geometry so the fence reads as see-through. Every baluster costs
// four unmergeable quads, so buildings placed often want a wider `pitch`.
export function balustrade(b: VoxelBuilder, o: BalustradeOptions): void {
  const height = o.height ?? 4;
  const depth = o.depth ?? 1;
  const pitch = o.pitch ?? 2;
  if (o.w < 1) throw new Error('A balustrade is at least one voxel long');
  if (depth < 1) throw new Error('A balustrade is at least one voxel deep');
  if (height < 3) throw new Error('A balustrade is a rail, a baluster and a coping: three layers');
  if (pitch < 1) throw new Error('A balustrade sets its balusters at least a voxel apart');

  const rail = o.rail ?? PALETTE.stone;
  const top = o.y + height - 1;

  const paint = (step: number, y0: number, y1: number, color: Color): void => {
    for (let cross = 0; cross < depth; cross++) {
      const x = o.along === 'x' ? o.x + step : o.x + cross;
      const z = o.along === 'z' ? o.z + step : o.z + cross;
      b.box(x, x, y0, y1, z, z, color);
    }
  };

  for (let step = 0; step < o.w; step++) {
    paint(step, o.y, o.y, rail.shade);
    paint(step, top, top, rail.light);
    if (step % pitch === 0 || step === o.w - 1) paint(step, o.y + 1, top - 1, rail.base);
  }
}
