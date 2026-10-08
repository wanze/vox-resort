// Mixed rather than taken modulo, so neighbouring inputs do not get neighbouring hashes.
export function mix(value: number): number {
  let hash = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2_ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export const unitOf = (hash: number): number => hash / 4_294_967_296;

// The index is spread by the golden ratio before the seed goes in, so neighbouring
// indices of one seed land far apart.
export const unitAt = (seed: number, index: number): number =>
  unitOf(mix(Math.imul(index + 1, 0x9e37_79b1) ^ seed));

// Signed, as both callers always had it: an unsigned salt would reroll every style and taste.
export function fnv(text: string): number {
  let hash = 2166136261;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return hash | 0;
}
