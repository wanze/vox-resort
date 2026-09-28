import { describe, expect, it } from 'vitest';
import { outcomeMessage, replyFor, savedAgo, statusLine, titleOf } from './saveWords';

const MINUTE = 60_000;

describe('save words', () => {
  it('calls an unnamed game the unsaved game', () => {
    expect(titleOf({ name: null })).toBe('Unsaved game');
    expect(titleOf({ name: 'Cove' })).toBe('Cove');
  });

  it('says how long ago a game was saved in whole units', () => {
    expect(savedAgo(0, 30_000)).toBe('just now');
    expect(savedAgo(0, 5 * MINUTE)).toBe('5 min ago');
    expect(savedAgo(0, 119 * MINUTE)).toBe('1 h ago');
    expect(savedAgo(0, 30 * 60 * MINUTE)).toBe('yesterday');
    expect(savedAgo(0, 3 * 24 * 60 * MINUTE)).toBe('3 days ago');
    expect(savedAgo(10, 0)).toBe('just now');
  });

  it('explains every outcome but a save that went through', () => {
    expect(outcomeMessage(null)).toBeNull();
    expect(outcomeMessage({ kind: 'saved' })).toBeNull();
    expect(outcomeMessage({ kind: 'failed' })).toMatch(/could not/);
    expect(outcomeMessage({ kind: 'bad-name' })).toMatch(/40/);
    expect(outcomeMessage({ kind: 'needs-name' })).toMatch(/name/);
    const clash = outcomeMessage({
      kind: 'clash',
      with: {
        id: 'a',
        name: 'Cove',
        savedAt: 0,
        version: 1,
        mode: 'sandbox',
        day: 1,
        balance: 0,
        stars: 3,
        guests: 0,
        tilesX: 8,
        tilesZ: 8,
      },
    });
    expect(clash).toMatch(/Cove.*Replace/);
  });
});

const line = (parts: Partial<Parameters<typeof statusLine>[0]>) =>
  statusLine({ available: true, status: 'idle', savedAt: null, ...parts });

describe('replyFor', () => {
  it('asks only about a clash, and says nothing of a save that went through', () => {
    expect(replyFor({ kind: 'saved' })).toBeNull();
    expect(replyFor({ kind: 'failed' })).toMatchObject({ asks: false });
  });
});

describe('statusLine', () => {
  it('says whether and when the game was saved', () => {
    expect(line({})).toBe('Not saved yet');
    expect(line({ status: 'saved', savedAt: '12:04' })).toBe('Saved 12:04');
    expect(line({ status: 'saving', savedAt: '12:04' })).toBe('Saving…');
    expect(line({ status: 'failed' })).toBe('The last save failed');
    expect(line({ available: false, status: 'failed' })).toBe(
      'Saving is not available in this browser',
    );
  });
});
