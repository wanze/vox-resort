import { blursAfter, pressesControl, type KeyTarget } from '../domain/keyTarget';

export interface Hotkey {
  readonly key: string;
  readonly run: () => boolean;
  // Held with Cmd on a Mac and Ctrl elsewhere; such a key also works from inside a field.
  readonly chord?: boolean;
}

export interface Hotkeys {
  dispose(): void;
}

export function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

const chorded = (event: KeyboardEvent): boolean => event.metaKey || event.ctrlKey;

// Held keys would toggle a window many times a second.
const ignored = (event: KeyboardEvent): boolean => event.altKey || event.repeat;

// Other chords belong to the browser, and a plain key typed in a field is text.
function matches(hotkey: Hotkey, event: KeyboardEvent): boolean {
  if (hotkey.key !== event.key.toLowerCase()) return false;
  return hotkey.chord === true ? chorded(event) : !chorded(event) && !inAField(event.target);
}

function keyTargetOf(
  target: EventTarget | null,
  keyboardFocused: EventTarget | null,
): KeyTarget | null {
  if (!(target instanceof HTMLElement)) return null;
  return {
    tag: target.tagName.toLowerCase(),
    role: target.getAttribute('role'),
    href: target.hasAttribute('href'),
    keyboardFocus: target === keyboardFocused,
  };
}

const passedOn = (event: KeyboardEvent, target: KeyTarget | null): boolean =>
  ignored(event) || pressesControl(target, event.key.toLowerCase());

function blur(target: EventTarget | null): void {
  if (target instanceof HTMLElement) target.blur();
}

// A hotkey returns false to let the key through, so Escape still reaches the tool or the inspector.
export function createHotkeys(keys: () => readonly Hotkey[]): Hotkeys {
  // Read when focus arrives, not on the key: a key press may make a clicked button match
  // :focus-visible too, and Space would press it twice.
  let keyboardFocused: EventTarget | null = null;
  const onFocusIn = (event: FocusEvent): void => {
    const { target } = event;
    keyboardFocused =
      target instanceof HTMLElement && target.matches(':focus-visible') ? target : null;
  };
  const onPointerDown = (): void => {
    keyboardFocused = null;
  };
  const ran = (event: KeyboardEvent): boolean =>
    keys()
      .find((each) => matches(each, event))
      ?.run() === true;
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = keyTargetOf(event.target, keyboardFocused);
    if (passedOn(event, target) || !ran(event)) return;
    event.preventDefault();
    if (blursAfter(target)) blur(event.target);
  };

  globalThis.addEventListener('focusin', onFocusIn);
  globalThis.addEventListener('pointerdown', onPointerDown, { capture: true });
  globalThis.addEventListener('keydown', onKeyDown);
  return {
    dispose() {
      globalThis.removeEventListener('focusin', onFocusIn);
      globalThis.removeEventListener('pointerdown', onPointerDown, { capture: true });
      globalThis.removeEventListener('keydown', onKeyDown);
    },
  };
}
