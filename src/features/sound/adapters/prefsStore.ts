import { jsonStore } from '../../saves/adapters/jsonStore';
import { DEFAULT_SOUND_PREFS, parseSoundPrefs, type SoundPrefs } from '../domain/soundPrefs';

// Apart from the HUD's store, whose `muted` already means toasts muted by kind.
const store = jsonStore('vox-resort:sound', DEFAULT_SOUND_PREFS, parseSoundPrefs);

export const loadSoundPrefs = (): SoundPrefs => store.load();
export const saveSoundPrefs = (prefs: SoundPrefs): void => store.save(prefs);
