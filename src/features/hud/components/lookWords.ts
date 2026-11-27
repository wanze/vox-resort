import type { Look } from '../domain/looks';

export const LOOK_NAMES: { readonly [look in Look]: string } = {
  block: 'Block',
  carved: 'Carved',
  pebble: 'Pebble',
  slab: 'Slab',
  stucco: 'Stucco',
  postcard: 'Postcard',
  'postcard-plain': 'Postcard plain',
  'postcard-stamp': 'Postcard stamp',
  'postcard-sepia': 'Postcard sepia',
  cosy: 'Cosy',
  boardwalk: 'Boardwalk',
};

export const LOOK_NOTES: { readonly [look in Look]: string } = {
  block: 'square pixel corners, solid faces, hard shadows',
  carved: 'chamfered corners on grained stone',
  pebble: 'worn round stones with soft shadows',
  slab: 'flat voxel slabs that show their side',
  stucco: 'smooth white plaster and terracotta',
  postcard: 'printed postcards and ticket stubs',
  'postcard-plain': 'postcards without the printed frame',
  'postcard-stamp': 'postcards, the picked label pressed flat',
  'postcard-sepia': 'postcards gone sepia',
  cosy: 'soft round cushions in warm cream',
  boardwalk: 'driftwood planks and painted signs',
};
