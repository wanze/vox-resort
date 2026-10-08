export type EscapeOutcome = 'close' | 'close-window' | 'open' | 'pass';

// Passed on, never swallowed, while something else owns the key: the tool cancels, the inspector clears.
export function escapeOutcome(menuOpen: boolean, idle: boolean, inWindow: boolean): EscapeOutcome {
  if (menuOpen) return 'close';
  if (!idle) return 'pass';
  return inWindow ? 'close-window' : 'open';
}
