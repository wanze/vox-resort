import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, MeshBasicNodeMaterial } from 'three/webgpu';
import { fieldMeshesFor, slotsFor } from './movingField';

/** A geometry filling one axis-aligned box, which is all the hang ever reads. */
const boxAt = (min: readonly [number, number, number], max: readonly [number, number, number]) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([...min, ...max]), 3));
  geometry.setIndex([0, 1, 0]);
  return geometry;
};

const material = new MeshBasicNodeMaterial();

/** The box a built mesh's geometry ended up in. */
function boxOf(geometry: BufferGeometry): { min: number[]; max: number[] } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return { min: box.min.toArray(), max: box.max.toArray() };
}

describe('fieldMeshesFor', () => {
  it('hangs every surface of a model on the box they share', () => {
    // A balloon's shape: a narrow basket on the ground and a wide envelope over
    // it, with nothing of the one inside the other.
    const [glow, lit] = fieldMeshesFor({
      name: 'balloon',
      members: Int32Array.from([0]),
      surfaces: [
        { kind: 'glow', source: boxAt([-4, 4, -4], [4, 16, 4]), material },
        { kind: 'lit', source: boxAt([-2, 0, -2], [2, 4, 2]), material },
      ],
    });

    // Hung one box at a time, the envelope would have come down onto the foot of
    // its own box and swallowed the basket whole.
    expect(boxOf(lit!.geometry)).toEqual({ min: [-2, 0, -2], max: [2, 4, 2] });
    expect(boxOf(glow!.geometry)).toEqual({ min: [-4, 4, -4], max: [4, 16, 4] });
  });

  it('centres a model across and along and stands it on zero', () => {
    const [part] = fieldMeshesFor({
      name: 'hull',
      members: Int32Array.from([0]),
      surfaces: [{ kind: 'lit', source: boxAt([10, 5, 20], [16, 9, 30]), material }],
    });

    expect(boxOf(part!.geometry)).toEqual({ min: [-3, 0, -5], max: [3, 4, 5] });
  });

  it('draws nothing for a field nobody is in', () => {
    expect(
      fieldMeshesFor({
        name: 'balloon',
        members: Int32Array.from([]),
        surfaces: [{ kind: 'lit', source: boxAt([0, 0, 0], [1, 1, 1]), material }],
      }),
    ).toEqual([]);
  });
});

describe('slotsFor', () => {
  it('takes the members drawn in one model, in field order', () => {
    expect([...slotsFor(Int32Array.from([1, 0, 1, 2]), 4, 1)]).toEqual([0, 2]);
  });
});
