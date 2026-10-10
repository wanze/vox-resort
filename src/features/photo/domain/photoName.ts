import { timeLabel } from './photoView';
import { shownDay } from '../../../shared/domain/dayNumber';

const MAX_NAME_CHARS = 40;

function slugOf(name: string): string {
  const slug = name
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_CHARS)
    .replace(/-+$/, '');
  return slug === '' ? 'resort' : slug;
}

export function photoFileName(resortName: string, day: number, time: number): string {
  return `vox-resort-${slugOf(resortName)}-day-${shownDay(day)}-${timeLabel(time).replace(':', '')}.png`;
}
