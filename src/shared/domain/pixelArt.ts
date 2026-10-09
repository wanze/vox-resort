export interface PixelRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly ink: string;
}

export interface PixelArt {
  readonly width: number;
  readonly height: number;
  readonly runs: readonly PixelRun[];
}

const CLEAR = '.';

// One rectangle per horizontal run rather than per pixel: a toolbar of icons stays a few hundred nodes.
export function pixelArt(rows: readonly string[]): PixelArt {
  const runs: PixelRun[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ink = row.charAt(x);
      let end = x + 1;
      while (end < row.length && row.charAt(end) === ink) end += 1;
      if (ink !== CLEAR) runs.push({ x, y, width: end - x, ink });
      x = end;
    }
  });
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  return { width, height: rows.length, runs };
}
