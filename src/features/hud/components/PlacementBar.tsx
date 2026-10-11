import { objectTypeById } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import {
  armedLand,
  armedObject,
  type BuildTool,
  type StylePick,
} from '../../build/domain/buildTool';
import { styleStripFor } from '../../build/domain/stylePick';
import type { LandView } from '../../land/domain/landRights';
import type { PreviewLookup } from './BuildPalette';
import { StyleStrip } from './StyleStrip';

export interface PlacementBarProps {
  readonly pending: boolean;
  readonly tool: BuildTool | null;
  readonly land: LandView | null;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly onTurn: (quarters: number) => void;
  readonly preview: PreviewLookup;
  readonly onToolChange: (tool: BuildTool) => void;
}

interface Asked {
  readonly question: string;
  readonly verb: string;
  readonly price: number;
  readonly turns: boolean;
}

const objectAsked = (id: string): Asked => ({
  question: `Place ${objectTypeById(id).label}?`,
  verb: 'Place',
  price: buildCostOf(id),
  turns: true,
});

// Free play claims land for nothing, as the land tool's own label says.
function landAsked(land: LandView | null): Asked {
  const price = land?.price ?? 0;
  return price > 0
    ? { question: 'Buy this parcel?', verb: 'Buy', price, turns: false }
    : { question: 'Claim this parcel?', verb: 'Claim', price, turns: false };
}

function askedOf({ pending, tool, land }: PlacementBarProps): Asked | null {
  if (!pending) return null;
  const id = armedObject(tool);
  if (id) return objectAsked(id);
  return armedLand(tool) ? landAsked(land) : null;
}

function Price({ price }: { readonly price: number }) {
  if (price <= 0) return null;
  return <span className="hud-placement-price">{price.toLocaleString('en-US')}</span>;
}

// A finger has no hover, so what it puts down waits here to be confirmed.
export function PlacementBar(props: PlacementBarProps) {
  const asked = askedOf(props);
  if (!asked) return null;
  const { onConfirm, onDismiss, onTurn } = props;
  // The sheet is put away once something is picked, so its style strip is out of reach here.
  const styles = styleStripFor(props.tool);
  const onStyle = (style: StylePick): void => {
    if (styles) props.onToolChange({ kind: 'object', id: styles.family, style });
  };
  return (
    <div
      className="hud-placement hud-placement-ask ui-plate"
      role="group"
      aria-label={asked.question}
      aria-live="polite"
    >
      {styles ? <StyleStrip strip={styles} preview={props.preview} onStyle={onStyle} /> : null}
      <div className="hud-placement-actions">
        <button
          type="button"
          className="ui-button-large ui-button-large--primary"
          onClick={onConfirm}
        >
          {asked.verb}
          <Price price={asked.price} />
        </button>
        {asked.turns ? (
          <button type="button" className="ui-button-large" onClick={() => onTurn(1)}>
            <span aria-hidden="true">⟳</span> Turn
          </button>
        ) : null}
        <button type="button" className="ui-button-large" onClick={onDismiss}>
          <span aria-hidden="true">✕</span> Cancel
        </button>
      </div>
    </div>
  );
}
