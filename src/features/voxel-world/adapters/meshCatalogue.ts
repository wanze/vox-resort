import type { MeshModelsRequest, MeshModelsResult, WireResponse } from './meshJob';

const WORKER_TIMEOUT_MS = 30_000;

interface MeshCatalogueResult extends MeshModelsResult {
  readonly threaded: boolean;
}

function runInWorker(request: MeshModelsRequest): Promise<MeshCatalogueResult> {
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
      const { error, models, dveMs, buildMs, meshedVoxelCount } = event.data;
      finish(() =>
        error
          ? reject(new Error(error))
          : resolve({ models, dveMs, buildMs, meshedVoxelCount, threaded: true }),
      );
    });
    worker.addEventListener('error', (event) => {
      finish(() => reject(new Error(event.message || 'The mesh worker failed')));
    });
    // Nothing to transfer: the worker paints and lays out the models itself.
    worker.postMessage(request);
  });
}

// Painting and meshing take seconds and hundreds of megabytes, so they run in a worker to keep
// the page responsive and its heap small. The main-thread fallback exists because a worker can
// fail to start.
export async function meshCatalogue(
  request: MeshModelsRequest,
  options: { readonly forceMainThread?: boolean } = {},
): Promise<MeshCatalogueResult> {
  if (options.forceMainThread !== true && typeof Worker !== 'undefined') {
    try {
      return await runInWorker(request);
    } catch (cause: unknown) {
      console.warn('Meshing on the main thread; the worker was unavailable.', cause);
    }
  }
  // Imported only here so the page's bundle does not carry the art the worker paints.
  const { meshModelsOnThisThread } = await import('./meshJob');
  return { ...(await meshModelsOnThisThread(request)), threaded: false };
}
