import { useEffect, useRef, useState } from 'react';
import { PixelIcon } from '../shared/components/PixelIcon';
import { ClockHub } from '../features/hud/components/ClockHub';
import { DemandMeter } from '../features/hud/components/DemandMeter';
import { RatingControl } from '../features/hud/components/RatingControl';
import { GatesToggle, type MenuId } from '../features/hud/components/TopBar';
import { ViewControl } from '../features/hud/components/ViewControl';
import type { ClockControls } from '../features/hud/components/hudControls';
import type { OverlayKind } from '../features/overlays/domain/overlays';
import { createLedger } from '../features/sim/domain/ledger';
import type { SimSpeed } from '../features/sim/domain/simClock';
import { SAMPLE_STATUS } from './styleguideSamples';

const noop = (): void => undefined;

const LEDGER = createLedger('tycoon', 8_450);

function useSampleClock(): ClockControls {
  const [speed, setSpeed] = useState<SimSpeed>('normal');
  return {
    speed,
    weather: 'clear',
    forcedWeather: null,
    setSpeed,
    togglePause: () => setSpeed(speed === 'paused' ? 'normal' : 'paused'),
    resume: () => setSpeed('normal'),
    setWeather: noop,
    adoptSpeed: noop,
    adoptForced: noop,
  };
}

// The real pieces in a bar of their own: a menu opens and a key presses as in the game, so the
// plank, its grooves and its keys can be tuned here without a resort.
export function TopBarSample() {
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind | null>(null);
  const [gates, setGates] = useState(true);
  const [fastNights, setFastNights] = useState(false);
  const clock = useSampleClock();
  const day = useRef<HTMLSpanElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (day.current) day.current.textContent = 'Day 12';
    if (time.current) time.current.textContent = '14:20';
  }, []);
  const menuOf = (id: MenuId) => ({
    open: menu === id,
    onOpenChange: (open: boolean) => setMenu(open ? id : null),
  });
  return (
    <div className="styleguide-bar">
      <header className="hud-bar">
        <div className="hud-bar-start">
          <div className="hud-bar-section">
            <button type="button" className="ui-key" title="Menu">
              <PixelIcon name="menu" />
              <span className="hud-wordmark">Coral Shores</span>
            </button>
          </div>
          <div className="hud-bar-section">
            <ViewControl
              overlay={{ kind: overlay, setOverlay }}
              highlights={{ types: [], picks: [], toggle: noop, clear: noop }}
              focusSearch={false}
              {...menuOf('view')}
            />
          </div>
        </div>
        <ClockHub
          dayElement={day}
          timeElement={time}
          season={null}
          clock={clock}
          fastNights={{ on: fastNights, onChange: setFastNights, running: false }}
          forecast={[]}
          ledger={LEDGER}
          status={SAMPLE_STATUS}
          betweenSeasons={false}
          short={false}
          speedMenu={menuOf('speed')}
          weatherMenu={menuOf('weather')}
        />
        <div className="hud-bar-end">
          <div className="hud-bar-section">
            <DemandMeter status={SAMPLE_STATUS} {...menuOf('demand')} />
          </div>
          <div className="hud-bar-section">
            <RatingControl
              rating={SAMPLE_STATUS.rating}
              stepFree={SAMPLE_STATUS.stepFree}
              prestige={null}
              trend={0.3}
              {...menuOf('rating')}
            />
          </div>
          <div className="hud-bar-section">
            <GatesToggle open={gates} onOpenChange={setGates} />
          </div>
        </div>
      </header>
    </div>
  );
}
