import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { writeMatrices } from '../../fireworks/adapters/fireworksField';
import {
  createFlameBuffer,
  kindle,
  MAX_FLAMES,
  tend,
  writeFlames,
  type Burning,
  type Hearth,
} from '../domain/flames';

// A backgrounded tab reports its whole absence as one frame.
const MAX_STEP = 0.1;

export interface FlamesField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  // The hearths to burn now; any other still alight burns down.
  burn(hearths: readonly Hearth[]): void;
  advance(dt: number): void;
  clear(): void;
  dispose(): void;
}

// Unlit, as the tiki torch's flame is; a flame dies by shrinking, never by transparency.
function flameMesh(geometry: BoxGeometry, material: MeshBasicNodeMaterial): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, MAX_FLAMES);
  mesh.name = 'flames';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Made up front: the shader is built on the first draw, and one built without them never reads them.
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 3), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  return mesh;
}

export function buildFlamesField(): FlamesField {
  const group = new Group();
  group.name = 'flames';
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicNodeMaterial();
  const mesh = flameMesh(geometry, material);
  group.add(mesh);
  const flames = createFlameBuffer();
  const triangles = (geometry.getIndex()?.count ?? geometry.attributes.position!.count) / 3;
  const fires = new Map<string, Burning>();
  const drawn: Burning[] = [];
  let seconds = 0;

  return {
    group,
    get drawCalls() {
      return mesh.visible ? 1 : 0;
    },
    get triangleCount() {
      return mesh.visible ? triangles * mesh.count : 0;
    },
    burn(hearths) {
      kindle(fires, hearths);
    },
    // Burns on while the resort is paused, like the lanterns and the fireworks.
    advance(dt) {
      if (fires.size === 0 && !mesh.visible) return;
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      seconds += step;
      tend(fires, step, drawn);
      const count = writeFlames(drawn, seconds, flames);
      writeMatrices(mesh, flames, count);
      mesh.count = count;
      mesh.visible = count > 0;
    },
    clear() {
      fires.clear();
      mesh.visible = false;
      mesh.count = 0;
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
