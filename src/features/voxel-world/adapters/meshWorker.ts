import { transferablesOf } from '../../rendering/domain/modelAttributes';
import { fromWire, meshOnThisThread, type WireRequest, type WireResponse } from './meshJob';

self.addEventListener('message', (event: MessageEvent<WireRequest>) => {
  void (async () => {
    try {
      const { models, dveMs } = await meshOnThisThread(fromWire(event.data));
      const response: WireResponse = { models, dveMs };
      // Transferred, not copied: the arrays are tens of megabytes.
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
