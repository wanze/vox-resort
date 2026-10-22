import { timeLabel } from './photoView';

// Written on every captioned photo, so one passed around leads back to the game.
const PHOTO_SITE = 'vox-resort.com';

export interface PhotoCaption {
  readonly title: string;
  readonly detail: string;
}

export function photoCaption(resortName: string, time: number): PhotoCaption {
  return { title: resortName, detail: `${timeLabel(time)} · ${PHOTO_SITE}` };
}
