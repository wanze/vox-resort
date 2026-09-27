import type { OverlayKind } from '../domain/overlays';

// Kept here rather than in the domain so a phrase can change without touching it.
export const OVERLAY_NAMES: { readonly [kind in OverlayKind]: string } = {
  footfall: 'Footfall',
  mood: 'Mood',
  'reach-food': 'Food',
  'reach-drink': 'Drink',
  'reach-wash': 'Wash',
  scenery: 'Scenery',
  litter: 'Litter',
};

export const OVERLAY_QUESTIONS: { readonly [kind in OverlayKind]: string } = {
  footfall: 'Where guests walk',
  mood: 'Where guests are unhappy',
  'reach-food': 'How far to something to eat',
  'reach-drink': 'How far to something to drink',
  'reach-wash': 'How far to somewhere to wash',
  scenery: 'Where the walk is plain',
  litter: 'Where litter lies',
};
