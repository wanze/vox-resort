import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import { capacityFor } from '../domain/spatialChunks';

export interface GroundQuadsOptions {
  readonly name: string;
  readonly size: number;
  readonly opacity: number;
  readonly renderOrder: number;
}

export interface GroundQuads {
  readonly group: Group;
  readonly mesh: InstancedMesh;
  // Grows the buffers when they are too small, dropping what was written to them.
  fit(count: number): void;
  dispose(): void;
}

export function buildGroundQuads(options: GroundQuadsOptions): GroundQuads {
  const group = new Group();
  group.name = options.name;

  const geometry = new PlaneGeometry(options.size, options.size);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    opacity: options.opacity,
  });

  // The colour attribute is made up front: the material's shader is built on the first draw, and
  // one built without instance colours would never read them.
  const createMesh = (capacity: number): InstancedMesh => {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = options.name;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    mesh.renderOrder = options.renderOrder;
    return mesh;
  };

  let mesh = createMesh(capacityFor(0));
  group.add(mesh);

  return {
    group,
    get mesh() {
      return mesh;
    },
    fit(count) {
      const capacity = capacityFor(count, mesh.instanceMatrix.count);
      if (capacity !== mesh.instanceMatrix.count) {
        const previous = mesh;
        mesh = createMesh(capacity);
        group.remove(previous);
        previous.dispose();
        group.add(mesh);
      }
      mesh.count = count;
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
