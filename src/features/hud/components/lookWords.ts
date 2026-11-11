import type { Look } from '../domain/looks';

export const LOOK_NAMES: { readonly [look in Look]: string } = {
  block: 'Block',
  carved: 'Carved',
  pebble: 'Pebble',
};

export const LOOK_NOTES: { readonly [look in Look]: string } = {
  block: 'square pixel corners, solid faces, hard shadows',
  carved: 'chamfered corners on grained stone',
  pebble: 'worn round stones with soft shadows',
};
