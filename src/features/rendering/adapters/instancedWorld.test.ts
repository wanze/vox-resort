import { describe, expect, it } from "vitest";
import type { Placement } from "../../layout/domain/resortLayout";
import { instancesByType } from "./instancedWorld";

const at = (key: string, id: string, x: number): Placement => ({
  key,
  id,
  tileX: 0,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  x,
  z: 0,
  width: 16,
  depth: 16,
});

describe("instancesByType", () => {
  it("collects every placement of a type under one key", () => {
    const grouped = instancesByType([
      at("cottage", "cottage", 0),
      at("path#1", "path", 16),
      at("cottage#2", "cottage", 32),
    ]);
    expect([...grouped.keys()]).toEqual(["cottage", "path"]);
    expect(grouped.get("cottage")?.map((placement) => placement.x)).toEqual([0, 32]);
  });

  it("keeps plan order inside a group", () => {
    const grouped = instancesByType([at("a", "hut", 5), at("b", "hut", 1)]);
    expect(grouped.get("hut")?.map((placement) => placement.key)).toEqual(["a", "b"]);
  });

  it("groups nothing when there is nothing to place", () => {
    expect(instancesByType([]).size).toBe(0);
  });
});
