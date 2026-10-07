// Its own version, apart from SAVE_VERSION, and outside the compressed body, so a reader can tell
// a format it does not know before it inflates anything.
export const LINK_VERSION = 1;
const LINK_KEY = 'resort';

export const MAX_LINK_CHARS = 1_000_000;
// Checked while inflating, so a small link cannot grow into gigabytes.
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

// Chats and some apps cut a link somewhere past this; the game itself reads far longer ones.
export const LONG_LINK_CHARS = 32_000;

export type ParsedLink =
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'body'; readonly compressed: Uint8Array };

// btoa works on a string of byte-sized chars, built in slices so no call gets too many arguments.
const SLICE = 0x8000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(at, at + SLICE));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

function fromBase64Url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function formatLink(base: string, compressed: Uint8Array): string {
  const payload = new Uint8Array(compressed.length + 1);
  payload[0] = LINK_VERSION;
  payload.set(compressed, 1);
  return `${base}#${LINK_KEY}=${toBase64Url(payload)}`;
}

// Null when the fragment holds no resort at all, so another use of the hash is left alone.
export function parseLink(hash: string): ParsedLink | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(LINK_KEY);
  if (value === null) return null;
  if (value.length > MAX_LINK_CHARS) return { kind: 'unreadable' };
  const payload = fromBase64Url(value);
  if (payload === null || payload.length < 2) return { kind: 'unreadable' };
  const version = payload[0]!;
  if (version > LINK_VERSION) return { kind: 'newer', version };
  if (version !== LINK_VERSION) return { kind: 'unreadable' };
  return { kind: 'body', compressed: payload.subarray(1) };
}
