import { describe, expect, it } from 'vitest';
import { WINDOW_IDS } from './windowLayout';
import { hostOfTab, isTab, isTabbed, WINDOW_TABS, type TabbedWindow } from './windowTabs';

const allTabs = Object.values(WINDOW_TABS).flat();

describe('WINDOW_TABS', () => {
  it('gives every tab exactly one host', () => {
    expect(new Set(allTabs).size).toBe(allTabs.length);
    for (const [host, tabs] of Object.entries(WINDOW_TABS)) {
      for (const tab of tabs) expect(hostOfTab(tab)).toBe(host as TabbedWindow);
    }
  });

  it('never names a tab the same as a window', () => {
    for (const tab of allTabs) {
      expect(isTab(tab)).toBe(true);
      expect(WINDOW_IDS).not.toContain(tab);
    }
  });
});

describe('hostOfTab', () => {
  it('finds the window a tab lives in', () => {
    expect(hostOfTab('report')).toBe('overview');
    expect(hostOfTab('staff')).toBe('people');
  });
});

describe('the books', () => {
  it('hosts the money and the prices', () => {
    expect(hostOfTab('money')).toBe('books');
    expect(hostOfTab('prices')).toBe('books');
    expect(isTabbed('books')).toBe(true);
  });
});

describe('isTabbed', () => {
  it('is false for a window without tabs', () => {
    expect(isTabbed('build')).toBe(false);
    expect(isTabbed('inbox')).toBe(true);
  });
});
