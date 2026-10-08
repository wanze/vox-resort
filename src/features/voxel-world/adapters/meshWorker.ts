import { transferablesOf } from '../../rendering/domain/modelAttributes';
import { meshModelsOnThisThread, type MeshModelsRequest, type WireResponse } from './meshJob';

self.addEventListener('message', (event: MessageEvent<MeshModelsRequest>) => {
  void (async () => {
    try {
      const { models, dveMs, buildMs, meshedVoxelCount } = await meshModelsOnThisThread(event.data);
      const response: WireResponse = { models, dveMs, buildMs, meshedVoxelCount };
      // Transferred, not copied: the arrays are tens of megabytes.
      self.postMessage(response, { transfer: transferablesOf(models) });
    } catch (cause: unknown) {
      const response: WireResponse = {
        models: [],
        dveMs: 0,
        buildMs: 0,
        meshedVoxelCount: 0,
        error: cause instanceof Error ? cause.message : String(cause),
      };
      self.postMessage(response);
    }
  })();
});
