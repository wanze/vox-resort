export interface Searchable {
  readonly label: string;
  readonly group: string;
  readonly keywords?: string;
}

export interface CommandSection<T extends Searchable> {
  readonly group: string;
  readonly items: readonly T[];
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const wordsOf = (query: string): readonly string[] => fold(query).split(/\s+/).filter(Boolean);

// Weighted so the name a player has in mind beats a command that only mentions it in passing.
function scoreWord(label: string, rest: string, word: string): number {
  if (label.startsWith(word)) return 4;
  if (label.includes(` ${word}`)) return 3;
  if (label.includes(word)) return 2;
  return rest.includes(word) ? 1 : 0;
}

function scoreOf(item: Searchable, words: readonly string[]): number {
  const label = fold(item.label);
  const rest = `${fold(item.group)} ${fold(item.keywords ?? '')}`;
  let total = 0;
  for (const word of words) {
    const score = scoreWord(label, rest, word);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

// Every word has to land, so a second word narrows rather than widens; ties keep the given order.
export function rankCommands<T extends Searchable>(
  items: readonly T[],
  query: string,
): readonly T[] {
  const words = wordsOf(query);
  if (words.length === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreOf(item, words) }))
    .filter((each) => each.score > 0)
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map((each) => each.item);
}

// Sections come in the order of their best hit, so the top row is always the first one shown.
export function sectionCommands<T extends Searchable>(
  ranked: readonly T[],
): readonly CommandSection<T>[] {
  const sections = new Map<string, T[]>();
  for (const item of ranked) {
    const section = sections.get(item.group);
    if (section) section.push(item);
    else sections.set(item.group, [item]);
  }
  return [...sections].map(([group, items]) => ({ group, items }));
}
