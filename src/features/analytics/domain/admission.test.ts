import { describe, expect, it } from 'vitest';
import { refusalOf } from './admission';
import { MAX_BODY_BYTES } from './analyticsEvent';

const beacon = {
  method: 'POST',
  url: 'https://vox-resort.com/e',
  origin: 'https://vox-resort.com',
  fetchSite: 'same-origin',
  length: 400,
};

describe('refusalOf', () => {
  it('admits a beacon from the game', () => {
    expect(refusalOf(beacon)).toBeNull();
  });

  it('admits a browser that sends no fetch metadata', () => {
    expect(refusalOf({ ...beacon, fetchSite: null, length: null })).toBeNull();
  });

  it('only takes posts', () => {
    expect(refusalOf({ ...beacon, method: 'GET' })).toBe(405);
  });

  it('refuses another site', () => {
    expect(refusalOf({ ...beacon, origin: 'https://example.com' })).toBe(403);
    expect(refusalOf({ ...beacon, fetchSite: 'cross-site' })).toBe(403);
  });

  it('refuses a request without an origin', () => {
    expect(refusalOf({ ...beacon, origin: null })).toBe(403);
  });

  it('refuses a body larger than a batch', () => {
    expect(refusalOf({ ...beacon, length: MAX_BODY_BYTES + 1 })).toBe(413);
  });
});
