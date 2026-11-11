export const LOOKS = ['block', 'carved', 'pebble'] as const;

export type Look = (typeof LOOKS)[number];

export const DEFAULT_LOOK: Look = 'block';

export const isLook = (value: unknown): value is Look => LOOKS.includes(value as Look);

// A look stored by an older build, or by hand, falls back rather than leaving the HUD unstyled.
export const parseLook = (value: unknown): Look => (isLook(value) ? value : DEFAULT_LOOK);
