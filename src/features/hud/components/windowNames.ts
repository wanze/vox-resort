import type { IconName } from './pixelIcons';
import type { WindowId } from '../domain/windowLayout';

export const WINDOW_TITLES: { readonly [id in WindowId]: string } = {
  build: 'Build',
  overview: 'Overview',
  advice: 'Advice',
  messages: 'Messages',
  guests: 'Guests',
  staff: 'Staff',
  books: 'Books',
  camera: 'Camera',
  resort: 'New game',
  saves: 'Saved games',
  debug: 'Debug',
  inspect: 'Inspector',
};

export const WINDOW_ICONS: { readonly [id in WindowId]: IconName } = {
  build: 'build',
  overview: 'overview',
  advice: 'advice',
  messages: 'advice',
  guests: 'guests',
  staff: 'guests',
  books: 'books',
  camera: 'camera',
  resort: 'resort',
  // The books icon is a ledger, which is what a list of saves looks like too.
  saves: 'books',
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
  'messages',
  'guests',
  'staff',
  'books',
  'camera',
] as const;
