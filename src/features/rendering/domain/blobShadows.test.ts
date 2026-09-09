import { describe, expect, it } from "vitest";
import { skyStateFor } from "../../lighting/domain/dayNight";
import {
  BLOB_OPACITY,
  blobShadowFor,
  blobShadowsFor,
  castsDiffer,
  MAX_CAST_LENGTH,
  MIN_CAST_HEIGHT,
  shadowCastFor,
  shadowQuadFor,
  type ShadowCaster,
} from "./blobShadows";

const caster = (overrides: Partial<ShadowCaster> = {}): ShadowCaster => ({
  key: "palm#1",
  x: 32,
  z: 64,
  width: 16,
  depth: 16,
  height: 45,
  ...overrides,
});

/** Noon: straight overhead, so nothing is swept anywhere. */
const OVERHEAD = { x: 0, y: 1, z: 0 };

describe("blobShadowFor", () => {
  it("centres the shadow on the footprint before the sun moves it", () => {
    const blob = blobShadowFor(caster({ x: 32, z: 64, width: 32, depth: 16 }))!;
    expect(blob.x).toBe(48);
    expect(blob.z).toBe(72);
  });

  it("takes its half-extents from the footprint as the object stands", () => {
    const blob = blobShadowFor(caster({ width: 96, depth: 64 }))!;
    expect(blob.halfWidth).toBeGreaterThan(48);
    expect(blob.halfWidth).toBeLessThan(52);
    expect(blob.halfDepth).toBeGreaterThan(32);
    expect(blob.halfDepth).toBeLessThan(35);
  });

  it("skips anything too flat to throw a shadow clear of itself", () => {
    expect(blobShadowFor(caster({ height: MIN_CAST_HEIGHT - 1 }))).toBeNull();
    expect(blobShadowFor(caster({ height: MIN_CAST_HEIGHT }))).not.toBeNull();
  });

  it("carries the height, which is what the sun stretches", () => {
    expect(blobShadowFor(caster({ height: 55 }))!.height).toBe(55);
  });
});

describe("blobShadowsFor", () => {
  it("keeps only the placements that throw a shadow", () => {
    const blobs = blobShadowsFor([
      caster({ key: "palm#1" }),
      caster({ key: "path@1,1", height: 2 }),
      caster({ key: "hotel#1", height: 55 }),
    ]);
    expect(blobs.map((blob) => blob.key)).toEqual(["palm#1", "hotel#1"]);
  });
});

describe("shadowCastFor", () => {
  it("draws nothing once the sun is down", () => {
    expect(shadowCastFor({ x: 1, y: -0.2, z: 0 })).toEqual({ strength: 0, runX: 0, runZ: 0 });
  });

  it("is at full strength with the sun high", () => {
    expect(shadowCastFor(OVERHEAD).strength).toBeCloseTo(BLOB_OPACITY, 5);
  });

  it("fades as the sun nears the horizon", () => {
    const low = shadowCastFor({ x: 0.99, y: 0.05, z: 0 });
    const high = shadowCastFor({ x: 0.2, y: 0.97, z: 0 });
    expect(low.strength).toBeLessThan(high.strength);
    expect(low.strength).toBeGreaterThan(0);
  });

  it("runs away from the sun", () => {
    const cast = shadowCastFor({ x: 0.6, y: 0.8, z: 0 });
    expect(cast.runX).toBeLessThan(0);
    expect(cast.runZ).toBeCloseTo(0, 10);
  });

  it("runs further as the sun drops", () => {
    const low = shadowCastFor({ x: 0.8, y: 0.6, z: 0 });
    const high = shadowCastFor({ x: 0.3, y: 0.95, z: 0 });
    expect(Math.abs(low.runX)).toBeGreaterThan(Math.abs(high.runX));
  });

  it("sweeps nothing under a sun directly overhead", () => {
    const cast = shadowCastFor(OVERHEAD);
    expect(cast.runX).toBe(0);
    expect(cast.runZ).toBe(0);
  });

  it("stops growing at the cap rather than reaching the horizon", () => {
    const grazing = shadowCastFor({ x: 0.999, y: 0.001, z: 0 });
    expect(Math.hypot(grazing.runX, grazing.runZ)).toBeCloseTo(MAX_CAST_LENGTH, 5);
  });

  it("runs through a whole day without leaving its bounds", () => {
    for (let time = 0; time < 1; time += 0.005) {
      const cast = shadowCastFor(skyStateFor(time).sunDirection);
      expect(cast.strength).toBeGreaterThanOrEqual(0);
      expect(cast.strength).toBeLessThanOrEqual(BLOB_OPACITY);
      expect(Math.hypot(cast.runX, cast.runZ)).toBeLessThanOrEqual(MAX_CAST_LENGTH + 1e-9);
    }
  });

  it("draws no sun shadow while the lamps are fully lit", () => {
    for (let time = 0; time < 1; time += 0.005) {
      const sky = skyStateFor(time);
      if (sky.lampFactor === 1) expect(shadowCastFor(sky.sunDirection).strength).toBe(0);
    }
  });
});

