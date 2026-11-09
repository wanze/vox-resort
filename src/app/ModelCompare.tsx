import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  createCompareStage,
  type CompareStage,
} from '../features/model-compare/adapters/compareStage';
import { ComparisonList } from '../features/model-compare/components/ComparisonList';
import { CompareToolbar } from '../features/model-compare/components/CompareToolbar';
import { StatTable } from '../features/model-compare/components/StatTable';
import {
  buildComparison,
  comparisonEntries,
  statChanges,
  type Comparison,
  type CompareView,
} from '../features/model-compare/domain/comparison';

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

function useStage(canvas: RefObject<HTMLCanvasElement | null>) {
  const [stage, setStage] = useState<CompareStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    let created: CompareStage | null = null;
    let cancelled = false;
    createCompareStage(element).then(
      (ready) => {
        // StrictMode unmounts before the renderer has finished starting; drop that one.
        if (cancelled) ready.dispose();
        else setStage((created = ready));
      },
      (cause: unknown) => setError(messageOf(cause)),
    );
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [canvas]);
  return { stage, error };
}

type Page = 'models' | 'art';

const ART_HASH = 'ui-art';

const PAGES: readonly { readonly id: Page; readonly label: string }[] = [
  { id: 'models', label: 'Models' },
  { id: 'art', label: 'UI art' },
];

// The hash names the variant, or the art page, so a reload or a shared link opens on the same view.
function useSelection(ids: readonly string[], active: boolean) {
  const initial = globalThis.location.hash.slice(1);
  const [selected, setSelected] = useState(ids.includes(initial) ? initial : ids[0]!);
  useEffect(() => {
    globalThis.history.replaceState(null, '', `#${active ? selected : ART_HASH}`);
  }, [selected, active]);
  const step = (by: number): void => {
    setSelected((id) => ids[(ids.indexOf(id) + by + ids.length) % ids.length]!);
  };
  return { selected, setSelected, step };
}

function PageTabs({
  page,
  onPage,
}: {
  readonly page: Page;
  readonly onPage: (page: Page) => void;
}) {
  return (
    <nav className="compare-pages" aria-label="Pages">
      {PAGES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === page}
          onClick={() => onPage(option.id)}
        >
          {option.label}
        </button>
      ))}
    </nav>
  );
}

// Its own page in a frame: the game's sheet styles the whole document, this page's included.
function ArtPage({ tabs }: { readonly tabs: ReactNode }) {
  return (
    <>
      <aside className="compare-side">
        {tabs}
        <h1>UI art</h1>
        <p className="compare-hint">
          The game's own components with sample data, styled as in the game. Edit and the frame
          reloads.
        </p>
      </aside>
      {/* Unsandboxed: an opaque origin would fail the dev server's CORS check on every module. */}
      {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
      <iframe className="compare-art" src="/art.html" title="UI art" />
    </>
  );
}

function useShown(
  canvas: RefObject<HTMLCanvasElement | null>,
  comparison: Comparison,
  view: CompareView,
  spin: boolean,
): string | null {
  const { stage, error } = useStage(canvas);
  useEffect(() => stage?.show(comparison), [stage, comparison]);
  useEffect(() => stage?.setView(view), [stage, view]);
  useEffect(() => stage?.setSpin(spin), [stage, spin]);
  return error;
}

function useKeys(
  active: boolean,
  setView: (view: CompareView) => void,
  step: (by: number) => void,
) {
  useEffect(() => {
    if (!active) return undefined;
    const actions: Readonly<Record<string, () => void>> = {
      1: () => setView('side'),
      2: () => setView('original'),
      3: () => setView('variant'),
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.target instanceof HTMLInputElement)) actions[event.key]?.();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  });
}

function Captions({ comparison }: { readonly comparison: Comparison }) {
  return (
    <div className="compare-captions" aria-hidden="true">
      <span>Current · {comparison.original.model.id}</span>
      <span>New · {comparison.variant.model.id}</span>
    </div>
  );
}

function ModelsPage({ tabs, active }: { readonly tabs: ReactNode; readonly active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const entries = useMemo(() => comparisonEntries(), []);
  const ids = useMemo(() => entries.map((entry) => entry.variantId), [entries]);
  const { selected, setSelected, step } = useSelection(ids, active);
  const comparison = useMemo(() => buildComparison(selected), [selected]);
  const stats = useMemo(() => statChanges(comparison), [comparison]);
  const [view, setView] = useState<CompareView>('side');
  const [spin, setSpin] = useState(false);
  const error = useShown(canvas, comparison, view, spin);

  useKeys(active, setView, step);

  // Hidden rather than unmounted: the renderer is started once, on this canvas.
  return (
    <>
      <aside className="compare-side" hidden={!active}>
        {tabs}
        <h1>Model variants</h1>
        <p className="compare-hint">Current model beside its new take. ↑ ↓ to step through.</p>
        <ComparisonList entries={entries} selected={selected} onSelect={setSelected} />
        <StatTable stats={stats} />
        <p className="compare-hint">
          Triangles are after the per-colour merge the game does, so they compare cost.
        </p>
      </aside>
      <main className="compare-main" hidden={!active}>
        <CompareToolbar view={view} spin={spin} onView={setView} onSpin={setSpin} />
        <div className="compare-stage">
          <canvas ref={canvas} />
          {view === 'side' && <Captions comparison={comparison} />}
          {error && <p className="compare-error">Could not start the renderer: {error}</p>}
        </div>
      </main>
    </>
  );
}

export function ModelCompare() {
  const [page, setPage] = useState<Page>(
    globalThis.location.hash === `#${ART_HASH}` ? 'art' : 'models',
  );
  const tabs = <PageTabs page={page} onPage={setPage} />;
  return (
    <div className="compare">
      {page === 'art' ? <ArtPage tabs={tabs} /> : null}
      <ModelsPage tabs={tabs} active={page === 'models'} />
    </div>
  );
}
