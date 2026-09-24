import type { MeshCatalogueRequest, MeshCatalogueResult, WireResponse } from './meshJob';
import { meshOnThisThread, toWire } from './meshJob';

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

// Meshing takes about 1.4 s, so it runs in a worker to keep the page responsive.
// The main-thread fallback exists because a worker can fail to start.
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
