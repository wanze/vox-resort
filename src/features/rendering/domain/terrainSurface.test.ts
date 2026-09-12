import { describe, expect, it } from 'vitest';
import { shoreFor, waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL, SEA_LEVEL, terrainSurfacesFor, type SurfaceGeometry } from './terrainSurface';
import {
  elevationFor,
  levelHeight,
  stepStartZ,
  type Elevation,
  type TerraceSpec,
} from '../../layout/domain/elevation';
import type { ShoreSpec } from '../../layout/domain/shoreline';
import { createTerrain, type TerrainEdit } from '../../layout/domain/terrain';

const TILE = 16;

const shore = (over: Partial<{ inset: number; beach: number; wave: number }> = {}): Shore =>
  shoreFor({
    tilesX: 40,
    tilesZ: 40,
    shore: { inset: 20, beach: 6, wave: 0, seed: 1, ...over },
  })!;

/**
 * The middle of a 40x40 plot, with the box reaching a plot's width past it.
 *
 * The ground reaches the mesher as a terrain rather than as a coast and a set of
 * terrace specs, which is the change this file is written against: an unedited
 * terrain answers exactly what those two answered, so every assertion below is
 * about the same plot it always was — and `edits` is how the ones about a river
 * or an island say what has been dug.
 */
const request = (
  coast: Shore | null,
  reach = 640,
  land: Elevation | null = null,
  edits: readonly TerrainEdit[] = [],
  built: readonly string[] = [],
) => ({
  terrain: createTerrain({ shore: coast, elevation: land, tilesX: 40, tilesZ: 40, edits }),
  isClear: (tileX: number, tileZ: number) => !built.includes(`${tileX},${tileZ}`),
  shore: coast,
  center: { x: 320, z: 320 },
  reach,
  tileVoxels: TILE,
});

/** Terraces climbing away from the water, on the same 40x40 plot. */
const terraced = (
  terraces: readonly TerraceSpec[] = [
    { level: 1, inset: 8, wave: 0 },
    { level: 2, inset: 16, wave: 0 },
  ],
  coast: ShoreSpec | null = null,
): Elevation =>
  elevationFor({
    tilesX: 40,
    tilesZ: 40,
    ...(coast ? { shore: coast } : {}),
    elevation: { terraces, seed: 1 },
  })!;

/** Every quad of a surface, as its own bounding box. */
function quadsOf(surface: SurfaceGeometry) {
  const quads = [];
  for (let quad = 0; quad < surface.quadCount; quad++) {
    const xs = [];
    const zs = [];
    for (let corner = 0; corner < 4; corner++) {
      const at = (quad * 4 + corner) * 3;
      xs.push(surface.positions[at]!);
      zs.push(surface.positions[at + 2]!);
    }
    quads.push({
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
      y: surface.positions[quad * 12 + 1]!,
    });
  }
  return quads;
}

/**
 * The ground a surface actually covers, in square voxels.
 *
 * Summed off the triangles rather than the quads, because a mitred half tile is
 * a quad with its fourth corner on the cut: its bounding box says a whole tile
 * and it covers half of one.
 */
