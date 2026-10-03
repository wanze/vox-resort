// Downloads and encodes every file the bank names whose entry changed since it was last encoded,
// and writes sounds/SHORTLIST.md from sounds/shortlist.ts. Needs ffmpeg and unzip on the PATH.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BANK } from '../sounds/bank.ts';
import { SHORTLIST } from '../sounds/shortlist.ts';
import {
  SLOT_BUS,
  SLOT_NAMES,
  type Candidate,
  type SlotName,
  type SoundFile,
} from '../src/features/sound/domain/bank.ts';

const FILES = 'sounds/files';
const CACHE = 'sounds/.cache';
const HASHES = path.join(FILES, '.hashes.json');
const SHORTLIST_MD = 'sounds/SHORTLIST.md';
// True peak: MP3 encoding overshoots by a fraction of a decibel, so the ceiling leaves room.
const PEAK_CEILING = -1.5;
// EBU R128 gates out quiet and short material, so a click reads as silence; those are evened
// out by their peak instead.
const UNREADABLE_LUFS = -60;
const SHORT_PEAK = -6;

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

// Bumped whenever the encode below changes, so every file is encoded again.
const ENCODING = 3;

const entryHash = (sound: SoundFile): string =>
  sha(JSON.stringify({ encoding: ENCODING, source: sound.source, cut: sound.cut }));

function readHashes(): Record<string, string> {
  if (!existsSync(HASHES)) return {};
  return JSON.parse(readFileSync(HASHES, 'utf8')) as Record<string, string>;
}

async function download(url: string): Promise<string> {
  const extension = path.extname(new URL(url).pathname) || '.bin';
  const cached = path.join(CACHE, `${sha(url)}${extension}`);
  if (existsSync(cached)) return cached;
  const response = await fetch(url, { headers: { 'user-agent': 'vox-resort fetch-sounds' } });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  return cached;
}

function unzipMember(zip: string, member: string): string {
  const out = path.join(CACHE, `${sha(`${zip}:${member}`)}${path.extname(member)}`);
  if (!existsSync(out)) writeFileSync(out, execFileSync('unzip', ['-p', zip, member]));
  return out;
}

async function sourceOf(sound: SoundFile): Promise<string> {
  const fetched = await download(sound.source.fetch);
  return sound.source.member ? unzipMember(fetched, sound.source.member) : fetched;
}

