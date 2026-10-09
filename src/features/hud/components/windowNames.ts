import type { IconName } from '../../../shared/components/pixelIcons';
import type { PageId, WindowId } from '../domain/windowLayout';
import { isTab, type TabId } from '../domain/windowTabs';
import { keyLabel } from '../domain/keymap';

export const WINDOW_TITLES: { readonly [id in WindowId]: string } = {
  build: 'Build',
  overview: 'Overview',
  inbox: 'Inbox',
  people: 'People',
  programme: 'Programme',
  books: 'Books',
  camera: 'Camera',
  resort: 'New game',
  name: 'Rename resort',
  saves: 'Saved games',
  share: 'Share resort',
  debug: 'Debug',
  inspect: 'Inspector',
};

export const WINDOW_ICONS: { readonly [id in WindowId]: IconName } = {
  build: 'build',
  overview: 'overview',
  inbox: 'inbox',
  people: 'people',
  programme: 'programme',
  books: 'books',
  camera: 'camera',
  resort: 'resort',
  name: 'rename',
  saves: 'saves',
  share: 'share',
  debug: 'debug',
  inspect: 'inspect',
};

export const TAB_TITLES: { readonly [tab in TabId]: string } = {
  summary: 'Resort',
  report: 'Day report',
  demand: 'Demand',
  photos: 'Photo wall',
  advice: 'Advice',
  messages: 'Messages',
  guests: 'Guests',
  staff: 'Staff',
};

export const TAB_ICONS: { readonly [tab in TabId]: IconName } = {
  summary: 'overview',
  report: 'report',
  demand: 'demand',
  photos: 'camera',
  advice: 'advice',
  messages: 'messages',
  guests: 'guests',
  staff: 'staff',
};

export const WINDOW_KEYS: { readonly [id in WindowId]?: string } = {
  build: keyLabel('build'),
  debug: keyLabel('debug'),
};

// The inspector follows the selection and the rest are reached from the menu.
export const DOCK_WINDOWS = ['build', 'overview', 'inbox', 'people', 'programme', 'books'] as const;

// Every page the menu and the palette offer by name, in the dock's order.
export const MENU_PAGES: readonly PageId[] = [
  'build',
  'summary',
  'report',
  'demand',
  'photos',
  'advice',
  'messages',
  'guests',
  'staff',
  'programme',
  'books',
  'camera',
];

export const pageTitle = (page: PageId): string =>
  isTab(page) ? TAB_TITLES[page] : WINDOW_TITLES[page];

export const pageIcon = (page: PageId): IconName =>
  isTab(page) ? TAB_ICONS[page] : WINDOW_ICONS[page];

export const pageKey = (page: PageId): string | undefined =>
  isTab(page) ? undefined : WINDOW_KEYS[page];
