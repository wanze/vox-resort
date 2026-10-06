# Sounds

Everything the game plays that is recorded rather than synthesized. Like the
voxel models, sound is authored here, outside `src/`, and the app derives
everything from `bank.ts`. Rain, wind, surf and thunder aren't here: they are
generated in Web Audio (`src/features/sound/adapters/synthVoices.ts`).

| Path           | What it is                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------- |
| `bank.ts`      | every slot: its bus, whether it loops, its gain, and its files with source, licence and cut |
| `files/`       | the encoded MP3s, committed and precached for offline play                                  |
| `shortlist.ts` | the candidates for every recorded slot; `SHORTLIST.md` is generated from it                 |
| `.cache/`      | downloads, git-ignored                                                                      |

## Adding or swapping a sound

1. Pick a candidate from `SHORTLIST.md`, or add one to `shortlist.ts` first.
2. Edit its slot's `SoundFile` in `bank.ts`: the page, the URL to fetch (and
   the `member` inside a zip), the author, the licence, and the cut (where a
   loop starts and how long it is, 20 s for ambience, and the loudness: ambience −24 LUFS,
   effects and interface −18, music −16).
3. Run `pnpm sounds:fetch`. It downloads and encodes only the files
   whose bank entry changed (64 kbps, mono except the music).
4. Listen on the sound board: `pnpm dev`, then `/sounds.html`. Set the slot's
   `gain` there and copy it into `bank.ts`.
5. `pnpm lint` runs `scripts/check-sounds.ts`: every file named once, every
   licence allowed, no file over 1.5 MiB and all of them within 12 MiB.
6. Commit the MP3 and `bank.ts` together.

A slot with no files plays nothing and logs once with `console.info`, so a
slot can stay empty until a good sound is found.

## Licences

Only licences that need no credit, so the game needs no credits screen:

1. **Kenney** and **CC0 on Freesound** first: public domain, no conditions.
2. **Sonniss GDC** bundles: royalty free for commercial use without credit.
   Only files already on hand; the bundles are gigabytes.
3. **Pixabay**: free for commercial use without credit, under its own licence
   (`Pixabay`), so the page is recorded in case it changes.

Never the **BBC sound effects archive** (personal and educational use only),
and no **CC-BY** in this version, since it would need the credits screen.
