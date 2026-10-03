import { BUSES, SLOT_BUS, slotFiles, type Bank, type Bus, type SlotName } from '../domain/bank';
import { pickVariant } from '../domain/cues';
import { MOOD_SLOT, type Mood } from '../domain/playlist';
import { busGain, type SoundPrefs } from '../domain/soundPrefs';
import { createDecodedCache, type DecodedCache } from './decodedCache';
import {
  closeLoop,
  isAudible,
  openLoop,
  releasable,
  scheduleLoop,
  setLoopLevel,
  type LoopLayer,
} from './loopLayer';
import { createMusicPlayer, type MusicPlayer, type Tracks } from './musicPlayer';
import { createSynthVoices, type SynthLayer, type SynthVoices } from './synthVoices';

export interface PlayOptions {
  readonly gain?: number;
  readonly detune?: number;
  // The sound board plays each one; the game picks.
  readonly variant?: number;
}

export interface AudioEngine {
  setPrefs(prefs: SoundPrefs): void;
  play(slot: SlotName, options?: PlayOptions): void;
  setLayer(slot: SlotName, level: number): void;
  // At 5 Hz, with the clock's real seconds, for the synthesized weather and sea.
  tick(seconds: number, storming: boolean): void;
  setMusic(mood: Mood, duck: number): void;
  // The sound board's: a gain to try in place of the bank's.
  trim(slot: SlotName, gain: number): void;
  strike(strength: number): void;
  dispose(): void;
}

const SCHEDULE_MS = 250;
// A time constant reaches 95% in three of them, so a slider settles in a tenth of a second.
const PREFS_TAU = 0.1 / 3;
const DUCK_TAU = 1;
const SYNTH_LAYERS: ReadonlySet<string> = new Set<SynthLayer>(['rain', 'wind', 'surf']);
// Small and heard at once: a click decoded on first use would land late.
const WARM_BUSES: ReadonlySet<Bus> = new Set<Bus>(['effects', 'interface']);

interface Live {
  readonly context: AudioContext;
  readonly buses: { readonly [bus in Bus]: GainNode };
  readonly cache: DecodedCache;
  readonly voices: SynthVoices;
  readonly music: MusicPlayer;
  readonly timer: ReturnType<typeof setInterval>;
}

const isSynthLayer = (slot: SlotName): slot is SynthLayer => SYNTH_LAYERS.has(slot);

function createBuses(context: AudioContext): { readonly [bus in Bus]: GainNode } {
  const master = context.createGain();
  master.connect(context.destination);
  const gainFor = (): GainNode => {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    return gain;
  };
  return Object.fromEntries(BUSES.map((bus) => [bus, gainFor()])) as {
    readonly [bus in Bus]: GainNode;
  };
}

function warmFiles(bank: Bank, urls: ReadonlyMap<string, string>): string[] {
  return Object.entries(bank)
    .filter(([slot]) => WARM_BUSES.has(SLOT_BUS[slot as SlotName]))
    .flatMap(([, entry]) => entry?.files ?? [])
    .map((file) => file.file)
    .filter((file) => urls.has(file));
}

interface EngineState {
  prefs: SoundPrefs;
  duck: number;
  mood: Mood | null;
  live: Live | null;
}

