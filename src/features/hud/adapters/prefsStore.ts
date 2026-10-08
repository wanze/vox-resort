import { jsonStore } from '../../saves/adapters/jsonStore';
import { DEFAULT_PREFS, parsePrefs, type HudPrefs } from '../domain/hudPrefs';

const store = jsonStore('vox-resort:hud', DEFAULT_PREFS, parsePrefs);

export const loadPrefs = (): HudPrefs => store.load();
export const savePrefs = (prefs: HudPrefs): void => store.save(prefs);
