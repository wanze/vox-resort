import { describe, expect, it } from 'vitest';
import {
  clampSpot,
  DEFAULT_LAYOUT,
  depthOf,
  isOpen,
  isWindowId,
  moveWindow,
  parseLayout,
  raiseWindow,
  resetPlaces,
  showWindow,
  soloWindow,
  tabOf,
  toCompact,
  toggleWindow,
  type WindowLayout,
} from './windowLayout';

const layout = (patch: Partial<WindowLayout> = {}): WindowLayout => ({
  open: [],
  stack: [],
  spots: {},
  focus: null,
  tabs: {},
  ...patch,
});

describe('toggleWindow', () => {
  it('opens a shut window and puts it in front', () => {
    const next = toggleWindow(layout({ open: ['build'], stack: ['inbox', 'build'] }), 'inbox');
    expect(isOpen(next, 'inbox')).toBe(true);
    expect(next.stack.at(-1)).toBe('inbox');
  });

  it('shuts an open window and leaves its place in the stack', () => {
    const next = toggleWindow(layout({ open: ['build'], stack: ['build'] }), 'build');
    expect(isOpen(next, 'build')).toBe(false);
    expect(next.stack).toEqual(['build']);
  });

  it('switches a window open on another tab to the one asked for, and keeps it open', () => {
    const next = toggleWindow(layout({ open: ['inbox'], tabs: { inbox: 'advice' } }), 'messages');
    expect(isOpen(next, 'inbox')).toBe(true);
    expect(tabOf(next, 'inbox')).toBe('messages');
  });

  it('shuts a window open on the tab asked for', () => {
    const next = toggleWindow(layout({ open: ['inbox'], tabs: { inbox: 'messages' } }), 'messages');
    expect(isOpen(next, 'inbox')).toBe(false);
  });
});

describe('showWindow', () => {
  it('hands the keyboard to the window just opened, and takes it back when it shuts', () => {
    const opened = showWindow(layout(), 'build', true);
    expect(opened.focus).toBe('build');
    expect(showWindow(opened, 'build', false).focus).toBeNull();
  });

  it('leaves the keyboard where it is when another window shuts', () => {
    const both = showWindow(showWindow(layout(), 'books', true), 'build', true);
    expect(showWindow(both, 'books', false).focus).toBe('build');
  });

  it('raises a window that is already open instead of opening it twice', () => {
    const next = showWindow(
      layout({ open: ['build', 'books'], stack: ['build', 'books'] }),
      'build',
      true,
    );
    expect(next.open).toEqual(['build', 'books']);
    expect(next.stack).toEqual(['books', 'build']);
  });

  it('opens the window hosting a tab on that tab, in front and with the keyboard', () => {
    const next = showWindow(layout({ open: ['build'], stack: ['build'] }), 'report', true);
    expect(isOpen(next, 'overview')).toBe(true);
    expect(tabOf(next, 'overview')).toBe('report');
    expect(next.stack.at(-1)).toBe('overview');
    expect(next.focus).toBe('overview');
  });

  it('shuts the window hosting a tab when the tab is hidden', () => {
    const next = showWindow(
      layout({ open: ['people'], tabs: { people: 'guests' } }),
      'staff',
      false,
    );
    expect(isOpen(next, 'people')).toBe(false);
  });

  it('hands back the same layout when hiding a window that is shut', () => {
    const before = layout({ open: ['build'] });
    expect(showWindow(before, 'books', false)).toBe(before);
  });
});

describe('soloWindow', () => {
  it('shows a tab as the only window open', () => {
    const next = soloWindow(
      layout({ open: ['build', 'inbox'], stack: ['build', 'inbox'] }),
      'staff',
    );
    expect(next.open).toEqual(['people']);
    expect(tabOf(next, 'people')).toBe('staff');
  });

  it('keeps a window that is already open, alone', () => {
    const next = soloWindow(layout({ open: ['build', 'books'], stack: ['build'] }), 'books');
    expect(next.open).toEqual(['books']);
    expect(next.stack.at(-1)).toBe('books');
  });
});

describe('toCompact', () => {
  it('keeps only the window raised last', () => {
    const next = toCompact(
      layout({ open: ['build', 'inbox', 'books'], stack: ['books', 'inbox', 'camera'] }),
    );
    expect(next.open).toEqual(['inbox']);
  });

  it('leaves an empty layout as it is', () => {
    const empty = layout();
    expect(toCompact(empty)).toBe(empty);
  });
});

