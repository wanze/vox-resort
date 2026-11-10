import { useState, type CSSProperties } from 'react';
import { contrast, gradeOf, type Rgba } from '../shared/domain/contrast';
import { PixelIcon } from '../shared/components/PixelIcon';
import { ICONS, type IconName } from '../shared/components/pixelIcons';
import { readTokens, type Token } from './styleguideTokens';

// The panel grounds text lands on: a window's slab, a raised row and the sunken inset.
const GROUNDS = ['--stone-100', '--stone-200', '--stone-300'] as const;

// Grouped by the prefix a token is named with, so a family reads as one row of chips.
const FAMILIES: readonly (readonly [string, RegExp])[] = [
  ['Stone', /^--stone-/],
  ['Text', /^--text/],
  ['Status inks', /^--ink-/],
  ['Accents', /^--(terracotta|foliage|ochre|lamp|alert|price|sun|notice)/],
  ['Edges and washes', /^--(edge|wash|badge|meter|lamp-rim|veil)/],
  ['Staff pins', /^--pin-/],
  ['Tour operators', /^--brand-/],
  ['Flyers', /^--flyer-/],
  ['Paper and prints', /^--(paper|ink$|ink-soft|headline|print|till|tray)/],
];

// The entry imports the sheets before the first render, so they are in place to be read.
function useTokens(): readonly Token[] {
  const [tokens] = useState(readTokens);
  return tokens;
}

function Ratio({ ink, ground }: { readonly ink: Rgba; readonly ground: Rgba | null }) {
  if (!ground) return null;
  const ratio = contrast(ink, ground);
  return (
    <span className="styleguide-ratio" data-grade={gradeOf(ratio)}>
      {ratio.toFixed(1)}
    </span>
  );
}

function Swatch({ token, grounds }: { readonly token: Token; readonly grounds: readonly Token[] }) {
  return (
    <li className="styleguide-swatch">
      <span className="styleguide-swatch-chip" style={{ background: `var(${token.name})` }} />
      <code>{token.name}</code>
      <span className="styleguide-value">{token.value}</span>
      {token.rgba ? (
        <span className="styleguide-ratios">
          {grounds.map((ground) => (
            <Ratio key={ground.name} ink={token.rgba!} ground={ground.rgba} />
          ))}
        </span>
      ) : null}
    </li>
  );
}

export function Colours() {
  const tokens = useTokens();
  const colours = tokens.filter((token) => token.kind === 'colour');
  const grounds = GROUNDS.flatMap((name) => colours.filter((token) => token.name === name));
  const claimed = new Set<string>();
  const families = FAMILIES.map(([title, pattern]) => {
    const members = colours.filter((t) => !claimed.has(t.name) && pattern.test(t.name));
    for (const member of members) claimed.add(member.name);
    return [title, members] as const;
  });
  const rest = colours.filter((token) => !claimed.has(token.name));
  return (
    <>
      <p className="ui-note">
        Read live from the stylesheets. The three figures are each colour's contrast on{' '}
        {GROUNDS.join(', ')}: green passes for text (4.5), amber only for large text, bars and edges
        (3), red fails both. A see-through colour is judged as it lands.
      </p>
      {[...families, ['Others', rest] as const].map(([title, members]) =>
        members.length === 0 ? null : (
          <div key={title} className="styleguide-group">
            <h3 className="hud-report-heading">{title}</h3>
            <ul className="styleguide-swatches">
              {members.map((token) => (
                <Swatch key={token.name} token={token} grounds={grounds} />
              ))}
            </ul>
          </div>
        ),
      )}
    </>
  );
}

// Some shadows are cast by letters and the till slip's by a filter that follows its torn edge.
const TEXT_SHADOWS = /^--(emboss|extrude|shadow-caption|shadow-accent-text)/;

function shadowStyle(name: string): CSSProperties {
  if (TEXT_SHADOWS.test(name)) return { textShadow: `var(${name})` };
  if (name === '--shadow-till') return { filter: `var(${name})` };
  return { boxShadow: `var(${name})` };
}

