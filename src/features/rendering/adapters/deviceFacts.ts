import { knownCount, type DeviceFacts } from '../domain/sunShadows';

// Chrome alone reports the memory, rounded and capped at 8, so most browsers answer null.
interface WithMemory {
  readonly deviceMemory?: number;
}

export function readDeviceFacts(webgpu: boolean): DeviceFacts {
  const browser = globalThis.navigator as (Navigator & WithMemory) | undefined;
  return {
    coarsePointer: globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
    webgpu,
    cores: knownCount(browser?.hardwareConcurrency),
    memoryGb: knownCount(browser?.deviceMemory),
  };
}
