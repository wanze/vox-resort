import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { BANK } from '../../sounds/bank.ts';
import { TILE_VOXELS } from '../../voxel-gen/voxelgen.ts';
import { parseBenchConfig } from '../features/bench/domain/benchConfig';
import { createAudioEngine, type AudioEngine } from '../features/sound/adapters/audioEngine';
import { loadSoundPrefs, saveSoundPrefs } from '../features/sound/adapters/prefsStore';
import { SOUND_URLS } from '../features/sound/adapters/soundFiles';
import { toastKey, type Toast } from '../features/hud/domain/news';
import {
  CUE_SLOT,
  cueAllowed,
  cueDetune,
  toastCueOf,
  type Cue,
} from '../features/sound/domain/cues';
import {
  approach,
  hear as hearScene,
  LAYERS,
  musicDuck,
  type HeardScene,
} from '../features/sound/domain/hearing';
import { moodAt } from '../features/sound/domain/playlist';
import type { SoundPrefs } from '../features/sound/domain/soundPrefs';
import { VENUE_SLOTS } from '../features/sound/domain/bank';

export interface SoundControls {
  readonly prefs: SoundPrefs;
  setPrefs(prefs: SoundPrefs): void;
  toggle(): void;
  cue(cue: Cue): void;
  hear(scene: HeardScene): void;
}

// None under a bench, so its figures are measured without an audio thread.
const SILENT = parseBenchConfig(globalThis.location?.search ?? '') !== null;

const LAYER_TAU = 1.5;
// Venues come and go with the camera, so they follow it more closely than the weather does.
const VENUE_TAU = 0.8;
const VENUES: ReadonlySet<string> = new Set(VENUE_SLOTS);
const TAUS = LAYERS.map((layer) => (VENUES.has(layer) ? VENUE_TAU : LAYER_TAU));
// A hidden tab stops the frames; the first heard after it should not count the whole absence.
const LONGEST_STEP = 1;

function useEngine(prefs: SoundPrefs) {
  const engine = useRef<AudioEngine | null>(null);
  const first = useRef(prefs);
  useEffect(() => {
    if (SILENT) return;
    const created = createAudioEngine(BANK, SOUND_URLS, first.current);
    engine.current = created;
    return () => {
      created.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => engine.current?.setPrefs(prefs), [prefs]);
  return engine;
}

function tellEngine(
  engine: RefObject<AudioEngine | null>,
  scene: HeardScene,
  step: { readonly dt: number; readonly welcome: boolean },
  layers: { readonly targets: Float32Array; readonly levels: Float32Array },
): void {
  const sound = engine.current;
  if (!sound) return;
  LAYERS.forEach((layer, at) => {
    const level = approach(layers.levels[at]!, layers.targets[at]!, step.dt, TAUS[at]!);
    layers.levels[at] = level;
    sound.setLayer(layer, level);
  });
  sound.tick(scene.stormSeconds, scene.weather === 'storm');
  const listener = { x: scene.targetX * TILE_VOXELS, y: 0, z: scene.targetZ * TILE_VOXELS };
  sound.fireworks(scene.show, scene.showSeconds, listener);
  sound.setMusic(moodAt(scene.night, step.welcome), musicDuck(scene.weather, scene.show !== null));
}

export function useHearing(engine: RefObject<AudioEngine | null>, welcome: boolean) {
  const targets = useRef(new Float32Array(LAYERS.length));
  const levels = useRef(new Float32Array(LAYERS.length));
  const heardAt = useRef<number | null>(null);
  const welcoming = useRef(welcome);
  useEffect(() => {
    welcoming.current = welcome;
    engine.current?.setMusic(moodAt(0, welcome), 1);
  }, [engine, welcome]);

  return useCallback(
    (scene: HeardScene) => {
      const now = performance.now();
      const since = heardAt.current === null ? 0 : (now - heardAt.current) / 1000;
      heardAt.current = now;
      hearScene(scene, targets.current);
      const step = { dt: Math.min(LONGEST_STEP, since), welcome: welcoming.current };
      tellEngine(engine, scene, step, { targets: targets.current, levels: levels.current });
    },
    [engine],
  );
}

function useCue(engine: RefObject<AudioEngine | null>) {
  const lastCued = useRef(new Map<Cue, number>());
  return useCallback(
    (played: Cue) => {
      const now = performance.now();
      if (!cueAllowed(played, lastCued.current.get(played), now)) return;
      lastCued.current.set(played, now);
      engine.current?.play(CUE_SLOT[played], { detune: cueDetune(played, Math.random) });
    },
    [engine],
  );
}

export function useSound(welcome: boolean): SoundControls {
  const [prefs, setPrefsState] = useState<SoundPrefs>(loadSoundPrefs);
  const engine = useEngine(prefs);

  const setPrefs = useCallback((next: SoundPrefs) => {
    saveSoundPrefs(next);
    setPrefsState(next);
  }, []);

  const toggle = useCallback(() => {
    setPrefsState((was) => {
      const next = { ...was, on: !was.on };
      saveSoundPrefs(next);
      return next;
    });
  }, []);

  const cue = useCue(engine);
  const hear = useHearing(engine, welcome);

  return { prefs, setPrefs, toggle, cue, hear };
}

const HEARD =
  ':is(.hud, .welcome) :is(button, [role="option"], input[type="checkbox"]):not(:disabled)';
const TOGGLES = 'input[type="checkbox"], [role="menuitemcheckbox"]';

function clickCueOf(target: EventTarget | null): Cue | null {
  const clicked = target instanceof Element ? target.closest(HEARD) : null;
  if (!clicked) return null;
  return clicked.matches(TOGGLES) ? 'toggle' : 'click';
}

// One listener for the whole HUD rather than a cue per button. No hover sounds: a pointer
// crossing the toolbar would rattle.
export function useClickCues(cue: (played: Cue) => void): void {
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const heard = clickCueOf(event.target);
      if (heard) cue(heard);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [cue]);
}

// Watched rather than told, so the news knows nothing of sound.
export function useToastCues(cue: (played: Cue) => void, toasts: readonly Toast[]): void {
  const seen = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const fresh = toasts.filter((toast) => !seen.current.has(toastKey(toast)));
    seen.current = new Set(toasts.map(toastKey));
    // Once each: a morning that brings three warnings rings once.
    const heard = new Set(fresh.map(toastCueOf));
    for (const each of heard) if (each) cue(each);
  }, [cue, toasts]);
}