function areaOf(surface: SurfaceGeometry): number {
  let area = 0;
  for (let index = 0; index < surface.indices.length; index += 3) {
    const corner = (vertex: number): readonly [number, number] => {
      const at = surface.indices[index + vertex]! * 3;
      return [surface.positions[at]!, surface.positions[at + 2]!];
    };
    const [ax, az] = corner(0);
    const [bx, bz] = corner(1);
    const [cx, cz] = corner(2);
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return area;
}

/** Every quad's normal, one entry per quad. */
function normalsOf(surface: SurfaceGeometry) {
  const normals = surface.normals!;
  return Array.from({ length: surface.quadCount }, (_, quad) => ({
    x: normals[quad * 12]!,
    y: normals[quad * 12 + 1]!,
    z: normals[quad * 12 + 2]!,
  }));
}

/**
 * Whether a quad faces the way its winding says it does.
 *
 * The normal is in the buffer and the winding is in the positions, and nothing
 * forces them to agree — so a quad wound the wrong way round is lit correctly
 * and culled anyway. This is the check that they match.
 */
function windingAgreesWithNormal(surface: SurfaceGeometry, quad: number): boolean {
  const at = (corner: number, axis: number): number =>
    surface.positions[(quad * 4 + corner) * 3 + axis]!;
  const edge = (from: number, to: number): number[] => [
    at(to, 0) - at(from, 0),
    at(to, 1) - at(from, 1),
    at(to, 2) - at(from, 2),
  ];
  const [ax, ay, az] = edge(0, 1) as [number, number, number];
  const [bx, by, bz] = edge(1, 2) as [number, number, number];
  const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const normal = normalsOf(surface)[quad]!;
  return cross[0]! * normal.x + cross[1]! * normal.y + cross[2]! * normal.z > 0;
}

/** What a plot contributes when neither material has anything to draw. */
const NOTHING = { grass: null, sand: null };

describe('terrainSurfacesFor', () => {
  it('draws nothing at all on flat land with no shore', () => {
    // Grass at sea level is the infinite ground plane's job, so a flat inland
    // plot is a plot with no terrain geometry on it at all.
    expect(terrainSurfacesFor(request(null))).toEqual({
      sea: null,
      water: null,
      ground: NOTHING,
      risers: NOTHING,
    });
  });

  it('builds both surfaces for a plot with a coast', () => {
    const { ground, sea } = terrainSurfacesFor(request(shore()));
    expect(ground.sand?.quadCount).toBeGreaterThan(0);
    expect(sea?.quadCount).toBeGreaterThan(0);
  });

  it('lays each surface flat at its own height', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    // Through a Float32Array and back, so the heights are compared as floats.
    for (const quad of quadsOf(sand!)) expect(quad.y).toBeCloseTo(SAND_LEVEL, 5);
    for (const quad of quadsOf(sea!)) expect(quad.y).toBeCloseTo(SEA_LEVEL, 5);
  });

  it('keeps the sand above the water, so the seam never shows the grass', () => {
    expect(SAND_LEVEL).toBeGreaterThan(SEA_LEVEL);
  });

  it('emits three numbers per vertex and six indices per quad', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    for (const surface of [sand!, sea!]) {
      expect(surface.positions).toHaveLength(surface.quadCount * 4 * 3);
      expect(surface.indices).toHaveLength(surface.quadCount * 6);
    }
  });

  it('winds every quad so it faces up', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    for (const surface of [sand!, sea!]) {
      for (let index = 0; index < surface.indices.length; index += 3) {
        const at = (vertex: number) => {
          const base = surface.indices[index + vertex]! * 3;
          return [surface.positions[base]!, surface.positions[base + 2]!] as const;
        };
        const [ax, az] = at(0);
        const [bx, bz] = at(1);
        const [cx, cz] = at(2);
        // The y component of (b - a) x (c - a); positive is a face pointing up.
        expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(0);
      }
    }
  });

  it('stays inside the box it was asked to cover', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    for (const quad of [...quadsOf(sand!), ...quadsOf(sea!)]) {
      expect(quad.z0).toBeGreaterThanOrEqual(-320);
      expect(quad.z1).toBeLessThanOrEqual(960);
    }
  });

  it('starts the sea on the same tile the layout calls water', () => {
    const coast = shore();
    const columns = new Map<number, number>();
    for (const quad of quadsOf(terrainSurfacesFor(request(coast)).sea!)) {
      columns.set(quad.x0, Math.min(columns.get(quad.x0) ?? Infinity, quad.z0));
    }
    // One tile of underlap, so the water runs in beneath the sand rather than
    // stopping exactly where it does.
    for (let tileX = 10; tileX < 30; tileX++) {
      expect({ tileX, from: columns.get(tileX * TILE) }).toEqual({
        tileX,
        from: (waterStartZ(coast, tileX) - 1) * TILE,
      });
    }
  });

  it('ends the sand exactly where the water begins', () => {
    const coast = shore();
    const columns = new Map<number, number>();
    for (const quad of quadsOf(terrainSurfacesFor(request(coast)).ground.sand!)) {
      columns.set(quad.x0, Math.max(columns.get(quad.x0) ?? -Infinity, quad.z1));
    }
    for (let tileX = 10; tileX < 30; tileX++) {
      expect({ tileX, to: columns.get(tileX * TILE) }).toEqual({
        tileX,
        to: waterStartZ(coast, tileX) * TILE,
      });
    }
  });

  it('covers columns well past the plot, so the coast reaches the horizon', () => {
    const columns = new Set(
      quadsOf(terrainSurfacesFor(request(shore())).sea!).map((quad) => quad.x0),
    );
    // The plot is 40 tiles across and the box reaches 40 tiles past both sides.
    expect(Math.min(...columns)).toBeLessThan(0);
    expect(Math.max(...columns)).toBeGreaterThan(40 * TILE);
  });

  it('measures the foam distance off its own column, staircase and all', () => {
    const coast = shore({ wave: 3 });
    const sea = terrainSurfacesFor(request(coast)).sea!;
    expect(sea.shoreDistances!.edge).toHaveLength(sea.quadCount * 4);
    for (const [index, quad] of quadsOf(sea).entries()) {
      const water = waterStartZ(coast, quad.x0 / TILE) * TILE;
      for (let corner = 0; corner < 4; corner++) {
        const vertex = index * 4 + corner;
        const z = sea.positions[vertex * 3 + 2]!;
        expect(sea.shoreDistances!.edge[vertex]).toBeCloseTo(z - water, 3);
      }
    }
  });

  it('measures the colour distance off the coast curve, at each vertex own x', () => {
    const coast = shore({ wave: 3 });
    const sea = terrainSurfacesFor(request(coast)).sea!;
    expect(sea.shoreDistances!.coast).toHaveLength(sea.quadCount * 4);
    for (let vertex = 0; vertex < sea.quadCount * 4; vertex++) {
      const x = sea.positions[vertex * 3]!;
      const z = sea.positions[vertex * 3 + 2]!;
      expect(sea.shoreDistances!.coast[vertex]).toBeCloseTo(
        z - waterEdgeZ(coast, x / TILE) * TILE,
        3,
      );
    }
  });

  /**
   * The seam this whole pair exists to remove: two columns sharing a boundary
   * have to agree on the colour distance there, or the eye sees the step.
   */
  it('hands neighbouring columns the same colour distance at the x they share', () => {
    const sea = terrainSurfacesFor(request(shore({ wave: 3 }))).sea!;
    /** Every colour distance recorded at one (x, z), keyed by the pair. */
    const seen = new Map<string, number[]>();
    for (let vertex = 0; vertex < sea.quadCount * 4; vertex++) {
      const key = `${sea.positions[vertex * 3]},${sea.positions[vertex * 3 + 2]}`;
      seen.set(key, [...(seen.get(key) ?? []), sea.shoreDistances!.coast[vertex]!]);
    }
    const shared = [...seen.values()].filter((distances) => distances.length > 1);
    expect(shared.length).toBeGreaterThan(10);
    for (const distances of shared) {
      expect(Math.max(...distances) - Math.min(...distances)).toBeCloseTo(0, 3);
    }
  });

  it('leaves the sand without shore distances, having no use for them', () => {
    expect(terrainSurfacesFor(request(shore())).ground.sand!.shoreDistances).toBeNull();
  });

  it('runs the water in under the sand, so the seam is an overlap', () => {
    const sea = terrainSurfacesFor(request(shore())).sea!;
    // A tile of underlap, and no more: the sand hides exactly that much water.
    expect(Math.min(...sea.shoreDistances!.edge)).toBeCloseTo(-TILE, 3);
  });
});

