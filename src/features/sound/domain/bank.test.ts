import { describe, expect, it } from 'vitest';
import { SLOT_BUS, SLOT_NAMES, slotFiles, slotOfKind, SOUND_KINDS, type Bank } from './bank';

const FILE = {
  file: 'click-1.mp3',
  source: {
    page: 'https://example.org',
    fetch: 'https://example.org/a.mp3',
    author: 'a',
    licence: 'CC0',
  },
  cut: { loudness: -18 },
} as const;

describe('slotFiles', () => {
  it('reads a slot the bank leaves out as silent', () => {
    const bank: Bank = { click: { bus: 'interface', loop: false, gain: 1, files: [FILE] } };
    expect(slotFiles(bank, 'click')).toEqual([FILE]);
    expect(slotFiles(bank, 'cafe')).toEqual([]);
    expect(slotFiles({}, 'music-day')).toEqual([]);
  });
});

describe('slotOfKind', () => {
  it('gives every SoundKind but trees a slot of its own, on the ambience bus', () => {
    const slots = SOUND_KINDS.filter((kind) => kind !== 'trees').map(slotOfKind);
    expect(slots).not.toContain(null);
    expect(new Set(slots).size).toBe(slots.length);
    for (const slot of slots) {
      expect(SLOT_NAMES).toContain(slot);
      expect(SLOT_BUS[slot!]).toBe('ambience');
    }
    expect(slotOfKind('trees')).toBeNull();
  });
});

describe('SLOT_BUS', () => {
  it('puts every slot on a bus, thunder with the effects', () => {
    for (const slot of SLOT_NAMES) expect(SLOT_BUS[slot], slot).toBeDefined();
    expect(SLOT_BUS.thunder).toBe('effects');
    expect(SLOT_BUS.rain).toBe('ambience');
  });
});
