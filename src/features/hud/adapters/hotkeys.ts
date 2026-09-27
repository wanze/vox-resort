export interface Hotkey {
  readonly key: string;
  readonly run: () => boolean;
  // Held with Cmd on a Mac and Ctrl elsewhere; such a key also works from inside a field.
  readonly chord?: boolean;
}

export interface Hotkeys {
  dispose(): void;
}

function inAField(target: EventTarget | null): boolean {
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

// A hotkey returns false to let the key through, so Escape still reaches the tool or the inspector.
export function createHotkeys(keys: () => readonly Hotkey[]): Hotkeys {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (ignored(event)) return;
    const hotkey = keys().find((each) => matches(each, event));
    if (!hotkey?.run()) return;
    event.preventDefault();
    // A clicked button keeps the focus, and Space would press it again on the way up.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  };

  globalThis.addEventListener('keydown', onKeyDown);
  return {
    dispose() {
      globalThis.removeEventListener('keydown', onKeyDown);
    },
  };
}
