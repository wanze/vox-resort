import { BOOT_STARTED } from './bootStart';
import { OBJECT_TYPES } from '../features/catalog/domain/objectTypes';

// Evaluated right after objectTypes and every model module it pulls in, before the rest of the app.
const CATALOGUE_BUILT = performance.now();

export function measureBoot(): void {
  performance.measure('vox:boot:catalogue', {
    start: BOOT_STARTED,
    end: CATALOGUE_BUILT,
    detail: OBJECT_TYPES.length,
  });
  performance.measure('vox:boot:modules');
}
