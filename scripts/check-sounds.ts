import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { BANK } from '../sounds/bank.ts';
import {
  LICENCES,
  SLOT_BUS,
  SLOT_NAMES,
  type SlotName,
  type SoundFile,
} from '../src/features/sound/domain/bank.ts';
import { STREAMED_MUSIC } from '../src/features/pwa/domain/precacheRules.ts';

const FILES = 'sounds/files';
const MIB = 1024 * 1024;
// All but the music is precached on install; the music is fetched as it is first heard.
const AUDIO_BUDGET = 12 * MIB;
const FILE_CAP = 1.5 * MIB;

const licences: ReadonlySet<string> = new Set(LICENCES);
const slots: ReadonlySet<string> = new Set(SLOT_NAMES);

const named = Object.entries(BANK).flatMap(([slot, entry]) =>
  (entry?.files ?? []).map((file: SoundFile) => ({ slot: slot as SlotName, file })),
);
const onDisk = readdirSync(FILES).filter((file) => file.endsWith('.mp3'));
const sizeOf = (file: string): number => statSync(path.join(FILES, file)).size;
const mib = (bytes: number): string => (bytes / MIB).toFixed(1);

function slotProblems(): string[] {
  return Object.entries(BANK).flatMap(([slot, entry]) => {
    if (!slots.has(slot)) return [`${slot}: not a slot in SLOT_NAMES`];
    const bus = SLOT_BUS[slot as SlotName];
    return entry && entry.bus !== bus
      ? [`${slot}: on the ${entry.bus} bus, the slot is ${bus}`]
      : [];
  });
}

function sourceProblems({ file, source }: SoundFile): string[] {
  const problems: string[] = [];
  if (!licences.has(source.licence))
    problems.push(`${file}: licence ${source.licence} not allowed`);
  if (!source.page.startsWith('https://')) problems.push(`${file}: page is not an https URL`);
  return problems;
}

// A track named otherwise would go back into the precache; a loop named music- would leave it.
function busProblems(slot: SlotName, { file, cut }: SoundFile): string[] {
  const music = SLOT_BUS[slot] === 'music';
  const problems: string[] = [];
  if (cut.stereo && !music) problems.push(`${file}: only music is stereo`);
  if (music !== STREAMED_MUSIC.test(file))
    problems.push(`${file}: music, and only music, is named music-*.mp3`);
  return problems;
}

function fileProblems(slot: SlotName, sound: SoundFile): string[] {
  const problems = [...sourceProblems(sound), ...busProblems(slot, sound)];
  if (!onDisk.includes(sound.file))
    problems.push(`${sound.file}: named in the bank, not in ${FILES}`);
  return problems;
}

function diskProblems(): string[] {
  const names = named.map(({ file }) => file.file);
  const twice = names.filter((name, at) => names.indexOf(name) !== at);
  return [
    ...[...new Set(twice)].map((file) => `${file}: named more than once in the bank`),
    ...onDisk.filter((file) => !names.includes(file)).map((file) => `${file}: named by nothing`),
    ...onDisk
      .filter((file) => sizeOf(file) > FILE_CAP)
      .map((file) => `${file}: ${mib(sizeOf(file))} MiB, over ${mib(FILE_CAP)} MiB`),
  ];
}

const total = onDisk.reduce((sum, file) => sum + sizeOf(file), 0);
const problems = [
  ...slotProblems(),
  ...named.flatMap(({ slot, file }) => fileProblems(slot, file)),
  ...diskProblems(),
  ...(total > AUDIO_BUDGET ? [`${mib(total)} MiB of sound, over the budget`] : []),
];

console.info(`sounds: ${onDisk.length} files, ${mib(total)} MiB of ${AUDIO_BUDGET / MIB} MiB`);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
