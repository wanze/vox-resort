import { HEARD_FROM, type Minded } from './nuisance';

// Two hours of full noise asleep is the worst night there is, so a club next door playing past
// midnight to a thin crowd costs a guest about half a night.
export const SLEEPLESS_HOURS = 2;

// As a venue's nuisance: below it a guest does not say so.
export const NOISY_NIGHT_FROM = HEARD_FROM;

// Twice a smelly lunch's NUISANCE_UPSET, because a night is worse.
export const NOISY_NIGHT_UPSET = 0.1;

// What a small fireworks show adds to the stay, taken off it: upset alone remembers a fifth.
export const NOISY_NIGHT_MEMORY = 0.03;

// Its own factor rather than the setting premium, which clamps at 0 and would spare a plain hotel.
export const NIGHT_NOISE_DISCOUNT = 0.4;

export interface NightNoise {
  // Per person, the noise-hours heard asleep since the last check-in.
  readonly heard: Float32Array;
  // Per lodging, the loudest moment tonight and the source of it.
  readonly peak: Float32Array;
  readonly loudest: Int32Array;
  // Per lodging, this frame's noise, -1 until asked: a scratch, so a hotel is read once a frame.
  readonly now: Float32Array;
}

export interface NoisyNight extends Minded {
  readonly woken: number;
}

export function createNightNoise(people: number, lodgings: number): NightNoise {
  return {
    heard: new Float32Array(people),
    peak: new Float32Array(lodgings),
    loudest: new Int32Array(lodgings).fill(-1),
    now: new Float32Array(lodgings),
  };
}

// asleepAt answers the lodging a person sleeps in, -1 for anybody awake, away or homeless.
export function listen(
  night: NightNoise,
  hours: number,
  people: number,
  asleepAt: (person: number) => number,
  feltAt: (lodging: number) => number,
  loudestAt: (lodging: number) => number,
): void {
  if (hours <= 0) return;
  const { heard, peak, loudest, now } = night;
  now.fill(-1);
  const count = Math.min(people, heard.length);
  for (let person = 0; person < count; person++) {
    const lodging = asleepAt(person);
    if (lodging < 0 || lodging >= now.length) continue;
    if (now[lodging]! < 0) {
      now[lodging] = feltAt(lodging);
      if (now[lodging]! > peak[lodging]!) {
        peak[lodging] = now[lodging]!;
        loudest[lodging] = loudestAt(lodging);
      }
    }
    heard[person]! += now[lodging]! * hours;
  }
}

export const nightOf = (heard: number): number => Math.min(1, heard / SLEEPLESS_HOURS);

export const quietFactor = (night: number): number =>
  1 - NIGHT_NOISE_DISCOUNT * Math.min(1, Math.max(0, night));

// Over the residents present that morning only, so a party out at the club is not counted as
// kept awake by it.
export function nightsOver(
  night: NightNoise,
  lodgingOf: (person: number) => number,
  present: Uint8Array,
  lodgings: number,
): readonly { readonly felt: number; readonly woken: number }[] {
  const sum = new Float64Array(lodgings);
  const residents = new Int32Array(lodgings);
  const woken = new Int32Array(lodgings);
  const count = Math.min(present.length, night.heard.length);
  for (let person = 0; person < count; person++) {
    const lodging = lodgingOf(person);
    if (present[person] !== 1 || lodging < 0 || lodging >= lodgings) continue;
    const felt = nightOf(night.heard[person]!);
    sum[lodging]! += felt;
    residents[lodging]!++;
    if (felt > NOISY_NIGHT_FROM) woken[lodging]!++;
  }
  return Array.from(sum, (total, lodging) => ({
    felt: residents[lodging]! > 0 ? total / residents[lodging]! : 0,
    woken: woken[lodging]!,
  }));
}

export function restartNight(night: NightNoise): void {
  night.heard.fill(0);
  night.peak.fill(0);
  night.loudest.fill(-1);
}
