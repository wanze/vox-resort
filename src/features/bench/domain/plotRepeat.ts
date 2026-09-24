export interface Repeatable {
  readonly key: string;
  readonly x: number;
  readonly z: number;
}

// Keys are suffixed per copy because the light anchors and the label map need unique keys.
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
