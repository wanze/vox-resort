export type EscapeOutcome = 'close' | 'open' | 'pass';

// Passed on, never swallowed, while something else owns the key: the tool cancels, the inspector clears.
export function escapeOutcome(menuOpen: boolean, idle: boolean): EscapeOutcome {
  if (menuOpen) return 'close';
  return idle ? 'open' : 'pass';
}
