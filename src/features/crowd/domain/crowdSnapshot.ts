import { z } from 'zod';

const float32 = z.instanceof(Float32Array);
const int32 = z.instanceof(Int32Array);
const uint8 = z.instanceof(Uint8Array);

// `rate` is +Infinity on a zero-length segment, which JSON would turn into null; the columns
// stay typed arrays for that reason as much as for size.
export const crowdSnapshotSchema = z.object({
  x: float32,
  y: float32,
  z: float32,
  heading: float32,
  phase: float32,
  fromX: float32,
  fromY: float32,
  fromZ: float32,
  toX: float32,
  toY: float32,
  toZ: float32,
  t: float32,
  rate: float32,
  speed: float32,
  node: int32,
  cameFrom: int32,
  gate: int32,
  seat: int32,
  holdPose: uint8,
  offPlot: uint8,
  dirX: float32,
  dirZ: float32,
  side: float32,
  pace: float32,
  lane: uint8,
  seatBy: int32,
  random: z.number().int(),
});

export type CrowdSnapshot = z.infer<typeof crowdSnapshotSchema>;

// Everything but `variant`, which the art decides, and the avoidance's scratch cells.
export const PER_BODY_COLUMNS = [
  'x',
  'y',
  'z',
  'heading',
  'phase',
  'fromX',
  'fromY',
  'fromZ',
  'toX',
  'toY',
  'toZ',
  't',
  'rate',
  'speed',
  'node',
  'cameFrom',
  'gate',
  'seat',
  'holdPose',
  'offPlot',
  'dirX',
  'dirZ',
  'side',
  'pace',
  'lane',
] as const satisfies readonly (keyof CrowdSnapshot)[];

export function crowdPerBody(snapshot: CrowdSnapshot): readonly ArrayLike<unknown>[] {
  return PER_BODY_COLUMNS.map((name) => snapshot[name]);
}
