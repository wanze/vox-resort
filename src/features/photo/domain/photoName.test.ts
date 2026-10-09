import { describe, expect, it } from 'vitest';
import { photoFileName } from './photoName';

const at = (hours: number, minutes = 0): number => (hours + minutes / 60) / 24;

describe('photoFileName', () => {
  it('names the resort, the day and the time', () => {
    expect(photoFileName('Golfo del Sole', 69, at(21, 15))).toBe(
      'vox-resort-golfo-del-sole-day-69-2115.png',
    );
  });

  it('drops accents and turns punctuation into one dash', () => {
    expect(photoFileName("Côte d'Été", 3, at(9))).toBe('vox-resort-cote-d-ete-day-3-0900.png');
  });

  it('falls back to "resort" for a name of only punctuation', () => {
    expect(photoFileName('?!… ***', 1, at(12))).toBe('vox-resort-resort-day-1-1200.png');
  });

  it('cuts a long name to forty characters', () => {
    const name = photoFileName('Sunny Bay '.repeat(20), 2, at(12));
    const slug = name.replace('vox-resort-', '').replace('-day-2-1200.png', '');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('writes midnight as 0000', () => {
    expect(photoFileName('Bay', 1, 0)).toBe('vox-resort-bay-day-1-0000.png');
  });
});
