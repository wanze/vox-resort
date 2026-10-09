import { isWindowId, type WindowId } from '../domain/windowLayout';

export function focusedWindow(): WindowId | null {
  const host = document.activeElement?.closest('.ui-window');
  const id = host instanceof HTMLElement ? host.dataset['window'] : undefined;
  return isWindowId(id) ? id : null;
}