// Browsers refuse to start audio before a gesture, so nothing is built until the first one; until
// then every call only remembers what it asked for.
export function createAudioEngine(
  bank: Bank,
  urls: ReadonlyMap<string, string>,
  initial: SoundPrefs,
): AudioEngine {
  const state: EngineState = { prefs: initial, duck: 1, mood: null, live: null };
  const targets = new Map<SlotName, number>();
  const trims = new Map<SlotName, number>();
  const lastVariant = new Map<SlotName, number>();
  const told = new Set<SlotName>();
  const layers = new Map<SlotName, LoopLayer>();

  const playable = (slot: SlotName): readonly string[] => {
    const files = slotFiles(bank, slot)
      .map((file) => file.file)
      .filter((file) => urls.has(file));
    if (files.length === 0 && !told.has(slot)) {
      told.add(slot);
      console.info(`Sound: no file for "${slot}" yet, so it plays nothing`);
    }
    return files;
  };

  const gainOf = (slot: SlotName): number => trims.get(slot) ?? bank[slot]?.gain ?? 1;

  const levelOf = (slot: SlotName, options: PlayOptions): number =>
    gainOf(slot) * (options.gain ?? 1);

  const chooseFile = (slot: SlotName, variant: number | undefined): string | null => {
    const files = playable(slot);
    if (files.length === 0) return null;
    const pick = variant ?? pickVariant(files.length, lastVariant.get(slot) ?? -1, Math.random);
    lastVariant.set(slot, pick);
    return files[pick % files.length]!;
  };

  const startOneShot = (now: Live, slot: SlotName, file: string, options: PlayOptions) => {
    return (buffer: AudioBuffer | null): void => {
      if (!buffer || state.live !== now) return;
      const { context, cache } = now;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.detune.value = options.detune ?? 0;
      const gain = context.createGain();
      gain.gain.value = levelOf(slot, options);
      source.connect(gain).connect(now.buses[SLOT_BUS[slot]]);
      cache.hold(file, 1);
      const ended = (): void => {
        gain.disconnect();
        cache.hold(file, -1);
      };
      source.addEventListener('ended', ended, { once: true });
      source.start();
    };
  };

  const play = (slot: SlotName, options: PlayOptions = {}): void => {
    const now = state.live;
    if (!now) return;
    const file = chooseFile(slot, options.variant);
    if (file !== null) void now.cache.bufferOf(file).then(startOneShot(now, slot, file, options));
  };

  const openLayer = (now: Live, slot: SlotName): LoopLayer | null => {
    const file = chooseFile(slot, undefined);
    if (file === null) return null;
    const layer = openLoop(now.context, now.buses[SLOT_BUS[slot]], file, now.cache);
    layers.set(slot, layer);
    return layer;
  };

  const layerFor = (now: Live, slot: SlotName, level: number): LoopLayer | null =>
    layers.get(slot) ?? (isAudible(level) ? openLayer(now, slot) : null);

  const applyLayer = (now: Live, slot: SlotName, level: number): void => {
    if (isSynthLayer(slot)) return now.voices.set(slot, level);
    const layer = layerFor(now, slot, level);
    if (layer) setLoopLevel(layer, level * gainOf(slot), now.context.currentTime);
  };

  const onSchedule = (): void => {
    const now = state.live;
    if (!now) return;
    for (const [slot, layer] of layers) {
      if (!releasable(layer, now.context.currentTime)) {
        scheduleLoop(now.context, layer);
        continue;
      }
      closeLoop(layer, now.cache);
      layers.delete(slot);
    }
  };

  const applyPrefs = (now: Live): void => {
    const time = now.context.currentTime;
    for (const bus of BUSES) {
      const duck = bus === 'music' ? state.duck : 1;
      now.buses[bus].gain.setTargetAtTime(busGain(state.prefs, bus) * duck, time, PREFS_TAU);
    }
  };

  const tracksOf = (mood: Mood): Tracks => {
    const slot = MOOD_SLOT[mood];
    return { urls: playable(slot).map((file) => urls.get(file)!), gain: gainOf(slot) };
  };

  const wake = (): void => {
    stopListening();
    const context = new AudioContext();
    void context.resume();
    const buses = createBuses(context);
    const now: Live = {
      context,
      buses,
      cache: createDecodedCache(context, urls),
      voices: createSynthVoices(context, buses.ambience, buses.effects),
      music: createMusicPlayer(context, buses.music, tracksOf),
      timer: setInterval(onSchedule, SCHEDULE_MS),
    };
    state.live = now;
    applyPrefs(now);
    for (const [slot, level] of targets) applyLayer(now, slot, level);
    if (state.mood !== null) now.music.want(state.mood);
    for (const file of warmFiles(bank, urls)) void now.cache.bufferOf(file);
  };

  const onVisibility = (): void => {
    const now = state.live;
    if (!now) return;
    now.music.hold(document.hidden);
    void (document.hidden ? now.context.suspend() : now.context.resume());
  };

  const stopListening = (): void => {
    document.removeEventListener('pointerdown', wake, true);
    document.removeEventListener('keydown', wake, true);
  };

  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('keydown', wake, true);
  document.addEventListener('visibilitychange', onVisibility);

  const duckMusic = (now: Live): void => {
    const level = busGain(state.prefs, 'music') * state.duck;
    now.buses.music.gain.setTargetAtTime(level, now.context.currentTime, DUCK_TAU);
  };

  return {
    setPrefs(prefs) {
      state.prefs = prefs;
      if (state.live) applyPrefs(state.live);
    },
    play,
    setLayer(slot, level) {
      targets.set(slot, level);
      if (state.live) applyLayer(state.live, slot, level);
    },
    tick(seconds, storming) {
      state.live?.voices.tick(seconds, storming);
    },
    setMusic(mood, duck) {
      state.mood = mood;
      state.live?.music.want(mood);
      if (duck === state.duck) return;
      state.duck = duck;
      if (state.live) duckMusic(state.live);
    },
    trim(slot, gain) {
      trims.set(slot, gain);
      if (state.live) applyLayer(state.live, slot, targets.get(slot) ?? 0);
    },
    strike(strength) {
      state.live?.voices.strike(strength);
    },
    dispose() {
      stopListening();
      document.removeEventListener('visibilitychange', onVisibility);
      const now = state.live;
      if (!now) return;
      state.live = null;
      clearInterval(now.timer);
      now.music.dispose();
      now.voices.dispose();
      void now.context.close();
    },
  };
}
