import type { SoundKind } from '../../../../voxel-gen/voxelgen.ts';

export const BUSES = ['music', 'ambience', 'effects', 'interface'] as const;

export type Bus = (typeof BUSES)[number];

export const LICENCES = ['CC0', 'Pixabay', 'Sonniss-GDC'] as const;

export type Licence = (typeof LICENCES)[number];

export interface SoundSource {
  // Where a human reads the licence.
  readonly page: string;
  // What fetch-sounds downloads: a file, or a zip holding `member`.
  readonly fetch: string;
  readonly member?: string;
  readonly author: string;
  readonly licence: Licence;
}

export interface SoundCut {
  readonly start?: number;
  readonly length?: number;
  // Music only: everything else is heard centred, so a second channel is wasted bytes.
  readonly stereo?: boolean;
  // The LUFS target ffmpeg's loudnorm evens every file out to.
  readonly loudness: number;
}

export interface SoundFile {
  // The name in sounds/files/.
  readonly file: string;
  readonly source: SoundSource;
  readonly cut: SoundCut;
}

// A recording considered for a slot, chosen by its metadata and played on the sound board. It
// carries what a SoundFile needs, so moving it into the bank is a copy.
export interface Candidate extends Omit<SoundSource, 'author' | 'licence'> {
  readonly slot: SlotName;
  readonly title: string;
  readonly author: string;
  readonly licence: Licence;
  // A file the board plays straight from its host; empty for a sound inside a zip.
  readonly preview: string;
  readonly seconds: number;
  readonly rating?: number;
  readonly ratings?: number;
  readonly why: string;
  readonly cut?: Omit<SoundCut, 'loudness'>;
}

export interface SoundSlot {
  readonly bus: Bus;
  readonly loop: boolean;
  // A trim, 0..1, set by ear on the sound board.
  readonly gain: number;
  // Variants, picked among so a repeated cue does not sound mechanical; none is silent.
  readonly files: readonly SoundFile[];
}

const MUSIC_SLOTS = ['music-menu', 'music-day', 'music-night'] as const;

// Generated in Web Audio from noise, so the bank never names a file for them.
const SYNTH_SLOTS = ['rain', 'wind', 'surf', 'thunder'] as const;

export const NATURE_SLOTS = [
  'gulls',
  'birds',
  'crickets',
  'cicadas',
  'crowd',
  'children',
  'swimmers',
] as const;

export const VENUE_SLOTS = [
  'cafe',
  'restaurant',
  'bar',
  'snack',
  'shop',
  'arcade',
  'gym',
  'spa',
  'pool',
  'kids',
  'tennis',
  'ballcourt',
  'minigolf',
  'boats',
  'reception',
  'restrooms',
  'bonfire',
  'watersports',
  'club',
  'massage',
  'mist',
] as const;

const FIXTURE_SLOTS = ['fountain', 'torch', 'sail'] as const;

const EFFECT_SLOTS = [
  'place',
  'pave',
  'dig',
  'demolish',
  'built',
  'land',
  'morning',
  'day',
] as const;

const INTERFACE_SLOTS = ['click', 'toggle', 'refused', 'alert', 'notice'] as const;

export const SLOT_NAMES = [
  ...MUSIC_SLOTS,
  ...SYNTH_SLOTS,
  ...NATURE_SLOTS,
  ...VENUE_SLOTS,
  ...FIXTURE_SLOTS,
  ...EFFECT_SLOTS,
  ...INTERFACE_SLOTS,
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

export type Bank = { readonly [slot in SlotName]?: SoundSlot };

const SYNTH: ReadonlySet<string> = new Set(SYNTH_SLOTS);

export const isSynth = (slot: SlotName): boolean => SYNTH.has(slot);

// Thunder is an effect: it is an event, and turning the ambience down must not silence it.
const BUS_SLOTS: readonly (readonly [Bus, readonly SlotName[]])[] = [
  ['music', MUSIC_SLOTS],
  ['ambience', ['rain', 'wind', 'surf', ...NATURE_SLOTS, ...VENUE_SLOTS, ...FIXTURE_SLOTS]],
  ['effects', ['thunder', ...EFFECT_SLOTS]],
  ['interface', INTERFACE_SLOTS],
];

export const SLOT_BUS = Object.fromEntries(
  BUS_SLOTS.flatMap(([bus, slots]) => slots.map((slot) => [slot, bus])),
) as { readonly [slot in SlotName]: Bus };

// A record, so a SoundKind added to the art without a slot fails the typecheck here. Trees play
// nothing themselves: they bring in the birds, crickets and cicadas.
const KIND_SLOTS: { readonly [kind in SoundKind]: SlotName | null } = {
  cafe: 'cafe',
  restaurant: 'restaurant',
  bar: 'bar',
  snack: 'snack',
  shop: 'shop',
  arcade: 'arcade',
  gym: 'gym',
  spa: 'spa',
  pool: 'pool',
  kids: 'kids',
  tennis: 'tennis',
  ballcourt: 'ballcourt',
  minigolf: 'minigolf',
  boats: 'boats',
  reception: 'reception',
  restrooms: 'restrooms',
  bonfire: 'bonfire',
  watersports: 'watersports',
  club: 'club',
  massage: 'massage',
  mist: 'mist',
  fountain: 'fountain',
  torch: 'torch',
  sail: 'sail',
  trees: null,
};

export const SOUND_KINDS = Object.keys(KIND_SLOTS) as readonly SoundKind[];

export const slotOfKind = (kind: SoundKind): SlotName | null => KIND_SLOTS[kind];

export function slotFiles(bank: Bank, slot: SlotName): readonly SoundFile[] {
  return bank[slot]?.files ?? [];
}
