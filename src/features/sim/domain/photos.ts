import { mix, unitOf } from '../../random/domain/hash';
import type { PhotosSnapshot } from './resortSnapshot';

export const NEVER = -(2 ** 31);

// Three simulated hours, so a guest on the promenade all evening takes one sunset, not twenty.
export const PHOTO_GAP_TICKS = 180;

// A shore tile by day sits just over it; a garden alone barely reaches it.
export const PHOTO_FROM = 0.5;

// The one dial: how many photos there are. Tuned on the reference resort (plans 107 and 109).
export const PHOTO_CHANCE = 0.04;

// Crowd seconds: long enough to be seen raising the phone, short beside a sit of 20 to 90.
export const PHOTO_SECONDS = 6;

// A stay of photos is worth about half a small fireworks show (0.03 to 0.08).
const PHOTO_MEMORY = 0.01;

// Its own salt, so a photo's draw is not the litter's or an incident's for the same numbers.
const SALT = 0x5f35_6495;

export interface Photos {
  // Per guest, NEVER for no photo yet.
  readonly lastAt: Int32Array;
  // Per walk node, so replaced on an edit, which renumbers nodes.
  heat: Float32Array;
}

export function createPhotos(people: number, nodes: number): Photos {
  return { lastAt: new Int32Array(people).fill(NEVER), heat: new Float32Array(nodes) };
}

export function mayPhoto(photos: Photos, person: number, tick: number): boolean {
  const last = photos.lastAt[person];
  return last !== undefined && tick - last >= PHOTO_GAP_TICKS;
}

// A hash, not a stream: a draw from the crowd's or the router's would move every seeded scene.
export function photoDraw(person: number, node: number, tick: number): number {
  return unitOf(mix(Math.imul(person + 1, SALT) ^ mix(Math.imul(node + 1, 0x9e37_79b1) ^ tick)));
}

export function photoChance(scenic: number): number {
  if (scenic < PHOTO_FROM) return 0;
  return (PHOTO_CHANCE * (Math.min(1, scenic) - PHOTO_FROM)) / (1 - PHOTO_FROM);
}

// Each photo of a stay is worth less than the one before: the tenth sunset is not the first.
export function photoMemory(before: number): number {
  return PHOTO_MEMORY / (1 + before);
}

export function notePhoto(photos: Photos, person: number, node: number, tick: number): void {
  photos.lastAt[person] = tick;
  if (node >= 0 && node < photos.heat.length) photos.heat[node]! += 1;
}

export function forgetPhotos(photos: Photos, person: number): void {
  if (person >= 0 && person < photos.lastAt.length) photos.lastAt[person] = NEVER;
}

// Halved every morning, as the footfall is, so the overlay shows the last few days.
export function fadePhotoHeat(photos: Photos): void {
  for (let node = 0; node < photos.heat.length; node++) photos.heat[node]! *= 0.5;
}

export function snapshotPhotos(photos: Photos): PhotosSnapshot {
  return { lastAt: photos.lastAt.slice(), heat: photos.heat.slice() };
}

// The heat is per node, so another length is another network and is dropped.
export function restorePhotos(photos: Photos, snapshot: PhotosSnapshot | undefined): void {
  photos.lastAt.fill(NEVER);
  photos.heat.fill(0);
  if (!snapshot) return;
  photos.lastAt.set(snapshot.lastAt.subarray(0, photos.lastAt.length));
  if (snapshot.heat.length === photos.heat.length) photos.heat.set(snapshot.heat);
}
