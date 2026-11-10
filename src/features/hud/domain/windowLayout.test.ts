import { describe, expect, it } from 'vitest';
import {
  canGoBack,
  DEFAULT_LAYOUT,
  depthOf,
  goBack,
  isOpen,
  isWindowId,
  parseLayout,
  raiseWindow,
  showWindow,
  sideOf,
  soloWindow,
  tabOf,
  toCompact,
  toggleWindow,
  type WindowLayout,
} from './windowLayout';

const layout = (patch: Partial<WindowLayout> = {}): WindowLayout => ({
  open: [],
  stack: [],
  back: [],
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

describe('sideOf', () => {
  it('keeps the build palette and the inspector right, dialogs in the middle, the rest left', () => {
    expect(sideOf('build')).toBe('right');
    expect(sideOf('inspect')).toBe('right');
    expect(sideOf('books')).toBe('left');
    expect(sideOf('camera')).toBe('left');
    expect(sideOf('saves')).toBeNull();
  });
});

describe('the left side', () => {
  it('holds one window: the next takes its place and remembers it', () => {
    const next = showWindow(layout({ open: ['build', 'inbox'] }), 'money', true);
    expect(next.open).toEqual(['build', 'books']);
    expect(next.back).toEqual(['inbox']);
    expect(canGoBack(next, 'books')).toBe(true);
  });

  it('leaves the build palette and the dialogs open beside it, and remembers nothing for them', () => {
    const next = showWindow(layout({ open: ['books'], back: ['inbox'] }), 'saves', true);
    expect(next.open).toEqual(['books', 'saves']);
    expect(next.back).toEqual(['inbox']);
    expect(canGoBack(next, 'saves')).toBe(false);
  });

  it('switches tabs without a step to go back to', () => {
    const next = showWindow(layout({ open: ['books'] }), 'prices', true);
    expect(next.back).toEqual([]);
  });

  it('goes back step by step, and forgets the way once the window is shut', () => {
    const there = showWindow(
      showWindow(layout({ open: ['inbox'] }), 'people', true),
      'books',
      true,
    );
    expect(there.back).toEqual(['inbox', 'people']);
    const back = goBack(there);
    expect(back.open).toEqual(['people']);
    expect(back.back).toEqual(['inbox']);
    expect(back.focus).toBe('people');
    expect(showWindow(back, 'people', false).back).toEqual([]);
  });

  it('starts afresh when a window opens onto an empty side', () => {
    expect(showWindow(layout({ back: ['inbox'] }), 'books', true).back).toEqual([]);
  });

  it('hands back the same layout with nowhere to go back to', () => {
    const before = layout({ open: ['books'] });
    expect(goBack(before)).toBe(before);
  });
});

describe('parseLayout', () => {
  it('never restores the keyboard to a window', () => {
    expect(parseLayout({ open: ['build'], focus: 'build' }).focus).toBeNull();
  });

  it('reads back what it was given, but the way back', () => {
    const stored = layout({
      open: ['build', 'debug'],
      stack: ['debug'],
      tabs: { books: 'prices' },
    });
    expect(parseLayout(JSON.parse(JSON.stringify({ ...stored, back: ['inbox'] })))).toEqual(stored);
  });

  it('keeps only the left window opened last from a build that let several share the side', () => {
    expect(parseLayout({ open: ['inbox', 'build', 'books', 'saves'] }).open).toEqual([
      'build',
      'books',
      'saves',
    ]);
  });

  it("drops windows it does not know, and reads an older build's dragged spots as nothing", () => {
    const parsed = parseLayout({
      open: ['build', 'jukebox', 'build'],
      stack: 'advice',
      spots: { books: { x: 4, y: 5 } },
    });
    expect(parsed).toEqual(layout({ open: ['build'] }));
  });

  it('reads windows an older build had as the tabs they became', () => {
    const parsed = parseLayout({ open: ['advice', 'messages', 'build'] });
    expect(parsed.open).toEqual(['inbox', 'build']);
    expect(parsed.tabs).toEqual({ inbox: 'advice' });
  });

  it('drops tabs stored under the wrong window', () => {
    const parsed = parseLayout({ open: ['build'], tabs: { inbox: 'staff', people: 'guests' } });
    expect(parsed.tabs).toEqual({ people: 'guests' });
  });

  it('falls back to the default for anything that is not a layout', () => {
    expect(parseLayout(null)).toBe(DEFAULT_LAYOUT);
    expect(parseLayout('build')).toBe(DEFAULT_LAYOUT);
    expect(parseLayout({ stack: [] })).toBe(DEFAULT_LAYOUT);
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
