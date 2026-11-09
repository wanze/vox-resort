// Ink letters of the pixel icons: a dark glass outline, an empty tube and the column's colour.
const GLASS = 'D';
const EMPTY = 'g';

export const TUBE_ROWS = 10;

// Cold blue for a glum resort, warm red for a happy one, as the column rises.
function columnInk(level: number): string {
  if (level < 1 / 3) return 'b';
  return level < 2 / 3 ? 'o' : 'r';
}

const clamp = (level: number): number => Math.min(1, Math.max(0, level));

// Rows for pixelArt: a tube with ticks on every other row over a full bulb.
export function thermometerRows(level: number): readonly string[] {
  const ink = columnInk(clamp(level));
  const filled = Math.round(clamp(level) * TUBE_ROWS);
  const tube = Array.from({ length: TUBE_ROWS }, (_, row) => {
    const fill = TUBE_ROWS - row <= filled ? ink : EMPTY;
    const tick = row % 2 === 1 ? GLASS : '.';
    return `.${GLASS}${EMPTY}${fill}${EMPTY}${GLASS}${tick}`;
  });
  const bulb = [
    `.${GLASS}${ink.repeat(3)}${GLASS}.`,
    ...Array(3).fill(`${GLASS}${ink.repeat(5)}${GLASS}`),
  ];
  return [
    `..${GLASS.repeat(3)}..`,
    ...tube,
    ...bulb,
    `.${GLASS}${ink.repeat(3)}${GLASS}.`,
    `..${GLASS.repeat(3)}..`,
  ];
}