// ffmpeg reports on stderr, the loudness reading included.
function ffmpeg(args: readonly string[]): string {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${run.stderr}`);
  return run.stderr;
}

// Seeking before the input is fast and, for audio, exact.
const inputArgs = (input: string, sound: SoundFile): string[] => [
  ...(sound.cut.start ? ['-ss', String(sound.cut.start)] : []),
  ...(sound.cut.length ? ['-t', String(sound.cut.length)] : []),
  '-i',
  input,
];

interface Loudness {
  readonly integrated: number;
  readonly peak: number;
}

// The same explicit fold in the measurement and the encode: ffmpeg's own downmix sums or
// averages the channels depending on where in the chain it lands, up to 3 dB apart.
const layoutOf = (sound: SoundFile): string =>
  sound.cut.stereo === true
    ? 'aformat=channel_layouts=stereo'
    : 'aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1';

function loudnessOf(input: string, sound: SoundFile): Loudness {
  const filter = `${layoutOf(sound)},volumedetect,loudnorm=I=${sound.cut.loudness}:TP=${PEAK_CEILING}:print_format=json`;
  const report = ffmpeg([...inputArgs(input, sound), '-af', filter, '-f', 'null', '-']);
  const json = report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1);
  const read = JSON.parse(json) as { readonly input_i: string; readonly input_tp: string };
  // loudnorm's true peak reads low on a clip of a fraction of a second; the sample peak does not.
  const sampled = Number(/max_volume: (-?[\d.]+) dB/.exec(report)?.[1] ?? Number.NaN);
  return { integrated: Number(read.input_i), peak: Math.max(Number(read.input_tp), sampled) };
}

// Linear, one gain for the whole file, so a wave's swell and a click's attack keep their shape;
// loudnorm's single pass would compress them.
function gainFor(loudness: Loudness, target: number): number {
  const readable = Number.isFinite(loudness.integrated) && loudness.integrated > UNREADABLE_LUFS;
  const wanted = readable ? target - loudness.integrated : SHORT_PEAK - loudness.peak;
  return Math.min(wanted, PEAK_CEILING - loudness.peak);
}

function encode(input: string, sound: SoundFile, out: string): number {
  const gain = gainFor(loudnessOf(input, sound), sound.cut.loudness);
  ffmpeg([
    '-y',
    '-v',
    'error',
    ...inputArgs(input, sound),
    '-af',
    `${layoutOf(sound)},volume=${gain.toFixed(2)}dB`,
    // Cover art embedded in a source MP3 would otherwise be carried over as a picture stream.
    '-vn',
    '-ar',
    '44100',
    '-codec:a',
    'libmp3lame',
    // Music too, at 8 MiB for the whole bank: 96 kbps put the five tracks alone at 6 MiB.
    '-b:a',
    '64k',
    '-map_metadata',
    '-1',
    out,
  ]);
  return gain;
}

const banked = (): { readonly slot: SlotName; readonly sound: SoundFile }[] =>
  SLOT_NAMES.flatMap((slot) => (BANK[slot]?.files ?? []).map((sound) => ({ slot, sound })));

const signed = (gain: number): string => `${gain >= 0 ? '+' : ''}${gain.toFixed(1)}`;

async function encodeChanged(hashes: Record<string, string>): Promise<Record<string, string>> {
  const next: Record<string, string> = {};
  for (const { slot, sound } of banked()) {
    const out = path.join(FILES, sound.file);
    const hash = entryHash(sound);
    next[sound.file] = hash;
    if (existsSync(out) && hashes[sound.file] === hash) continue;
    const gain = encode(await sourceOf(sound), sound, out);
    console.info(`${slot}: ${sound.file} (${signed(gain)} dB)`);
  }
  return next;
}

function removeUnnamed(named: Record<string, string>): void {
  for (const file of readdirSync(FILES).filter((name) => name.endsWith('.mp3'))) {
    if (named[file] !== undefined) continue;
    rmSync(path.join(FILES, file));
    console.info(`removed ${file}: no longer in the bank`);
  }
}

const cell = (text: string): string => text.replaceAll('|', '\\|');

const ratingOf = (candidate: Candidate): string =>
  candidate.rating === undefined ? '' : `${candidate.rating.toFixed(1)} (${candidate.ratings})`;

const sourceKey = (source: { readonly fetch: string; readonly member?: string }): string =>
  `${source.fetch}#${source.member ?? ''}`;

function rowOf(candidate: Candidate, inBank: ReadonlySet<string>): string {
  const marked = inBank.has(sourceKey(candidate)) ? '**In bank**' : '';
  const title = `[${cell(candidate.title)}](${candidate.page})`;
  const length = `${Math.round(candidate.seconds)} s`;
  return `| ${marked} | ${title} | ${cell(candidate.author)} | ${candidate.licence} | ${length} | ${ratingOf(candidate)} | ${cell(candidate.why)} |`;
}

function sectionOf(slot: SlotName, inBank: ReadonlySet<string>): string[] {
  const found = SHORTLIST.filter((candidate) => candidate.slot === slot);
  if (found.length === 0) return [];
  return [
    '',
    `## ${slot} (${SLOT_BUS[slot]})`,
    '',
    '| | Title | Author | Licence | Length | Rating | Why |',
    '| - | - | - | - | - | - | - |',
    ...found.map((candidate) => rowOf(candidate, inBank)),
  ];
}

function shortlistMarkdown(): string {
  const inBank = new Set(banked().map(({ sound }) => sourceKey(sound.source)));
  const lines = [
    '# Sound shortlist',
    '',
    'Generated from `shortlist.ts` by `pnpm sounds:fetch`; edit that, not this.',
    'Every candidate for a recorded slot, best first. **In bank** marks what the game plays now.',
    'Play them on the sound board: `pnpm dev`, then `/sounds.html`.',
    ...SLOT_NAMES.flatMap((slot) => sectionOf(slot, inBank)),
  ];
  return `${lines.join('\n')}\n`;
}

mkdirSync(CACHE, { recursive: true });
writeFileSync(SHORTLIST_MD, shortlistMarkdown());
// Formatted as `pnpm format` would, so a fetch never leaves `format:check` failing.
execFileSync('node_modules/.bin/oxfmt', [SHORTLIST_MD]);
if (!process.argv.includes('--shortlist')) {
  const hashes = await encodeChanged(readHashes());
  removeUnnamed(hashes);
  writeFileSync(HASHES, `${JSON.stringify(hashes, null, 2)}\n`);
}
