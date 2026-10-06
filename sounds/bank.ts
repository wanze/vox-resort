import type { Bank } from '../src/features/sound/domain/bank.ts';

// Gains are 1 until set by ear on the sound board (`pnpm dev`, then /sounds.html).
export const BANK: Bank = {
  'music-menu': {
    bus: 'music',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'music-menu.mp3',
        source: {
          page: 'https://opengameart.org/content/seaside-village',
          fetch: 'https://opengameart.org/sites/default/files/Sea%20side%20Village.flac',
          author: 'KarateStudios',
          licence: 'CC0',
        },
        cut: { length: 75, stereo: true, loudness: -16 },
      },
    ],
  },
  'music-day': {
    bus: 'music',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'music-day-1.mp3',
        source: {
          page: 'https://opengameart.org/content/feel-good-island',
          fetch: 'https://opengameart.org/sites/default/files/island_0.ogg',
          author: 'HaelDB (Brandon Morris)',
          licence: 'CC0',
        },
        cut: { length: 105, stereo: true, loudness: -16 },
      },
      {
        file: 'music-day-2.mp3',
        source: {
          page: 'https://opengameart.org/content/vintage-hawaii',
          fetch: 'https://opengameart.org/sites/default/files/vintage_hawaii.mp3',
          author: 'Tarush Singhal',
          licence: 'CC0',
        },
        cut: { stereo: true, loudness: -16 },
      },
      {
        file: 'music-day-3.mp3',
        source: {
          page: 'https://opengameart.org/content/champ-de-tournesol',
          fetch:
            'https://opengameart.org/sites/default/files/Komiku_-_03_-_Champ_de_tournesol_0.mp3',
          author: 'Komiku (Loyalty Freak Music)',
          licence: 'CC0',
        },
        cut: { length: 112, stereo: true, loudness: -16 },
      },
    ],
  },
  'music-night': {
    bus: 'music',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'music-night.mp3',
        source: {
          page: 'https://opengameart.org/content/blue-moon-beach',
          fetch: 'https://opengameart.org/sites/default/files/blue_moon_beach_alternate_0.ogg',
          author: 'Tsorthan Grove',
          licence: 'CC0',
        },
        cut: { start: 20, length: 120, stereo: true, loudness: -16 },
      },
    ],
  },
  gulls: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'gulls.mp3',
        source: {
          page: 'https://freesound.org/people/felix.blume/sounds/155747/',
          fetch: 'https://cdn.freesound.org/previews/155/155747_1661766-hq.mp3',
          author: 'felix.blume',
          licence: 'CC0',
        },
        cut: { start: 33, length: 20, loudness: -24 },
      },
    ],
  },
  birds: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'birds.mp3',
        source: {
          page: 'https://freesound.org/people/myrinvp/sounds/423711/',
          fetch: 'https://cdn.freesound.org/previews/423/423711_1451873-hq.mp3',
          author: 'myrinvp',
          licence: 'CC0',
        },
        cut: { start: 11, length: 20, loudness: -24 },
      },
    ],
  },
  crickets: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'crickets.mp3',
        source: {
          page: 'https://freesound.org/people/ellie.vanderlip/sounds/704381/',
          fetch: 'https://cdn.freesound.org/previews/704/704381_8525021-hq.mp3',
          author: 'ellie.vanderlip',
          licence: 'CC0',
        },
        cut: { start: 12, length: 20, loudness: -24 },
      },
    ],
  },
  cicadas: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'cicadas.mp3',
        source: {
          page: 'https://freesound.org/people/laughatlantic/sounds/320113/',
          fetch: 'https://cdn.freesound.org/previews/320/320113_3713344-hq.mp3',
          author: 'laughatlantic',
          licence: 'CC0',
        },
        cut: { start: 8, length: 20, loudness: -24 },
      },
    ],
  },
  crowd: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'crowd.mp3',
        source: {
          page: 'https://freesound.org/people/gecop/sounds/640254/',
          fetch: 'https://cdn.freesound.org/previews/640/640254_3562198-hq.mp3',
          author: 'gecop',
          licence: 'CC0',
        },
        cut: { start: 80, length: 20, loudness: -24 },
      },
    ],
  },
  children: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'children.mp3',
        source: {
          page: 'https://freesound.org/people/conleec/sounds/159735/',
          fetch: 'https://cdn.freesound.org/previews/159/159735_221578-hq.mp3',
          author: 'conleec',
          licence: 'CC0',
        },
        cut: { start: 134.5, length: 20, loudness: -24 },
      },
    ],
  },
  swimmers: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'swimmers.mp3',
        source: {
          page: 'https://freesound.org/people/felix.blume/sounds/238386/',
          fetch: 'https://cdn.freesound.org/previews/238/238386_1661766-hq.mp3',
          author: 'felix.blume',
          licence: 'CC0',
        },
        cut: { start: 138.5, length: 20, loudness: -24 },
      },
    ],
  },
  cafe: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'cafe.mp3',
        source: {
          page: 'https://freesound.org/people/Ultra-Edward/sounds/823831/',
          fetch: 'https://cdn.freesound.org/previews/823/823831_16786392-hq.mp3',
          author: 'Ultra-Edward',
          licence: 'CC0',
        },
        cut: { start: 26, length: 20, loudness: -24 },
      },
    ],
  },
  restaurant: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'restaurant.mp3',
        source: {
          page: 'https://freesound.org/people/burkay/sounds/325558/',
          fetch: 'https://cdn.freesound.org/previews/325/325558_760102-hq.mp3',
          author: 'burkay',
          licence: 'CC0',
        },
        cut: { start: 40, length: 20, loudness: -24 },
      },
    ],
  },
  bar: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'bar.mp3',
        source: {
          page: 'https://freesound.org/people/gagehurley78/sounds/397569/',
          fetch: 'https://cdn.freesound.org/previews/397/397569_6382166-hq.mp3',
          author: 'gagehurley78',
          licence: 'CC0',
        },
        cut: { start: 24, length: 20, loudness: -24 },
      },
    ],
  },
  snack: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'snack.mp3',
        source: {
          page: 'https://freesound.org/people/Audeption/sounds/455653/',
          fetch: 'https://cdn.freesound.org/previews/455/455653_8323418-hq.mp3',
          author: 'Audeption',
          licence: 'CC0',
        },
        cut: { start: 21, length: 20, loudness: -24 },
      },
    ],
  },
  shop: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'shop.mp3',
        source: {
          page: 'https://freesound.org/people/hubyduby/sounds/148410/',
          fetch: 'https://cdn.freesound.org/previews/148/148410_822206-hq.mp3',
          author: 'hubyduby',
          licence: 'CC0',
        },
        cut: { start: 6, length: 20, loudness: -24 },
      },
    ],
  },
  arcade: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'arcade.mp3',
        source: {
          page: 'https://freesound.org/people/maxstcroix/sounds/343151/',
          fetch: 'https://cdn.freesound.org/previews/343/343151_1928753-hq.mp3',
          author: 'maxstcroix',
          licence: 'CC0',
        },
        cut: { start: 2, length: 20, loudness: -24 },
      },
    ],
  },
  gym: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'gym.mp3',
        source: {
          page: 'https://freesound.org/people/wdmatheson/sounds/341181/',
          fetch: 'https://cdn.freesound.org/previews/341/341181_5699463-hq.mp3',
          author: 'wdmatheson',
          licence: 'CC0',
        },
        cut: { start: 10, length: 20, loudness: -24 },
      },
    ],
  },
  spa: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'spa.mp3',
        source: {
          page: 'https://freesound.org/people/Kinoton/sounds/378431/',
          fetch: 'https://cdn.freesound.org/previews/378/378431_2247456-hq.mp3',
          author: 'Kinoton',
          licence: 'CC0',
        },
        cut: { start: 3, length: 20, loudness: -24 },
      },
    ],
  },
  pool: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'pool.mp3',
        source: {
          page: 'https://freesound.org/people/felix.blume/sounds/238386/',
          fetch: 'https://cdn.freesound.org/previews/238/238386_1661766-hq.mp3',
          author: 'felix.blume',
          licence: 'CC0',
        },
        cut: { start: 38, length: 20, loudness: -24 },
      },
    ],
  },
  kids: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'kids.mp3',
        source: {
          page: 'https://freesound.org/people/Garuda1982/sounds/538220/',
          fetch: 'https://cdn.freesound.org/previews/538/538220_2061858-hq.mp3',
          author: 'Garuda1982',
          licence: 'CC0',
        },
        cut: { start: 22, length: 20, loudness: -24 },
      },
    ],
  },
  tennis: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'tennis.mp3',
        source: {
          page: 'https://freesound.org/people/Garuda1982/sounds/585820/',
          fetch: 'https://cdn.freesound.org/previews/585/585820_2061858-hq.mp3',
          author: 'Garuda1982',
          licence: 'CC0',
        },
        cut: { start: 70, length: 20, loudness: -24 },
      },
    ],
  },
  ballcourt: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'ballcourt.mp3',
        source: {
          page: 'https://freesound.org/people/kyles/sounds/452928/',
          fetch: 'https://cdn.freesound.org/previews/452/452928_612689-hq.mp3',
          author: 'kyles',
          licence: 'CC0',
        },
        cut: { start: 20, length: 20, loudness: -24 },
      },
    ],
  },
  minigolf: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'minigolf.mp3',
        source: {
          page: 'https://freesound.org/people/170129/sounds/408260/',
          fetch: 'https://cdn.freesound.org/previews/408/408260_7906405-hq.mp3',
          author: '170129',
          licence: 'CC0',
        },
        cut: { loudness: -24 },
      },
    ],
  },
  boats: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'boats.mp3',
        source: {
          page: 'https://freesound.org/people/Filipe%20Chagas/sounds/91912/',
          fetch: 'https://cdn.freesound.org/previews/91/91912_1512131-hq.mp3',
          author: 'Filipe Chagas',
          licence: 'CC0',
        },
        cut: { start: 40, length: 20, loudness: -24 },
      },
    ],
  },
  reception: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'reception.mp3',
        source: {
          page: 'https://freesound.org/people/craigsmith/sounds/675171/',
          fetch: 'https://cdn.freesound.org/previews/675/675171_2524442-hq.mp3',
          author: 'craigsmith',
          licence: 'CC0',
        },
        cut: { length: 20, loudness: -24 },
      },
    ],
  },
  restrooms: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'restrooms.mp3',
        source: {
          page: 'https://freesound.org/people/4estaciones/sounds/186453/',
          fetch: 'https://cdn.freesound.org/previews/186/186453_3459121-hq.mp3',
          author: '4estaciones',
          licence: 'CC0',
        },
        cut: { start: 2, length: 20, loudness: -24 },
      },
    ],
  },
  bonfire: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'bonfire.mp3',
        source: {
          page: 'https://freesound.org/people/florianreichelt/sounds/563764/',
          fetch: 'https://cdn.freesound.org/previews/563/563764_6253486-hq.mp3',
          author: 'florianreichelt',
          licence: 'CC0',
        },
        cut: { start: 27, length: 20, loudness: -24 },
      },
    ],
  },
  watersports: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'watersports.mp3',
        source: {
          page: 'https://freesound.org/people/kyles/sounds/451458/',
          fetch: 'https://cdn.freesound.org/previews/451/451458_612689-hq.mp3',
          author: 'kyles',
          licence: 'CC0',
        },
        cut: { start: 20, length: 20, loudness: -24 },
      },
    ],
  },
  club: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'club.mp3',
        source: {
          page: 'https://freesound.org/people/arrogantwhiteboys/sounds/417949/',
          fetch: 'https://cdn.freesound.org/previews/417/417949_8198569-hq.mp3',
          author: 'arrogantwhiteboys',
          licence: 'CC0',
        },
        cut: { start: 2, length: 20, loudness: -24 },
      },
    ],
  },
  fountain: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'fountain.mp3',
        source: {
          page: 'https://freesound.org/people/skyko/sounds/169254/',
          fetch: 'https://cdn.freesound.org/previews/169/169254_1391822-hq.mp3',
          author: 'skyko',
          licence: 'CC0',
        },
        cut: { start: 29, length: 20, loudness: -24 },
      },
    ],
  },
  torch: {
    bus: 'ambience',
    loop: true,
    gain: 1,
    files: [
      {
        file: 'torch.mp3',
        source: {
          page: 'https://freesound.org/people/ahriik/sounds/508110/',
          fetch: 'https://cdn.freesound.org/previews/508/508110_6657854-hq.mp3',
          author: 'ahriik',
          licence: 'CC0',
        },
        cut: { length: 20, loudness: -24 },
      },
    ],
  },
  place: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'place-1.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactWood_heavy_000.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'place-2.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactWood_heavy_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'place-3.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactWood_heavy_002.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  pave: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'pave-1.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/footstep_concrete_000.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'pave-2.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/footstep_concrete_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'pave-3.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/footstep_concrete_002.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  dig: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'dig-1.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactSoft_heavy_000.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'dig-2.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactSoft_heavy_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  demolish: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'demolish-1.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactPlank_medium_000.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'demolish-2.mp3',
        source: {
          page: 'https://kenney.nl/assets/impact-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          member: 'Audio/impactPlank_medium_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  built: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'built.mp3',
        source: {
          page: 'https://kenney.nl/assets/music-jingles',
          fetch:
            'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
          member: 'Audio/Steel jingles/jingles_STEEL00.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  land: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'land.mp3',
        source: {
          page: 'https://kenney.nl/assets/rpg-audio',
          fetch:
            'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
          member: 'Audio/handleCoins.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  morning: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'morning.mp3',
        source: {
          page: 'https://kenney.nl/assets/music-jingles',
          fetch:
            'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
          member: 'Audio/Steel jingles/jingles_STEEL04.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  day: {
    bus: 'effects',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'day.mp3',
        source: {
          page: 'https://kenney.nl/assets/music-jingles',
          fetch:
            'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
          member: 'Audio/Steel jingles/jingles_STEEL09.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  click: {
    bus: 'interface',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'click-1.mp3',
        source: {
          page: 'https://kenney.nl/assets/ui-audio',
          fetch:
            'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip',
          member: 'Audio/click1.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'click-2.mp3',
        source: {
          page: 'https://kenney.nl/assets/ui-audio',
          fetch:
            'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip',
          member: 'Audio/click3.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
      {
        file: 'click-3.mp3',
        source: {
          page: 'https://kenney.nl/assets/ui-audio',
          fetch:
            'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip',
          member: 'Audio/click5.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  toggle: {
    bus: 'interface',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'toggle.mp3',
        source: {
          page: 'https://kenney.nl/assets/interface-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
          member: 'Audio/toggle_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  refused: {
    bus: 'interface',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'refused.mp3',
        source: {
          page: 'https://kenney.nl/assets/interface-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
          member: 'Audio/error_008.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  alert: {
    bus: 'interface',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'alert.mp3',
        source: {
          page: 'https://kenney.nl/assets/interface-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
          member: 'Audio/question_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
  notice: {
    bus: 'interface',
    loop: false,
    gain: 1,
    files: [
      {
        file: 'notice.mp3',
        source: {
          page: 'https://kenney.nl/assets/interface-sounds',
          fetch:
            'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
          member: 'Audio/glass_001.ogg',
          author: 'Kenney',
          licence: 'CC0',
        },
        cut: { loudness: -18 },
      },
    ],
  },
};
