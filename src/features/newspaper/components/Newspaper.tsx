import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { useReturnFocus } from '../../../shared/components/useReturnFocus';
import { frontPageOf, type FrontPage } from '../domain/frontPage';
import type { OpenPaper, PaperControls } from './paperControls';

export interface NewspaperProps {
  readonly paper: OpenPaper;
  readonly controls: PaperControls;
}

// Until the box is laid out; about what the lead column is on a laptop.
const GUESSED_WIDTH = 720;

const STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

// As the photo lightbox: the arrows step, and Escape shuts the paper without also opening the
// menu behind it.
const keysFor =
  (step: (by: number) => void, close: () => void) =>
  (event: KeyboardEvent<HTMLDivElement>): void => {
    const by = STEPS[event.key];
    if (by !== undefined) step(by);
    else if (event.key === 'Escape') close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

// Printed for the width it is shown at; each print's URL goes when the next is in or the paper shuts.
function usePrint(
  photo: Blob | null,
  box: RefObject<HTMLElement | null>,
  print: PaperControls['print'],
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const printer = useRef(print);
  useEffect(() => {
    printer.current = print;
  });
  useEffect(() => {
    if (!photo) return;
    let live = true;
    let made: string | null = null;
    const width = box.current?.clientWidth || GUESSED_WIDTH;
    printer.current(photo, width).then((next) => {
      if (!live) {
        URL.revokeObjectURL(next);
        return;
      }
      made = next;
      setUrl(next);
    }, console.error);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photo, box]);
  return photo ? url : null;
}

function Masthead({ page, titleId }: { readonly page: FrontPage; readonly titleId: string }) {
  return (
    <>
      <header className="newspaper-mast">
        <p className="newspaper-ear">
          <b>Weather</b>
          {page.ears.weather}
        </p>
        <p className="newspaper-title">{page.masthead}</p>
        <p className="newspaper-ear newspaper-ear--right">
          <b>{page.ears.edition.title}</b>
          {page.ears.edition.text}
        </p>
      </header>
      <p className="newspaper-dateline">
        {page.dateline.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </p>
      {page.kicker ? <p className="newspaper-kicker">{page.kicker}</p> : null}
      <h2 className="newspaper-headline" id={titleId}>
        {page.headline}
      </h2>
      <p className="newspaper-deck">{page.deck}</p>
    </>
  );
}

function Photo({
  page,
  url,
  box,
  name,
}: {
  readonly page: FrontPage;
  readonly url: string | null;
  readonly box: RefObject<HTMLDivElement | null>;
  readonly name: string;
}) {
  if (!page.caption) return null;
  return (
    <figure className="newspaper-figure">
      <div className="newspaper-photo" ref={box}>
        {url ? <img src={url} alt={`${name}, ${page.caption.lead}`} /> : null}
      </div>
      <figcaption className="newspaper-caption">
        <b>{page.caption.lead}</b> {page.caption.text}
      </figcaption>
    </figure>
  );
}

function Side({ page }: { readonly page: FrontPage }) {
  return (
    <aside className="newspaper-side">
      <section className="newspaper-box">
        <h3 className="newspaper-box-title">The season in figures</h3>
        <dl className="newspaper-figures">
          {page.figures.map((figure) => (
            <div key={figure.label}>
              <dt>{figure.label}</dt>
              <dd>
                {figure.value}
                {figure.note ? <span className="newspaper-note">{figure.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="newspaper-box">
        <h3 className="newspaper-box-title">{page.outlook.title}</h3>
        <div className="newspaper-phases" aria-hidden="true">
          {page.outlook.phases.map((phase) => (
            <span
              key={phase.label}
              data-busy={phase.busy || undefined}
              style={{ flexGrow: phase.days }}
            >
              {phase.label}
            </span>
          ))}
        </div>
        <p className="newspaper-text">{page.outlook.text}</p>
      </section>
    </aside>
  );
}

const starsOutOf = (stars: number): string =>
  '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));

function Lower({ page }: { readonly page: FrontPage }) {
  return (
    <div className="newspaper-lower">
      <section className="newspaper-column">
        <h3 className="newspaper-box-title">Letters to the editor</h3>
        {page.letters.length === 0 ? (
          <p className="newspaper-text">No letters this season.</p>
        ) : null}
        {page.letters.map((letter) => (
          <blockquote className="newspaper-letter" key={letter.by}>
            <q>{letter.quote}</q>
            <cite>
              <span aria-label={`${letter.stars} of 5 stars`}>{starsOutOf(letter.stars)}</span>
              {` · ${letter.by}`}
            </cite>
          </blockquote>
        ))}
      </section>
      <section className="newspaper-column">
        <h3 className="newspaper-box-title">Around the resort</h3>
        {page.briefs.map((brief) => (
          <p className="newspaper-brief" key={brief.title}>
            <b>{`${brief.title}.`}</b> {brief.text}
          </p>
        ))}
      </section>
      <section className="newspaper-column">
        <h3 className="newspaper-box-title">{page.desk.title}</h3>
        {page.desk.items.map((item) => (
          <p className="newspaper-brief" key={item.title}>
            <b>{`${item.title}.`}</b> {item.text}
          </p>
        ))}
        <div className="newspaper-ads">
          {page.ads.map((ad) => (
            <p className="newspaper-ad" key={ad.title}>
              <b>{ad.title}</b>
              {ad.text}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function Sheet({
  paper,
  page,
  titleId,
  print,
}: {
  readonly paper: OpenPaper;
  readonly page: FrontPage;
  readonly titleId: string;
  readonly print: { readonly url: string | null; readonly box: RefObject<HTMLDivElement | null> };
}) {
  return (
    <article className="newspaper-sheet" data-tone={page.tone} aria-labelledby={titleId}>
      <Masthead page={page} titleId={titleId} />
      <div className="newspaper-front">
        <div className="newspaper-lead">
          <Photo page={page} url={print.url} box={print.box} name={paper.edition.resortName} />
          <div className="newspaper-story">
            {page.story.map((paragraph, at) => (
              <p key={paragraph} className={at === 0 ? 'newspaper-story-lead' : undefined}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        <Side page={page} />
      </div>
      <Lower page={page} />
      <footer className="newspaper-foot">
        <span>{page.foot[0]}</span>
        <span>
          {paper.kept ? 'Kept in this resort’s archive' : 'Not kept: the archive is unavailable'}
        </span>
        <span>{page.foot[1]}</span>
      </footer>
    </article>
  );
}

// The archive's neighbours of the edition open, as the photo lightbox steps through the wall;
// a paper printed as the season ended is read alone.
function neighbours(paper: OpenPaper, controls: PaperControls) {
  const { editions } = controls;
  const at = paper.browsing
    ? editions.findIndex((edition) => edition.season === paper.edition.season)
    : -1;
  const near = (by: number): number | null => (at < 0 ? null : (editions[at + by]?.season ?? null));
  const step = (by: number): void => {
    const season = near(by);
    if (season !== null) controls.read(season);
  };
  return { earlier: near(-1), later: near(1), step };
}

function Stepping({
  paper,
  steps,
}: {
  readonly paper: OpenPaper;
  readonly steps: ReturnType<typeof neighbours>;
}) {
  if (!paper.browsing) return null;
  return (
    <div className="ui-actions newspaper-actions">
      <button
        type="button"
        className="ui-button-large"
        disabled={steps.earlier === null}
        onClick={() => steps.step(-1)}
      >
        Earlier
      </button>
      <button
        type="button"
        className="ui-button-large"
        disabled={steps.later === null}
        onClick={() => steps.step(1)}
      >
        Later
      </button>
    </div>
  );
}

function Head({
  paper,
  controls,
}: {
  readonly paper: OpenPaper;
  readonly controls: PaperControls;
}) {
  return (
    <header className="ui-window-head">
      <p className="ui-window-title">{`Season ${paper.edition.season} paper`}</p>
      <button
        type="button"
        className="ui-window-close"
        aria-label="Close the paper"
        title="Close (Esc)"
        autoFocus
        onClick={controls.close}
      >
        <PixelIcon name="close" scale={1} />
      </button>
    </header>
  );
}

export function Newspaper({ paper, controls }: NewspaperProps) {
  const titleId = useId();
  useReturnFocus(() => null);
  const box = useRef<HTMLDivElement>(null);
  const page = useMemo(() => frontPageOf(paper.edition), [paper.edition]);
  const url = usePrint(paper.photo, box, controls.print);
  const steps = neighbours(paper, controls);
  return (
    <div className="ui-modal">
      <div className="ui-scrim newspaper-scrim" onPointerDown={controls.close} />
      <div
        className="ui-panel newspaper"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={keysFor(steps.step, controls.close)}
      >
        <Head paper={paper} controls={controls} />
        <div className="newspaper-scroll">
          <Sheet
            key={`${paper.edition.gameId}|${paper.edition.season}`}
            paper={paper}
            page={page}
            titleId={titleId}
            print={{ url, box }}
          />
        </div>
        <Stepping paper={paper} steps={steps} />
      </div>
    </div>
  );
}
