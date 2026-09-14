/**
 * The worker half of `resortPreparer.ts`: grows, lays out and bakes a resort,
 * and transfers the bytes back.
 *
 * Kept alive between resorts rather than started per request, because the
 * catalogue it lays out against is built when this module loads — every model
 * in `voxel-gen/`, voxel by voxel — and paying that on every Generate would put
 * back a good part of the wait this exists to take off the page.
 */

import {
  prepareResort,
  preparedTransferables,
  type PrepRequest,
  type PreparedResort,
} from '../domain/prepareResort';

/** One request, numbered so the answer finds its way back to the promise that asked. */
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
