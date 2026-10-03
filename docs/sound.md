# Sound

How the resort sounds: music, the weather and the sea, the guests, the
buildings near the camera, and a cue for every click and build. All of it runs
in Web Audio, and nothing runs under a bench.

## Buses

Every sound plays on one of four buses, each a `GainNode` into the master:

| Bus         | What plays on it                                                    | Default |
| ----------- | ------------------------------------------------------------------- | ------- |
| `music`     | the menu theme, day and night tracks, through one `<audio>` element | 0.5     |
| `ambience`  | rain, wind, surf, nature, the crowd, venues, fountains and torches  | 0.8     |
| `effects`   | building cues, game events and thunder                              | 0.8     |
| `interface` | clicks, windows, toggles, refusals and toast chimes                 | 0.6     |

The master defaults to 0.8. A bus plays at `master × bus` when sound is on and at 0 when
it's off (`busGain` in `sound/domain/soundPrefs.ts`). The settings live in
`localStorage` under `vox-resort:sound`, apart from the HUD's own preferences.
**M** mutes and unmutes, and the speaker dropdown in the top bar has the sliders.

Browsers refuse to start audio before a gesture, so the `AudioContext` is
created on the first `pointerdown` or `keydown`. Until then the engine only
remembers what it was asked to play. A hidden tab suspends the context. Pausing
the game doesn't, because a paused resort is still on screen.

## Slots and the bank

A **slot** is one thing the game can play (`SLOT_NAMES` in
`sound/domain/bank.ts`). `sounds/bank.ts` gives each recorded slot its bus,
whether it loops, a gain trim, and its files: the variants, with where each
came from, its licence and how it's cut. A slot the bank leaves out is
silent: it logs once with `console.info`, and nothing else changes.

Rain, wind, surf and thunder are synthesized, not recorded (see below), so the
bank never names a file for them.

The pipeline, from candidate to precached MP3:

1. `sounds/shortlist.ts` lists the candidates for each slot, chosen by metadata
   (licence, rating, length, tags). `SHORTLIST.md` is generated from it.
2. `sounds/bank.ts` names the chosen ones.
3. `pnpm sounds:fetch` downloads each file (into the git-ignored
   `sounds/.cache/`), unzips the member if there is one, cuts it, evens out its
   loudness with one linear gain (ambience −24 LUFS, effects and interface −18,
   music −16; files too short to measure go by their peak), and encodes MP3:
   64 kbps, mono except the music. Ambience loops are cut to 20 s. Only entries that changed are encoded
   again, tracked by `sounds/files/.hashes.json`.
4. `scripts/check-sounds.ts` (in `pnpm lint`) checks that every file is named
   once, every licence is allowed, no file is over 1.5 MiB and all of them fit
   in 8 MiB.
5. `sound/adapters/soundFiles.ts` imports every MP3 as a URL, so Vite hashes it
   into `dist/assets` and the service worker precaches it.

Licences: CC0 (Kenney, Freesound), Sonniss GDC and Pixabay, none needing
credit. Never the BBC archive, and no CC-BY. See `sounds/README.md`.

## Decoding and loops

Music streams through its `<audio>` element. Everything else is fetched and
decoded on first use and kept in an LRU of decoded buffers capped at 48 MB
(`decodedCache.ts`). Decoded PCM is about ten times the size of the MP3, and a
buffer that's playing is never dropped. Interface and effect files are decoded
when the context starts, so the first click isn't late.

A looping layer (`loopLayer.ts`) is crossfaded with itself: each pass overlaps
the next by 1.5 s with equal-power curves. That's because MP3 pads both ends of
a file and few free recordings are cut to loop. A file shorter than three fades
loops plainly. A layer starts when its level first rises above 0.001 and is
dropped after 10 s at zero.

## Cues

Game events play one-shot cues (`sound/domain/cues.ts`):

| Event                                | Cue                      |
| ------------------------------------ | ------------------------ |
| placing an object, laying a path     | `place`, `pave`          |
| digging, demolishing                 | `dig`, `demolish`        |
| a construction site finishing        | `built`                  |
| buying a parcel                      | `land`                   |
| a refusal                            | `refused`                |
| the morning check-in                 | `morning`                |
| a toast: urgent, warning, day report | `alert`, `notice`, `day` |
| a HUD button, a checkbox row         | `click`, `toggle`        |

The showcase fires the build cues (`onCue`) only for what the pointer does,
never for a load or a settle laying the plot out again, and never under a
bench. Dragged cues have a cooldown (`pave` and `dig` 70 ms, `click` 40 ms,
`built` 150 ms). A slot with several files never plays the same one twice in a
row, and `place`, `pave`, `dig` and `click` are detuned by up to ±60 cents. The
HUD has no hover sounds.

