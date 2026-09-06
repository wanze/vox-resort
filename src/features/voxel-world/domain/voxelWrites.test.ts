import { describe, expect, it } from "vitest";
import { packVoxelWrites, unpackVoxelWrites, type VoxelWrite } from "./voxelWrites";

const writes: VoxelWrite[] = [
  { x: 0, y: 0, z: 0, voxelId: "stone" },
  { x: -3, y: 12, z: 4096, voxelId: "grass" },
  { x: 7, y: 1, z: 2, voxelId: "stone" },
];

describe("packVoxelWrites", () => {
  it("survives a round trip", () => {
    expect(unpackVoxelWrites(packVoxelWrites(writes))).toEqual(writes);
  });

  it("packs an empty catalogue", () => {
    const packed = packVoxelWrites([]);
    expect(packed.palette).toEqual([]);
    expect(unpackVoxelWrites(packed)).toEqual([]);
  });

  it("keeps one palette entry per distinct id, not per write", () => {
    expect(packVoxelWrites(writes).palette).toEqual(["stone", "grass"]);
  });

  it("keeps negative and large coordinates", () => {
    const extreme: VoxelWrite[] = [{ x: -8192, y: 255, z: 100_000, voxelId: "a" }];
    expect(unpackVoxelWrites(packVoxelWrites(extreme))).toEqual(extreme);
  });

  it("produces arrays a worker can transfer rather than copy", () => {
    const packed = packVoxelWrites(writes);
    expect(packed.positions).toBeInstanceOf(Int32Array);
    expect(packed.voxelIds).toBeInstanceOf(Uint16Array);
    expect(packed.positions).toHaveLength(writes.length * 3);
  });

  it("refuses a palette entry that is not there", () => {
    const packed = packVoxelWrites(writes);
    packed.voxelIds[0] = 99;
    expect(() => unpackVoxelWrites(packed)).toThrow(/palette entry 99/);
  });
});
