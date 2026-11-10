import { useMemo, useState, type ReactNode } from 'react';
import { Tabs, tabIdOf } from '../shared/components/Tabs';
import type { IconName } from '../shared/components/pixelIcons';
import { BookingsPanel } from '../features/bookings/components/BookingsPanel';
import type { BookingsControls } from '../features/bookings/components/bookingsControls';
import { AdvicePanel } from '../features/hud/components/AdvicePanel';
import { DayReportPanel } from '../features/hud/components/DayReportPanel';
import { DemandPanel } from '../features/hud/components/DemandPanel';
import { GuestsPanel } from '../features/hud/components/GuestsPanel';
import { HudWindow, type HudWindowFrame } from '../features/hud/components/HudWindow';
import { StaffPanel } from '../features/hud/components/StaffPanel';
import {
  TAB_ICONS,
  TAB_TITLES,
  WINDOW_ICONS,
  WINDOW_TITLES,
} from '../features/hud/components/windowNames';
import type { TabId } from '../features/hud/domain/windowTabs';
import type { WindowId } from '../features/hud/domain/windowLayout';
import { sampleDays, sampleDesk } from './artSamples';
import {
  SAMPLE_ADVICE,
  SAMPLE_STAFF,
  SAMPLE_STATUS,
  SAMPLE_TALLY,
  SAMPLE_VOICES,
} from './styleguideSamples';

const noop = (): void => undefined;

const frameOf = (id: WindowId): HudWindowFrame => ({
  id,
  compact: false,
  peek: false,
  depth: 0,
  takesFocus: false,
  back: null,
  onRaise: noop,
  onClose: noop,
});

type Pages = { readonly [tab in TabId]?: ReactNode };

// A window as the HUD frames it, with only the tabs there are samples for.
function SampleWindow({ id, pages }: { readonly id: WindowId; readonly pages: Pages }) {
  const tabs = Object.keys(pages) as TabId[];
  const [current, setCurrent] = useState(tabs[0]!);
  const panelId = `styleguide-${id}-tabpanel`;
  return (
    <div className="styleguide-window">
      <HudWindow frame={frameOf(id)} title={WINDOW_TITLES[id]} icon={WINDOW_ICONS[id] as IconName}>
        <Tabs<TabId>
          tabs={tabs}
          current={current}
          onPick={setCurrent}
          titleOf={(tab) => TAB_TITLES[tab]}
          iconOf={(tab) => TAB_ICONS[tab]}
          label={WINDOW_TITLES[id]}
          panelId={panelId}
        />
        <div
          role="tabpanel"
          id={panelId}
          className="ui-inset"
          aria-labelledby={tabIdOf(panelId, current)}
        >
          {pages[current]}
        </div>
      </HudWindow>
    </div>
  );
}

const bookingsOf = (view: BookingsControls['view']): BookingsControls => ({
  view,
  accept: () => null,
  decline: noop,
});

export function Panels() {
  const desk = useMemo(() => bookingsOf(sampleDesk()), []);
  const history = useMemo(() => sampleDays().map((day) => day.report), []);
  const [shown, setShown] = useState<number | null>(null);
  return (
    <div className="styleguide-windows">
      <SampleWindow
        id="inbox"
        pages={{
          advice: <AdvicePanel advice={SAMPLE_ADVICE} onShowOnPlot={noop} />,
          bookings: <BookingsPanel bookings={desk} />,
        }}
      />
      <SampleWindow
        id="overview"
        pages={{
          report: (
            <DayReportPanel
              history={history}
              shown={shown}
              onShow={setShown}
              mode="tycoon"
              resortName="Coral Shores"
            />
          ),
          demand: <DemandPanel status={SAMPLE_STATUS} />,
        }}
      />
      <SampleWindow
        id="people"
        pages={{
          guests: <GuestsPanel voices={SAMPLE_VOICES} />,
          staff: <StaffPanel staff={SAMPLE_STAFF} tally={SAMPLE_TALLY} onHire={noop} />,
        }}
      />
    </div>
  );
}
