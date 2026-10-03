import { fadeCurve, loopSchedule, type LoopSchedule } from '../domain/cues';
import type { DecodedCache } from './decodedCache';

export interface LoopLayer {
  readonly gain: GainNode;
  readonly file: string;
  readonly sources: Set<AudioBufferSourceNode>;
  loaded: { readonly buffer: AudioBuffer; readonly schedule: LoopSchedule } | null;
  next: number;
  silentSince: number | null;
  closed: boolean;
}

const AUDIBLE = 0.001;
const LAYER_TAU = 0.6;
const RELEASE_SECONDS = 10;
// MP3 pads both ends of a file and few free recordings are cut to loop, so a loop is crossfaded
// with itself rather than trusted to be seamless.
const LOOP_FADE = 1.5;
const LOOKAHEAD_SECONDS = 1;
const FADE_STEPS = 64;
const FADE_IN = fadeCurve(FADE_STEPS, true);
const FADE_OUT = fadeCurve(FADE_STEPS, false);

export const isAudible = (level: number): boolean => level > AUDIBLE;

export function openLoop(
  context: AudioContext,
  output: AudioNode,
  file: string,
  cache: DecodedCache,
): LoopLayer {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(output);
  const layer: LoopLayer = {
    gain,
    file,
    sources: new Set(),
    loaded: null,
    next: 0,
    silentSince: null,
    closed: false,
  };
  void cache.bufferOf(file).then((buffer) => {
    if (!buffer || layer.closed) return;
    cache.hold(file, 1);
    layer.loaded = { buffer, schedule: loopSchedule(buffer.duration, LOOP_FADE) };
    layer.next = context.currentTime;
    scheduleLoop(context, layer);
  });
  return layer;
}

export function setLoopLevel(layer: LoopLayer, level: number, time: number): void {
  layer.gain.gain.setTargetAtTime(level, time, LAYER_TAU);
  layer.silentSince = isAudible(level) ? null : (layer.silentSince ?? time);
}

export const releasable = (layer: LoopLayer, time: number): boolean =>
  layer.silentSince !== null && time - layer.silentSince > RELEASE_SECONDS;

function startPlain(context: AudioContext, layer: LoopLayer, buffer: AudioBuffer): void {
  if (layer.sources.size > 0) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(layer.gain);
  layer.sources.add(source);
  source.start(0, Math.random() * buffer.duration);
}

function startPass(context: AudioContext, layer: LoopLayer, buffer: AudioBuffer, fade: number) {
  const when = layer.next;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const pass = context.createGain();
  pass.gain.value = 0;
  pass.gain.setValueCurveAtTime(FADE_IN, when, fade);
  pass.gain.setValueCurveAtTime(FADE_OUT, when + buffer.duration - fade, fade);
  source.connect(pass).connect(layer.gain);
  layer.sources.add(source);
  const ended = (): void => {
    pass.disconnect();
    layer.sources.delete(source);
  };
  source.addEventListener('ended', ended, { once: true });
  source.start(when);
  source.stop(when + buffer.duration);
}

// Each pass is scheduled a second ahead; after a stall the next starts now rather than in a pile.
export function scheduleLoop(context: AudioContext, layer: LoopLayer): void {
  const { loaded } = layer;
  if (!loaded) return;
  const { buffer, schedule } = loaded;
  if (schedule.kind === 'plain') return startPlain(context, layer, buffer);
  layer.next = Math.max(layer.next, context.currentTime);
  while (layer.next < context.currentTime + LOOKAHEAD_SECONDS) {
    startPass(context, layer, buffer, schedule.fade);
    layer.next += schedule.period;
  }
}

export function closeLoop(layer: LoopLayer, cache: DecodedCache): void {
  layer.closed = true;
  for (const source of layer.sources) source.stop();
  layer.gain.disconnect();
  if (layer.loaded) cache.hold(layer.file, -1);
}
