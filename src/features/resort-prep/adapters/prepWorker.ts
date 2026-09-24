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
  | { readonly id: number; readonly error: string };

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
