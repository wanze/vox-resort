import { steadySize, type ViewportSize } from '../domain/layoutMode';

const NO_KEYBOARD = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'];
const TYPED = `input:not(${NO_KEYBOARD.map((type) => `[type='${type}']`).join(', ')}), textarea, [contenteditable]:not([contenteditable='false'])`;

const typing = (): boolean => globalThis.document?.activeElement?.matches(TYPED) ?? false;

// The visual viewport follows a mobile browser's toolbars as they slide in and out; the window
// only learns of them once they settle, if at all.
export function watchViewport(onChange: (width: number, height: number) => void): () => void {
  const viewport = globalThis.visualViewport;
  const target: EventTarget = viewport ?? globalThis;
  let settled: ViewportSize | null = null;
  const report = (): void => {
    const measured = viewport
      ? { width: viewport.width, height: viewport.height }
      : { width: globalThis.innerWidth, height: globalThis.innerHeight };
    settled = steadySize(settled, measured, typing());
    onChange(settled.width, settled.height);
  };
  report();
  target.addEventListener('resize', report);
  return () => target.removeEventListener('resize', report);
}
