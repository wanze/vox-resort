import { useState } from 'react';
import { HudDropdown } from '../../hud/components/HudDropdown';
import { HudOption } from '../../hud/components/HudOption';
import { PixelIcon } from '../../hud/components/PixelIcon';
import { highlightIconOf } from './highlightIcons';
import {
  canPick,
  HIGHLIGHT_COLOURS,
  searchTypes,
  type HighlightPick,
  type HighlightType,
} from '../domain/highlights';
import type { HighlightControls } from '../../../app/useHighlights';

export interface HighlightOptionsProps {
  readonly highlights: HighlightControls;
  // Off on a touch layout, where focusing the field would throw up the keyboard over the list.
  readonly focusSearch: boolean;
  readonly onDone: () => void;
}

export interface HighlightControlProps extends Omit<HighlightOptionsProps, 'onDone'> {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const cssColourOf = (colour: number): string =>
  `#${(HIGHLIGHT_COLOURS[colour] ?? 0xffffff).toString(16).padStart(6, '0')}`;

function Swatch({ colour }: { readonly colour: number }) {
  return (
    <span
      className="hud-highlight-swatch"
      style={{ backgroundColor: cssColourOf(colour) }}
      aria-hidden="true"
    />
  );
}

function HighlightLegend({
  types,
  picks,
}: {
  readonly types: readonly HighlightType[];
  readonly picks: readonly HighlightPick[];
}) {
  if (picks.length === 0) return null;
  return (
    <ul className="hud-highlight-legend">
      {picks.map((pick) => (
        <li key={pick.family}>
          <Swatch colour={pick.colour} />
          {types.find((type) => type.family === pick.family)?.label ?? pick.family}
        </li>
      ))}
    </ul>
  );
}

// Stays open on a pick, since the point is to pick several.
export function HighlightOptions({ highlights, focusSearch, onDone }: HighlightOptionsProps) {
  const { types, picks, toggle, clear } = highlights;
  const [query, setQuery] = useState('');
  const room = canPick(picks);
  const shown = searchTypes(types, query);
  return (
    <>
      <div className="hud-highlight-search">
        <input
          type="search"
          value={query}
          placeholder="Search buildings"
          aria-label="Search buildings"
          autoFocus={focusSearch}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // The field clears itself on the first Escape; the second hands the keys back to the game.
            if (event.key === 'Escape' && query === '') event.currentTarget.blur();
          }}
        />
      </div>
      <div className="hud-highlight-list">
        <HudOption
          label="None"
          note="show every building alike"
          checked={picks.length === 0}
          onSelect={() => {
            clear();
            onDone();
          }}
        />
        <hr className="hud-rule" />
        {shown.map((type) => {
          const pick = picks.find((each) => each.family === type.family);
          return (
            <HudOption
              key={type.family}
              label={type.label}
              icon={highlightIconOf(type)}
              note={
                <>
                  {pick ? <Swatch colour={pick.colour} /> : null}
                  {type.count} built
                </>
              }
              checked={pick !== undefined}
              many
              disabled={!pick && !room}
              onSelect={() => toggle(type.family)}
            />
          );
        })}
        {shown.length === 0 ? <p className="hud-highlight-empty">No building matches</p> : null}
      </div>
    </>
  );
}

export function HighlightControl({
  highlights,
  focusSearch,
  open,
  onOpenChange,
}: HighlightControlProps) {
  const { types, picks } = highlights;
  return (
    <div className="hud-highlight">
      <HudDropdown
        open={open}
        onOpenChange={onOpenChange}
        title="Highlight buildings of a kind"
        label={
          <>
            <PixelIcon name="inspect" />
            <span className="hud-chip-label">
              {picks.length > 0 ? `Highlight · ${picks.length}` : 'Highlight'}
            </span>
          </>
        }
      >
        <HighlightOptions
          highlights={highlights}
          focusSearch={focusSearch}
          onDone={() => onOpenChange(false)}
        />
      </HudDropdown>
      <HighlightLegend types={types} picks={picks} />
    </div>
  );
}
