import { parseColour, type Rgba } from '../shared/domain/contrast';

export type TokenKind = 'colour' | 'surface' | 'shadow' | 'font' | 'length' | 'other';

export interface Token {
  readonly name: string;
  // As the browser resolves it, every var() inside it substituted.
  readonly value: string;
  readonly kind: TokenKind;
  readonly rgba: Rgba | null;
}

// Grouping rules (layers, media) and imported sheets hold rules of their own.
const innerRules = (rule: CSSRule): CSSRuleList | undefined =>
  (rule as Partial<CSSGroupingRule>).cssRules ??
  (rule as Partial<CSSImportRule>).styleSheet?.cssRules;

function* everyRule(rules: CSSRuleList): Generator<CSSRule> {
  for (const rule of rules) {
    yield rule;
    const inner = innerRules(rule);
    if (inner) yield* everyRule(inner);
  }
}

const isRoot = (rule: CSSRule): rule is CSSStyleRule =>
  rule instanceof CSSStyleRule && rule.selectorText === ':root';

// Read from the sheets rather than listed here, so a token added to tokens.css shows up unasked.
function rootNames(rules: CSSRuleList, into: Set<string>): void {
  for (const rule of [...everyRule(rules)].filter(isRoot)) {
    for (const name of rule.style) if (name.startsWith('--')) into.add(name);
  }
}

const SHADOWS = /^--(shadow|bevel|glow|emboss|extrude|knob-shadow|viewfinder-shade|print-vignette)/;

// First match wins, so a gradient is a surface before CSS could call it anything else.
const KINDS: readonly (readonly [TokenKind, (name: string, value: string) => boolean])[] = [
  ['font', (name) => name.startsWith('--font')],
  ['shadow', (name) => SHADOWS.test(name)],
  ['surface', (_, value) => /gradient\(|url\(/.test(value)],
  ['colour', (_, value) => CSS.supports('color', value)],
  ['length', (_, value) => CSS.supports('width', value)],
];

const kindOf = (name: string, value: string): TokenKind =>
  KINDS.find(([, test]) => test(name, value))?.[0] ?? 'other';

// A probe turns any colour spelling into the rgb() the contrast maths reads.
function rgbaOf(value: string, probe: HTMLElement): Rgba | null {
  probe.style.color = '';
  probe.style.color = value;
  return parseColour(getComputedStyle(probe).color);
}

export function readTokens(): readonly Token[] {
  const names = new Set<string>();
  for (const sheet of document.styleSheets) {
    try {
      rootNames(sheet.cssRules, names);
    } catch {
      // A sheet from another origin keeps its rules to itself.
    }
  }
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('span');
  document.body.append(probe);
  const tokens = [...names].map((name): Token => {
    const value = root.getPropertyValue(name).trim();
    const kind = kindOf(name, value);
    return { name, value, kind, rgba: kind === 'colour' ? rgbaOf(value, probe) : null };
  });
  probe.remove();
  return tokens;
}
