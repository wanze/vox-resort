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
  readonly indices: Int32Array;
}

const floorDiv = (value: number, size: number): number => Math.floor(value / size);

// Each axis is offset by 2^16 and given 17 bits, so the 51-bit key stays exact in a double.
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

// Allocates nothing per write: this walks about three quarters of a million of them.
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

// A counting sort, so the writes inside each section keep the order they are painted in.
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
