/**
 * The worker half of `meshCatalogue.ts`: meshes the catalogue and transfers the
 * attribute arrays back.
 *
 * DVE is designed to run in workers, and nothing downstream of it here touches
 * the DOM or Three.js, so the whole pipeline — paint the scratch world, mesh it,
 * merge the coplanar faces, split the emissive colours out — happens on this
 * side and only typed arrays cross back.
 */

import { transferablesOf } from '../../rendering/domain/modelAttributes';
import { fromWire, meshOnThisThread, type WireRequest, type WireResponse } from './meshJob';

self.addEventListener('message', (event: MessageEvent<WireRequest>) => {
  void (async () => {
    try {
      const { models, dveMs } = await meshOnThisThread(fromWire(event.data));
      const response: WireResponse = { models, dveMs };
      // Transferred rather than copied: the arrays are tens of megabytes, and
      // this worker has no further use for them.
      self.postMessage(response, { transfer: transferablesOf(models) });
    } catch (cause: unknown) {
      const response: WireResponse = {
        models: [],
        dveMs: 0,
        error: cause instanceof Error ? cause.message : String(cause),
      };
      self.postMessage(response);
    }
  })();
});
