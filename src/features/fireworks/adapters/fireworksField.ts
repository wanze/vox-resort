import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { DARK, showLightAt, type ShowLight } from '../domain/light';
import type { Show } from '../domain/show';
import { createStarBuffer, MAX_INSTANCES, writeStars, type StarBuffer } from '../domain/stars';

// A backgrounded tab reports its whole absence as one frame.
const MAX_STEP = 0.1;

export interface FireworksField {
  readonly group: Group;
  // The run the show belongs to, kept once it has burnt out: the clock may be paused with the run
  // still on, and that run must not be played twice.
  readonly key: string | null;
  readonly show: Show | null;
  readonly playhead: number;
  // A show with launches still to come.
  readonly playing: boolean;
  readonly light: ShowLight;
  readonly drawCalls: number;
  readonly triangleCount: number;
  play(show: Show, from: number, key: string): void;
  // Nothing more is launched; what is in the air burns out.
  stop(): void;
  clear(): void;
  advance(dt: number): void;
  dispose(): void;
}

// Scale on the diagonal and position in the last column; the rest stays the identity it was made.
export function writeMatrices(mesh: InstancedMesh, stars: StarBuffer, count: number): void {
  const matrices = mesh.instanceMatrix.array;
  const colours = mesh.instanceColor!.array;
  for (let index = 0; index < count; index++) {
    const at = index * 16;
    const scale = stars.scale[index]!;
    matrices[at] = scale;
    matrices[at + 5] = scale;
    matrices[at + 10] = scale;
    matrices[at + 12] = stars.x[index]!;
    matrices[at + 13] = stars.y[index]!;
    matrices[at + 14] = stars.z[index]!;
    colours[index * 3] = stars.r[index]!;
    colours[index * 3 + 1] = stars.g[index]!;
    colours[index * 3 + 2] = stars.b[index]!;
  }
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.clearUpdateRanges();
  mesh.instanceColor!.addUpdateRange(0, count * 3);
  mesh.instanceColor!.needsUpdate = true;
}

// Unlit and fogless: a burst over the sea would otherwise be washed into the sky colour. A star
// fades by shrinking and darkening, never by transparency, as the lanterns do.
function starMesh(geometry: BoxGeometry, material: MeshBasicNodeMaterial): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, MAX_INSTANCES);
  mesh.name = 'fireworks';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Made up front: the shader is built on the first draw, and one built without them never reads them.
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 3), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  return mesh;
}

export function buildFireworksField(): FireworksField {
  const group = new Group();
  group.name = 'fireworks';
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicNodeMaterial({ fog: false });
  const mesh = starMesh(geometry, material);
  group.add(mesh);
  const stars = createStarBuffer();
  const triangles = (geometry.getIndex()?.count ?? geometry.attributes.position!.count) / 3;

  let show: Show | null = null;
  let key: string | null = null;
  let playhead = 0;
  let stopAt = Infinity;
  let light: ShowLight = DARK;

  const burntOut = (): void => {
    show = null;
    light = DARK;
    mesh.visible = false;
    mesh.count = 0;
  };

  return {
    group,
    get key() {
      return key;
    },
    get show() {
      return show;
    },
    get playhead() {
      return playhead;
    },
    get playing() {
      return show !== null && playhead < Math.min(stopAt, show.length);
    },
    get light() {
      return light;
    },
    get drawCalls() {
      return mesh.visible ? 1 : 0;
    },
    get triangleCount() {
      return mesh.visible ? triangles * mesh.count : 0;
    },
    play(next, from, playing) {
      show = next;
      key = playing;
      playhead = from;
      stopAt = Infinity;
    },
    stop() {
      stopAt = Math.min(stopAt, playhead);
    },
    clear() {
      burntOut();
      key = null;
    },
    // Plays on while the resort is paused, like the lanterns and the lightning.
    advance(dt) {
      if (!show) return;
      playhead += Math.min(Math.max(dt, 0), MAX_STEP);
      const count = writeStars(show, playhead, stars, stopAt);
      light = showLightAt(show, playhead, stopAt);
      if (count === 0 && playhead >= Math.min(stopAt, show.length)) {
        burntOut();
        return;
      }
      writeMatrices(mesh, stars, count);
      mesh.count = count;
      mesh.visible = count > 0;
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
