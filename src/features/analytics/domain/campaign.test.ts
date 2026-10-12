import { describe, expect, it } from 'vitest';
import { campaignOf } from './campaign';

describe('campaignOf', () => {
  it('reads the utm tags', () => {
    expect(campaignOf('?utm_source=Reddit&utm_medium=social&utm_campaign=launch')).toEqual({
      source: 'reddit',
      medium: 'social',
      campaign: 'launch',
    });
  });

  it('leaves out tags that are missing or empty', () => {
    expect(campaignOf('?utm_source=&bench=1')).toEqual({});
  });

  it('cuts a tag short', () => {
    expect(campaignOf(`?utm_campaign=${'x'.repeat(100)}`).campaign).toHaveLength(64);
  });
});
