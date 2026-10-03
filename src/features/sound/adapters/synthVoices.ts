import { rainVoice, surfAt, thunderDue, thunderOf, windVoice, type Thunder } from '../domain/synth';

export type SynthLayer = 'rain' | 'wind' | 'surf';

export interface SynthVoices {
  set(layer: SynthLayer, level: number): void;
  // At 5 Hz, with the clock's real seconds: the gusts, the swell and the thunder follow them.
  tick(seconds: number, storming: boolean): void;
  // One thunder now, for the sound board.
  strike(strength: number): void;
  dispose(): void;
}

const NOISE_SECONDS = 4;
// Ahead of the 5 Hz tick, so a thunder falls between two ticks without being late.
const THUNDER_HORIZON = 0.5;
// Above 1 on purpose: the rumble's energy sits below 200 Hz, where small speakers give little
// back, so it needs far more level than a cue to sound as loud. The compressor keeps it unclipped.
const THUNDER_GAIN = 2.4;
// Thunder's audible body on laptop speakers, where the 200 Hz rumble alone is barely there.
const THUNDER_BODY_HZ = 320;
const RAMP_TAU = 0.25;

function noiseBuffers(context: BaseAudioContext): { white: AudioBuffer; brown: AudioBuffer } {
  const length = Math.round(context.sampleRate * NOISE_SECONDS);
  const white = context.createBuffer(1, length, context.sampleRate);
  const brown = context.createBuffer(1, length, context.sampleRate);
  const whiteData = white.getChannelData(0);
  const brownData = brown.getChannelData(0);
  let level = 0;
  for (let at = 0; at < length; at++) {
    const sample = Math.random() * 2 - 1;
    whiteData[at] = sample;
    // A leaky integrator: brown noise, with the leak keeping it from drifting off.
    level = (level + 0.02 * sample) / 1.02;
    brownData[at] = level * 3.5;
  }
  return { white, brown };
}

function filter(context: BaseAudioContext, type: BiquadFilterType, hz: number, q = 0.7) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = hz;
  node.Q.value = q;
  return node;
}

function chain(...nodes: AudioNode[]): void {
  for (let at = 1; at < nodes.length; at++) nodes[at - 1]!.connect(nodes[at]!);
}

export function createSynthVoices(
  context: AudioContext,
  ambience: AudioNode,
  effects: AudioNode,
): SynthVoices {
  const noise = noiseBuffers(context);
  const looped = (buffer: AudioBuffer, offset: number): AudioBufferSourceNode => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, offset);
    return source;
  };
  const silent = (): GainNode => {
    const gain = context.createGain();
    gain.gain.value = 0;
    return gain;
  };

  const rainSource = looped(noise.white, 0);
  const rainHigh = filter(context, 'highpass', 1400);
  const rainLow = filter(context, 'lowpass', 9000);
  const rainGain = silent();
  chain(rainSource, rainHigh, rainLow, rainGain, ambience);

  // Each voice starts the shared buffer elsewhere, so the wind and the sea do not move together.
  const windSource = looped(noise.brown, 1.3);
  const windBand = filter(context, 'bandpass', 400, 1);
  const windGain = silent();
  chain(windSource, windBand, windGain, ambience);

  const surfSource = looped(noise.brown, 2.7);
  const surfLow = filter(context, 'lowpass', 600);
  const surfGain = silent();
  chain(surfSource, surfLow, surfGain, ambience);

  const thunderBus = context.createDynamicsCompressor();
  thunderBus.threshold.value = -14;
  thunderBus.knee.value = 6;
  thunderBus.ratio.value = 8;
  thunderBus.attack.value = 0.003;
  thunderBus.release.value = 0.3;
  thunderBus.connect(effects);

  const levels = { rain: 0, wind: 0, surf: 0 };
  let lastThunder = -Infinity;

  const ramp = (param: AudioParam, value: number): void => {
    param.setTargetAtTime(value, context.currentTime, RAMP_TAU);
  };

  const burst = (buffer: AudioBuffer, from: number, until: number): AudioBufferSourceNode => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(from, Math.random() * NOISE_SECONDS);
    source.stop(until);
    return source;
  };

  const rumble = (thunder: Thunder, when: number): void => {
    const peak = thunder.gain * THUNDER_GAIN;
    const end = when + thunder.rumbleSeconds;
    const gain = silent();
    const envelope = gain.gain;
    envelope.setValueAtTime(0, when);
    envelope.linearRampToValueAtTime(peak, when + 0.15);
    envelope.linearRampToValueAtTime(peak * 0.55, when + 0.7);
    // A second roll partway through, as the echoes come back off the clouds.
    envelope.linearRampToValueAtTime(peak * 0.7, when + thunder.rumbleSeconds * 0.4);
    envelope.linearRampToValueAtTime(0, end);
    const source = burst(noise.brown, when, end + 0.05);
    chain(source, filter(context, 'lowpass', 200), gain, thunderBus);
    chain(source, filter(context, 'bandpass', THUNDER_BODY_HZ, 0.8), gain);
    source.addEventListener('ended', () => gain.disconnect(), { once: true });
  };

  const crack = (thunder: Thunder, when: number): void => {
    const gain = silent();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(thunder.gain * THUNDER_GAIN * 0.7, when + 0.01);
    gain.gain.linearRampToValueAtTime(0, when + 0.3);
    const source = burst(noise.white, when, when + 0.35);
    chain(source, filter(context, 'bandpass', 1800, 0.5), gain, thunderBus);
    source.addEventListener('ended', () => gain.disconnect(), { once: true });
  };

  const thunderAt = (thunder: Thunder, when: number): void => {
    rumble(thunder, when);
    if (thunder.crack) crack(thunder, when);
  };

  return {
    set(layer, level) {
      levels[layer] = level;
      if (layer === 'rain') {
        const voice = rainVoice(level);
        ramp(rainGain.gain, voice.gain);
        ramp(rainLow.frequency, voice.lowpassHz);
        ramp(rainHigh.frequency, voice.highpassHz);
      }
    },
    tick(seconds, storming) {
      const wind = windVoice(levels.wind, seconds);
      ramp(windGain.gain, wind.gain);
      ramp(windBand.frequency, wind.bandHz);
      ramp(windBand.Q, wind.q);
      ramp(surfGain.gain, surfAt(seconds, levels.surf) * 0.6);
      if (!storming) {
        lastThunder = -Infinity;
        return;
      }
      for (const thunder of thunderDue(lastThunder, seconds, THUNDER_HORIZON)) {
        thunderAt(thunder, context.currentTime + (thunder.at - seconds));
      }
      lastThunder = seconds + THUNDER_HORIZON;
    },
    strike(strength) {
      thunderAt(thunderOf({ at: 0, strength }), context.currentTime + 0.05);
    },
    dispose() {
      for (const source of [rainSource, windSource, surfSource]) source.stop();
      for (const gain of [rainGain, windGain, surfGain]) gain.disconnect();
      thunderBus.disconnect();
    },
  };
}
