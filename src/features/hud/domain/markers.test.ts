import { describe, expect, it } from 'vitest';
import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { MAX_MARKERS, adviceAt, markerIconOf, markersOf } from './markers';

const advice = (kind: AdviceKind, tileX = 0, tileZ = 0): Advice => ({
  kind,
  weight: 0.9,
  subject: kind,
  count: 1,
  at: { tileX, tileZ },
  need: null,
});

describe('markersOf', () => {
  it('drops the kinds that are design notes rather than problems', () => {
    expect(
      markersOf([advice('unvisited'), advice('far-from-home', 1), advice('closed', 2)]),
    ).toEqual([]);
  });

  it('keeps one marker per tile, the louder advice', () => {
    const markers = markersOf([advice('broken', 3, 4), advice('dirty', 3, 4)]);
    expect(markers.map((marker) => marker.icon)).toEqual(['broken']);
  });

  it(`stops at ${MAX_MARKERS} markers, the loudest`, () => {
    const many = Array.from({ length: MAX_MARKERS + 5 }, (_, index) => advice('broken', index));
    const markers = markersOf(many);
    expect(markers).toHaveLength(MAX_MARKERS);
    expect(markers.at(-1)?.at.tileX).toBe(MAX_MARKERS - 1);
  });

  it('gives no marker to advice without a tile', () => {
    expect(markersOf([{ ...advice('littered'), at: null }])).toEqual([]);
  });

  it('maps each marked kind to its icon', () => {
    const kinds: AdviceKind[] = [
      'broken',
      'unreachable',
      'full-lines',
      'dirty',
      'unwatched',
      'littered',
    ];
    const icons = markersOf(kinds.map((kind, index) => advice(kind, index))).map(
      (marker) => marker.icon,
    );
    expect(icons).toEqual(['broken', 'stranded', 'queue', 'dirty', 'lifeguard', 'litter']);
  });

  it('keeps the order of the advice', () => {
    const markers = markersOf([advice('dirty', 5), advice('unvisited', 6), advice('broken', 1)]);
    expect(markers.map((marker) => marker.at.tileX)).toEqual([5, 1]);
    expect(markers[0]?.key).toBe('dirty:dirty:5,0');
  });
});

describe('adviceAt', () => {
  it('keeps every advice on the tile, marked or not, in order', () => {
    const all = [advice('broken', 1, 2), advice('dirty', 3, 2), advice('unvisited', 1, 2)];
    expect(adviceAt(all, { tileX: 1, tileZ: 2 }).map((each) => each.kind)).toEqual([
      'broken',
      'unvisited',
    ]);
  });

  it('skips advice without a tile', () => {
    expect(adviceAt([{ ...advice('closed'), at: null }], { tileX: 0, tileZ: 0 })).toEqual([]);
  });
});

describe('markerIconOf', () => {
  it('has no icon for a kind that gets no marker', () => {
    expect(markerIconOf('unvisited')).toBeNull();
    expect(markerIconOf('broken')).toBe('broken');
  });
});
