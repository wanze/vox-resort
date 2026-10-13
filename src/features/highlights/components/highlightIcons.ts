import { SIGN_ICONS } from '../../hud/components/signIcons';
import type { IconName } from '../../../shared/components/pixelIcons';
import type { HighlightKind, HighlightPlace } from '../domain/highlights';

// For what has no sign of its own; the parasol stands for a place to stay.
const PLACE_ICONS: { readonly [place in HighlightPlace]: IconName } = {
  venue: 'resort',
  lodging: 'resort',
  staff: 'staff',
  entrance: 'guests',
};

export const highlightIconOf = (kind: HighlightKind): IconName =>
  kind.sign ? SIGN_ICONS[kind.sign] : PLACE_ICONS[kind.place];
