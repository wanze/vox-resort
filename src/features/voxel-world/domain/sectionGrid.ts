/**
 * Pure voxel-space arithmetic mirroring DVE's sector/section subdivision.
 *
 * DVE stores voxels in sectors, which are subdivided into cubic sections; the
 * mesher runs per section. These helpers work out which sectors have to exist
 * and which sections have to be meshed, without touching the engine.
 *
 * Both walk the packed positions of three quarters of a million writes, so
 * neither builds anything per write: a volume is named by a number rather than
 * an origin object and a string key, and a section's writes are a view of
 * indices rather than an array of objects.
 */

export interface VolumeSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelOrigin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SectionBucket {
  readonly origin: VoxelOrigin;
  /** Indices of the writes this section owns, in the order they were written. */
  readonly indices: Int32Array;
}

const floorDiv = (value: number, size: number): number => Math.floor(value / size);

/**
 * How far from zero a volume index may be before it cannot be named by one
 * number. Each axis is offset by this and given 17 bits, so the three together
 * take 51 and stay exact in a double. At DVE's smallest section that is a world
 * a million voxels across, which is a hundred times the one the scratch layout
 * paints into.
 */
const KEY_OFFSET = 1 << 16;
const KEY_SPAN = 2 ** 17;

const keyable = (index: number): boolean => index >= -KEY_OFFSET && index < KEY_OFFSET;

function volumeKey(ix: number, iy: number, iz: number): number {
  if (!keyable(ix) || !keyable(iy) || !keyable(iz)) {
    throw new Error(`Volume ${ix},${iy},${iz} is too far from the origin to key`);
  }
  return ((ix + KEY_OFFSET) * KEY_SPAN + (iy + KEY_OFFSET)) * KEY_SPAN + (iz + KEY_OFFSET);
}

function assertPositive(size: VolumeSize): void {
  if (size.x < 1 || size.y < 1 || size.z < 1) {
    throw new Error('Volume size must be positive on every axis');
  }
}

/**
 * Walks packed x, y, z positions, handing each write's index to `visit` along
 * with the key of the volume that holds it and that volume's index on each axis.
 */
function forEachVolume(
  positions: Int32Array,
  size: VolumeSize,
  visit: (write: number, key: number, ix: number, iy: number, iz: number) => void,
): void {
  assertPositive(size);
  for (let write = 0; write * 3 < positions.length; write++) {
    const ix = floorDiv(positions[write * 3]!, size.x);
    const iy = floorDiv(positions[write * 3 + 1]!, size.y);
    const iz = floorDiv(positions[write * 3 + 2]!, size.z);
    visit(write, volumeKey(ix, iy, iz), ix, iy, iz);
  }
}

/** Distinct volume origins touched by the given positions, in first-touch order. */
export function originsFor(positions: Int32Array, size: VolumeSize): readonly VoxelOrigin[] {
  const seen = new Set<number>();
  const origins: VoxelOrigin[] = [];
  forEachVolume(positions, size, (_, key, ix, iy, iz) => {
    if (seen.has(key)) return;
    seen.add(key);
    origins.push({ x: ix * size.x, y: iy * size.y, z: iz * size.z });
  });
  return origins;
}

/**
 * Groups writes by the section that owns them, so each section is loaded once.
 *
 * A counting sort: one pass finds each write's section and how many writes each
 * section holds, the second drops every index into its section's slot of one
 * shared array. Sections come out in first-touch order and the writes inside
 * each in the order they were made, which is the order they are painted in.
 */
export function groupBySection(
  positions: Int32Array,
  sectionSize: VolumeSize,
): readonly SectionBucket[] {
  const sectionOf = new Int32Array(positions.length / 3);
  const sectionByKey = new Map<number, number>();
  const origins: VoxelOrigin[] = [];
  const counts: number[] = [];
  forEachVolume(positions, sectionSize, (write, key, ix, iy, iz) => {
    let section = sectionByKey.get(key);
    if (section === undefined) {
      section = origins.length;
      sectionByKey.set(key, section);
      origins.push({ x: ix * sectionSize.x, y: iy * sectionSize.y, z: iz * sectionSize.z });
      counts.push(0);
    }
    sectionOf[write] = section;
    counts[section]!++;
  });

  const starts = new Int32Array(origins.length);
  for (let section = 1; section < origins.length; section++) {
    starts[section] = starts[section - 1]! + counts[section - 1]!;
  }
  const order = new Int32Array(sectionOf.length);
  const cursors = starts.slice();
  for (let write = 0; write < sectionOf.length; write++) {
    order[cursors[sectionOf[write]!]!++] = write;
  }
  return origins.map((origin, section) => ({
    origin,
    indices: order.subarray(starts[section]!, starts[section]! + counts[section]!),
  }));
}
