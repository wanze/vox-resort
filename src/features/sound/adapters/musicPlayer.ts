import { gapSeconds, loops, moodChange, nextTrack, type Mood } from '../domain/playlist';

export interface MusicPlayer {
  want(mood: Mood): void;
  // For a hidden tab: a media element keeps playing into a suspended context.
  hold(held: boolean): void;
  dispose(): void;
}

const MENU_FADE_SECONDS = 3;

// One element, decoded as it plays: a three-minute track decoded up front is 30 MB of PCM.
export interface Tracks {
  readonly urls: readonly string[];
  readonly gain: number;
}

export function createMusicPlayer(
  context: AudioContext,
  bus: AudioNode,
  tracksOf: (mood: Mood) => Tracks,
): MusicPlayer {
  const element = new Audio();
  element.preload = 'auto';
  const fade = context.createGain();
  context.createMediaElementSource(element).connect(fade).connect(bus);

  let playing: Mood | null = null;
  let wanted: Mood | null = null;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  let held = false;
  const last = new Map<Mood, number>();

  const wait = (seconds: number): void => {
    if (waiting !== null) clearTimeout(waiting);
    waiting = setTimeout(() => {
      waiting = null;
      if (wanted !== null) start(wanted);
    }, seconds * 1000);
  };

  const start = (mood: Mood): void => {
    const { urls, gain } = tracksOf(mood);
    if (urls.length === 0) return;
    const track = nextTrack(urls.length, last.get(mood) ?? -1, Math.random);
    last.set(mood, track);
    fade.gain.cancelScheduledValues(context.currentTime);
    fade.gain.setValueAtTime(gain, context.currentTime);
    element.src = urls[track]!;
    element.loop = loops(mood);
    playing = mood;
    if (!held) void element.play().catch(() => {});
  };

  const startUnlessWaiting = (mood: Mood): void => {
    if (waiting === null) start(mood);
  };

  const fadeOut = (): void => {
    const now = context.currentTime;
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + MENU_FADE_SECONDS);
    playing = null;
    setTimeout(() => element.pause(), MENU_FADE_SECONDS * 1000);
    wait(MENU_FADE_SECONDS + gapSeconds(Math.random));
  };

  const onEnded = (): void => {
    playing = null;
    wait(gapSeconds(Math.random));
  };
  element.addEventListener('ended', onEnded);

  return {
    want(mood) {
      if (mood === wanted) return;
      wanted = mood;
      const change = moodChange(playing, mood);
      if (change === 'fade') return fadeOut();
      if (change === 'start') startUnlessWaiting(mood);
    },
    hold(next) {
      held = next;
      if (held) element.pause();
      else if (playing !== null) void element.play().catch(() => {});
    },
    dispose() {
      if (waiting !== null) clearTimeout(waiting);
      element.removeEventListener('ended', onEnded);
      element.pause();
      element.removeAttribute('src');
      fade.disconnect();
    },
  };
}
