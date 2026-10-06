# Sound

Music, weather, the sea, the guests, nearby buildings and a cue for every click
and build, all in Web Audio. Nothing plays under a bench.

## Buses

Every sound plays on one of four `GainNode` buses into the master (default 0.8):

| Bus         | Plays                                               | Default |
| ----------- | --------------------------------------------------- | ------- |
| `music`     | menu theme, day and night tracks, via one `<audio>` | 0.5     |
| `ambience`  | rain, wind, surf, nature, crowd, venues, fountains  | 0.8     |
| `effects`   | building cues, game events, thunder                 | 0.8     |
| `interface` | clicks, windows, toggles, refusals, toast chimes    | 0.6     |

Settings live in `localStorage` under `vox-resort:sound`. **M** mutes; the
speaker dropdown in the top bar has the sliders. The `AudioContext` starts on
the first gesture, since browsers refuse earlier. A hidden tab suspends it, a
paused game doesn't.

## Slots and the bank

A **slot** is one thing the game can play (`SLOT_NAMES` in
`sound/domain/bank.ts`). `sounds/bank.ts` gives each slot its bus, loop flag,
gain trim and files. A slot without files is silent and logs once. Rain, wind,
surf, thunder and fireworks are synthesized.

1. `sounds/shortlist.ts` lists candidates per slot (generates `SHORTLIST.md`).
2. `sounds/bank.ts` names the chosen ones.
3. `pnpm sounds:fetch` downloads, cuts, normalizes loudness (ambience −24 LUFS,
   effects and interface −18, music −16) and encodes 64 kbps MP3. Only changed
   entries are re-encoded (`sounds/files/.hashes.json`).
4. `scripts/check-sounds.ts` (in `pnpm lint`) checks licences and sizes (max
   1.5 MiB per file, 12 MiB total).
5. Vite hashes every MP3 into `dist/assets` and the service worker precaches it.

Licences: CC0, Sonniss GDC and Pixabay, none needing credit. No CC-BY, no BBC
archive. See `sounds/README.md`.

## Playback

Music streams. Everything else is decoded on first use into an LRU capped at
48 MB (`decodedCache.ts`); interface and effect files are decoded up front so
the first click isn't late. Loops (`loopLayer.ts`) crossfade with themselves
over 1.5 s, because MP3 pads both ends and few free recordings loop cleanly.

## Cues

Game events play one-shot cues (`sound/domain/cues.ts`): `place`, `pave`,
`dig`, `demolish`, `built`, `land`, `refused`, `morning`, `alert`, `notice`,
`day`, `click`, `toggle`. Build cues fire only for what the pointer does, never
for a load or settle. Dragged cues have a cooldown, repeated files never play
twice in a row, and frequent cues are detuned by up to ±60 cents.

## Hearing the scene

Five times a second the showcase fills a `HeardScene` (zoom, camera target,
night, weather, shore distance, guests in reach, nearby sounding models), and
`hear()` in `sound/domain/hearing.ts` turns it into a target level per layer.
`useSound` glides each layer towards it.

- **Zoom**: buildings are heard once their signs appear. The radius shrinks
  from 24 tiles zoomed out to 8 zoomed in.
- **Weather**: rain and wind rise with rain and storm; music ducks in a storm.
- **Sea**: surf by closeness to the shore, gulls by day in the dry.
- **Nature**: birds by day, crickets at night, cicadas in a heatwave.
- **Guests**: crowd murmur, children and swimmers by count in reach.
- **Venues**: only when zoomed in, scaled by how open and awake they are. Only
  the three loudest kinds play. A fire pit counts as open only while its
  bonfire burns. The water sports hut's engines are heard at the hut; the craft
  out on the water are silent.

Sound sources are listed once per resort and after every edit, not scanned at
5 Hz. One fill with 3,000 guests costs about 0.2 ms.

## Synthesis

`sound/adapters/synthVoices.ts` loops one white and one brown noise buffer
through filters:

- **Rain**: bandpassed white noise, lower and fuller in a storm.
- **Wind**: bandpassed brown noise with gusts from two incommensurate sines.
- **Surf**: lowpassed brown noise with swells about 8 and 11 s apart.
- **Thunder**: a rumble plus a crack for strong strikes, through a compressor,
  0.3 to 3.5 s after the flash. Strikes come from `weather/domain/lightning.ts`
  on the same clock as the flash, scheduled half a second ahead.
- **Fireworks** (`fireworksSound.ts`): thump, whistle, bang and crackle per
  shell, delayed by distance at the speed of sound. Bangs within 40 ms merge so
  a finale doesn't start fifty sources. Music ducks during a show.

## Music

`sound/domain/playlist.ts`: menu theme on the welcome screen (looping), night
music once `night > 0.7`, day music otherwise. Tracks are shuffled with 8 to
25 s of silence between them. A mood change waits for the track to end, except
leaving the menu.

## Adding a model's sound

1. Give the model `sound: '<kind>'` in `voxel-gen/models/<model>.ts`. Variants
   inherit it.
2. For a new `SoundKind`, add it in `voxel-gen/voxelgen.ts`; the typecheck then
   asks for a slot in `KIND_SLOTS`. Add venues to `VENUE_SLOTS`.
3. Give the slot files in `sounds/bank.ts` and run `pnpm sounds:fetch`.

## Sound board

`/sounds.html` in `pnpm dev` (dev only). Plays every slot and shortlisted
candidate with gain sliders to copy into `bank.ts`, tunes the synth voices, and
runs `hear()` on a hand-set scene.
