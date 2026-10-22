import { describe, expect, it } from 'vitest';
import { photoCaption } from './photoCaption';

describe('photoCaption', () => {
  it('names the resort over the hour it was taken at and the site', () => {
    expect(photoCaption('Golfo del Sole', (21 + 15 / 60) / 24)).toEqual({
      title: 'Golfo del Sole',
      detail: '21:15 · vox-resort.com',
    });
  });
});
