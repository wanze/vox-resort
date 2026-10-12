import { MAX_BODY_BYTES } from './analyticsEvent';

export interface RequestFacts {
  readonly method: string;
  readonly url: string;
  readonly origin: string | null;
  readonly fetchSite: string | null;
  readonly length: number | null;
}

export type Refusal = 403 | 405 | 413;

// Only keeps other sites' pages from posting here: anything outside a browser can claim any
// origin, so this is a filter for honest clients, not a lock.
export function refusalOf(request: RequestFacts): Refusal | null {
  if (request.method !== 'POST') return 405;
  if (request.origin !== new URL(request.url).origin) return 403;
  if (request.fetchSite !== null && request.fetchSite !== 'same-origin') return 403;
  if (request.length !== null && request.length > MAX_BODY_BYTES) return 413;
  return null;
}
