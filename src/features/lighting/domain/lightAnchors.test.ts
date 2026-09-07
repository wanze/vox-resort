import { describe, expect, it } from "vitest";
import type { ModelLight } from "../../../../voxel-gen/voxelgen.ts";
import { anchorsFor, lampReservationFor } from "./lightAnchors";

const light = (overrides: Partial<ModelLight> = {}): ModelLight => ({
  x: 7,
  y: 18,
  z: 7,
  color: 0xfff3a3,
  intensity: 90,
  distance: 46,
  ...overrides,
});

const ground = { minX: 0, maxX: 1792, minZ: 0, maxZ: 1600 };

describe("anchorsFor", () => {
  it("has nothing to place for an object that declares no light", () => {
    expect(anchorsFor({ key: "hedge:1", x: 0, z: 0 }, [])).toEqual([]);
  });

  it("carries the light to where the object stands", () => {
    const [anchor] = anchorsFor({ key: "street-lamp:4", x: 320, z: 96 }, [light()]);
    expect(anchor).toMatchObject({ x: 327, z: 103, y: 18, intensity: 90, distance: 46 });
  });

  it("leaves the light's height alone, because objects sit on the ground", () => {
    const [anchor] = anchorsFor({ key: "torch:1", x: 999, z: 999 }, [light({ y: 10 })]);
    expect(anchor?.y).toBe(10);
  });

  it("numbers the lights within the object that owns them", () => {
    const anchors = anchorsFor({ key: "tennis-court:2", x: 0, z: 0 }, [light(), light({ x: 97 })]);
    expect(anchors.map((anchor) => anchor.key)).toEqual(["tennis-court:2:0", "tennis-court:2:1"]);
  });

  it("keys two placements of the same model apart", () => {
    const first = anchorsFor({ key: "street-lamp:1", x: 0, z: 0 }, [light()]);
    const second = anchorsFor({ key: "street-lamp:2", x: 64, z: 0 }, [light()]);
    expect(first[0]?.key).not.toBe(second[0]?.key);
  });
});

describe("lampReservationFor", () => {
  it("has nothing to reserve when no model declares a light", () => {
    expect(lampReservationFor(ground, [])).toBeNull();
  });

  it("covers the plot and a lamp's reach beyond every edge", () => {
    const reservation = lampReservationFor(ground, [
      light({ distance: 46 }),
      light({ distance: 70 }),
    ])!;
    expect(reservation.minX).toBe(-70);
    expect(reservation.maxX).toBe(1862);
    expect(reservation.minZ).toBe(-70);
    expect(reservation.maxZ).toBe(1670);
  });

  it("reaches from the ground to the highest light's own reach above it", () => {
    const reservation = lampReservationFor(ground, [light({ y: 22, distance: 56 })])!;
    expect(reservation.minY).toBe(0);
    expect(reservation.maxY).toBe(78);
  });

  it("takes the furthest reach, whichever model declared it", () => {
    const near = lampReservationFor(ground, [light({ distance: 30 })])!;
    const far = lampReservationFor(ground, [light({ distance: 30 }), light({ distance: 70 })])!;
    expect(far.maxX - far.minX).toBeGreaterThan(near.maxX - near.minX);
  });
});
