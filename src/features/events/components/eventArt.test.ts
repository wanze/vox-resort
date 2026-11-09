import { describe, expect, it } from 'vitest';
import { INKS } from '../../../shared/components/pixelIcons';
import { EVENT_KIND_IDS } from '../domain/catalogue';
import { CATEGORY_OF, FLYER_CATEGORIES, MOTIF_ROWS } from './eventArt';

describe('event flyer motifs', () => {
  it.each(Object.entries(MOTIF_ROWS))('draws %s on a 16 by 16 grid', (_, rows) => {
    expect(rows).toHaveLength(16);
    for (const row of rows) expect(row).toHaveLength(16);
  });

  it.each(Object.entries(MOTIF_ROWS))('paints %s only in the kit inks', (_, rows) => {
    const inks = new Set(rows.join('').replaceAll('.', ''));
    for (const ink of inks) expect(INKS).toHaveProperty(ink);
  });

  it('gives every kind of event a category, and every category a kind', () => {
    for (const kind of EVENT_KIND_IDS) expect(FLYER_CATEGORIES).toContain(CATEGORY_OF[kind]);
    expect(new Set(Object.values(CATEGORY_OF))).toEqual(new Set(FLYER_CATEGORIES));
  });
});
