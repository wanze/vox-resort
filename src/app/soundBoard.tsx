import { StrictMode, useEffect, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { BANK } from '../../sounds/bank.ts';
import { SHORTLIST } from '../../sounds/shortlist.ts';
import { createAudioEngine, type AudioEngine } from '../features/sound/adapters/audioEngine';
import { SOUND_URLS } from '../features/sound/adapters/soundFiles';
import {
  isSynth,
  SLOT_BUS,
  SLOT_NAMES,
  slotFiles,
  SOUND_KINDS,
  type Candidate,
  type SlotName,
} from '../features/sound/domain/bank';
import type { FireworkVoice } from '../features/sound/domain/fireworksSound';
import { hear, kindAt, LAYERS, type HeardScene } from '../features/sound/domain/hearing';
import { DEFAULT_SOUND_PREFS } from '../features/sound/domain/soundPrefs';
import { WEATHERS, type Weather } from '../features/sim/domain/weather';
import type { SoundKind } from '../../voxel-gen/voxelgen.ts';
import { useHearing } from './useSound';
import '@fontsource-variable/rubik/index.css';
import './soundBoard.css';

const HEAR_MS = 200;
const FIREWORK_VOICES: readonly FireworkVoice[] = ['thump', 'whistle', 'bang', 'crackle'];
const FULL = { ...DEFAULT_SOUND_PREFS, master: 1, music: 1, ambience: 1, effects: 1, interface: 1 };

// One element for every file and candidate: the board plays one thing at a time.
function usePreview() {
  const element = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    const audio = new Audio();
    const ended = () => setPlaying(null);
    audio.addEventListener('ended', ended);
    element.current = audio;
    return () => {
      audio.removeEventListener('ended', ended);
      audio.pause();
    };
  }, []);
  const toggle = (url: string, loop: boolean, volume: number): void => {
    const audio = element.current;
    if (!audio) return;
    audio.pause();
    if (playing === url) return setPlaying(null);
    audio.src = url;
    audio.loop = loop;
    audio.volume = volume;
    void audio.play();
    setPlaying(url);
  };
  return { playing, toggle };
}

type Preview = ReturnType<typeof usePreview>;

function GainControl(props: { readonly gain: number; readonly onGain: (gain: number) => void }) {
  const line = props.gain.toFixed(2);
  return (
    <span className="board-gain">
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={props.gain}
        onChange={(event) => props.onGain(Number(event.target.value))}
      />
      <code>gain: {line}</code>
      <button type="button" onClick={() => void navigator.clipboard.writeText(`gain: ${line},`)}>
        copy
      </button>
    </span>
  );
}

function CandidatePlay(props: {
  readonly candidate: Candidate;
  readonly preview: Preview;
  readonly loop: boolean;
}) {
  const url = props.candidate.preview;
  // A sound inside a zip has no address of its own until fetch-sounds unpacks it.
  if (url === '') return <span className="board-none">in a zip</span>;
  return (
    <button type="button" onClick={() => props.preview.toggle(url, props.loop, 1)}>
      {props.preview.playing === url ? '■' : '▶'}
    </button>
  );
}

function Candidates(props: {
  readonly found: readonly Candidate[];
  readonly preview: Preview;
  readonly loop: boolean;
}) {
  if (props.found.length === 0) return <p className="board-none">no candidates listed</p>;
  return (
    <ul className="board-candidates">
      {props.found.map((candidate) => (
        <li key={`${candidate.page}${candidate.member ?? ''}`}>
          <CandidatePlay candidate={candidate} preview={props.preview} loop={props.loop} />
          <a href={candidate.page} target="_blank" rel="noreferrer">
            {candidate.title}
          </a>
          <span>
            {candidate.author}, {candidate.licence}, {Math.round(candidate.seconds)} s
          </span>
          <span className="board-why">{candidate.why}</span>
        </li>
      ))}
    </ul>
  );
}

function FileButtons(props: {
  readonly slot: SlotName;
  readonly preview: Preview;
  readonly loop: boolean;
  readonly gain: number;
}) {
  const files = slotFiles(BANK, props.slot).filter((file) => SOUND_URLS.has(file.file));
  if (files.length === 0) return <span className="board-none">silent</span>;
  return files.map((file) => {
    const url = SOUND_URLS.get(file.file)!;
    return (
      <button
        key={file.file}
        type="button"
        onClick={() => props.preview.toggle(url, props.loop, props.gain)}
      >
        {props.preview.playing === url ? '■' : '▶'} {file.file}
      </button>
    );
  });
}

