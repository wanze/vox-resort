// Past nine a badge only says "many": a wider one would cover the icon it sits on.
const MOST_SHOWN = 9;

export const badgeText = (count: number): string =>
  count > MOST_SHOWN ? `${MOST_SHOWN}+` : String(count);
