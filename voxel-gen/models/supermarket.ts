/**
 * Resort minimarket: a whitewashed shop under a flat slate roof, with a produce
 * bay under a red blind at one end of its front, a glazed shopfront cut into
 * the other, a lit sign on the fascia over the doors, and a plant room and a
 * potted palm on the roof deck.
 * 64x48x23 (16x12 m plot, a 15x8 m shop 3 m to the cornice and 4.75 m to the
 * top of the parapet), a 4x3 tile. The shopfront faces +z.
 *
 * Massing and dressing from `docs/references/supermarket.jpg` — the parapet and
 * the plant standing on the roof, the fascia band with its sign, the blind, the
 * crates stacked against the front and the cabinet at the end of them — and
 * from `market-kiosk.jpg` for the crates and the blind over them. Colour comes
 * from `villa.jpg`, which is the lane the resort is held against: the shop's
 * cream, stone and slate are the game hall's, because the two are the same
 * resort's amenities under the same flat roof.
 *
 * The model it replaces was drawn before the palette and before the parts. It
 * painted eighteen private colours, and it had the dithering fault three times
 * over — a storefront highlighted `(x + y) % 4` across a 56x14 pane, a blind
 * whose front lip alternated `x % 2` over 62 voxels, and five crates that laid
 * their fruit `(dx + dz + i) % 3` across a 4x4 top. Those three surfaces were
 * three quarters of the whole model's triangles — the largest share of a model
 * yet, and the same trade the restaurant and the beach club made. Flattening
 * them alone takes the model from 1 576 triangles to 372; about a third of that
 * went straight back out on the geometry below, and `pnpm bench` reads the
 * balance as 6 624 triangles off the overview frame over nine placements.
 *
 * It also used no parts at all — one flat cream box with the storefront painted
 * onto it, and a roof slab with a one-voxel edge line. The box is a
 * `stuccoWall` on a `plinth` under a `flatRoof` now, so the shop has the
 * skirting, quoins and cornice every other building in the lane wears, and the
 * openings are cut a voxel into it rather than painted on. It stays solid: a
 * cavity gets its own inside surface, and what a flat box needs is geometry
 * outside it rather than a room nobody can see into.
 *
 * The front is deliberately not symmetrical, which is the reference read
 * straight: a shop puts its produce out under a blind at one end and glazes the
 * rest. Nothing is glazed behind the blind, and that is the pergola lesson
 * applied rather than repeated — a canopy over the shopfront is a canopy over
 * the thing the pass was for, so it goes where what is under it is meant to be
 * in shade.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The shop: 15 x 8 m, set back to leave an apron for the produce and trolleys. */