## Hearing the scene

Five times a second the showcase fills one `HeardScene` (`createHearing` in
`showcase.ts`): CSS pixels per tile at the camera's target, the target in
tiles, how much night (`skyStateFor(time).lampFactor`), the weather, the
clock's real seconds, the distance to the shore, the guests in reach (and the
children and swimmers among them), and, per `SoundKind`, how close the sounding
models are and how much of that is open. `hear()` in
`sound/domain/hearing.ts` turns the scene into a target level per layer.
`useSound` glides each layer towards its target (time constant 1.5 s, venues
0.8 s) and hands the levels to the engine.

- **Zoom**: `smoothstep(6, 20, tilePx)`. 20 is `SIGN_MIN_TILE_PX`, so a building
  is heard when its sign appears. The hearing radius falls from 24 tiles
  zoomed out to 8 zoomed in. Closeness is `(1 − d/r)²`, measured from a
  footprint's centre less half its shorter side.
- **Weather**: rain 0.55 in rain and 1 in a storm. Wind 0.06, 0.25 in rain
  and 1 in a storm. The music ducks to 0.6 in a storm.
- **Sea**: surf by closeness to the shore, at least 0.15 within 40 tiles, and
  louder in a storm. Gulls follow the surf by day in the dry.
- **Trees**: four trees' worth of closeness gives full birds by day, crickets
  at night (both only in the dry) and cicadas by day in a heatwave.
- **Guests**: crowd murmur at 40 guests in reach, children at 8, swimmers at 10, none of them
  counting while asleep. The crowd and children drop to 40% in rain.
- **Places**: fountains, and torches at night, by closeness.
- **Venues**: only once zoomed in (`smoothstep(0.55, 0.85, zoom)`), by closeness
  times the share that's open in the weather, times the share of guests awake, so
  they fall silent as the resort goes to bed. Only the three loudest kinds play.

The sources (every placement whose model declares a sound) are listed once
per resort and again whenever the venues are replaced (every edit, settle and
reanchor), not scanned at 5 Hz. On the generated plot, 275 of about 3,000
placements and path tiles sound. One fill with 3,000 guests costs about
0.2 ms (0.7 ms at worst).

## Synthesized weather and sea

`sound/adapters/synthVoices.ts` makes one 4 s noise buffer (white, and a brown
copy from a leaky integrator) and loops it through filters:

- **Rain**: white noise, then a highpass and a lowpass. Light rain is higher
  and thinner, and a storm is lower and fuller (`rainVoice`).
- **Wind**: brown noise through a bandpass, with gusts from two sines whose
  periods don't divide (`windVoice`).
- **Surf**: brown noise through a lowpass at 600 Hz, its swell from two sets of
  waves about 8 and 11 s apart (`surfAt`).
- **Thunder**: for each lightning strike, a brown-noise rumble through a 200 Hz
  lowpass and a 320 Hz band (its body on small speakers), plus a short bandpassed
  crack for a strong one, all through a compressor so its gain above 1 doesn't clip. It plays 0.3 to
  3.5 s after the flash, sooner and louder the stronger the strike
  (`thunderOf`). The strikes come from `strikesBetween` in
  `weather/domain/lightning.ts`, read on the same real-seconds clock the flash
  uses, and are scheduled half a second ahead, so each one plays once.

## Music

`sound/domain/playlist.ts` picks the mood: the menu theme on the welcome
screen, night music once `night > 0.7`, and day music otherwise. The menu theme
loops. Other tracks play one at a time, shuffled, never the same twice in a
row, with 8 to 25 s of silence between them. A change of mood waits for the end
of the track, except leaving the menu, which fades over 3 s.

## Adding a model's sound

1. Give the model `sound: '<kind>'` in `voxel-gen/models/<model>.ts`. Its
   variants sound like it without declaring anything.
2. For a new `SoundKind`, add it to the type in `voxel-gen/voxelgen.ts`. The
   typecheck then asks for a slot in `KIND_SLOTS` (`sound/domain/bank.ts`).
   Add the slot to `VENUE_SLOTS` for a venue.
3. Give the slot its files in `sounds/bank.ts` and run
   `pnpm sounds:fetch`.

## The sound board

`pnpm dev`, then `/sounds.html` (`src/app/soundBoard.tsx`, dev only, not in the
build). It plays every slot's files and its shortlisted candidates, with a gain
slider per slot whose value can be copied into `bank.ts`. It has sliders for
the synth voices and a thunder strike, and a scene panel that runs `hear()` on
a scene set by hand: weather, night, zoom, guests, the shore, trees and one
kind of place.
