import type { SlotName } from './bank';
import { pickVariant } from './cues';

export type Mood = 'menu' | 'day' | 'night';

export const MOOD_SLOT = {
  menu: 'music-menu',
  day: 'music-day',
  night: 'music-night',
} as const satisfies { readonly [mood in Mood]: SlotName };

// Well after sunset: dusk still sounds like the day winding down.
const NIGHT_MUSIC = 0.7;

export function moodAt(night: number, welcome: boolean): Mood {
  if (welcome) return 'menu';
  return night > NIGHT_MUSIC ? 'night' : 'day';
}

export const nextTrack = (count: number, last: number, random: () => number): number =>
  pickVariant(count, last, random);

// Silence between tracks, so the music breathes and the resort is heard on its own.
export function gapSeconds(random: () => number): number {
  return 8 + 17 * random();
}

// The menu theme loops until a game starts; game music plays a track at a time.
export const loops = (mood: Mood): boolean => mood === 'menu';

export type MoodChange = 'keep' | 'fade' | 'start';

// A change of mood waits for the end of the track, except leaving the menu, which should not
// play on over the game.
export function moodChange(playing: Mood | null, wanted: Mood): MoodChange {
  if (playing === null) return 'start';
  if (playing === wanted) return 'keep';
  return playing === 'menu' ? 'fade' : 'keep';
}