describe('raiseWindow', () => {
  it('hands back the same layout when the window is in front already', () => {
    const before = layout({ stack: ['build', 'inbox'] });
    expect(raiseWindow(before, 'inbox')).toBe(before);
  });

  it('draws a window never raised below every one that was', () => {
    const raised = raiseWindow(layout(), 'books');
    expect(depthOf(raised, 'build')).toBe(0);
    expect(depthOf(raised, 'books')).toBe(1);
  });
});

describe('tabOf', () => {
  it('falls back to the first tab when none was picked', () => {
    expect(tabOf(layout(), 'overview')).toBe('summary');
    expect(tabOf(layout({ open: ['books'] }), 'books'), 'a layout from before the tabs').toBe(
      'money',
    );
    expect(tabOf(layout({ tabs: { people: 'staff' } }), 'people')).toBe('staff');
  });
});

describe('resetPlaces', () => {
  it('forgets where windows were dragged but keeps which are open', () => {
    const moved = moveWindow(layout({ open: ['build'], stack: ['build'] }), 'build', {
      x: 1,
      y: 2,
    });
    expect(resetPlaces(moved)).toEqual(layout({ open: ['build'] }));
  });
});

describe('clampSpot', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 300, height: 400 };

  it('keeps the whole window across and the title bar down inside the screen', () => {
    expect(clampSpot({ x: 900, y: 900 }, size, viewport, 60)).toEqual({ x: 694, y: 756 });
  });

  it('never lets the title bar slide under the top bar', () => {
    expect(clampSpot({ x: -50, y: 0 }, size, viewport, 60)).toEqual({ x: 6, y: 60 });
  });

  it('pins a window wider than the screen to its left edge', () => {
    expect(clampSpot({ x: 200, y: 100 }, { width: 1200, height: 100 }, viewport, 60).x).toBe(6);
  });
});

describe('parseLayout', () => {
  it('never restores the keyboard to a window', () => {
    expect(parseLayout({ open: ['build'], focus: 'build' }).focus).toBeNull();
  });

  it('reads back what it was given', () => {
    const stored = moveWindow(layout({ open: ['build', 'debug'], stack: ['debug'] }), 'debug', {
      x: 10,
      y: 70,
    });
    expect(parseLayout(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('drops windows it does not know and spots that are not numbers', () => {
    const parsed = parseLayout({
      open: ['build', 'jukebox', 'build'],
      stack: 'advice',
      spots: { build: { x: 'left', y: 3 }, books: { x: 4, y: 5 }, jukebox: { x: 1, y: 1 } },
    });
    expect(parsed).toEqual(layout({ open: ['build'], spots: { books: { x: 4, y: 5 } } }));
  });

  it('reads windows an older build had as the tabs they became', () => {
    const parsed = parseLayout({ open: ['advice', 'messages', 'build'] });
    expect(parsed.open).toEqual(['inbox', 'build']);
    expect(parsed.tabs).toEqual({ inbox: 'advice' });
  });

  it('drops spots of windows that became tabs and tabs stored under the wrong window', () => {
    const parsed = parseLayout({
      open: ['build'],
      spots: { guests: { x: 1, y: 2 }, build: { x: 3, y: 4 } },
      tabs: { inbox: 'staff', people: 'guests' },
    });
    expect(parsed.spots).toEqual({ build: { x: 3, y: 4 } });
    expect(parsed.tabs).toEqual({ people: 'guests' });
  });

  it('falls back to the default for anything that is not a layout', () => {
    expect(parseLayout(null)).toBe(DEFAULT_LAYOUT);
    expect(parseLayout('build')).toBe(DEFAULT_LAYOUT);
    expect(parseLayout({ spots: {} })).toBe(DEFAULT_LAYOUT);
  });
});

describe('isWindowId', () => {
  it('knows a window, the inspector among them', () => {
    expect(isWindowId('saves')).toBe(true);
    expect(isWindowId('inspect')).toBe(true);
  });

  it('turns down a tab and anything that is not a window name', () => {
    expect(isWindowId('advice')).toBe(false);
    expect(isWindowId(undefined)).toBe(false);
    expect(isWindowId(42)).toBe(false);
  });
});
