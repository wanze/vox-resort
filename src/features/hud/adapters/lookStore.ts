import { jsonStore } from '../../saves/adapters/jsonStore';
import { DEFAULT_LOOK, parseLook, type Look } from '../domain/looks';

// Apart from the HUD's other preferences, so the styleguide page switches the game's look too.
const store = jsonStore<Look>('vox-resort:look', DEFAULT_LOOK, parseLook);

let current: Look = DEFAULT_LOOK;
const listeners = new Set<() => void>();

const paint = (look: Look): void => {
  document.documentElement.dataset['look'] = look;
};

// Called before the first render, so the page never shows one look and then switches.
export function startLook(): void {
  current = store.load();
  paint(current);
}

export const currentLook = (): Look => current;

export function setLook(look: Look): void {
  current = look;
  paint(look);
  store.save(look);
  for (const listener of listeners) listener();
}

export function watchLook(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
