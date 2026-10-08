export type HudAction =
  | 'palette'
  | 'save'
  | 'find'
  | 'pause'
  | 'build'
  | 'staffPins'
  | 'signs'
  | 'sound'
  | 'land'
  | 'debug'
  | 'nextStyle'
  | 'cancel';
export type CameraAction = 'cameraMode' | 'turnLeft' | 'turnRight';
type KeyAction = HudAction | CameraAction | 'turnPlacement';

interface KeyBinding {
  // KeyboardEvent.key lower-cased, as every listener compares it.
  readonly key: string;
  // Held with Cmd on a Mac and Ctrl elsewhere.
  readonly chord?: true;
}

export const KEYMAP: { readonly [action in KeyAction]: KeyBinding } = {
  palette: { key: 'k', chord: true },
  save: { key: 's', chord: true },
  find: { key: '/' },
  pause: { key: ' ' },
  build: { key: 'b' },
  staffPins: { key: 's' },
  signs: { key: 'n' },
  sound: { key: 'm' },
  land: { key: 'l' },
  debug: { key: 'f3' },
  nextStyle: { key: 'v' },
  cancel: { key: 'escape' },
  cameraMode: { key: 'c' },
  turnLeft: { key: 'q' },
  turnRight: { key: 'e' },
  turnPlacement: { key: 'r' },
};

const KEY_NAMES: { readonly [key: string]: string } = { ' ': 'Space', escape: 'Esc' };

export function keyLabel(action: KeyAction, mac = false): string {
  const { key, chord } = KEYMAP[action];
  const name = KEY_NAMES[key] ?? key.toUpperCase();
  if (chord !== true) return name;
  return mac ? `⌘${name}` : `Ctrl+${name}`;
}

// A key that types a character can be turned off (WCAG 2.1.4); Esc, F3 and the chords cannot.
export function keyHeard(action: KeyAction, singleKeys: boolean): boolean {
  const { key, chord } = KEYMAP[action];
  return singleKeys || chord === true || key.length > 1;
}

export function hotkeysFor<A extends KeyAction>(
  runs: { readonly [action in A]: () => boolean },
  singleKeys: boolean,
): { readonly key: string; readonly chord: boolean; readonly run: () => boolean }[] {
  return (Object.keys(runs) as A[])
    .filter((action) => keyHeard(action, singleKeys))
    .map((action) => ({
      key: KEYMAP[action].key,
      chord: KEYMAP[action].chord === true,
      run: runs[action],
    }));
}
