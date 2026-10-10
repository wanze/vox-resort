import { HelpTip } from '../../../shared/components/HelpTip';
import {
  fairFactor,
  PRICE_RANGE,
  priceVerdict,
  type PriceRow,
  type PriceVerdict,
} from '../../sim/domain/pricing';
import type { ShowcaseStats } from '../domain/views';
import { PanelSummary } from './PanelSummary';
import { SettingGroup, SettingRow, type Tone } from './SettingRows';
import { SIGN_ICONS } from './signIcons';

export interface PricesPanelProps {
  readonly prices: ShowcaseStats['prices'] | null;
  readonly onPrice: (family: string, factor: number | null) => void;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

// A true minus sign, as the ledger writes one.
const percentOff = (factor: number): string => {
  const percent = Math.round((factor - 1) * 100);
  return percent < 0 ? `−${-percent}%` : `+${percent}%`;
};

// setPrice rounds to the step, so a sum that misses it by a float's width is harmless.
const stepped = (factor: number, steps: number): number => factor + steps * PRICE_RANGE.step;

const pullTone = (pull: number): Tone | undefined =>
  pull < 1 ? 'bad' : pull > 1 ? 'good' : undefined;

const VERDICT_TONES: { readonly [verdict in PriceVerdict]: Tone | undefined } = {
  cheap: 'good',
  fair: undefined,
  dear: 'bad',
};

function PriceLine({
  row,
  stars,
  onPrice,
}: {
  readonly row: PriceRow;
  readonly stars: number;
  readonly onPrice: PricesPanelProps['onPrice'];
}) {
  return (
    <SettingRow
      icon={row.sign ? SIGN_ICONS[row.sign] : 'lodging'}
      name={row.label}
      value={formatNumber(row.charged)}
      note={row.factor === 1 ? null : percentOff(row.factor)}
      tone={VERDICT_TONES[priceVerdict(row, stars)]}
      stepper={{
        label: `Price of the ${row.label}`,
        less: {
          label: `Charge less for the ${row.label}`,
          disabled: row.factor <= PRICE_RANGE.min,
          onClick: () => onPrice(row.family, stepped(row.factor, -1)),
        },
        more: {
          label: `Charge more for the ${row.label}`,
          disabled: row.factor >= PRICE_RANGE.max,
          onClick: () => onPrice(row.family, stepped(row.factor, 1)),
        },
        preset: {
          text: 'List',
          label: `Charge the list price for the ${row.label}, ${formatNumber(row.list)}`,
          pressed: row.factor === 1,
          onClick: () => onPrice(row.family, null),
        },
      }}
    />
  );
}

function PriceGroup({
  title,
  rows,
  stars,
  onPrice,
}: {
  readonly title: string;
  readonly rows: readonly PriceRow[];
  readonly stars: number;
  readonly onPrice: PricesPanelProps['onPrice'];
}) {
  if (rows.length === 0) return null;
  return (
    <SettingGroup title={title}>
      {rows.map((row) => (
        <PriceLine key={row.family} row={row} stars={stars} onPrice={onPrice} />
      ))}
    </SettingGroup>
  );
}

function PricesHelp() {
  return (
    <HelpTip label="How prices work">
      <p>
        List price is what a three-star resort can ask. Each star above three lets you ask{' '}
        {percentOff(fairFactor(4))} more for a bed before guests start booking elsewhere.
      </p>
      <p>
        Bookings compares the guests your beds draw at these prices with what your stars alone would
        bring. Cheaper beds draw more, up to a busy summer&rsquo;s worth.
      </p>
      <p>
        A dearer venue sees fewer visitors, and well past what your stars allow they grumble that it
        was not worth it. A price in red is costing you guests.
      </p>
    </HelpTip>
  );
}

export function PricesPanel({ prices, onPrice }: PricesPanelProps) {
  if (!prices) return <p className="ui-loading">Meshing the catalogue…</p>;
  if (prices.rows.length === 0)
    return <p className="ui-loading">Nothing on the plot charges yet.</p>;
  const accepted = Math.max(1, prices.fair);
  return (
    <div className="hud-settings">
      <PanelSummary
        figures={[
          {
            label: 'Guests accept',
            value: accepted > 1 ? `up to ${percentOff(accepted)}` : 'list price',
          },
          {
            label: 'Bookings',
            value: `${Math.round(prices.pull * 100)}%`,
            tone: pullTone(prices.pull),
          },
        ]}
        help={<PricesHelp />}
      />
      <PriceGroup
        title="Lodgings, a night"
        rows={prices.rows.filter((row) => row.role === 'lodging')}
        stars={prices.stars}
        onPrice={onPrice}
      />
      <PriceGroup
        title="Venues, a visit"
        rows={prices.rows.filter((row) => row.role === 'venue')}
        stars={prices.stars}
        onPrice={onPrice}
      />
    </div>
  );
}
