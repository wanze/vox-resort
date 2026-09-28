import { describe, expect, it } from 'vitest';
import { createCrowd, snapshotCrowd } from './crowd';
import { crowdPerBody, crowdSnapshotSchema, PER_BODY_COLUMNS } from './crowdSnapshot';
import { walkNetworkFor } from './walkNetwork';

const crowd = createCrowd({
  network: walkNetworkFor({
    paved: Array.from({ length: 5 }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 })),
    levelOf: () => 0,
    shore: null,
    tilesX: 5,
  }),
  count: 7,
  variants: 2,
  seed: 3,
});

describe('a crowd snapshot', () => {
  it('lists every per-body column, each a body long', () => {
    const columns = crowdPerBody(snapshotCrowd(crowd));
    expect(columns).toHaveLength(PER_BODY_COLUMNS.length);
    expect(columns.every((column) => column.length === 7)).toBe(true);
  });

  it('keeps an endless rate, which JSON would have turned into null', () => {
    const snapshot = snapshotCrowd(crowd);
    snapshot.rate[0] = Number.POSITIVE_INFINITY;
    const parsed = crowdSnapshotSchema.parse(structuredClone(snapshot));
    expect(parsed.rate[0]).toBe(Number.POSITIVE_INFINITY);
  });
});
