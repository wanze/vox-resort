/**
 * Which of the resort's lights are worth switching on.
 *
 * The plan puts a few hundred lights on the plot — every street lamp, every
 * torch, the pool floods — and a renderer that tried to evaluate all of them per
 * fragment would fall over. Only the handful nearest the camera actually change
 * what anyone sees, so the scene keeps a small pool of point lights and this
 * module decides which anchors they are pointed at.
 */

export interface LightAnchor {
  /** Placement key the light belongs to, unique across the resort. */
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: number;
  /** Intensity at full strength, before the day/night factor. */
  readonly intensity: number;
  /** Falloff distance in voxels. */
  readonly distance: number;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const distanceSquared = (anchor: LightAnchor, point: Point3): number =>
  (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2 + (anchor.z - point.z) ** 2;

/**
 * The `limit` anchors closest to `point`, nearest first. Ties break on the
 * anchor key so the same camera position always lights the same lamps.
 */
export function nearestAnchors(
  anchors: readonly LightAnchor[],
  point: Point3,
  limit: number,
): LightAnchor[] {
  if (limit <= 0) return [];
  return anchors
    .map((anchor) => ({ anchor, distance: distanceSquared(anchor, point) }))
    .toSorted((a, b) => a.distance - b.distance || (a.anchor.key < b.anchor.key ? -1 : 1))
    .slice(0, limit)
    .map((entry) => entry.anchor);
}