describe('the terraces', () => {
  it('draws no raised ground and no slopes on flat land, however much sea', () => {
    // The beach is still drawn, because the ground plane cannot; what a flat
    // coast has none of is raised grass and cut faces. A slope is a question
    // about benches alone, so the fractions of a voxel that keep the sand over
    // the water never grow one — see `ColumnProfile.benches`.
    const { ground, risers } = terrainSurfacesFor(request(shore()));
    expect({ grass: ground.grass, risers }).toEqual({ grass: null, risers: NOTHING });
  });

  it('draws a bench and a riser for a terraced plot with no sea at all', () => {
    // The terraces are independent of the coast: a plot can be terraced without
    // a shore, and the surfaces have to come out either way.
    const { ground, risers } = terrainSurfacesFor(request(null, 640, terraced()));
    expect(ground.grass).not.toBeNull();
    expect(risers.grass).not.toBeNull();
  });

  it('lays each bench at its own level and none at sea level', () => {
    // Sea level is the infinite grass plane's job; a quad laid over it would be
    // a second surface at the same height, fighting for the same fragments.
    const { ground: terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const heights = new Set(quadsOf(terraces.grass!).map((quad) => quad.y));
    expect([...heights].toSorted((a, b) => a - b)).toEqual([levelHeight(1), levelHeight(2)]);
  });

  it('faces every bench straight up', () => {
    const { ground: terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    for (const normal of normalsOf(terraces.grass!)) expect(normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('slopes every step rather than standing it upright', () => {
    // The whole point of the slope: a step is a ramp cut into the tile above it,
    // so its face leans back rather than standing as a wall. It still carries a
    // normal of its own, because a slope lit as a floor is a slope the sun
    // cannot pick out.
    const { risers } = terrainSurfacesFor(request(null, 640, terraced()));
    for (const normal of normalsOf(risers.grass!)) {
      const lean = Math.hypot(normal.x, normal.z);
      expect({ leans: lean > 0.1, tips: normal.y > 0.1 }).toEqual({ leans: true, tips: true });
    }
  });

  it('cuts the slope into the tile above the step, never into the ground below', () => {
    // The ground below a step is where the paths, the beach and the water are; a
    // ramp that overlapped it would bury the foot of a promenade. So a slope
    // takes its run out of the upper tile's own edge, and the drawn ground never
    // reaches below the bench it is falling to.
    const land = terraced([{ level: 1, inset: 8, wave: 0 }]);
    const { risers } = terrainSurfacesFor(request(null, 640, land));
    // The last row of the bench is the one that gives up its edge; everything
    // seaward of the step is ground the slope may not reach into.
    const step = stepStartZ(land, 0, 20) * TILE;
    for (const quad of quadsOf(risers.grass!)) {
      expect({ z0: quad.z0 >= step - TILE, z1: quad.z1 <= step }).toEqual({ z0: true, z1: true });
    }
  });

  it('leaves the ground square under anything standing on it', () => {
    // A model is a box with a flat underside covering its whole tile, so a slope
    // cut into a tile something stands on leaves it overhanging the cut.
    const land = terraced([{ level: 1, inset: 8, wave: 0 }]);
    const step = stepStartZ(land, 0, 20);
    const tile = { x: 20, z: step - 1 };
    const bare = terrainSurfacesFor(request(null, 640, land));
    const stood = terrainSurfacesFor(request(null, 640, land, [], [`${tile.x},${tile.z}`]));
    const inTile = (quads: ReturnType<typeof quadsOf>) =>
      quads.filter(
        (quad) =>
          quad.x0 >= tile.x * TILE && quad.x1 <= (tile.x + 1) * TILE && quad.z1 > tile.z * TILE,
      );
    // Sloped, the tile's own ground is cut back from the step; square, its top
    // reaches the tile's own edge and the drop is put back as a wall.
    const sloped = inTile(quadsOf(bare.risers.grass!));
    const walls = inTile(quadsOf(stood.risers.grass!));
    expect(sloped.length).toBeGreaterThan(0);
    expect(walls.length).toBeGreaterThan(0);
    expect(Math.max(...walls.map((quad) => quad.z1))).toBe((tile.z + 1) * TILE);
    // Every one of them upright: no extent in x or none in z.
    for (const wall of walls) {
      expect((wall.x1 - wall.x0) * (wall.z1 - wall.z0)).toBe(0);
    }
    // The top is one quad spanning the whole tile rather than the six a sloped
    // tile's flat parts merge into.
    const top = inTile(quadsOf(stood.ground.grass!)).filter(
      (quad) => quad.z0 === tile.z * TILE && quad.x0 === tile.x * TILE,
    );
    expect(top).toHaveLength(1);
    expect({ x: top[0]!.x1 - top[0]!.x0, z: top[0]!.z1 - top[0]!.z0 }).toEqual({
      x: TILE,
      z: TILE,
    });
  });

  it('stands the wall under a building upright, on the rim the slopes use', () => {
    // A square tile and a sloped one meet along the rim every tile is drawn
    // against, so nothing has to be closed between them.
    const land = terraced([{ level: 1, inset: 8, wave: 0 }]);
    const step = stepStartZ(land, 0, 20);
    const { risers } = terrainSurfacesFor(request(null, 640, land, [], [`20,${step - 1}`]));
    const face = quadsOf(risers.grass!).filter(
      (quad) => quad.x0 >= 20 * TILE && quad.x1 <= 21 * TILE && quad.z0 === step * TILE,
    );
    // The step's own face, across the whole tile at the tile's own edge — where
    // a sloped tile would have put a ramp three eighths of a tile back from it.
    // A rim is walked in three segments a side, so it is three quads end to end.
    expect(face.length).toBeGreaterThan(0);
    expect(Math.min(...face.map((quad) => quad.x0))).toBe(20 * TILE);
    expect(Math.max(...face.map((quad) => quad.x1))).toBe(21 * TILE);
    for (const quad of face) expect(quad.z1).toBe(step * TILE);
    // And it faces the ground it holds up: out to sea, which is +z.
    const acrossX = normalsOf(risers.grass!).filter((normal) => Math.abs(normal.z) > 0.99);
    expect(acrossX.length).toBeGreaterThan(0);
    for (const normal of acrossX) {
      expect({ upright: Math.abs(normal.y) < 1e-6, z: normal.z }).toEqual({ upright: true, z: 1 });
    }
  });

  it('winds every quad to agree with the normal it carries', () => {
    const { ground: terraces, risers } = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    for (const surface of [terraces.grass!, risers.grass!]) {
      for (let quad = 0; quad < surface.quadCount; quad++) {
        expect({ quad, agrees: windingAgreesWithNormal(surface, quad) }).toEqual({
          quad,
          agrees: true,
        });
      }
    }
  });

  it('turns a slope to face the lower ground beside it', () => {
    // The land climbs inland, so every step's face looks out to sea: +z.
    const { risers } = terrainSurfacesFor(request(null, 640, terraced()));
    const acrossX = normalsOf(risers.grass!).filter((normal) => normal.z !== 0);
    expect(acrossX.length).toBeGreaterThan(0);
    for (const normal of acrossX) expect(normal.z).toBeGreaterThan(0);
  });

  it('turns a slope round where the land falls away inland instead', () => {
    const knoll = terraced([
      { level: 1, inset: 8, wave: 0 },
      { level: 0, inset: 16, wave: 0 },
    ]);
    const { risers } = terrainSurfacesFor(request(null, 640, knoll));
    const facings = new Set(
      normalsOf(risers.grass!)
        .filter((normal) => normal.z !== 0)
        .map((normal) => Math.sign(normal.z)),
    );
    // One step up out of the sea and one back down behind it, facing opposite ways.
    expect([...facings].toSorted()).toEqual([-1, 1]);
  });

  it('spans each bench from one step to the next, with no gap between them', () => {
    const { ground: terraces, risers } = terrainSurfacesFor(request(null, 640, terraced()));
    // The western strip of the column: the merged benches, and the western
    // third of each tile that gives up its edge to a slope.
    const column = [...quadsOf(terraces.grass!), ...quadsOf(risers.grass!)]
      .filter((quad) => quad.x0 === 320)
      .toSorted((a, b) => a.z0 - b.z0);
    // Two benches and the slopes off them, laid end to end with nothing between:
    // each patch starts exactly where the one behind it stopped.
    expect(column.length).toBeGreaterThan(2);
    for (const [index, quad] of column.slice(1).entries()) {
      expect({ index, z0: quad.z0 }).toEqual({ index, z0: column[index]!.z1 });
    }
    const heights = column.map((quad) => quad.y);
    expect(heights).toContain(levelHeight(2));
    expect(heights).toContain(levelHeight(1));
  });

  it('closes the slot a wandering step leaves between two columns', () => {
    // A straight step rounds to the same tile in every column and needs no
    // closure; a wandering one steps between columns, and each of those steps is
    // a vertical slot at the boundary the two columns share.
    const straight = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 0 }])),
    );
    const wandering = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    const alongZ = (surface: SurfaceGeometry): number =>
      normalsOf(surface).filter((normal) => normal.x !== 0).length;
    expect(alongZ(straight.risers.grass!)).toBe(0);
    expect(alongZ(wandering.risers.grass!)).toBeGreaterThan(0);
  });

  it('never lets a slope span more than one level, whichever way it falls', () => {
    const wandering = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    // Every slope stays inside the tile it was cut into and falls exactly one
    // level: a face deeper than a level would mean two steps had been allowed to
    // meet, and one wider than a tile would mean it had spilled onto the ground
    // below the step.
    const risers = wandering.risers.grass!;
    for (const quad of quadsOf(risers)) {
      expect({ x: quad.x1 - quad.x0 <= TILE, z: quad.z1 - quad.z0 <= TILE }).toEqual({
        x: true,
        z: true,
      });
    }
    const ys: number[] = [];
    for (let quad = 0; quad < risers.quadCount; quad++) {
      for (let corner = 0; corner < 4; corner++) {
        ys.push(risers.positions[(quad * 4 + corner) * 3 + 1]!);
      }
    }
    expect(new Set(ys)).toEqual(new Set([0, levelHeight(1)]));
  });

  it('keeps every bench clear of the sand, column by column', () => {
    // `elevationFor` refuses a step that cuts into the beach; this is the same
    // invariant seen from the geometry, with a coast that wanders under it. A
    // bench overlapping the sand would draw grass over the beach.
    const coast: ShoreSpec = { inset: 20, beach: 6, wave: 3, seed: 1 };
    const wandering = shore({ wave: 3 });
    const withCoast = terraced(
      [
        { level: 1, inset: 10, wave: 2 },
        { level: 2, inset: 20, wave: 2 },
      ],
      coast,
    );
    const { ground: terraces } = terrainSurfacesFor(request(wandering, 640, withCoast));
    const quads = quadsOf(terraces.grass!).filter((quad) => quad.x0 >= 0 && quad.x1 <= 40 * TILE);
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) {
      const tileX = quad.x0 / TILE;
      const grass = (waterStartZ(wandering, tileX) - 6) * TILE;
      expect({ tileX, past: quad.z1 > grass }).toEqual({ tileX, past: false });
    }
  });

  it('draws a bench of sand on the sand mesh and a bench of grass on the grass one', () => {
    // A dune is sand four metres up. Drawn on the grass mesh it is a lawn where
    // the beach should have carried on, which is the whole reason the two are
    // separate surfaces.
    const dune = terraced([
      { level: 1, inset: 8, wave: 0, surface: 'sand' },
      { level: 2, inset: 16, wave: 0 },
    ]);
    const { ground: terraces, risers } = terrainSurfacesFor(request(null, 640, dune));
    // The sand carries its own lift wherever it is, dune or beach: see
    // `SAND_LEVEL`, which is what keeps the beach over the water. Compared as
    // floats, because the heights have been through a Float32Array.
    for (const quad of quadsOf(terraces.sand!)) {
      expect(quad.y).toBeCloseTo(levelHeight(1) + SAND_LEVEL, 5);
    }
    expect(new Set(quadsOf(terraces.grass!).map((quad) => quad.y))).toEqual(
      new Set([levelHeight(2)]),
    );
    // A riser is made of the bench above it: the dune's own face is sand, the
    // cut up to the lawn behind it is not.
    expect(risers.sand).not.toBeNull();
    expect(risers.grass).not.toBeNull();
  });

  it('runs the terraces past the plot, the way the beach runs past it', () => {
    const { ground: terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const quads = quadsOf(terraces.grass!);
    expect(Math.min(...quads.map((quad) => quad.x0))).toBeLessThan(0);
    expect(Math.max(...quads.map((quad) => quad.x1))).toBeGreaterThan(40 * TILE);
  });
});

