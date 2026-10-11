import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const Slot = createContext<HTMLElement | null>(null);

// Set by a window on the strip under its content, which stays put while the content scrolls.
export const ActionSlot = Slot.Provider;

// In the window's slot where there is one, so its buttons sit under the inset rather than in
// it; in line anywhere else, and for the one render before the slot is mounted.
export function Actions({ children }: { readonly children: ReactNode }) {
  const slot = useContext(Slot);
  const row = <div className="ui-actions">{children}</div>;
  return slot ? createPortal(row, slot) : row;
}
