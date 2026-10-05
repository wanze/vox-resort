import {
  objectTypeById,
  stylesOf,
  type ObjectTypeDefinition,
} from '../../catalog/domain/objectTypes';
import type { LayoutItem } from '../../layout/domain/resortLayout';
import { isPaintable, layoutItemFor } from './buildPlan';
import type { BuildTool, StylePick } from './buildTool';

export interface StyleStrip {
  readonly family: string;
  readonly pick: StylePick;
  readonly styles: readonly ObjectTypeDefinition[];
}

export interface ArmedWithMemory {
  readonly tool: BuildTool | null;
  readonly memory: ReadonlyMap<string, StylePick>;
}

// A pick the family no longer has rolls, so a variant removed from the art leaves no dead pick.
export function resolveStyle(
  styles: readonly string[],
  pick: StylePick,
  random: () => number,
): string {
  if (pick !== null && styles.includes(pick)) return pick;
  const rolled = styles[Math.floor(random() * styles.length)];
  if (rolled === undefined) throw new Error('A family has at least one style');
  return rolled;
}

// A family drawn in runs starts on its original: a row of lamps reads as one piece unless the
// player asks for a mix.
export function startsOnOriginal(family: string): boolean {
  const original = stylesOf(family)[0];
  return original !== undefined && isPaintable(layoutItemFor(original));
}

function firstPick(family: string): StylePick {
  return startsOnOriginal(family) ? (stylesOf(family)[0]?.id ?? null) : null;
}

export function nextPick(styles: readonly string[], pick: StylePick): StylePick {
  if (styles.length < 2) return null;
  if (pick === null) return styles[0]!;
  return styles[styles.indexOf(pick) + 1] ?? null;
}

// Only the style strip and V name a style; a palette tile or command arms the family as it was left,
// or on its first pick the first time.
export function armWithMemory(
  next: BuildTool | null,
  memory: ReadonlyMap<string, StylePick>,
): ArmedWithMemory {
  if (next?.kind !== 'object') return { tool: next, memory };
  if (next.style === undefined) {
    const style = memory.has(next.id) ? memory.get(next.id)! : firstPick(next.id);
    return { tool: { ...next, style }, memory };
  }
  return { tool: next, memory: new Map(memory).set(next.id, next.style) };
}

export function styleIdsOf(family: string): readonly string[] {
  return stylesOf(family).map((type) => type.id);
}

// The pick is read once, here: a tool with another pick gets a chooser of its own.
export function itemChooser(
  tool: BuildTool | null,
  random: () => number,
): (() => LayoutItem) | null {
  if (tool?.kind !== 'object') return null;
  const styles = styleIdsOf(tool.id);
  const pick = tool.style ?? null;
  return () => layoutItemFor(objectTypeById(resolveStyle(styles, pick, random)));
}

// Only for an armed family with styles to choose between.
export function styleStripFor(tool: BuildTool | null): StyleStrip | null {
  if (tool?.kind !== 'object') return null;
  const styles = stylesOf(tool.id);
  if (styles.length < 2) return null;
  return { family: tool.id, pick: tool.style ?? null, styles };
}

export function cycledTool(tool: BuildTool | null): BuildTool | null {
  const strip = styleStripFor(tool);
  if (!strip) return null;
  const styles = strip.styles.map((type) => type.id);
  return { kind: 'object', id: strip.family, style: nextPick(styles, strip.pick) };
}

export function styleLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function pickLabel(strip: StyleStrip): string {
  const index = strip.styles.findIndex((type) => type.id === strip.pick);
  return index < 0 ? 'Random' : `Style ${styleLetter(index)}`;
}