const UNBANKED = { gain: 1, loop: false };

interface RowProps {
  readonly slot: SlotName;
  readonly preview: Preview;
  readonly engine: RefObject<AudioEngine | null>;
}

function RecordedRow({ slot, preview, engine }: RowProps) {
  const { gain: banked, loop } = BANK[slot] ?? UNBANKED;
  const [gain, setGain] = useState(banked);
  const onGain = (next: number): void => {
    setGain(next);
    engine.current?.trim(slot, next);
  };
  return (
    <tr>
      <th>{slot}</th>
      <td>{SLOT_BUS[slot]}</td>
      <td>
        <FileButtons slot={slot} preview={preview} loop={loop} gain={gain} />
      </td>
      <td>
        <GainControl gain={gain} onGain={onGain} />
      </td>
      <td>
        <Candidates
          found={SHORTLIST.filter((each) => each.slot === slot)}
          preview={preview}
          loop={loop}
        />
      </td>
    </tr>
  );
}

function SlotRow(props: RowProps) {
  if (!isSynth(props.slot)) return <RecordedRow {...props} />;
  return (
    <tr>
      <th>{props.slot}</th>
      <td>{SLOT_BUS[props.slot]}</td>
      <td colSpan={3} className="board-none">
        synthesized: try it in the synth voices panel
      </td>
    </tr>
  );
}

function Level(props: {
  readonly label: string;
  readonly value: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="board-level">
      <span>{props.label}</span>
      <input
        type="range"
        min={0}
        max={props.max ?? 1}
        step={props.step ?? 0.01}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <code>{props.value.toFixed(2)}</code>
    </label>
  );
}

function SynthPanel({ engine }: { readonly engine: RefObject<AudioEngine | null> }) {
  const [levels, setLevels] = useState({ rain: 0, wind: 0, surf: 0 });
  const [strength, setStrength] = useState(0.9);
  useEffect(() => {
    const timer = setInterval(() => engine.current?.tick(performance.now() / 1000, false), HEAR_MS);
    return () => clearInterval(timer);
  }, [engine]);
  const set = (layer: keyof typeof levels) => (value: number) => {
    setLevels((was) => ({ ...was, [layer]: value }));
    engine.current?.setLayer(layer, value);
  };
  return (
    <section className="board-panel">
      <h2>Synth voices</h2>
      <Level label="rain" value={levels.rain} onChange={set('rain')} />
      <Level label="wind" value={levels.wind} onChange={set('wind')} />
      <Level label="surf" value={levels.surf} onChange={set('surf')} />
      <Level label="strike strength" value={strength} onChange={setStrength} />
      <button type="button" onClick={() => engine.current?.strike(strength)}>
        Strike
      </button>
      {FIREWORK_VOICES.map((voice) => (
        <button key={voice} type="button" onClick={() => engine.current?.pop(voice)}>
          {voice[0]!.toUpperCase() + voice.slice(1)}
        </button>
      ))}
      <p className="board-none">The scene panel drives the same voices while it runs.</p>
    </section>
  );
}

interface SceneControls {
  weather: Weather;
  night: number;
  tilePx: number;
  shore: number;
  guests: number;
  children: number;
  swimmers: number;
  trees: number;
  kind: SoundKind;
  near: number;
}

const START: SceneControls = {
  weather: 'clear',
  night: 0,
  tilePx: 24,
  shore: 6,
  guests: 20,
  children: 4,
  swimmers: 0,
  trees: 4,
  kind: 'cafe',
  near: 1,
};

function sceneOf(controls: SceneControls, seconds: number): HeardScene {
  const near = new Float32Array(SOUND_KINDS.length);
  const open = new Float32Array(SOUND_KINDS.length).fill(1);
  near[kindAt('trees')] = controls.trees;
  near[kindAt(controls.kind)] = controls.near;
  return {
    ...controls,
    targetX: 0,
    targetZ: 0,
    stormSeconds: seconds,
    show: null,
    showSeconds: 0,
    // The board has no bedtimes: the night slider stands in for the guests gone to bed.
    awake: 1 - controls.night,
    shore: controls.shore >= 40 ? Infinity : controls.shore,
    near,
    open,
  };
}

