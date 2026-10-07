// Kept alive between resorts: the catalogue is built on module load and too slow to rebuild per request.

import {
  prepareResort,
  preparedTransferables,
  type PrepRequest,
  type PreparedResort,
} from '../domain/prepareResort';

export interface PrepMessage {
  readonly id: number;
  readonly request: PrepRequest;
}

export type PrepAnswer =
  | { readonly id: number; readonly prepared: PreparedResort }
  | { readonly id: number; readonly error: string }
  | { readonly ready: true };

self.addEventListener('message', (event: MessageEvent<PrepMessage>) => {
  const { id, request } = event.data;
  try {
    const prepared = prepareResort(request);
    const answer: PrepAnswer = { id, prepared };
    self.postMessage(answer, { transfer: preparedTransferables(prepared) });
  } catch (cause: unknown) {
    const answer: PrepAnswer = {
      id,
      error: cause instanceof Error ? cause.message : String(cause),
    };
    self.postMessage(answer);
  }
});

// Sent once the imports above have built the catalogue: an error before it is a worker that could
// not start, one after it a job that crashed.
const ready: PrepAnswer = { ready: true };
self.postMessage(ready);
