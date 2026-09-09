/**
 * Meshes the catalogue, in a worker when the browser allows one.
 *
 * The catalogue is meshed exactly once, however large the resort is — that is
 * what makes instancing pay — but "once" still costs about 1.2 seconds of DVE
 * and a further 0.2 running the greedy merge over its output, and on the main
 * thread that is 1.4 seconds in which the page does not respond, does not paint
 * and does not answer a click.
 *
 * None of that work touches the DOM or the renderer: it reads plain numbers and
 * writes typed arrays. So it runs in a worker and the arrays are transferred
 * back, leaving the main thread free to show a loading state that actually
 * animates. The main-thread path is kept as a fallback, because a worker can
 * fail to start for reasons that have nothing to do with this code, and a resort
 * that renders late is better than one that does not render.
 */

import type { MeshCatalogueRequest, MeshCatalogueResult, WireResponse } from './meshJob';
import { meshOnThisThread, toWire } from './meshJob';

/** How long to wait for the worker before giving up and meshing here instead. */
const WORKER_TIMEOUT_MS = 30_000;

function runInWorker(request: MeshCatalogueRequest): Promise<MeshCatalogueResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('The mesh worker did not answer'));
    }, WORKER_TIMEOUT_MS);

    const finish = (outcome: () => void): void => {
      clearTimeout(timer);
      worker.terminate();
      outcome();
    };

    worker.addEventListener('message', (event: MessageEvent<WireResponse>) => {
      const data = event.data;
      finish(() =>
        data.error
          ? reject(new Error(data.error))
          : resolve({ models: data.models, dveMs: data.dveMs, threaded: true }),
      );
    });
    worker.addEventListener('error', (event) => {
      finish(() => reject(new Error(event.message || 'The mesh worker failed')));
    });
    const wire = toWire(request);
    // Three quarters of a million writes: transferred, not cloned.
    worker.postMessage(wire, {
      transfer: [wire.writes.positions.buffer, wire.writes.voxelIds.buffer],
    });
  });
}

/**
 * Meshes the catalogue off the main thread, falling back to the main thread if
 * the worker cannot be started or does not answer.
 */
export async function meshCatalogue(
  request: MeshCatalogueRequest,
  options: { readonly forceMainThread?: boolean } = {},
): Promise<MeshCatalogueResult> {
  if (options.forceMainThread !== true && typeof Worker !== 'undefined') {
    try {
      return await runInWorker(request);
    } catch (cause: unknown) {
      console.warn('Meshing on the main thread; the worker was unavailable.', cause);
    }
  }
  const { models, dveMs } = await meshOnThisThread(request);
  return { models, dveMs, threaded: false };
}
