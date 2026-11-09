import { describe, expect, it } from 'vitest';
import { INKS } from '../../../shared/components/pixelIcons';
import { LOGO_ROWS } from './operatorArt';

describe('operator logos', () => {
  it.each(Object.entries(LOGO_ROWS))('draws %s on a 16 by 16 grid', (_, rows) => {
    expect(rows).toHaveLength(16);
    for (const row of rows) expect(row).toHaveLength(16);
  });

  it.each(Object.entries(LOGO_ROWS))('paints %s only in the kit inks', (_, rows) => {
    const inks = new Set(rows.join('').replaceAll('.', ''));
    for (const ink of inks) expect(INKS).toHaveProperty(ink);
  });
});
