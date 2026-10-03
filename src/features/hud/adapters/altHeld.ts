import { inAField } from './hotkeys';

// Cleared on blur too: an Alt-Tab away never delivers the keyup.
export function watchAltHeld(onChange: (held: boolean) => void): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Alt' && !event.repeat && !inAField(event.target)) onChange(true);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Alt') onChange(false);
  };
  const onBlur = (): void => onChange(false);
  globalThis.addEventListener('keydown', onKeyDown);
  globalThis.addEventListener('keyup', onKeyUp);
  globalThis.addEventListener('blur', onBlur);
  return () => {
    globalThis.removeEventListener('keydown', onKeyDown);
    globalThis.removeEventListener('keyup', onKeyUp);
    globalThis.removeEventListener('blur', onBlur);
  };
}
