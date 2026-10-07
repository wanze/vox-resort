import { describe, expect, it } from 'vitest';
import { formatLink, LINK_VERSION, MAX_LINK_CHARS, parseLink } from './shareLink';

const hashOf = (link: string): string => link.slice(link.indexOf('#'));

describe('formatLink and parseLink', () => {
  it('carry every byte value, at every length base64 pads differently', () => {
    const every = Uint8Array.from({ length: 256 }, (_, value) => value);
    const lengths = [1, 2, 3, 4, 5, 256].map((length) => every.subarray(256 - length));
    for (const bytes of lengths) {
      const link = formatLink('https://vox-resort.com/', bytes);
      expect(link).toMatch(/^https:\/\/vox-resort\.com\/#resort=[A-Za-z0-9_-]+$/);
      expect(parseLink(hashOf(link))).toEqual({ kind: 'body', compressed: bytes });
    }
  });

  it('leave a fragment with no resort alone', () => {
    expect(parseLink('')).toBeNull();
    expect(parseLink('#villa')).toBeNull();
  });

  it('tell a link from a newer game', () => {
    const link = formatLink('', Uint8Array.of(7, 7));
    const newer = btoa(String.fromCharCode(LINK_VERSION + 1, 7, 7));
    expect(parseLink(hashOf(link))?.kind).toBe('body');
    expect(parseLink(`#resort=${newer}`)).toEqual({ kind: 'newer', version: LINK_VERSION + 1 });
  });

  it('refuse a payload that cannot be read', () => {
    expect(parseLink(hashOf(formatLink('', new Uint8Array())))).toEqual({ kind: 'unreadable' });
    expect(parseLink('#resort=')).toEqual({ kind: 'unreadable' });
    expect(parseLink('#resort=AQ$x')).toEqual({ kind: 'unreadable' });
    expect(parseLink('#resort=AQIDB')).toEqual({ kind: 'unreadable' });
    expect(parseLink(`#resort=${'A'.repeat(MAX_LINK_CHARS + 1)}`)).toEqual({ kind: 'unreadable' });
  });
});
