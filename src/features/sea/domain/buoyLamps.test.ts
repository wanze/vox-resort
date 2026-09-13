import { describe, expect, it } from 'vitest';
import { anchorsFor } from '../../lighting/domain/lightAnchors';
import { buoyLampSites } from './buoyLamps';

const buoy = { width: 5, depth: 5 };

describe('buoyLampSites', () => {
  it('has nothing to light where nothing is moored', () => {
    expect(buoyLampSites([], buoy, 0.1)).toEqual([]);
  });

  it('puts a lamp declared at the middle of the model over its mooring', () => {
    const [site] = buoyLampSites([{ x: 40, z: 72 }], buoy, 0.1);
    const [anchor] = anchorsFor(site!, [
      { x: 2.5, y: 10.5, z: 2.5, color: 0xffcc66, intensity: 40, distance: 30 },
    ]);
    expect(anchor).toMatchObject({ x: 40, y: 10.6, z: 72 });
  });

  it('keys every mooring apart', () => {
    const sites = buoyLampSites(
      [
        { x: 8, z: 8 },
        { x: 24, z: 8 },
        { x: 40, z: 8 },
      ],
      buoy,
      0,
    );
    expect(new Set(sites.map((site) => site.key)).size).toBe(3);
  });
});
