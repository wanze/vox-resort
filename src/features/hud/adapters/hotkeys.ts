export interface Hotkey {
  readonly key: string;
  readonly run: () => boolean;
}

export interface Hotkeys {
  dispose(): void;
}

function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

// Chords belong to the browser and held keys would toggle a window many times a second.
function ignored(event: KeyboardEvent): boolean {
  const held = [event.metaKey, event.ctrlKey, event.altKey, event.repeat];
  return held.some(Boolean) || inAField(event.target);
}

// A hotkey returns false to let the key through, so Escape still reaches the tool or the inspector.
export function createHotkeys(keys: () => readonly Hotkey[]): Hotkeys {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (ignored(event)) return;
    const hotkey = keys().find((each) => each.key === event.key.toLowerCase());
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