function useScene(
  engine: RefObject<AudioEngine | null>,
  controls: SceneControls,
  running: boolean,
) {
  const listen = useHearing(engine, false);
  const [levels, setLevels] = useState<Float32Array>(() => new Float32Array(LAYERS.length));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const scene = sceneOf(controls, performance.now() / 1000);
      const targets = new Float32Array(LAYERS.length);
      hear(scene, targets);
      setLevels(targets);
      listen(scene);
    }, HEAR_MS);
    return () => clearInterval(timer);
  }, [controls, running, listen]);
  return levels;
}

function ScenePanel({ engine }: { readonly engine: RefObject<AudioEngine | null> }) {
  const [controls, setControls] = useState(START);
  const [running, setRunning] = useState(false);
  const levels = useScene(engine, controls, running);
  const set =
    <K extends keyof SceneControls>(key: K) =>
    (value: SceneControls[K]) =>
      setControls((was) => ({ ...was, [key]: value }));
  return (
    <section className="board-panel">
      <h2>Scene</h2>
      <button type="button" onClick={() => setRunning(!running)}>
        {running ? 'Stop hearing' : 'Hear this scene'}
      </button>
      <label className="board-level">
        <span>weather</span>
        <select
          value={controls.weather}
          onChange={(e) => set('weather')(e.target.value as Weather)}
        >
          {WEATHERS.map((each) => (
            <option key={each}>{each}</option>
          ))}
        </select>
      </label>
      <Level label="night" value={controls.night} onChange={set('night')} />
      <Level
        label="tile px (zoom)"
        value={controls.tilePx}
        max={40}
        step={1}
        onChange={set('tilePx')}
      />
      <Level
        label="shore (40 = none)"
        value={controls.shore}
        max={40}
        step={1}
        onChange={set('shore')}
      />
      <Level label="guests" value={controls.guests} max={80} step={1} onChange={set('guests')} />
      <Level
        label="children"
        value={controls.children}
        max={20}
        step={1}
        onChange={set('children')}
      />
      <Level
        label="swimmers"
        value={controls.swimmers}
        max={20}
        step={1}
        onChange={set('swimmers')}
      />
      <Level label="trees near" value={controls.trees} max={8} step={0.1} onChange={set('trees')} />
      <label className="board-level">
        <span>place</span>
        <select value={controls.kind} onChange={(e) => set('kind')(e.target.value as SoundKind)}>
          {SOUND_KINDS.filter((kind) => kind !== 'trees').map((each) => (
            <option key={each}>{each}</option>
          ))}
        </select>
      </label>
      <Level label="place near" value={controls.near} max={2} onChange={set('near')} />
      <table className="board-meters">
        <tbody>
          {LAYERS.map((layer, at) => (
            <tr key={layer}>
              <th>{layer}</th>
              <td>
                <meter min={0} max={1} value={levels[at]} />
              </td>
              <td>{levels[at]!.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function useBoardEngine(): RefObject<AudioEngine | null> {
  const engine = useRef<AudioEngine | null>(null);
  useEffect(() => {
    const created = createAudioEngine(BANK, SOUND_URLS, FULL);
    engine.current = created;
    return () => {
      created.dispose();
      engine.current = null;
    };
  }, []);
  return engine;
}

// Dev only, as compare.html is: every slot, its files and candidates, the synth voices, and the
// hearing rules run on a scene set by hand, so levels are tuned without starting a game.
function SoundBoard() {
  const engine = useBoardEngine();
  const preview = usePreview();
  return (
    <main className="board">
      <h1>Sound board</h1>
      <p>
        Gains copy into <code>sounds/bank.ts</code>; candidates come from{' '}
        <code>sounds/shortlist.ts</code>. Every level here is at full volume.
      </p>
      <div className="board-panels">
        <SynthPanel engine={engine} />
        <ScenePanel engine={engine} />
      </div>
      <table className="board-slots">
        <thead>
          <tr>
            <th>slot</th>
            <th>bus</th>
            <th>files</th>
            <th>gain</th>
            <th>candidates</th>
          </tr>
        </thead>
        <tbody>
          {SLOT_NAMES.map((slot) => (
            <SlotRow key={slot} slot={slot} preview={preview} engine={engine} />
          ))}
        </tbody>
      </table>
    </main>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <SoundBoard />
  </StrictMode>,
);
