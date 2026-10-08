import { firstLaunchedFrom, type Show, type Shell } from '../../fireworks/domain/show';
import { MAX_RISE } from '../../fireworks/domain/shells';
import { unitAt } from '../../random/domain/hash';

// The lanterns' scale, four voxels to the metre.
const VOXELS_PER_METRE = 4;
const SOUND_VOXELS_PER_SECOND = 343 * VOXELS_PER_METRE;

// Full loudness this near; quieter beyond, but never below QUIETEST: a show is heard plot-wide.
const REFERENCE_VOXELS = 400;
const QUIETEST = 0.25;
const USUAL_RADIUS = 55;

const THUMP_GAIN = 0.35;
const THUMP_SECONDS = 0.15;
const WHISTLE_GAIN = 0.2;
const BANG_SECONDS = 0.6;
const CRACKLE_AFTER = 0.6;
const CRACKLE_SECONDS = 1;
const CRACKLE_GAIN = 0.5;

// Bangs closer than this sound as one; a finale would otherwise start fifty noise sources at once.
const MERGE_SECONDS = 0.04;
export const MAX_BANGS_PER_WINDOW = 8;

// The furthest a listener is from a burst on the largest plot, as seconds of sound.
const LONGEST_DELAY = 6;
const LATEST_SOUND = MAX_RISE + CRACKLE_AFTER + LONGEST_DELAY;

export type FireworkVoice = 'thump' | 'whistle' | 'bang' | 'crackle';

export interface FireworkSound {
  // Show seconds.
  readonly at: number;
  readonly voice: FireworkVoice;
  readonly gain: number;
  readonly seconds: number;
  readonly seed: number;
}

export interface Listener {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const distanceTo = (listener: Listener, x: number, y: number, z: number): number =>
  Math.hypot(x - listener.x, y - listener.y, z - listener.z);

const loudnessAt = (distance: number): number =>
  Math.max(QUIETEST, Math.min(1, REFERENCE_VOXELS / Math.max(1, distance)));

export function soundsOfShell(shell: Shell, listener: Listener): FireworkSound[] {
  const { site, seed } = shell;
  const launchDistance = distanceTo(listener, site.x, site.y, site.z);
  const launchHeard = shell.launchAt + launchDistance / SOUND_VOXELS_PER_SECOND;
  const near = loudnessAt(launchDistance);
  const burstDistance = distanceTo(listener, shell.burstX, shell.burstY, shell.burstZ);
  const bangAt = shell.launchAt + shell.rise + burstDistance / SOUND_VOXELS_PER_SECOND;
  const loud = loudnessAt(burstDistance);
  const sounds: FireworkSound[] = [
    { at: launchHeard, voice: 'thump', gain: THUMP_GAIN * near, seconds: THUMP_SECONDS, seed },
    {
      at: bangAt,
      voice: 'bang',
      gain: Math.min(1, shell.radius / USUAL_RADIUS) * loud,
      seconds: BANG_SECONDS,
      seed,
    },
  ];
  if (shell.whistle) {
    sounds.push({
      at: launchHeard,
      voice: 'whistle',
      gain: WHISTLE_GAIN * near,
      seconds: shell.rise,
      seed,
    });
  }
  if (shell.kind === 'crackle') {
    const at = bangAt + CRACKLE_AFTER;
    sounds.push({
      at,
      voice: 'crackle',
      gain: CRACKLE_GAIN * loud,
      seconds: CRACKLE_SECONDS,
      seed,
    });
  }
  return sounds;
}

// The louder of two bangs keeps its place; the merged one is as loud as both together.
function mergedBangs(bangs: FireworkSound[]): FireworkSound[] {
  const merged: FireworkSound[] = [];
  for (const bang of bangs.toSorted((a, b) => a.at - b.at)) {
    const last = merged.at(-1);
    if (last && bang.at - last.at < MERGE_SECONDS) {
      merged[merged.length - 1] = { ...last, gain: Math.hypot(last.gain, bang.gain) };
    } else merged.push(bang);
  }
  return merged
    .toSorted((a, b) => b.gain - a.gain)
    .slice(0, MAX_BANGS_PER_WINDOW)
    .toSorted((a, b) => a.at - b.at);
}

// As thunderDue: never earlier than now, and never one twice across consecutive windows.
export function fireworksDue(
  show: Show,
  lastScheduled: number,
  now: number,
  horizon: number,
  listener: Listener,
): FireworkSound[] {
  const from = Math.max(lastScheduled, now);
  const to = now + horizon;
  if (to <= from) return [];
  const due: FireworkSound[] = [];
  const bangs: FireworkSound[] = [];
  const first = firstLaunchedFrom(show.shells, from - LATEST_SOUND);
  for (let index = first; index < show.shells.length; index++) {
    const shell = show.shells[index]!;
    if (shell.launchAt > to) break;
    for (const sound of soundsOfShell(shell, listener)) {
      if (sound.at <= from || sound.at > to) continue;
      if (sound.voice === 'bang') bangs.push(sound);
      else due.push(sound);
    }
  }
  return [...due, ...mergedBangs(bangs)].toSorted((a, b) => a.at - b.at);
}

// Thinning towards the end, as the last sparks burn out.
export function crackleClicks(seed: number, seconds: number): number[] {
  const clicks: number[] = [];
  let index = 0;
  for (let at = 0; at < seconds; index++) {
    if (unitAt(seed, index * 2) >= (at / seconds) * 0.8) clicks.push(at);
    at += 0.015 + 0.03 * unitAt(seed, index * 2 + 1);
  }
  return clicks;
}
