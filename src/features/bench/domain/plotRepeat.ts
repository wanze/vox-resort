/**
 * Tiles the laid-out resort into a larger one, for measurement.
 *
 * The whole point of the culling and merging work is a resort several times the
 * size of the authored plot, and there is no honest way to claim that without
 * rendering one. Repeating the plot `n` times on each axis gives a scene with
 * `n²` times the instances, lamps and area, laid out exactly as the real one is
 * — the same density of buildings, the same spacing of lamps — which is a fair
 * stand-in for a plan that had simply been drawn bigger.
 *
 * This is a benchmark scaffold, reached only through `?bench=1&repeat=n`. It is
 * pure so that the key rewriting, which is what stops the copies from colliding,
 * can be checked without a renderer.
 */

export interface Repeatable {
  readonly key: string;
  readonly x: number;
  readonly z: number;
}

/**
 * `copies x copies` tiles of the given items, the original first.
 *
 * Keys are suffixed per tile so every placement stays unique, which the light
 * anchors and the label map both depend on.
 */
export function repeatPlot<T extends Repeatable>(
  items: readonly T[],
  copies: number,
  spanX: number,
  spanZ: number,
): T[] {
  if (!Number.isInteger(copies) || copies < 1) {
    throw new Error(`A plot cannot be repeated ${copies} times`);
  }
  if (copies === 1) return [...items];

  const repeated: T[] = [];
  for (let tileZ = 0; tileZ < copies; tileZ++) {
    for (let tileX = 0; tileX < copies; tileX++) {
      const first = tileX === 0 && tileZ === 0;
      for (const item of items) {
        repeated.push(
          first
            ? item
            : {
                ...item,
                key: `${item.key}~${tileX},${tileZ}`,
                x: item.x + tileX * spanX,
                z: item.z + tileZ * spanZ,
              },
        );
      }
    }
  }
  return repeated;
}
