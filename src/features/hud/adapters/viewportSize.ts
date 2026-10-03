// The visual viewport follows a mobile browser's toolbars as they slide in and out; the window
// only learns of them once they settle, if at all.
export function watchViewport(onChange: (width: number, height: number) => void): () => void {
  const viewport = globalThis.visualViewport;
  const target: EventTarget = viewport ?? globalThis;
  const report = (): void => {
    if (viewport) onChange(viewport.width, viewport.height);
    else onChange(globalThis.innerWidth, globalThis.innerHeight);
  };
  report();
  target.addEventListener('resize', report);
  return () => target.removeEventListener('resize', report);
}
