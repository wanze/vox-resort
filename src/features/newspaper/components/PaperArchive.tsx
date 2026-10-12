import { useMemo } from 'react';
import type { Edition } from '../domain/edition';
import { frontPageOf } from '../domain/frontPage';
import { starsWords, whole } from '../domain/stories';

export interface PaperArchiveProps {
  // Oldest first, as the archive lists them; shown newest first.
  readonly editions: readonly Edition[];
  // The season of the paper being read, if any.
  readonly current: number | null;
  readonly onRead: (season: number) => void;
}

const netWords = (edition: Edition): string | null =>
  edition.mode === 'tycoon'
    ? edition.report.net.toLocaleString('en-US', { signDisplay: 'exceptZero' }).replace('-', '−')
    : null;

function Issue({
  edition,
  current,
  onRead,
}: {
  readonly edition: Edition;
  readonly current: boolean;
  readonly onRead: (season: number) => void;
}) {
  const page = useMemo(() => frontPageOf(edition), [edition]);
  const facts = [
    `Season ${edition.season}`,
    `${starsWords(edition.report.meanStars)} ★`,
    netWords(edition),
  ].filter((fact) => fact !== null);
  return (
    <li>
      <button
        type="button"
        className="newspaper-issue"
        data-tone={page.tone}
        aria-current={current || undefined}
        onClick={() => onRead(edition.season)}
      >
        <span className="newspaper-issue-mast" aria-hidden="true">
          {page.tone === 'tabloid' ? 'Bugle' : 'Courier'}
        </span>
        <span className="newspaper-issue-head">{page.headline}</span>
        <span className="newspaper-issue-facts">{facts.join(' · ')}</span>
      </button>
    </li>
  );
}

export function PaperArchive({ editions, current, onRead }: PaperArchiveProps) {
  if (editions.length === 0) return null;
  return (
    <ul className="newspaper-archive" aria-label={`Earlier editions, ${whole(editions.length)}`}>
      {editions.toReversed().map((edition) => (
        <Issue
          key={edition.season}
          edition={edition}
          current={edition.season === current}
          onRead={onRead}
        />
      ))}
    </ul>
  );
}
