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

// Short-lived windows over the middle of the screen. The rest have a side: the right holds the
// build palette with the inspector over it, the left one of the others at a time.
const DIALOGS: ReadonlySet<WindowId> = new Set(['resort', 'name', 'saves', 'share']);
const RIGHT: ReadonlySet<WindowId> = new Set(['build', 'inspect']);

export type Side = 'left' | 'right';

export function sideOf(id: WindowId): Side | null {
  if (DIALOGS.has(id)) return null;
  return RIGHT.has(id) ? 'right' : 'left';
}

const isLeft = (id: WindowId): boolean => sideOf(id) === 'left';

// Enough to retrace a few steps; older ones are forgotten.
const BACK_STEPS = 10;

export interface WindowLayout {
  readonly open: readonly WindowId[];
  // Back to front. A window never raised is not in it and sits under every one that was.
  readonly stack: readonly WindowId[];
  // The left windows that gave way to the one there now, the latest last. Never restored.
  readonly back: readonly WindowId[];
  // The window the player last opened, which may take the keyboard. Never restored, so a
  // reload does not grab the keys before anything has been clicked.
  readonly focus: WindowId | null;
  // Only tabs picked by hand or by an opener; the rest show their first.
  readonly tabs: Readonly<Partial<Record<TabbedWindow, TabId>>>;
}

export const DEFAULT_LAYOUT: WindowLayout = {
  open: ['build'],
  stack: [],
  back: [],
  focus: null,
  tabs: {},
};

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

function hide(layout: WindowLayout, id: WindowId): WindowLayout {
  if (!isOpen(layout, id)) return layout;
  const focus = layout.focus === id ? null : layout.focus;
  const back = isLeft(id) ? [] : layout.back;
  return { ...layout, open: layout.open.filter((each) => each !== id), focus, back };
}

// A left window takes the place of the one there, which is remembered to go back to.
function place(layout: WindowLayout, id: WindowId, back: readonly WindowId[]): WindowLayout {
  const there = isLeft(id) ? layout.open.find(isLeft) : undefined;
  const kept = layout.open.filter((each) => each !== there);
  return { ...layout, open: [...kept, id], focus: id, back };
}

function pushedBack(layout: WindowLayout, id: WindowId): readonly WindowId[] {
  const there = isLeft(id) ? layout.open.find(isLeft) : undefined;
  if (there === undefined) return isLeft(id) ? [] : layout.back;
  return [...layout.back, there].slice(-BACK_STEPS);
}

// Hiding a tab hides its window, whichever tab that window is on.
export function showWindow(layout: WindowLayout, page: PageId, shown: boolean): WindowLayout {
  const id = hostOf(page);
  if (!shown) return hide(layout, id);
  const opened = isOpen(layout, id) ? layout : place(layout, id, pushedBack(layout, id));
  return raiseWindow(isTab(page) ? pickTab(opened, page) : opened, id);
}

export function canGoBack(layout: WindowLayout, id: WindowId): boolean {
  return isLeft(id) && layout.back.length > 0;
}

export function goBack(layout: WindowLayout): WindowLayout {
  const previous = layout.back.at(-1);
  if (previous === undefined) return layout;
  return raiseWindow(place(layout, previous, layout.back.slice(0, -1)), previous);
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

export function depthOf(layout: WindowLayout, id: WindowId): number {
  return layout.stack.indexOf(id) + 1;
}

export const isWindowId = (value: unknown): value is WindowId =>
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

// A build that let several windows share the left kept them all open; the one opened last stays.
function oneLeft(ids: readonly WindowId[]): readonly WindowId[] {
  const last = ids.findLast(isLeft);
  return ids.filter((id) => !isLeft(id) || id === last);
}

// Whatever was stored by an older build, or by hand, comes back as something usable.
export function parseLayout(value: unknown): WindowLayout {
  if (typeof value !== 'object' || value === null) return DEFAULT_LAYOUT;
  const { open, stack, tabs } = value as { open?: unknown; stack?: unknown; tabs?: unknown };
  if (!Array.isArray(open)) return DEFAULT_LAYOUT;
  const picked = tabsOf(tabs);
  return {
    open: oneLeft(idsOf(open, picked)),
    stack: idsOf(stack, picked),
    back: [],
    focus: null,
    tabs: picked,
  };
}
