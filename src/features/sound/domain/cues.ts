import type { Toast, ToastKind } from '../../hud/domain/news';
import type { SlotName } from './bank';

export type Cue =
  | 'click'
  | 'toggle'
  | 'refused'
  | 'alert'
  | 'notice'
  | 'place'
  | 'pave'
  | 'dig'
  | 'demolish'
  | 'built'
  | 'land'
  | 'morning'
  | 'day';

export type BuildCue = 'place' | 'pave' | 'dig' | 'demolish' | 'built' | 'land';

export const CUE_SLOT = {
  click: 'click',
  toggle: 'toggle',
  refused: 'refused',
  alert: 'alert',
  notice: 'notice',
  place: 'place',
  pave: 'pave',
  dig: 'dig',
  demolish: 'demolish',
  built: 'built',
  land: 'land',
  morning: 'morning',
  day: 'day',
} as const satisfies { readonly [cue in Cue]: SlotName };

// A drag paves or digs a tile per pointer move, and a run of sites can finish on one frame.
const CUE_COOLDOWN_MS: { readonly [cue in Cue]?: number } = {
  pave: 70,
  dig: 70,
  click: 40,
  built: 150,
};

export function cueAllowed(cue: Cue, lastAt: number | undefined, now: number): boolean {
  return lastAt === undefined || now - lastAt >= (CUE_COOLDOWN_MS[cue] ?? 0);
}

// Never the one just played, so a cue heard twice in a row does not sound like a machine.
export function pickVariant(count: number, last: number, random: () => number): number {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.floor(random() * count);
  const pick = Math.floor(random() * (count - 1));
  return pick >= last ? pick + 1 : pick;
}

const DETUNED: ReadonlySet<Cue> = new Set(['place', 'pave', 'dig', 'click']);

const DETUNE_CENTS = 60;

// Only the cues repeated by the dozen: a jingle played off pitch sounds out of tune.
export function cueDetune(cue: Cue, random: () => number): number {
  return DETUNED.has(cue) ? (random() * 2 - 1) * DETUNE_CENTS : 0;
}

export type LoopSchedule =
  | { readonly kind: 'plain' }
  | { readonly kind: 'crossfade'; readonly period: number; readonly fade: number };

// Each pass starts `period` after the one before and overlaps it by `fade`. Too short a file
// would spend most of itself fading, so it loops plainly instead.
export function loopSchedule(duration: number, fade: number): LoopSchedule {
  if (duration < 3 * fade) return { kind: 'plain' };
  return { kind: 'crossfade', period: duration - fade, fade };
}

// Equal power: two uncorrelated recordings faded linearly dip by 3 dB halfway through.
export function fadeCurve(steps: number, rising: boolean): Float32Array {
  const curve = new Float32Array(steps);
  for (let step = 0; step < steps; step++) {
    const through = step / (steps - 1);
    curve[step] = Math.sin(((rising ? through : 1 - through) * Math.PI) / 2);
  }
  return curve;
}

const TOAST_CUES: { readonly [kind in ToastKind]: Cue } = {
  urgent: 'alert',
  warning: 'notice',
  day: 'day',
};

export const toastCue = (kind: ToastKind): Cue => TOAST_CUES[kind];

// A new version on offer is about the game, not the resort, so it comes in quietly.
export function toastCueOf(toast: Toast): Cue | null {
  if (toast.kind === 'update') return null;
  return toastCue(toast.kind === 'advice' ? toast.news.severity : toast.kind);
}
