// The main-thread fallback covers a worker that cannot start. A job that fails inside the worker
// is not retried here: it would fail the same way, only with the page frozen.

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
    let ready = false;
    started.addEventListener('message', (event: MessageEvent<PrepAnswer>) => {
      const answer = event.data;
      if ('ready' in answer) {
        ready = true;
        return;
      }
      const waiting = pending.get(answer.id);
      if (!waiting) return;
      pending.delete(answer.id);
      if ('error' in answer) waiting.reject(new Error(answer.error));
      else waiting.resolve(answer.prepared);
    });
    started.addEventListener('error', (event) => {
      started.terminate();
      worker = null;
      const message = event.message || 'The resort worker failed';
      if (ready) {
        failAll(new Error(message));
        return;
      }
      unavailable = true;
      failAll(new WorkerUnavailable(message));
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
