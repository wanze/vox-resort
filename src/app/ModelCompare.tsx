import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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

// The hash names the variant, so a reload or a shared link opens on the same pair.
function useSelection(ids: readonly string[]) {
  const initial = globalThis.location.hash.slice(1);
  const [selected, setSelected] = useState(ids.includes(initial) ? initial : ids[0]!);
  useEffect(() => {
    globalThis.history.replaceState(null, '', `#${selected}`);
  }, [selected]);
  const step = (by: number): void => {
    setSelected((id) => ids[(ids.indexOf(id) + by + ids.length) % ids.length]!);
  };
  return { selected, setSelected, step };
}

export function ModelCompare() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const entries = useMemo(() => comparisonEntries(), []);
  const ids = useMemo(() => entries.map((entry) => entry.variantId), [entries]);
  const { selected, setSelected, step } = useSelection(ids);
  const comparison = useMemo(() => buildComparison(selected), [selected]);
  const stats = useMemo(() => statChanges(comparison), [comparison]);
  const [view, setView] = useState<CompareView>('side');
  const [spin, setSpin] = useState(false);
  const { stage, error } = useStage(canvas);

  useEffect(() => stage?.show(comparison), [stage, comparison]);
  useEffect(() => stage?.setView(view), [stage, view]);
  useEffect(() => stage?.setSpin(spin), [stage, spin]);

  useEffect(() => {
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

  return (
    <div className="compare">
      <aside className="compare-side">
        <h1>Model variants</h1>
        <p className="compare-hint">Current model beside its new take. ↑ ↓ to step through.</p>
        <ComparisonList entries={entries} selected={selected} onSelect={setSelected} />
        <StatTable stats={stats} />
        <p className="compare-hint">
          Triangles are after the per-colour merge the game does, so they compare cost.
        </p>
      </aside>
      <main className="compare-main">
        <CompareToolbar view={view} spin={spin} onView={setView} onSpin={setSpin} />
        <div className="compare-stage">
          <canvas ref={canvas} />
          {view === 'side' && (
            <div className="compare-captions" aria-hidden="true">
              <span>Current · {comparison.original.model.id}</span>
              <span>New · {comparison.variant.model.id}</span>
            </div>
          )}
          {error && <p className="compare-error">Could not start the renderer: {error}</p>}
        </div>
      </main>
    </div>
  );
}
