import {
  hostOfTab,
  isTab,
  isTabbed,
  WINDOW_TABS,
  type TabbedWindow,
  type TabId,
} from './windowTabs';

export const WINDOW_IDS = [
  'build',
  'overview',
  'inbox',
  'people',
  'programme',
  'books',
  'camera',
  'resort',
  'name',
  'saves',
  'share',
  'debug',
  'inspect',
] as const;

export type WindowId = (typeof WINDOW_IDS)[number];

// What callers ask for: a window, or a tab that stands for the window hosting it.
export type PageId = WindowId | TabId;

function hostOf(page: PageId): WindowId {
  return isTab(page) ? hostOfTab(page) : page;
}

export interface WindowSpot {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface WindowLayout {
  readonly open: readonly WindowId[];
  // Back to front. A window never raised is not in it and sits under every one that was.
  readonly stack: readonly WindowId[];
  // Only windows the player has dragged; the rest keep the stylesheet's default place.
  readonly spots: Readonly<Partial<Record<WindowId, WindowSpot>>>;
  // The window the player last opened, which may take the keyboard. Never restored, so a
  // reload does not grab the keys before anything has been clicked.
  readonly focus: WindowId | null;
  // Only tabs picked by hand or by an opener; the rest show their first.
  readonly tabs: Readonly<Partial<Record<TabbedWindow, TabId>>>;
}

export const DEFAULT_LAYOUT: WindowLayout = {
  open: ['build'],
  stack: [],
  spots: {},
  focus: null,
  tabs: {},
};

const MARGIN = 6;
// Enough of the title bar to grab, so a window pushed off an edge can always be pulled back.
const GRIP = 44;

export function isOpen(layout: WindowLayout, id: WindowId): boolean {
  return layout.open.includes(id);
}

export function tabOf(layout: WindowLayout, id: TabbedWindow): TabId {
  return layout.tabs[id] ?? WINDOW_TABS[id][0];
}

// A tab counts as shown only while its window is open on it.
export function isShown(layout: WindowLayout, page: PageId): boolean {
  const host = hostOf(page);
  if (!isOpen(layout, host)) return false;
  return !isTab(page) || tabOf(layout, hostOfTab(page)) === page;
}

export function raiseWindow(layout: WindowLayout, id: WindowId): WindowLayout {
  if (layout.stack.at(-1) === id) return layout;
  return { ...layout, stack: [...layout.stack.filter((each) => each !== id), id] };
}

function pickTab(layout: WindowLayout, tab: TabId): WindowLayout {
  const host = hostOfTab(tab);
  if (layout.tabs[host] === tab) return layout;
  return { ...layout, tabs: { ...layout.tabs, [host]: tab } };
}

// Hiding a tab hides its window, whichever tab that window is on.
export function showWindow(layout: WindowLayout, page: PageId, shown: boolean): WindowLayout {
  const id = hostOf(page);
  if (!shown) {
    if (!isOpen(layout, id)) return layout;
    const focus = layout.focus === id ? null : layout.focus;
    return { ...layout, open: layout.open.filter((each) => each !== id), focus };
  }
  const opened = isOpen(layout, id) ? layout : { ...layout, open: [...layout.open, id], focus: id };
  return raiseWindow(isTab(page) ? pickTab(opened, page) : opened, id);
}

// A tab whose window is open on another tab is switched to, not closed.
export function toggleWindow(layout: WindowLayout, page: PageId): WindowLayout {
  return showWindow(layout, page, !isShown(layout, page));
}

// On a small screen only one window fits: showing one hides the rest. The inspector is not in
// `open` (the selection drives it), so it is never closed here.
export function soloWindow(layout: WindowLayout, page: PageId): WindowLayout {
  const shown = showWindow(layout, page, true);
  return shown.open.length === 1 ? shown : { ...shown, open: [hostOf(page)] };
}

// Entering a small screen keeps the window raised last, or the first open one if none was raised.
export function toCompact(layout: WindowLayout): WindowLayout {
  if (layout.open.length <= 1) return layout;
  const raised = layout.stack.findLast((id) => isOpen(layout, id));
  const kept = raised ?? layout.open[0];
  return kept === undefined ? layout : { ...layout, open: [kept] };
}

export function moveWindow(layout: WindowLayout, id: WindowId, spot: WindowSpot): WindowLayout {
  return { ...layout, spots: { ...layout.spots, [id]: spot } };
}

export function resetPlaces(layout: WindowLayout): WindowLayout {
  return { ...layout, stack: [], spots: {} };
}

export function depthOf(layout: WindowLayout, id: WindowId): number {
  return layout.stack.indexOf(id) + 1;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

export function clampSpot(spot: WindowSpot, size: Box, viewport: Box, top: number): WindowSpot {
  const right = Math.max(MARGIN, viewport.width - size.width - MARGIN);
  const bottom = Math.max(top, viewport.height - GRIP);
  return {
    x: Math.round(clamp(spot.x, MARGIN, right)),
    y: Math.round(clamp(spot.y, top, bottom)),
  };
}

const isWindowId = (value: unknown): value is WindowId =>
  typeof value === 'string' && (WINDOW_IDS as readonly string[]).includes(value);

// Windows an older build had before they became tabs, read back as the tab they are now.
const LEGACY: Readonly<Record<string, TabId>> = {
  advice: 'advice',
  messages: 'messages',
  report: 'report',
  demand: 'demand',
  guests: 'guests',
  staff: 'staff',
};

const legacyTab = (value: unknown): TabId | null =>
  typeof value === 'string' && Object.hasOwn(LEGACY, value) ? (LEGACY[value] ?? null) : null;

// Fills in the tab of a window an older build stored as one of its tabs, unless it has one.
function idsOf(value: unknown, tabs: Partial<Record<TabbedWindow, TabId>>): readonly WindowId[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<WindowId>();
  for (const each of value) {
    const tab = legacyTab(each);
    if (tab !== null) {
      const host = hostOfTab(tab);
      tabs[host] ??= tab;
      ids.add(host);
    } else if (isWindowId(each)) {
      ids.add(each);
    }
  }
  return [...ids];
}

function tabsOf(value: unknown): Partial<Record<TabbedWindow, TabId>> {
  if (typeof value !== 'object' || value === null) return {};
  const tabs: Partial<Record<TabbedWindow, TabId>> = {};
  for (const [host, tab] of Object.entries(value)) {
    if (isTabbed(host) && typeof tab === 'string' && isTab(tab) && hostOfTab(tab) === host) {
      tabs[host] = tab;
    }
  }
  return tabs;
}

function spotOf(value: unknown): WindowSpot | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function spotsOf(value: unknown): WindowLayout['spots'] {
  if (typeof value !== 'object' || value === null) return {};
  const spots: Partial<Record<WindowId, WindowSpot>> = {};
  for (const [id, raw] of Object.entries(value)) {
    const spot = spotOf(raw);
    if (isWindowId(id) && spot) spots[id] = spot;
  }
  return spots;
}

// Whatever was stored by an older build, or by hand, comes back as something usable.
export function parseLayout(value: unknown): WindowLayout {
  if (typeof value !== 'object' || value === null) return DEFAULT_LAYOUT;
  const { open, stack, spots, tabs } = value as {
    open?: unknown;
    stack?: unknown;
    spots?: unknown;
    tabs?: unknown;
  };
  if (!Array.isArray(open)) return DEFAULT_LAYOUT;
  const picked = tabsOf(tabs);
  return {
    open: idsOf(open, picked),
    stack: idsOf(stack, picked),
    spots: spotsOf(spots),
    focus: null,
    tabs: picked,
  };
}
