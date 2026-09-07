import { describe, expect, it } from "vitest";
import { place, type LayoutItem } from "../../layout/domain/resortLayout";
import { objectTypeById } from "../../catalog/domain/objectTypes";
import {
  buildKey,
  isPaintable,
  layoutItemFor,
  planAt,
  planStroke,
  tilesBetween,
} from "./buildPlan";
import { createTileOccupancy } from "./tileOccupancy";

const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * 16,
  depth: tilesZ * 16,
});

const PATH = item("path");
const COTTAGE = item("cottage", 2, 3);

describe("buildKey", () => {
  it("keys a placement by its type and tile, so it survives an edit", () => {
    expect(buildKey(PATH, { x: 12, z: 7 })).toBe("path@12,7");
  });
});

describe("isPaintable", () => {
  it("paints a one-tile object", () => {
    expect(isPaintable(PATH)).toBe(true);
  });

  it("does not paint a row of buildings out of one drag", () => {
    expect(isPaintable(COTTAGE)).toBe(false);
  });
});

describe("planAt", () => {
  it("stands the object on the tile it was dropped on", () => {
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy());
    expect(plan.blocked).toBe(false);
    expect(plan.placement).toEqual(place(COTTAGE, "cottage@3,5", 3, 5));
  });

  it("still plans a blocked placement, so the preview can show it refused", () => {
    const occupancy = createTileOccupancy([place(PATH, "path@3,5", 3, 5)]);
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, occupancy);
    expect(plan.blocked).toBe(true);
    expect(plan.placement.tileX).toBe(3);
  });

  it("is blocked by anything under any tile of its footprint", () => {
    const occupancy = createTileOccupancy([place(PATH, "path@4,7", 4, 7)]);
    expect(planAt(COTTAGE, { x: 3, z: 5 }, occupancy).blocked).toBe(true);
  });
});

describe("tilesBetween", () => {
  it("gives just the tile when a drag never left it", () => {
    expect(tilesBetween({ x: 2, z: 2 }, { x: 2, z: 2 })).toEqual([{ x: 2, z: 2 }]);
  });

  it("fills a straight run, ends included", () => {
    expect(tilesBetween({ x: 0, z: 3 }, { x: 3, z: 3 })).toEqual([
      { x: 0, z: 3 },
      { x: 1, z: 3 },
      { x: 2, z: 3 },
      { x: 3, z: 3 },
    ]);
  });

  it("runs backwards as readily as forwards", () => {
    expect(tilesBetween({ x: 0, z: 2 }, { x: 0, z: 0 })).toEqual([
      { x: 0, z: 2 },
      { x: 0, z: 1 },
      { x: 0, z: 0 },
    ]);
  });

  it("leaves no gap when the pointer jumped a diagonal", () => {
    const tiles = tilesBetween({ x: 0, z: 0 }, { x: 4, z: 2 });
    expect(tiles[0]).toEqual({ x: 0, z: 0 });
    expect(tiles.at(-1)).toEqual({ x: 4, z: 2 });
    for (let index = 1; index < tiles.length; index++) {
      const step = Math.max(
        Math.abs(tiles[index]!.x - tiles[index - 1]!.x),
        Math.abs(tiles[index]!.z - tiles[index - 1]!.z),
      );
      expect(step).toBe(1);
    }
  });
});

describe("planStroke", () => {
  it("paves every free tile the stroke ran over", () => {
    const stroke = planStroke(
      PATH,
      tilesBetween({ x: 0, z: 0 }, { x: 2, z: 0 }),
      createTileOccupancy(),
    );
    expect(stroke.map((placement) => placement.key)).toEqual(["path@0,0", "path@1,0", "path@2,0"]);
  });

  it("paves around what is in the way rather than stopping at it", () => {
    const occupancy = createTileOccupancy([place(PATH, "hedge@1,0", 1, 0)]);
    const stroke = planStroke(PATH, tilesBetween({ x: 0, z: 0 }, { x: 2, z: 0 }), occupancy);
    expect(stroke.map((placement) => placement.key)).toEqual(["path@0,0", "path@2,0"]);
  });
});

describe("layoutItemFor", () => {
  it("takes the footprint of a catalogue type, without its voxels", () => {
    const cottage = objectTypeById("cottage");
    expect(layoutItemFor(cottage)).toEqual({
      id: "cottage",
      tilesX: cottage.model.tiles.x,
      tilesZ: cottage.model.tiles.z,
      width: cottage.model.width,
      depth: cottage.model.depth,
    });
  });
});
