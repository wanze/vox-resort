import { useEffect, useRef, useState } from 'react';
import { LONG_LINK_CHARS } from '../domain/shareLink';

export interface SharePanelProps {
  readonly onShare: () => Promise<string>;
  readonly title: string | null;
  readonly busy: boolean;
}

type Made =
  | { readonly kind: 'copied'; readonly link: string }
  | { readonly kind: 'by-hand'; readonly link: string }
  | { readonly kind: 'failed' };

const sizeOf = (link: string): string => `${(link.length / 1000).toFixed(1)} KB`;

// Selected as it appears, so a refused clipboard leaves the player one copy away. Keyed on the
// link, so a new one is selected too.
function LinkField({ link }: { readonly link: string }) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.select(), []);
  return (
    <input
      ref={field}
      type="text"
      className="ui-field"
      value={link}
      readOnly
      aria-label="Link to this resort"
      onFocus={(event) => event.currentTarget.select()}
    />
  );
}

function Outcome({ made }: { readonly made: Made }) {
  if (made.kind === 'failed') return <p className="ui-note">The link could not be made.</p>;
  const long = made.link.length > LONG_LINK_CHARS;
  return (
    <>
      {made.kind === 'copied' ? (
        <p className="ui-note" role="status">
          Link copied ({sizeOf(made.link)})
        </p>
      ) : (
        <LinkField key={made.link} link={made.link} />
      )}
      {long ? <p className="ui-note">Long link: some apps may cut it</p> : null}
    </>
  );
}

async function copy(link: string): Promise<Made> {
  try {
    await navigator.clipboard.writeText(link);
    return { kind: 'copied', link };
  } catch {
    return { kind: 'by-hand', link };
  }
}

const CAN_SEND = typeof navigator !== 'undefined' && 'share' in navigator;

const cancelled = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === 'AbortError';

export function SharePanel({ onShare, title, busy }: SharePanelProps) {
  const [sharing, setSharing] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const blocked = busy || sharing;

  const run = (deliver: (link: string) => Promise<Made | null>) => async (): Promise<void> => {
    setSharing(true);
    setMade(null);
    try {
      setMade(await deliver(await onShare()));
    } catch (cause: unknown) {
      console.error(cause);
      setMade({ kind: 'failed' });
    } finally {
      setSharing(false);
    }
  };

  const send = async (link: string): Promise<Made | null> => {
    try {
      await navigator.share({ url: link, ...(title === null ? {} : { title }) });
      return null;
    } catch (cause: unknown) {
      return cancelled(cause) ? null : { kind: 'by-hand', link };
    }
  };

  return (
    <div className="sharing-panel">
      <p className="ui-note">A link to its layout, opened in sandbox from day one.</p>
      <div className="ui-columns">
        <button
          type="button"
          className="ui-button-primary ui-button-compact"
          disabled={blocked}
          aria-busy={sharing}
          onClick={() => void run(copy)()}
        >
          Copy link
        </button>
        {CAN_SEND ? (
          <button
            type="button"
            className="ui-button-secondary ui-button-compact"
            disabled={blocked}
            onClick={() => void run(send)()}
          >
            Share…
          </button>
        ) : null}
      </div>
      {made ? <Outcome made={made} /> : null}
    </div>
  );
}
