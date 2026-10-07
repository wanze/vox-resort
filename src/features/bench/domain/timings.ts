import { percentile } from './frameStats';

export interface TimingEntry {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly detail?: unknown;
}

export interface TimingStats {
  readonly count: number;
  readonly totalMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  // Summed numeric details: the ticks behind the sim's frames, so a run can say ms per tick.
  readonly detailTotal: number;
}

const PREFIX = 'vox:';

// Boot measures happen once, before warmup ends, and would never be kept otherwise.
const ONCE = 'vox:boot:';

const kept = (entry: TimingEntry, since: number): boolean =>
  entry.name.startsWith(PREFIX) && (entry.name.startsWith(ONCE) || entry.startTime >= since);

const detailOf = (entry: TimingEntry): number =>
  typeof entry.detail === 'number' && Number.isFinite(entry.detail) ? entry.detail : 0;

const round = (value: number): number => Math.round(value * 100) / 100;

function statsOf(group: readonly TimingEntry[]): TimingStats {
  const sorted = group.map((entry) => entry.duration).toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    totalMs: round(sorted.reduce((sum, value) => sum + value, 0)),
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1) ?? 0),
    detailTotal: group.reduce((sum, entry) => sum + detailOf(entry), 0),
  };
}

export function summarizeTimings(
  entries: readonly TimingEntry[],
  since: number,
): Readonly<Record<string, TimingStats>> {
  const groups = new Map<string, TimingEntry[]>();
  for (const entry of entries.filter((candidate) => kept(candidate, since))) {
    const group = groups.get(entry.name) ?? [];
    group.push(entry);
    groups.set(entry.name, group);
  }
  return Object.fromEntries([...groups].map(([name, group]) => [name, statsOf(group)]));
}
