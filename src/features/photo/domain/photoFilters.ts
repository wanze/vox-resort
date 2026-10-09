// Row-major 4x5, as feColorMatrix reads it: R, G, B and A rows, each with an offset in 0..1.
export type ColorMatrix = readonly number[];

export type PhotoFilterId = 'none' | 'warm' | 'faded' | 'mono';

export interface PhotoFilter {
  readonly label: string;
  readonly matrix: ColorMatrix;
}

const WARM = { red: 1.08, green: 1, blue: 0.88, lift: 0.02 } as const;
const FADED = { keep: 0.85, lift: 0.08 } as const;
// Rec. 709, the same weights the sRGB primaries are defined by.
const LUMA = { red: 0.2126, green: 0.7152, blue: 0.0722 } as const;

const ALPHA_ROW = [0, 0, 0, 1, 0];

const rows = (red: number[], green: number[], blue: number[]): ColorMatrix => [
  ...red,
  ...green,
  ...blue,
  ...ALPHA_ROW,
];

const IDENTITY = rows([1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0]);

const lumaRow = [LUMA.red, LUMA.green, LUMA.blue, 0, 0];

export const PHOTO_FILTERS: { readonly [id in PhotoFilterId]: PhotoFilter } = {
  none: { label: 'None', matrix: IDENTITY },
  warm: {
    label: 'Warm',
    matrix: rows(
      [WARM.red, 0, 0, 0, WARM.lift],
      [0, WARM.green, 0, 0, WARM.lift / 2],
      [0, 0, WARM.blue, 0, 0],
    ),
  },
  faded: {
    label: 'Faded',
    matrix: rows(
      [FADED.keep, 0, 0, 0, FADED.lift],
      [0, FADED.keep, 0, 0, FADED.lift],
      [0, 0, FADED.keep, 0, FADED.lift],
    ),
  },
  mono: { label: 'Mono', matrix: rows(lumaRow, lumaRow, lumaRow) },
};

export const PHOTO_FILTER_IDS = Object.keys(PHOTO_FILTERS) as PhotoFilterId[];

const isIdentity = (matrix: ColorMatrix): boolean =>
  matrix.every((value, index) => value === IDENTITY[index]);

// The alpha row is left out on purpose: a photo is opaque, and a filter must never punch through.
export function applyFilter(data: Uint8ClampedArray, matrix: ColorMatrix): void {
  if (isIdentity(matrix)) return;
  for (let at = 0; at < data.length; at += 4) {
    const r = data[at]!;
    const g = data[at + 1]!;
    const b = data[at + 2]!;
    const a = data[at + 3]!;
    for (let channel = 0; channel < 3; channel++) {
      const row = channel * 5;
      data[at + channel] =
        matrix[row]! * r +
        matrix[row + 1]! * g +
        matrix[row + 2]! * b +
        matrix[row + 3]! * a +
        matrix[row + 4]! * 255;
    }
  }
}

export function svgValuesOf(matrix: ColorMatrix): string {
  return matrix.join(' ');
}
