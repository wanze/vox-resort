import { useState, type CSSProperties, type ReactNode } from 'react';
import { Buttons, Figures, Forms, Menus, TabSets } from './StyleguideKit';
import { Colours, Icons, Spacing, Surfaces, Typography } from './StyleguideFoundations';
import { Panels } from './StyleguidePanels';
import { TopBarSample } from './StyleguideBar';
import { LOOKS } from '../features/hud/domain/looks';
import { LOOK_NAMES } from '../features/hud/components/lookWords';
import { useLook } from './useLook';

const SECTIONS: readonly (readonly [string, string, () => ReactNode])[] = [
  ['type', 'Typography', Typography],
  ['colours', 'Colours', Colours],
  ['surfaces', 'Surfaces', Surfaces],
  ['spacing', 'Spacing and radii', Spacing],
  ['icons', 'Icons', Icons],
  ['buttons', 'Buttons and keys', Buttons],
  ['bar', 'Top bar', TopBarSample],
  ['tabs', 'Tabs', TabSets],
  ['forms', 'Forms', Forms],
  ['figures', 'Figures', Figures],
  ['menus', 'Menus and receipts', Menus],
  ['panels', 'Windows with sample data', Panels],
];

// The grounds a panel is tried on: the game's dark backdrop, a sand map and a bright sky.
const GROUNDS = {
  backdrop: 'var(--backdrop)',
  sand: 'var(--stone-300)',
  sky: 'var(--sky-noon)',
} as const;

type Ground = keyof typeof GROUNDS;

// The game reads the same stored look, so a look picked here is the one the game opens in.
function LookPicker() {
  const { look, setLook } = useLook();
  return (
    <div className="ui-form-choices" role="group" aria-label="Look">
      {LOOKS.map((each) => (
        <button
          key={each}
          type="button"
          className="ui-form-choice"
          aria-pressed={look === each}
          onClick={() => setLook(each)}
        >
          {LOOK_NAMES[each]}
        </button>
      ))}
    </div>
  );
}

function Toolbar(props: {
  readonly ground: Ground;
  readonly onGround: (ground: Ground) => void;
  readonly width: number;
  readonly onWidth: (width: number) => void;
}) {
  return (
    <div className="ui-panel styleguide-toolbar">
      <LookPicker />
      <div className="ui-form-choices" role="group" aria-label="Ground">
        {(Object.keys(GROUNDS) as Ground[]).map((ground) => (
          <button
            key={ground}
            type="button"
            className="ui-form-choice"
            aria-pressed={props.ground === ground}
            onClick={() => props.onGround(ground)}
          >
            {ground}
          </button>
        ))}
      </div>
      <label className="ui-slider">
        <span className="ui-slider-label">Width</span>
        <input
          type="range"
          min={280}
          max={480}
          step={4}
          value={props.width}
          onChange={(event) => props.onWidth(Number(event.target.value))}
        />
        <span className="ui-slider-value">{props.width}px</span>
      </label>
    </div>
  );
}

export function Styleguide() {
  const [ground, setGround] = useState<Ground>('backdrop');
  const [width, setWidth] = useState(380);
  // Remounted on a new look, so the token tables read the values the look has just set.
  const { look } = useLook();
  const style = {
    '--styleguide-ground': GROUNDS[ground],
    '--styleguide-window-w': `${width}px`,
  } as CSSProperties;
  return (
    <div className="styleguide" style={style}>
      <nav className="ui-panel styleguide-nav" aria-label="Sections">
        <h1 className="styleguide-title">Vox Resort styleguide</h1>
        <ul>
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`}>{title}</a>
            </li>
          ))}
        </ul>
        <Toolbar ground={ground} onGround={setGround} width={width} onWidth={setWidth} />
      </nav>
      <main key={look} className="styleguide-main">
        {SECTIONS.map(([id, title, Section]) => (
          <section key={id} id={id} className="ui-panel styleguide-section">
            <h2 className="ui-window-title">{title}</h2>
            <Section />
          </section>
        ))}
      </main>
    </div>
  );
}