/** A two-tile channel down the middle of a flat inland plot. */
const channel = (): TerrainEdit[] =>
  Array.from({ length: 8 }, (_, row) => row + 4).flatMap((tileZ) => [
    { tileX: 20, tileZ, level: 0, surface: 'water' as const },
    { tileX: 21, tileZ, level: 0, surface: 'water' as const },
  ]);

describe('ground that was dug rather than grown', () => {
  it('draws a river on its own mesh, not on the sea', () => {
    const { water, sea } = terrainSurfacesFor(request(null, 640, null, channel()));
    expect(water?.quadCount).toBeGreaterThan(0);
    expect(sea).toBeNull();
  });

  it('lays the river flush with the ground it was cut into', () => {
    // Flush, and not dug: paving stands at the tile's own level, so a sunken
    // river would carry a sunken bridge. See `layout/domain/terrain.ts`.
    const { water } = terrainSurfacesFor(request(null, 640, null, channel()));
    for (const quad of quadsOf(water!)) expect(quad.y).toBeCloseTo(SEA_LEVEL, 5);
  });

  it('merges the channel into one quad per column, however long it is', () => {
    const { water } = terrainSurfacesFor(request(null, 640, null, channel()));
    // Eight rows in each of two columns, and two quads rather than sixteen. A
    // straight-sided channel has no diagonal in it, so nothing is mitred: its
    // corners are square because they were painted square.
    expect(water!.quadCount).toBe(2);
  });

  it('mitres the grass beside a staircase and never the water itself', () => {
    // The rule that keeps a lake honest: the stronger ground takes the corner,
    // so the water covers every tile the brush painted and half a tile more at
    // each step of the staircase. Both directions at once is what used to leave
    // a spike and a notch either side of the point they shared.
    const stair: TerrainEdit[] = [
      { tileX: 20, tileZ: 4, level: 0, surface: 'water' },
      { tileX: 21, tileZ: 4, level: 0, surface: 'water' },
      { tileX: 21, tileZ: 5, level: 0, surface: 'water' },
      { tileX: 22, tileZ: 5, level: 0, surface: 'water' },
    ];
    const { water } = terrainSurfacesFor(request(null, 640, null, stair));
    // Four whole tiles, and the two grass tiles at the steps giving up a corner.
    expect(areaOf(water!)).toBeCloseTo(4 * TILE * TILE + (2 * (TILE * TILE)) / 2, 3);
  });

  it('keeps the sea to itself: a river reaching it is still two surfaces', () => {
    const coast = shore();
    const mouth: TerrainEdit[] = [{ tileX: 20, tileZ: 10, level: 0, surface: 'water' }];
    const { water, sea } = terrainSurfacesFor(request(coast, 640, null, mouth));
    expect(water?.quadCount).toBe(1);
    expect(sea?.quadCount).toBeGreaterThan(0);
  });

  it('banks a lake on a terrace in earth rather than in water', () => {
    // A vertical sheet of river would read as a blue wall, so the face of a
    // channel is the ground it was cut through.
    const lake: TerrainEdit[] = [{ tileX: 20, tileZ: 2, level: 2, surface: 'water' }];
    const { risers, water } = terrainSurfacesFor(request(null, 640, terraced(), lake));
    expect(water?.quadCount).toBe(1);
    // The lake stands a hair above its own bench, so its own edges contribute no
    // riser; what is drawn is the bench's own step, in earth.
    expect(risers.grass).not.toBeNull();
    expect(risers.sand).toBeNull();
  });

  it('draws an island standing out of the bay, with its own risers', () => {
    const coast = shore();
    const water = waterStartZ(coast, 20);
    const island: TerrainEdit[] = [{ tileX: 20, tileZ: water + 2, level: 1, surface: 'sand' }];
    const bare = terrainSurfacesFor(request(coast, 640, null, []));
    const raised = terrainSurfacesFor(request(coast, 640, null, island));
    // One more patch of sand than the bare bay had, and the risers that hold it
    // up out of the water, which a flat coast has none of.
    expect(raised.ground.sand!.quadCount).toBe(bare.ground.sand!.quadCount + 1);
    expect(bare.risers.sand).toBeNull();
    expect(raised.risers.sand!.quadCount).toBeGreaterThan(0);
  });

  it('stands the island on its own level, above the water around it', () => {
    const coast = shore();
    const water = waterStartZ(coast, 20);
    const island: TerrainEdit[] = [{ tileX: 20, tileZ: water + 2, level: 1, surface: 'sand' }];
    const { ground } = terrainSurfacesFor(request(coast, 640, null, island));
    const standing = quadsOf(ground.sand!).filter((quad) => quad.y > levelHeight(1) - 1);
    expect(standing).toHaveLength(1);
    expect(standing[0]!.y).toBeCloseTo(levelHeight(1) + SAND_LEVEL, 5);
  });

  it('fills the corner where two tiles of water only touch diagonally', () => {
    // The cut cuts both ways: the grass between two tiles that meet at a point
    // gives its own corner up to the water, so a channel running across the grid
    // comes out as one continuous diagonal rather than a chain of squares.
    const diagonal: TerrainEdit[] = [
      { tileX: 20, tileZ: 4, level: 0, surface: 'water' },
      { tileX: 21, tileZ: 5, level: 0, surface: 'water' },
    ];
    const { water } = terrainSurfacesFor(request(null, 640, null, diagonal));
    // Two whole tiles — each has grass on all four sides and so no one corner to
    // cut — and a half tile from each of the two grass tiles between them.
    expect(water!.quadCount).toBe(4);
    const halves = quadsOf(water!).filter(
      (quad) => !(quad.x0 === 20 * TILE && quad.z0 === 4 * TILE),
    );
    expect(new Set(halves.map((quad) => `${quad.x0 / TILE},${quad.z0 / TILE}`))).toContain('21,4');
  });

  it('draws an island raised out in the bay, past the plot itself', () => {
    // The apron: the ground an edit may touch runs a plot's width past the plot,
    // so an island can stand well out to sea. See `layout/domain/terrain.ts`.
    const coast = shore();
    const island: TerrainEdit[] = [{ tileX: 20, tileZ: 45, level: 1, surface: 'sand' }];
    const { ground, risers } = terrainSurfacesFor(request(coast, 640, null, island));
    const standing = quadsOf(ground.sand!).filter((quad) => quad.z0 >= 45 * TILE);
    expect(standing).toHaveLength(1);
    expect(standing[0]!.y).toBeCloseTo(levelHeight(1) + SAND_LEVEL, 5);
    expect(risers.sand).not.toBeNull();
  });

  it('turns a beach tile to grass when that is what it was painted', () => {
    const coast = shore();
    const bare = terrainSurfacesFor(request(coast));
    const turfed = terrainSurfacesFor(
      request(coast, 640, null, [
        { tileX: 20, tileZ: waterStartZ(coast, 20) - 3, level: 0, surface: 'grass' },
      ]),
    );
    // The band in that column is cut in two by a tile that is no longer sand,
    // so the merged run becomes two runs.
    const inColumn = (surfaces: ReturnType<typeof terrainSurfacesFor>): number =>
      quadsOf(surfaces.ground.sand!).filter((quad) => quad.x0 === 20 * TILE).length;
    expect(inColumn(bare)).toBe(1);
    expect(inColumn(turfed)).toBe(2);
  });
});
