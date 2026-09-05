import { describe, expect, it } from "vitest";
import { nearestAnchors, type LightAnchor } from "./lightAnchors";

const anchor = (key: string, x: number, y = 0, z = 0): LightAnchor => ({
  key,
  x,
  y,
  z,
  color: 0xffffff,
  intensity: 1,
  distance: 10,
});

const anchors = [anchor("far", 100), anchor("near", 1), anchor("mid", 10)];

describe("nearestAnchors", () => {
  it("returns the closest anchors, nearest first", () => {
    const chosen = nearestAnchors(anchors, { x: 0, y: 0, z: 0 }, 2);
    expect(chosen.map((entry) => entry.key)).toEqual(["near", "mid"]);
  });

  it("measures in all three axes", () => {
    const chosen = nearestAnchors(
      [anchor("low", 0, 1), anchor("high", 0, 50)],
      { x: 0, y: 0, z: 0 },
      1,
    );
    expect(chosen[0]?.key).toBe("low");
  });

  it("returns everything when the limit exceeds the anchors", () => {
    expect(nearestAnchors(anchors, { x: 0, y: 0, z: 0 }, 99)).toHaveLength(3);
  });

  it("returns nothing for a limit of zero", () => {
    expect(nearestAnchors(anchors, { x: 0, y: 0, z: 0 }, 0)).toEqual([]);
  });

  it("breaks ties on the key, so the same view lights the same lamps", () => {
    const tied = [anchor("b", 5), anchor("a", 5)];
    expect(nearestAnchors(tied, { x: 0, y: 0, z: 0 }, 1)[0]?.key).toBe("a");
  });
});
