import type { IconName } from './pixelIcons';
import type { WindowId } from '../domain/windowLayout';

export const WINDOW_TITLES: { readonly [id in WindowId]: string } = {
  build: 'Build',
  overview: 'Overview',
  advice: 'Advice',
  guests: 'Guests',
  books: 'Books',
  camera: 'Camera',
  resort: 'New game',
  debug: 'Debug',
  inspect: 'Inspector',
};

export const WINDOW_ICONS: { readonly [id in WindowId]: IconName } = {
  build: 'build',
  overview: 'overview',
  advice: 'advice',
  guests: 'guests',
  books: 'books',
  camera: 'camera',
  resort: 'resort',
  debug: 'debug',
  inspect: 'guests',
};

export const WINDOW_KEYS: { readonly [id in WindowId]?: string } = {
  build: 'B',
  debug: 'F3',
};

// The inspector follows the selection and the rest are reached from the menu.
export const TOOLBAR_WINDOWS = [
  'build',
  'overview',
  'advice',
  'guests',
  'books',
  'camera',
] as const;
