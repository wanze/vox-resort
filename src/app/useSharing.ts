import { useCallback, useEffect, useState, type RefObject } from 'react';
import { deflate, inflate } from '../features/sharing/adapters/deflate';
import { packShared, ShareError, unpackShared } from '../features/sharing/domain/layoutCodec';
import { formatLink, MAX_BODY_BYTES, parseLink } from '../features/sharing/domain/shareLink';
import { sharedOf } from '../features/sharing/domain/sharedResort';
import type { Showcase } from './showcase';
import type { IncomingShare } from '../features/sharing/components/incomingShare';

export interface IncomingLink {
  readonly share: IncomingShare | null;
  // Forgets the link and takes it off the address, so a reload afterwards does not ask again.
  dismiss(): void;
}

const dropFragment = (): void =>
  history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);

// Any refusal reads as one unreadable link to the player; why goes to the console.
async function readShare(compressed: Uint8Array): Promise<IncomingShare> {
  try {
    return { kind: 'ready', shared: unpackShared(await inflate(compressed, MAX_BODY_BYTES)) };
  } catch (cause: unknown) {
    if (cause instanceof ShareError) console.warn(cause.message, cause.detail);
    else console.error(cause);
    return { kind: 'unreadable' };
  }
}

// Read once at startup. A link opened in a tab already playing is not picked up.
export function useIncomingLink(enabled: boolean): IncomingLink {
  const [link] = useState(() => (enabled ? parseLink(globalThis.location?.hash ?? '') : null));
  const [share, setShare] = useState<IncomingShare | null>(() => {
    if (link === null) return null;
    return link.kind === 'body' ? { kind: 'loading' } : { kind: link.kind };
  });
  useEffect(() => {
    if (link === null) return;
    if (link.kind !== 'body') {
      dropFragment();
      return;
    }
    let live = true;
    void readShare(link.compressed).then((read) => {
      if (!live) return;
      setShare(read);
      if (read.kind !== 'ready') dropFragment();
    });
    return () => {
      live = false;
    };
  }, [link]);
  const dismiss = useCallback(() => {
    setShare(null);
    dropFragment();
  }, []);
  return { share, dismiss };
}

// The same snapshot an autosave takes, so a link costs what an autosave costs.
async function linkOf(showcase: RefObject<Showcase | null>): Promise<string> {
  const mounted = showcase.current;
  if (!mounted) throw new Error('No resort to share');
  const compressed = await deflate(packShared(sharedOf(mounted.snapshot())));
  return formatLink(globalThis.location.origin + globalThis.location.pathname, compressed);
}

export function useShareLink(showcase: RefObject<Showcase | null>): () => Promise<string> {
  return useCallback(() => linkOf(showcase), [showcase]);
}
