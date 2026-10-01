import { DEFAULT_PREFS, parsePrefs, type HudPrefs } from '../domain/hudPrefs';

const KEY = 'vox-resort:hud';

// Storage throws in a private window or with site data blocked; the preferences are then just not kept.
export function loadPrefs(): HudPrefs {
  try {
    const stored = globalThis.localStorage.getItem(KEY);
    return stored === null ? DEFAULT_PREFS : parsePrefs(JSON.parse(stored));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: HudPrefs): void {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Same as above: an unsaved preference only costs the player a click next time.
  }
}
