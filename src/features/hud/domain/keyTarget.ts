export interface KeyTarget {
  readonly tag: string;
  readonly role: string | null;
  readonly href: boolean;
  readonly keyboardFocus: boolean;
}

const PRESSED_TAGS: ReadonlySet<string> = new Set(['button', 'summary']);
const PRESSED_ROLES: ReadonlySet<string> = new Set([
  'button',
  'tab',
  'menuitem',
  'menuitemradio',
  'menuitemcheckbox',
  'radio',
  'switch',
  'checkbox',
]);

const isControl = ({ tag, role, href }: KeyTarget): boolean =>
  PRESSED_TAGS.has(tag) || (role !== null && PRESSED_ROLES.has(role)) || (tag === 'a' && href);

// The keys a browser presses a control with; no hotkey may take them from one the keyboard is on.
export function pressesControl(target: KeyTarget | null, key: string): boolean {
  if (target === null || !target.keyboardFocus) return false;
  return (key === ' ' || key === 'enter') && isControl(target);
}

// A clicked control keeps the focus, and Space would press it again on the way up.
export function blursAfter(target: KeyTarget | null): boolean {
  return target !== null && !target.keyboardFocus && isControl(target);
}
