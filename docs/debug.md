# Debug mode

The render figures and tools for trying the game out faster than it plays: a
turbo clock and jumps through the season's calendar. Nothing here is saved.

## Where it is on

Debug mode is decided when the bundle is built; there is no URL parameter.

| Build                                    | Debug mode |
| ---------------------------------------- | ---------- |
| `pnpm dev`                               | on         |
| `pnpm build` or `vite build` on your Mac | on         |
| any build with `CI` set (GitHub Actions) | off        |
| the deploy to Cloudflare (`ci.yml`)      | off        |
| any build with `VOX_DEBUG=on` / `off`    | as it says |

`vite.config.ts` reads `VOX_DEBUG` (`on` or `off`; anything else fails the
build). Left unset, it is `off` when `CI` is set and `on` otherwise. The answer
is compiled into the bundle as the constant `VOX_DEBUG_ALLOWED` through
`define`; the deploy step in `ci.yml` also sets `VOX_DEBUG: off`, so the intent
is in the workflow. The debug code ships in every bundle; with the constant
false nothing offers it.

## The panel

The Debug window (F3, main menu Windows, command palette) exists only in debug
mode. It has two tabs: **Render**, the frame and scene figures, and
**Actions**, the tools below. The palette also lists Turbo and every season
action that can run now. Without debug mode F3 passes through, the menu and the
palette have no debug entries, and a Debug window left open by a debug build
stays shut.

## Level of detail

Always on for the player. The Actions tab's **Level of detail** button switches
it off, to compare frame rate with it and without; it is not saved.

## Turbo

About 2 s of real time per simulated day, so a 28-day season plays in roughly a
minute with the whole simulation running. It multiplies the frame's clock step
(`turboPace`) rather than adding a `SimSpeed`, which the save schema knows.

- It runs only while the clock does, at any speed; paused stays paused, and a
  break still stops the clock.
- At 60 fps a 2 s day is exactly `MAX_TICKS_PER_ADVANCE` (12) ticks a frame,
  which is left alone: a slower frame rate makes the day longer instead.
- Guests cannot walk that fast (`crowdScaleFor`, `MAX_SUBSTEPS`), so they reach
  fewer places in a day: expect low moods, few visits and thin takings.

## Season actions

Each is a pure step in `resort-sim/domain/debugSteps.ts`.

| Action                | Does                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Go to early season    | today becomes season day 1                                                                     |
| Go to school holidays | today becomes season day 8                                                                     |
| Go to late season     | today becomes season day 22                                                                    |
| Go to the last day    | today becomes day 28; the season closes tomorrow at 11:00                                      |
| Close the season now  | today is the closing day: no coach, everybody is sent home, and it ends once empty or at 22:00 |
| End the season now    | straight to the break and the season report; the clock pauses as at a season's own end         |

- A jump moves `season.startedOn`; the clock, the weekdays and the events
  programme stay where they are. The days skipped are **not simulated**, so the
  season report counts only the days actually played (and a jump back counts
  some phases twice).
- Today's calendar day becomes the season day, as `phaseOn` reads it. A season
  day starts at the 11:00 check-in, so before 11:00 today's coach brings the day
  jumped to; after it, the phase's guests arrive with tomorrow's coach.
- From a break a jump opens the next season on that day and resumes the clock,
  as Open season does. Close and End are off in a break.
- Early in a game a jump can start the season before day 0, which the save
  schema allows (`startedOn` is any whole number).
