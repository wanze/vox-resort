export const GLYPH_ROWS = 5;

// Row 0 is the top. '#' is set and '.' clear. Three wide where a letter allows, so a short
// name sets at the largest pixel the board's height allows.
export const SIGN_GLYPHS: { readonly [glyph: string]: readonly string[] } = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  // With the gaps either side, three clear columns: a word apart, not a letter.
  ' ': ['.', '.', '.', '.', '.'],
  '&': ['.#..', '#.#.', '.#..', '#.#.', '.#.#'],
  "'": ['#', '#', '.', '.', '.'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
};

export interface SetLine {
  readonly width: number;
  readonly height: typeof GLYPH_ROWS;
  // width × height, row by row from the top; 1 is set.
  readonly cells: Uint8Array;
}

// Accents are dropped rather than drawn: a mark above a 5-pixel capital has no room to read.
export function glyphsOf(text: string): readonly string[] {
  const glyphs = [...text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()].map((char) =>
    char in SIGN_GLYPHS ? char : ' ',
  );
  const first = glyphs.findIndex((glyph) => glyph !== ' ');
  if (first < 0) return [];
  const last = glyphs.findLastIndex((glyph) => glyph !== ' ');
  return glyphs.slice(first, last + 1);
}

export function setLine(text: string): SetLine {
  const glyphs = glyphsOf(text).map((glyph) => SIGN_GLYPHS[glyph]!);
  const width = Math.max(0, glyphs.reduce((total, rows) => total + rows[0]!.length + 1, 0) - 1);
  const cells = new Uint8Array(width * GLYPH_ROWS);
  let left = 0;
  for (const rows of glyphs) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#') cells[y * width + left + x] = 1;
      }
    });
    left += rows[0]!.length + 1;
  }
  return { width, height: GLYPH_ROWS, cells };
}
