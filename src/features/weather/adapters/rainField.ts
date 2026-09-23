/**
 * The rain on screen: one `InstancedMesh` of streaks over the camera, rewritten
 * every frame it is raining and never touched on a day it is not.
 *
 * `domain/rainfall.ts` decides where every drop is; this draws them.
 *
 * ## One mesh, sized once, drawn short
 *
 * The pool is allocated at the wettest day's count and `mesh.count` is wound
 * down to whatever the day asks for - so going from rain to storm and back
 * costs a number, not a reallocation, and a clear day costs `visible = false`.
 * It is never culled, for `rendering/adapters/movingField.ts`'s reason: every
 * instance moved this frame, so a bounding sphere would have to be rebuilt this
 * frame to reject anything.
 *
 * ## Every size it draws at comes from the look, and the look comes from the view
 *
 * The streak's length, width and lean, the column it wraps in and how far it
 * falls are all in the `RainfallLook` this is handed, already turned from
 * pixels into voxels by the camera it was asked about. Nothing here knows how
 * big a drop should be; see `domain/rainfall.ts`.
 *
 * ## Not built from a voxel model, unlike everything else that moves
 *
 * The balloons and the boats are art, drawn in `voxel-gen/` and meshed with the
 * catalogue, because they are things somebody designed. A raindrop is not: it is
 * a streak, the way a blob shadow is a disc, and `blobShadowField.ts` builds its
 * own geometry here for exactly this reason. Putting one in the sky registry
 * would also put it in front of `SKY_MODELS`' index, which is what a balloon's
 * `variant` counts along.
 *
 * ## Transparent, and deliberately not sorted
 *
 * Rain that is not see-through is a field of flying white sticks. So the streaks
 * are transparent - and `depthWrite` is off, which is what lets them be drawn in
 * whatever order the buffer happens to hold without the nearer ones punching
 * holes in the farther ones. At this opacity the order two streaks are blended
 * in is not a difference anybody can see, which is the trade the whole feature
 * rests on: one draw call, no sort, no second pass.
 */

import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { dropAt, type DropPose, type RainfallLook, type Raindrops } from '../domain/rainfall';

/**
 * The longest step the rain will take, in seconds.
 *
 * A backgrounded tab reports the time it was away as one frame. The balloons
 * clamp their own step to the same tenth of a second and the crowd to the same
 * again; written out here rather than borrowed, because rain that depended on
 * how fast somebody walks would be a strange thing to have to explain.
 */
const MAX_STEP = 0.1;

/**
 * The pale the streaks are drawn in.
 *
 * A cold near-white rather than a grey: rain reads against the ground it falls
 * on, and the ground under a storm is already slate - see `OVERCAST_GREY`. A
 * grey streak over grey sand is a streak nobody sees.
 *
 * It is the *opacity* that keeps this subtle and not the colour - see
 * `RAINFALL` - because a streak two pixels wide has to be pale-on-dark to
 * register at all, and dimming the colour instead would leave the rain reading
 * as dirt on the lens.
 */
const RAIN_COLOR = 0xcfe0ef;

export interface RainField {
  readonly group: Group;
  /** Draw calls this costs while it is raining; none at all when it is not. */
  readonly drawCalls: number;
  /** Triangles it submitted on the last frame it drew; 0 on a dry one. */
  readonly triangleCount: number;
  /**
   * Moves the rain on by a frame's worth of seconds and writes where every
   * streak ended up.
   *
   * `look` is {@link rainfallFor} on today's weather, or null on a day that
   * draws none - at which the whole write is skipped and the mesh is hidden.
   * `centre` is where the camera is pointed, which is what the column of air
   * being drawn is kept over.
   */
  advance(dt: number, look: RainfallLook | null, centre: DropPose): void;
  dispose(): void;
}

/**
 * One streak, standing on its own bottom end.
 *
 * A unit box hung on its foot rather than its middle, so the instance matrix's
 * Y column is the whole streak: its length *and* the lean the wind gives it,
 * written as three numbers instead of a rotation that would have to be built.
 * See {@link writeStreaks}.
 */
function streakGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/**
 * Writes every drop into the instance buffer.
 *
 * Twelve of a matrix's sixteen numbers, and four of those are the same for every
 * streak in the frame - the width across, and the lean along. The wind's tip is
 * a shear rather than a rotation: the box's Y column is aimed along the fall,
 * which leans the top of the streak downwind and leaves its foot where the drop
 * actually is. A rotation would do the same and would cost a `Matrix4`, a sine
 * and a cosine per drop to say it.
 */
function writeStreaks(
  mesh: InstancedMesh,
  drops: Raindrops,
  seconds: number,
  look: RainfallLook,
  centre: DropPose,
): void {
  const matrices = mesh.instanceMatrix.array;
  const drawn = Math.min(look.drops, drops.count);
  for (let index = 0; index < drawn; index++) {
    const pose = dropAt(drops, index, seconds, look, centre);
    const at = index * 16;
    matrices[at] = look.width;
    matrices[at + 4] = look.leanX;
    matrices[at + 5] = look.length;
    matrices[at + 6] = look.leanZ;
    matrices[at + 10] = look.width;
    matrices[at + 12] = pose.x;
    matrices[at + 13] = pose.y;
    matrices[at + 14] = pose.z;
    matrices[at + 15] = 1;
  }
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Puts a plot's weather in the air over the camera.
 *
 * The pool is whatever the wettest day asks for - `MAX_DROPS`, which the caller
 * sizes it from; a day that wants fewer simply draws fewer of them. Nothing is
 * drawn until the first {@link RainField.advance} says it is raining.
 */
export function buildRainField(drops: Raindrops): RainField {
  const group = new Group();
  group.name = 'rain';

  const geometry = streakGeometry();
  const material = new MeshBasicNodeMaterial({
    color: RAIN_COLOR,
    transparent: true,
    // See the note at the top: no sort, and no holes punched in the streaks
    // behind by the ones in front.
    depthWrite: false,
  });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, drops.count));
  mesh.name = 'rain-streaks';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  group.add(mesh);

  const triangles = (geometry.getIndex()?.count ?? geometry.attributes.position!.count) / 3;
  /** Seconds it has been raining, which is the only state the field keeps. */
  let seconds = 0;

  return {
    group,
    get drawCalls() {
      return mesh.visible ? 1 : 0;
    },
    get triangleCount() {
      return mesh.visible ? triangles * mesh.count : 0;
    },
    advance(dt, look, centre) {
      if (look === null) {
        mesh.visible = false;
        mesh.count = 0;
        return;
      }
      // The clock is not what the rain runs on: it falls while the resort is
      // paused, exactly as the balloons fly and the boats sail, because a
      // stopped clock is somebody looking at the plot and not a stopped world.
      seconds += Math.min(Math.max(dt, 0), MAX_STEP);
      material.opacity = look.opacity;
      mesh.visible = true;
      writeStreaks(mesh, drops, seconds, look, centre);
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
