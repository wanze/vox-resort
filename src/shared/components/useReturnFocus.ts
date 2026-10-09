import { useEffect, useRef, useState } from 'react';

const focusLost = (): boolean =>
  document.activeElement === null || document.activeElement === document.body;

const stillThere = (opener: Element | null): opener is HTMLElement =>
  opener instanceof HTMLElement && opener !== document.body && opener.isConnected;

// Hands the keyboard back only when it went down with the layer, never away from where it went.
export function useReturnFocus(fallback: () => HTMLElement | null): void {
  // Read while rendering, before an autofocus inside the new layer moves the focus.
  const [opener] = useState(() => document.activeElement);
  const latest = useRef(fallback);
  const mounted = useRef(false);
  useEffect(() => {
    latest.current = fallback;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Checked a beat later, so StrictMode's rehearsed unmount, mounted again at once, moves nothing.
      queueMicrotask(() => {
        if (mounted.current || !focusLost()) return;
        (stillThere(opener) ? opener : latest.current())?.focus();
      });
    };
  }, [opener]);
}
