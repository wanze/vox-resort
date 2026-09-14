/**
 * Prepares resorts in a worker when the browser allows one, so the page keeps
 * drawing — and answering — while a large plot is grown and baked.
 *
 * The main-thread path is kept as a fallback, as `meshCatalogue.ts` keeps one:
 * a worker can fail to start for reasons that have nothing to do with this code,
 * and a resort that arrives with the page frozen is better than none. A job that
 * fails *inside* the worker is not retried here, though: the same plan would
 * fail the same way on this thread, only with the page frozen while it did.
 */

import { prepareResort, type PrepRequest, type PreparedResort } from '../domain/prepareResort';
import type { PrepAnswer, PrepMessage } from './prepWorker';

export interface ResortPreparer {
  prepare(request: PrepRequest): Promise<PreparedResort>;
  dispose(): void;
}

interface Pending {
  readonly resolve: (prepared: PreparedResort) => void;
  readonly reject: (cause: Error) => void;
}

/** A worker that could not be started or died, as against a job that failed in it. */
class WorkerUnavailable extends Error {}

export function createResortPreparer(
  options: { readonly forceMainThread?: boolean } = {},
): ResortPreparer {
  let worker: Worker | null = null;
  let unavailable = options.forceMainThread === true || typeof Worker === 'undefined';
  let nextId = 0;
  const pending = new Map<number, Pending>();

  const failAll = (cause: Error): void => {
    for (const waiting of pending.values()) waiting.reject(cause);
    pending.clear();
  };

  function start(): Worker {
    const started = new Worker(new URL('./prepWorker.ts', import.meta.url), { type: 'module' });
    started.addEventListener('message', (event: MessageEvent<PrepAnswer>) => {
      const answer = event.data;
      const waiting = pending.get(answer.id);
      if (!waiting) return;
      pending.delete(answer.id);
      if ('error' in answer) waiting.reject(new Error(answer.error));
      else waiting.resolve(answer.prepared);
    });
    started.addEventListener('error', (event) => {
      unavailable = true;
      started.terminate();
      worker = null;
      failAll(new WorkerUnavailable(event.message || 'The resort worker failed'));
    });
    return started;
  }

  function inWorker(request: PrepRequest): Promise<PreparedResort> {
    worker ??= start();
    const id = nextId++;
    const message: PrepMessage = { id, request };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker!.postMessage(message);
    });
  }

  return {
    async prepare(request) {
      if (!unavailable) {
        try {
          return await inWorker(request);
        } catch (cause: unknown) {
          if (!(cause instanceof WorkerUnavailable)) throw cause;
          console.warn('Preparing resorts on the main thread; the worker was unavailable.', cause);
        }
      }
      return prepareResort(request);
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error('The resort preparer was disposed'));
    },
  };
}
