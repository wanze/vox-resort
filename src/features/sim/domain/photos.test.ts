import { describe, expect, it } from 'vitest';
import {
  createPhotos,
  fadePhotoHeat,
  forgetPhotos,
  mayPhoto,
  NEVER,
  notePhoto,
  PHOTO_CHANCE,
  PHOTO_FROM,
  photoChance,
  photoDraw,
  photoMemory,
  restorePhotos,
  snapshotPhotos,
} from './photos';

describe('photos', () => {
  it('lets a guest take one photo every three hours', () => {
    const photos = createPhotos(3, 4);
    expect(mayPhoto(photos, 1, 0)).toBe(true);
    notePhoto(photos, 1, 2, 100);
    expect(mayPhoto(photos, 1, 279)).toBe(false);
    expect(mayPhoto(photos, 1, 280)).toBe(true);
    expect(mayPhoto(photos, 0, 101)).toBe(true);
    forgetPhotos(photos, 1);
    expect(mayPhoto(photos, 1, 101)).toBe(true);
  });

  it('gives no chance below the bar and the whole dial at a perfect view', () => {
    expect(photoChance(PHOTO_FROM - 0.01)).toBe(0);
    expect(photoChance(PHOTO_FROM)).toBe(0);
    expect(photoChance(1)).toBeCloseTo(PHOTO_CHANCE);
    expect(photoChance(1.5)).toBeCloseTo(PHOTO_CHANCE);
  });

  it('remembers each photo of a stay for less than the one before', () => {
    expect(photoMemory(0)).toBeCloseTo(0.01);
    expect(photoMemory(1)).toBeCloseTo(0.005);
  });

  it('draws the same for the same guest, node and tick, and spreads over many', () => {
    expect(photoDraw(3, 40, 900)).toBe(photoDraw(3, 40, 900));
    let sum = 0;
    for (let at = 0; at < 10_000; at++) sum += photoDraw(at % 97, at % 31, at);
    expect(sum / 10_000).toBeGreaterThan(0.45);
    expect(sum / 10_000).toBeLessThan(0.55);
  });

  it('counts heat per node and halves it every morning', () => {
    const photos = createPhotos(2, 3);
    notePhoto(photos, 0, 2, 10);
    notePhoto(photos, 1, 2, 10);
    fadePhotoHeat(photos);
    expect(Array.from(photos.heat)).toEqual([0, 0, 1]);
  });

  it('restores nobody having taken a photo without a snapshot', () => {
    const photos = createPhotos(3, 2);
    notePhoto(photos, 0, 1, 50);
    restorePhotos(photos, undefined);
    expect(Array.from(photos.lastAt)).toEqual([NEVER, NEVER, NEVER]);
    expect(Array.from(photos.heat)).toEqual([0, 0]);
  });

  it('pads a shorter save and drops a heat of another network', () => {
    const saved = createPhotos(2, 5);
    notePhoto(saved, 1, 4, 70);
    const photos = createPhotos(4, 3);
    restorePhotos(photos, snapshotPhotos(saved));
    expect(Array.from(photos.lastAt)).toEqual([NEVER, 70, NEVER, NEVER]);
    expect(Array.from(photos.heat)).toEqual([0, 0, 0]);
  });
});