export function Surfaces() {
  const tokens = useTokens();
  const surfaces = tokens.filter((token) => token.kind === 'surface');
  const shadows = tokens.filter((token) => token.kind === 'shadow');
  return (
    <>
      <h3 className="hud-report-heading">Grounds</h3>
      <ul className="styleguide-tiles">
        {surfaces.map((token) => (
          <li key={token.name}>
            <span className="styleguide-tile" style={{ background: `var(${token.name})` }} />
            <code>{token.name}</code>
          </li>
        ))}
      </ul>
      <h3 className="hud-report-heading">Shadows and bevels</h3>
      <ul className="styleguide-tiles">
        {shadows.map((token) => (
          <li key={token.name}>
            <span
              className="styleguide-tile styleguide-tile--lifted"
              style={shadowStyle(token.name)}
            >
              Aa
            </span>
            <code>{token.name}</code>
          </li>
        ))}
      </ul>
    </>
  );
}

const SIZES = ['--size-label', '--size-small', '--size-body', '--size-lead'] as const;

const PANGRAM = 'Sunny Coral Shores · 1,284 guests · 4.7 ★ · −612';

export function Typography() {
  const fonts = useTokens().filter((token) => token.kind === 'font');
  return (
    <>
      <h3 className="hud-report-heading">Faces</h3>
      <dl className="styleguide-fonts">
        {fonts.map((token) => (
          <div key={token.name}>
            <dt>
              <code>{token.name}</code>
              <span className="styleguide-value">{token.value}</span>
            </dt>
            <dd style={{ fontFamily: `var(${token.name})` }}>
              <span className="styleguide-specimen">{PANGRAM}</span>
              <span>AaBbCc 0123456789 äöü ß €</span>
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="hud-report-heading">Sizes in the HUD face</h3>
      <dl className="styleguide-fonts">
        {SIZES.map((size) => (
          <div key={size}>
            <dt>
              <code>{size}</code>
            </dt>
            <dd style={{ fontSize: `var(${size})` }}>
              <span>{PANGRAM}</span>
              <strong>{PANGRAM}</strong>
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="hud-report-heading">Text roles</h3>
      <div className="styleguide-roles">
        <h2 className="ui-window-title">Window title</h2>
        <h3 className="hud-report-heading">Section heading</h3>
        <p className="ui-label">Small label</p>
        <p>Body text, the line most of the HUD is set in.</p>
        <p className="ui-note">A note: secondary text under a row or a form.</p>
        <p className="ui-loading">Loading or empty state…</p>
        <p>
          <span data-tone="good" className="styleguide-tone">
            Good figure +280
          </span>{' '}
          <span data-tone="bad" className="styleguide-tone">
            Bad figure −612
          </span>
        </p>
      </div>
    </>
  );
}

export function Spacing() {
  const lengths = useTokens().filter(
    (token) =>
      token.kind === 'length' && /^--(space|section|radius|control|bar|tile)/.test(token.name),
  );
  return (
    <ul className="styleguide-lengths">
      {lengths.map((token) => (
        <li key={token.name}>
          <code>{token.name}</code>
          <span className="styleguide-value">{token.value}</span>
          {token.name.startsWith('--radius') ? (
            <span className="styleguide-radius" style={{ borderRadius: `var(${token.name})` }} />
          ) : (
            <span className="styleguide-length" style={{ width: `var(${token.name})` }} />
          )}
        </li>
      ))}
    </ul>
  );
}

const ICON_NAMES = Object.keys(ICONS) as readonly IconName[];

export function Icons() {
  const [scale, setScale] = useState(2);
  return (
    <>
      <label className="ui-slider styleguide-control">
        <span className="ui-slider-label">Scale</span>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={scale}
          onChange={(event) => setScale(Number(event.target.value))}
        />
        <span className="ui-slider-value">{scale}×</span>
      </label>
      <ul className="styleguide-icons">
        {ICON_NAMES.map((name) => (
          <li key={name}>
            <PixelIcon name={name} scale={scale} />
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
