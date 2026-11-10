import { describe, expect, it } from 'vitest';
import { badgeText } from './badge';

describe('badgeText', () => {
  it('shows a count up to nine as it is', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(9)).toBe('9');
  });

  it('caps anything above nine', () => {
    expect(badgeText(10)).toBe('9+');
    expect(badgeText(50)).toBe('9+');
  });
});
