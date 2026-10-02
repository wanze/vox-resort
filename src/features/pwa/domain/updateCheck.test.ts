import { describe, expect, it } from 'vitest';
import { UPDATE_CHECK_MS, updateCheckDue } from './updateCheck';

const asked = {
  found: false,
  online: true,
  visible: true,
  lastCheckedAt: 1_000,
  now: 1_000 + UPDATE_CHECK_MS,
};

describe('updateCheckDue', () => {
  it('checks once the hour is up', () => {
    expect(updateCheckDue(asked)).toBe(true);
  });

  it('waits out the hour', () => {
    expect(updateCheckDue({ ...asked, now: asked.now - 1 })).toBe(false);
  });

  it('never checks offline', () => {
    expect(updateCheckDue({ ...asked, online: false })).toBe(false);
  });

  it('never checks a hidden page', () => {
    expect(updateCheckDue({ ...asked, visible: false })).toBe(false);
  });

  it('stops once an update is found', () => {
    expect(updateCheckDue({ ...asked, found: true })).toBe(false);
  });
});
