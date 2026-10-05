import { describe, expect, it } from 'vitest';
import { planShow, type Shell, type Show } from '../../fireworks/domain/show';
import {
  crackleClicks,
  fireworksDue,
  MAX_BANGS_PER_WINDOW,
  soundsOfShell,
  type FireworkSound,
} from './fireworksSound';

const SITES = Array.from({ length: 5 }, (_, index) => ({ x: 200 + index * 100, y: 0.1, z: 900 }));
const GRAND = planShow({ tier: 'grand', seed: 3, sites: SITES });
const HERE = { x: 400, y: 0, z: 600 };

const shellOf = (over: Partial<Shell> = {}): Shell => ({
  launchAt: 1,
  site: { x: 0, y: 0, z: 0 },
  kind: 'peony',
  colour: 0xffffff,
  burstX: 0,
  burstY: 200,
  burstZ: 0,
  rise: 2,
  radius: 55,
  stars: 40,
  whistle: false,
  seed: 9,
  ...over,
});

const voiceOf = (sounds: readonly FireworkSound[], voice: FireworkSound['voice']) =>
  sounds.find((sound) => sound.voice === voice);

const windows = (show: Show, step: number): FireworkSound[][] => {
  const heard: FireworkSound[][] = [];
  let last = -Infinity;
  for (let now = 0; now < show.length + 8; now += step) {
    heard.push(fireworksDue(show, last, now, 0.5, HERE));
    last = now + 0.5;
  }
  return heard;
};

describe('soundsOfShell', () => {
  it('never bangs before the burst', () => {
    for (const shell of GRAND.shells) {
      expect(voiceOf(soundsOfShell(shell, HERE), 'bang')!.at).toBeGreaterThanOrEqual(
        shell.launchAt + shell.rise,
      );
    }
  });

  it('is later and quieter further off, but never below the floor', () => {
    const shell = shellOf();
    const near = voiceOf(soundsOfShell(shell, { x: 0, y: 0, z: 300 }), 'bang')!;
    const far = voiceOf(soundsOfShell(shell, { x: 0, y: 0, z: 3000 }), 'bang')!;
    const furthest = voiceOf(soundsOfShell(shell, { x: 0, y: 0, z: 30_000 }), 'bang')!;
    expect(far.at).toBeGreaterThan(near.at);
    expect(far.gain).toBeLessThan(near.gain);
    expect(furthest.gain).toBeCloseTo(0.25);
  });

  it('hears the bang a second late 343 metres off', () => {
    const shell = shellOf();
    const off = { x: 0, y: 200, z: 343 * 4 };
    expect(voiceOf(soundsOfShell(shell, off), 'bang')!.at).toBeCloseTo(
      shell.launchAt + shell.rise + 1,
    );
  });

  it('whistles only for a whistling shell, and crackles only for a crackle', () => {
    const plain = soundsOfShell(shellOf(), HERE).map((sound) => sound.voice);
    expect(plain.toSorted()).toEqual(['bang', 'thump']);
    const whistling = soundsOfShell(shellOf({ whistle: true, kind: 'crackle' }), HERE);
    expect(whistling.map((sound) => sound.voice).toSorted()).toEqual([
      'bang',
      'crackle',
      'thump',
      'whistle',
    ]);
  });
});

describe('fireworksDue', () => {
  it('hands each sound over once across consecutive windows, and none before now', () => {
    const heard = windows(planShow({ tier: 'small', seed: 3, sites: SITES }), 0.2);
    const all = heard.flat();
    const keys = all.map((sound) => `${sound.voice}:${sound.at}:${sound.seed}`);
    expect(new Set(keys).size).toBe(keys.length);
    let now = 0;
    for (const window of heard) {
      for (const sound of window) expect(sound.at).toBeGreaterThan(now);
      now += 0.2;
    }
    expect(all.filter((sound) => sound.voice === 'thump').length).toBeGreaterThan(50);
  });

  it('merges a finale into a few loud bangs a window', () => {
    let merged = false;
    for (const window of windows(GRAND, 0.5)) {
      const bangs = window.filter((sound) => sound.voice === 'bang');
      expect(bangs.length).toBeLessThanOrEqual(MAX_BANGS_PER_WINDOW);
      merged ||= bangs.some((bang) => bang.gain > 1);
    }
    expect(merged).toBe(true);
  });
});

describe('crackleClicks', () => {
  it('clicks in order, inside the crackle, thinning towards the end', () => {
    const clicks = crackleClicks(42, 1);
    expect(clicks).toEqual(clicks.toSorted((a, b) => a - b));
    expect(clicks[0]).toBeGreaterThanOrEqual(0);
    expect(clicks.at(-1)).toBeLessThan(1);
    const early = clicks.filter((at) => at < 0.5).length;
    expect(early).toBeGreaterThan(clicks.length - early);
  });
});
