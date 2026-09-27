import { DEFAULT_LAYOUT, parseLayout, type WindowLayout } from '../domain/windowLayout';

const KEY = 'vox-resort:windows';

// Storage throws in a private window or with site data blocked; the layout is then just not kept.
export function loadLayout(): WindowLayout {
  try {
    const stored = globalThis.localStorage.getItem(KEY);
    return stored === null ? DEFAULT_LAYOUT : parseLayout(JSON.parse(stored));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: WindowLayout): void {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Same as above: an unsaved layout only costs the player a drag next time.
  }
}
