import { DEFAULT_SOUND_PREFS, parseSoundPrefs, type SoundPrefs } from '../domain/soundPrefs';

// Apart from the HUD's store, whose `muted` already means toasts muted by kind.
const KEY = 'vox-resort:sound';

// Storage throws in a private window or with site data blocked; the settings are then just not kept.
export function loadSoundPrefs(): SoundPrefs {
  try {
    const stored = globalThis.localStorage.getItem(KEY);
    return stored === null ? DEFAULT_SOUND_PREFS : parseSoundPrefs(JSON.parse(stored));
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

export function saveSoundPrefs(prefs: SoundPrefs): void {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Same as above: an unsaved setting only costs the player a slider next time.
  }
}
