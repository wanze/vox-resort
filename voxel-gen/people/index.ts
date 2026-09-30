// Not in models/index.ts: a person has no tile footprint and must never reach the palette or
// the generator.

import type { VoxelModelSource } from '../voxelgen.ts';
import animator from './animator.ts';
import child from './child.ts';
import cleaner from './cleaner.ts';
import guest_a from './guest-a.ts';
import guest_b from './guest-b.ts';
import guest_c from './guest-c.ts';
import lifeguard from './lifeguard.ts';
import mechanic from './mechanic.ts';

export const PEOPLE_SOURCES: readonly VoxelModelSource[] = [guest_a, guest_b, guest_c, child];

// Staff are a list of their own: guests draw from PEOPLE_MODELS.length, so a cleaner there would be
// dealt to guests and shift every seeded draw a benchmark replays. In STAFF_ROLES order: a staff
// body's variant is its role's index.
export const STAFF_SOURCES: readonly VoxelModelSource[] = [cleaner, lifeguard, animator, mechanic];