const BODY = { x: 2, z: 3, w: 60, d: 32 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;
const BACK = BODY.z;

/**
 * The produce bay: the stretch of front the blind covers, and the only stretch
 * left solid. The reference stands its crates against blank wall for the same
 * reason this does — a blind reaching a metre out takes rather more than half
 * a metre off the bottom of whatever is behind it at 30 degrees, so the one
 * place to put it is over the thing that wants shade rather than over the
 * glazing.
 */
const PRODUCE = { x: 4, w: 18 } as const;

/** The doors, and the two shopfront panes to the right of them. */
const DOOR = { along: 22, w: 8, h: 9 } as const;
const PANES = [32, 46] as const;
const PANE = { w: 12, h: 8 } as const;

/**
 * The fascia: a band standing one voxel proud of the wall under the roof's
 * oversail, which is where the reference carries its sign.
 *
 * A course rather than a colour painted on the render. Both are one flat
 * rectangle to the mesher, so the difference is free, and only one of them
 * throws the line of shadow that makes a shopfront read as a shopfront.
 */
const FASCIA = { y: 13, y1: 14 } as const;

/** The sign case on the fascia, centred over the doors. */
const SIGN_CASE = { x: 20, x1: 35 } as const;

/**
 * The one colour that burns after dark.
 *
 * The same `amber.light` the game hall's sign box is, because the two are the
 * same fitting on the same street, and spent in the same one place: the panel
 * over the doors and nothing else. A shop with a glow on every surface is a
 * shop at noon.
 *
 * It is not free, and the price is known rather than guessed: `emissive` splits
 * a second geometry off every placement, so a shop that stands on the plot nine
 * times costs nine draw calls, and the lamp below costs nine anchors for the
 * night bake. Measured, that is exactly what it came to — 579 calls and 466
 * lamps before the pass, 588 and 475 after — which is what the beach club's bar
 * lantern cost for the same reason. It is bought against the 6 624 triangles
 * the same pass took off the frame, and because a lit sign is what tells an
 * amenity from a house down an unlit street: the alternative is the resort's
 * only shop being the one dark building at the hour it is most obviously open.
 */
const SIGN = PALETTE.amber.light;

export default defineModel({
  id: 'supermarket',
  label: 'Supermarket',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [SIGN],
  windows: WINDOW_GLASS,
  /**
   * One lamp, on the apron under the sign rather than inside the shop.
   *
   * The body is solid, so there is no room to light: what a shop offers the
   * street after dark is the spill over its own forecourt, across the doors,
   * the crates and the trolleys. One is enough for a 15 m front from 2 m up.
   */
  lights: [{ x: 26, y: 12, z: 38, color: SIGN, intensity: 90, distance: 50 }],
  venue: {
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 0.8 },
      { need: 'thirst', amount: 0.8 },
    ],
    capacity: 20,
    dwellSeconds: { min: 480, max: 1200 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, slate, stone, teak, terracotta, water } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 48 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    /**
     * The roof: the game hall's, at the game hall's two courses of parapet and
     * one voxel of oversail, because the two are the resort's two flat-roofed
     * amenities and they should be recognisably the same roof.
     *
     * A deeper parapet was tried first, on the argument that this shop is half
     * as wide again as that hall on the same one storey. Four courses read as a
     * grey crown: from a camera looking down at 30 degrees a parapet is seen
     * almost edge-on while the deck behind it is seen almost flat, so every
     * course added to it takes a slice off the elevation and gives it to the
     * lid. Two is the depth at which the roof still has an edge and the
     * shopfront still has the building.
     */
    const OVERHANG = 1;
    const deck = eaves + 1;
    flatRoof(b, { ...BODY, y: eaves, overhang: OVERHANG, parapet: 2, cover: slate });

    // The shopfront. Two panes and the doors between the produce bay and the
    // right-hand corner, each cut a voxel into the render so the reveal throws
    // its own shadow — the model this replaces painted a 56x14 sheet of glass
    // flat onto the wall and highlighted it in a checker, which read as a
    // sticker from every angle and cost more triangles than the hotel's walls.
    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: DOOR.along,
      y: ground,
      w: DOOR.w,
      h: DOOR.h,
      // Glazed doors, which is what a shop has: `doorway` frames whatever leaf
      // it is handed, so the glass ramp makes the same part a shopfront door.
      timber: glass,
    });
    for (const along of PANES) {
      shutteredWindow(b, {
        face: 'z+',
        at: FRONT,
        along,
        y: ground + 1,
        w: PANE.w,
        h: PANE.h,
        shutters: false,
      });
    }

    // Windows down both flanks and along the back, big ones, for the same
    // reason the game hall has them: this elevation is 8 m of blank render
    // otherwise, and three sides of the shop are seen from the street.
    for (const along of [9, 22]) {
      for (const [face, at] of [
        ['x-', LEFT],
        ['x+', RIGHT],
      ] as const) {
        shutteredWindow(b, { face, at, along, y: ground + 3, w: 8, h: 7, shutters: false });
      }
    }
    // The back is the service side: a door for deliveries and one window over
    // the stockroom, and nothing else. The reference's back wall is plain.
    doorway(b, { face: 'z-', at: BACK, along: 12, y: ground, w: 5, h: 8, timber: teak });
    shutteredWindow(b, {
      face: 'z-',
      at: BACK,
      along: 38,
      y: ground + 4,
      w: 8,
      h: 6,
      shutters: false,
    });

    // The fascia, and the sign case standing on it. Terracotta, because the one
    // warm band on a cream-and-slate box should be the tile the rest of the
    // resort is roofed in rather than a colour this model invents.
    box(PRODUCE.x, RIGHT - 2, FASCIA.y, FASCIA.y1, FRONT + 1, FRONT + 1, terracotta.base);
    box(SIGN_CASE.x, SIGN_CASE.x1, FASCIA.y - 1, FASCIA.y1 + 1, FRONT + 2, FRONT + 2, metal.base);
    box(SIGN_CASE.x + 1, SIGN_CASE.x1 - 1, FASCIA.y, FASCIA.y1, FRONT + 2, FRONT + 2, SIGN);

    // The blind over the produce, drawn by the part this pass wrote. Five
    // voxels of reach is 1.25 m of shade over the crates, and it clears the
    // fascia beneath rather than running the full 15 m front at roof level the
    // way the model it replaces did — that blind stood over the whole
    // shopfront, which is the one elevation the pass is for.
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: PRODUCE.x,
      w: PRODUCE.w,
      y: FASCIA.y - 1,
      reach: 5,
      drop: 2,
      canvas: bloom,
    });

    /**
     * The roof deck: a plant room and a plant.
     *
     * The field of a flat roof is a third of what the resort ever sees of a
     * building this wide, and an empty one is a lid — the game hall's vents are
     * there for the same reason. The potted palm is the reference's own: it
     * stands one plant on the roof of a shop, and at this scale that single
     * green note is what stops the deck reading as poured concrete.
     */
    box(12, 21, deck, deck + 2, 10, 17, slate.shade);
    box(12, 21, deck + 3, deck + 3, 10, 17, metal.base);
    box(38, 43, deck, deck + 1, 22, 27, slate.shade);
    box(38, 43, deck + 2, deck + 2, 22, 27, metal.base);
    pottedPlant(b, { x: 49, z: 27, y: deck, size: 3 });
    // The seams between the deck's bays, which the reference has and a 15 x 8 m
    // sheet of slate badly needs: two courses split one flat field into three,
    // and three rectangles is what they cost. This is the line the dithering
    // rule draws — a course across a surface is geometry the mesher keeps, a
    // grid painted cell by cell over the same surface is what it cannot.
    for (const x of [22, 42]) box(x, x, eaves, eaves, BODY.z, FRONT, slate.shade);

    /**
     * A crate of produce: a slatted timber box with one flat colour of fruit
     * heaped in it.
     *
     * One colour is the whole of the fix. The five crates this replaces each
     * laid three fruits `(dx + dz + i) % 3` across a 4x4 top, which is 16 quads
     * a crate where a flat top is one, and from the height the resort is seen
     * at the three colours were a stipple rather than a display. A crate of
     * apples next to a crate of lemons reads; a crate of confetti does not.
     */
    const crate = (x: number, z: number, y: number, fruit: number): void => {
      box(x, x + 3, y, y + 2, z, z + 3, teak.shade);
      box(x, x + 3, y, y, z, z + 3, teak.deep);
      box(x, x + 3, y + 3, y + 3, z, z + 3, fruit);
    };

    // Stacked two high against the wall and one deep in front of them, the way
    // the reference stacks a market stall, so the bay has a step in it rather
    // than one flat wall of boxes. Two columns rather than three: the bay is
    // 4.5 m of the 15 m front and the cabinet stands at the end of it, and
    // crates run out at the door jamb rather than up to it.
    const FRUIT = [bloom.base, amber.base, foliage.base] as const;
    for (const [i, x] of [5, 10].entries()) {
      crate(x, FRONT + 1, ground, FRUIT[i % FRUIT.length]!);
      crate(x, FRONT + 1, ground + 4, FRUIT[(i + 2) % FRUIT.length]!);
      crate(x, FRONT + 5, ground, FRUIT[(i + 1) % FRUIT.length]!);
    }

    /**
     * The chilled cabinet at the door end of the blind, where the reference
     * stands one: a pale case with a dark top, a glazed door and shelves of
     * drink behind it. Two metres tall rather than the two and a half a real
     * one is, because the blind's valance hangs at 2.5 m and anything that
     * reaches it is a machine seen from the chin down. Pale because the reference's is, and because a case drawn in
     * `metal` — the ramp a fitting reaches for first — is the darkest family in
     * the palette, and a black slab against a cream wall reads as a bin.
     */
    const CABINET = { x: 16, z: FRONT + 1 } as const;
    box(CABINET.x, CABINET.x + 5, ground, ground + 7, CABINET.z, CABINET.z + 3, stone.light);
    box(CABINET.x, CABINET.x + 5, ground + 7, ground + 7, CABINET.z, CABINET.z + 3, metal.shade);
    box(
      CABINET.x + 1,
      CABINET.x + 4,
      ground + 1,
      ground + 6,
      CABINET.z + 3,
      CABINET.z + 3,
      glass.deep,
    );
    for (const y of [ground + 2, ground + 4]) {
      box(CABINET.x + 1, CABINET.x + 4, y, y, CABINET.z + 3, CABINET.z + 3, water.base);
    }

    // The forecourt: a darker apron up to the doors, planting either side of
    // them, and a long box down the edge of the plot.
    box(
      DOOR.along - 2,
      DOOR.along + DOOR.w + 1,
      ground - 1,
      ground - 1,
      FRONT + 1,
      45,
      stone.shade,
    );
    for (const x of [DOOR.along - 5, DOOR.along + DOOR.w + 3]) {
      pottedPlant(b, { x, z: FRONT + 2, y: ground });
    }
    // Both planters are green rather than flowering, which is the beach club's
    // trade at the beach club's scale: `flowerBox` takes its three blooms in
    // turn along the run, so 3 m of them is 12 quads where one flat course is
    // one, and at this length it reads as bunting rather than as planting. The
    // flowering detail the lane puts at an entrance is the two pots, which are
    // where the eye goes anyway.
    for (const x of [4, 32]) {
      flowerBox(b, { x, z: 46, y: ground, w: 14, along: 'x', blooms: [foliage.base] });
    }

    /**
     * The trolley bay: two rails with a nested rank of trolleys between them,
     * out on the apron clear of the doors.
     *
     * Drawn as two flat runs and one flat block rather than as a trolley each,
     * because a trolley at 25 cm a voxel is a smear: what reads from above is
     * the rank, and what tells it from a bench is the rails either side of it.
     */
    for (const z of [39, 45]) box(48, 60, ground, ground + 2, z, z, metal.base);
    box(49, 59, ground, ground + 1, 40, 44, metal.base);
    box(49, 59, ground + 2, ground + 4, 40, 44, slate.light);
    box(49, 59, ground + 5, ground + 5, 44, 44, metal.base);
  },
});
