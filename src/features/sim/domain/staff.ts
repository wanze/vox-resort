/**
 * The people who work here.
 *
 * A registry of its own, parallel to a crowd of its own, for the reason `Guests`
 * is parallel to the crowd of guests: what a cleaner is doing is rewritten every
 * tick and who they are is written once. They are **not** guests - no party, no
 * bed, no needs, no stay - and putting them in that registry would make every
 * count in the HUD a lie, from the beds taken to the rating.
 *
 * ## One role today, and the seam for the next
 *
 * {@link StaffRole} is the seam. A lifeguard is a second role, a second model in
 * `STAFF_SOURCES` and a second branch in `staffRouter.ts`; an animator is a
 * third. Both are deferred, and the plan says why: a lifeguard's post is out on
 * the sand, which is `router.ts`'s sand leg and not a thing to copy, and an
 * animator has nothing to do until a venue can run an event.
 */

/** What one of the staff is here to do. */
export type StaffRole = 'cleaner';

/**
 * The roles in the order their art is declared in `voxel-gen/people/index.ts`'s
 * `STAFF_SOURCES`, which is what {@link Staff.variant} indexes.
 *
 * Declared here rather than derived from the art, so this module stays pure -
 * `domain/` may not reach into the catalogue - and asserted where the two meet;
 * see `showcase.ts`.
 */
export const STAFF_ROLES: readonly StaffRole[] = ['cleaner'];

export interface Staff {
  readonly count: number;
  /** What each of them does. One role today; see the plan's deferrals. */
  readonly role: readonly StaffRole[];
  /** Which staff model each is drawn with: an index into `STAFF_MODELS`. */
  readonly variant: Int32Array;
}

/**
 * How many cleaners a plot gets per venue standing on it.
 *
 * A sixth, with {@link SCRUB_PER_SPELL}'s three spells to a ruined venue behind
 * it: a cleaner holds two or three places comfortably, so one per six is a plot
 * that keeps up while everything is merely used and falls behind where a venue
 * is hammered. That gap is the mechanic. See `upkeep.ts`.
 */
const CLEANERS_PER_VENUE = 1 / 6;

/**
 * The most staff any plot gets, however much is built on it.
 *
 * A benchmark tiles the reference plan out ninefold, which is some five hundred
 * venues; without a cap that is five hundred more figures walking every frame,
 * and the second population would be the most expensive thing on the plot. Forty
 * is well past the point where the cleaners keep up with the resort a player
 * actually builds.
 */
const MAX_STAFF = 40;

/**
 * How many cleaners a plot of this many venues gets.
 *
 * Off the venues standing rather than off a slider, so a resort that builds
 * more places to clean gets more people cleaning them - which is what keeps the
 * mechanic from being a difficulty setting. At least one wherever anything at
 * all stands, because a plot with three venues and no cleaner would simply
 * degrade for ever with nothing the player could read as the reason. Plan 024 is
 * what makes them cost something.
 */
export function staffFor(venues: number): Staff {
  const wanted = venues > 0 ? Math.max(1, Math.round(venues * CLEANERS_PER_VENUE)) : 0;
  const count = Math.min(MAX_STAFF, wanted);
  const role: StaffRole[] = Array.from({ length: count }, () => 'cleaner');
  const variant = new Int32Array(count);
  for (let worker = 0; worker < count; worker++) {
    variant[worker] = STAFF_ROLES.indexOf(role[worker]!);
  }
  return { count, role, variant };
}