describe("shadowQuadFor", () => {
  it("sits the quad on the footprint when the sun is overhead", () => {
    const blob = blobShadowFor(caster())!;
    const quad = shadowQuadFor(blob, shadowCastFor(OVERHEAD));
    expect(quad.x).toBe(blob.x);
    expect(quad.z).toBe(blob.z);
    expect(quad.halfWidth).toBe(blob.halfWidth);
  });

  it("runs the quad out of the object rather than clear of it", () => {
    const blob = blobShadowFor(caster({ height: 40 }))!;
    // Sun to the west, so the shadow runs east and the arithmetic reads forwards.
    const cast = shadowCastFor({ x: -0.7, y: 0.7, z: 0 });
    expect(cast.runX).toBeGreaterThan(0);
    const quad = shadowQuadFor(blob, cast);
    // The near edge is still under the footprint the object claims.
    expect(quad.x - quad.halfWidth).toBeLessThan(blob.x);
    // And the far edge has reached the ground beyond it.
    expect(quad.x + quad.halfWidth).toBeGreaterThan(blob.x + blob.halfWidth);
  });

  it("stretches a tall object's shadow further than a squat one's", () => {
    const cast = shadowCastFor({ x: 0.7, y: 0.7, z: 0 });
    const tall = shadowQuadFor(blobShadowFor(caster({ height: 45 }))!, cast);
    const squat = shadowQuadFor(blobShadowFor(caster({ height: 8 }))!, cast);
    expect(tall.halfWidth).toBeGreaterThan(squat.halfWidth);
    expect(Math.abs(tall.x - 40)).toBeGreaterThan(Math.abs(squat.x - 40));
  });

  it("stretches along the axis the sun is on, and not across it", () => {
    const blob = blobShadowFor(caster({ height: 40 }))!;
    const cast = shadowCastFor({ x: 0.7, y: 0.7, z: 0 });
    const quad = shadowQuadFor(blob, cast);
    expect(quad.halfWidth).toBeGreaterThan(blob.halfWidth);
    expect(quad.halfDepth).toBe(blob.halfDepth);
    expect(quad.z).toBe(blob.z);
  });

  it("grows rather than shrinking, whichever way the sun is", () => {
    const blob = blobShadowFor(caster({ height: 40 }))!;
    for (let time = 0; time < 1; time += 0.01) {
      const quad = shadowQuadFor(blob, shadowCastFor(skyStateFor(time).sunDirection));
      expect(quad.halfWidth).toBeGreaterThanOrEqual(blob.halfWidth);
      expect(quad.halfDepth).toBeGreaterThanOrEqual(blob.halfDepth);
    }
  });
});

describe("castsDiffer", () => {
  it("is false for a clock that has not moved", () => {
    const cast = shadowCastFor({ x: 0.5, y: 0.8, z: 0.3 });
    expect(castsDiffer(cast, cast)).toBe(false);
  });

  it("is true once the sun has actually moved", () => {
    const before = shadowCastFor(skyStateFor(0.5).sunDirection);
    const after = shadowCastFor(skyStateFor(0.55).sunDirection);
    expect(castsDiffer(before, after)).toBe(true);
  });
});
