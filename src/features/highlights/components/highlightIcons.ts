import { SIGN_ICONS } from '../../hud/components/signIcons';
import type { IconName } from '../../hud/components/pixelIcons';
import type { HighlightKind } from '../domain/highlights';

// Lodging has no sign; the parasol stands for a place to stay.
export const highlightIconOf = (kind: HighlightKind): IconName =>
  kind.sign ? SIGN_ICONS[kind.sign] : 'resort';
