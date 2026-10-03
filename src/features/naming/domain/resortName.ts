export const MAX_RESORT_NAME = 24;

// Shared with the venues' fallback names, so both sound like the same place.
export const FIRSTS = [
  'Coral',
  'Sunset',
  'Azure',
  'Lemon',
  'Olive',
  'Driftwood',
  'Seashell',
  'Golden',
  'Palm',
  'Silver',
  'Lagoon',
  'Marina',
  'Breeze',
  'Saffron',
  'Pebble',
  'Citrus',
] as const;

const SECONDS = [
  'Cove',
  'Bay',
  'Sands',
  'Shores',
  'Gardens',
  'Lido',
  'Haven',
  'Point',
  'Bluffs',
  'Beach',
  'Harbour',
  'Springs',
  'Terrace',
  'Reef',
  'Isle',
  'Dunes',
] as const;

export function cleanName(typed: string, longest: number): string | null {
  const cleaned = typed.trim().replace(/\s+/g, ' ').slice(0, longest).trimEnd();
  return cleaned === '' ? null : cleaned;
}

export const cleanResortName = (typed: string): string | null => cleanName(typed, MAX_RESORT_NAME);

function hashOf(seed: number): number {
  const hash = Math.imul((seed | 0) ^ 0x9e37_79b9, 0x2c1b_3c6d);
  return (Math.imul(hash ^ (hash >>> 12), 0x297a_2d39) ^ (hash >>> 15)) >>> 0;
}

// A hash rather than a draw from the seed's stream, so naming a resort cannot shift
// anything the generator draws from the same seed.
export function resortNameFor(seed: number): string {
  const hash = hashOf(seed);
  return `${FIRSTS[hash % FIRSTS.length]} ${SECONDS[(hash >>> 8) % SECONDS.length]}`;
}

// A save from before resorts had names is named by its seed, as a new game would have been.
export function savedResortName(saved: string | undefined, seed: number): string {
  return saved ?? resortNameFor(seed);
}

export function rerollResortName(random: () => number): string {
  const first = FIRSTS[Math.floor(random() * FIRSTS.length) % FIRSTS.length];
  const second = SECONDS[Math.floor(random() * SECONDS.length) % SECONDS.length];
  return `${first} ${second}`;
}
