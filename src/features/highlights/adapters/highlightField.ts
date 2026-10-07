import type { Group } from 'three/webgpu';
import { buildGroundQuads } from '../../rendering/adapters/groundQuads';
import { HIGHLIGHT_COLOURS, ringStripsOf, type HighlightBox } from '../domain/highlights';

// Over the map overlay's 2.1, so a ring is never lost under a tinted path tile.
const HIGHLIGHT_LIFT = 2.2;

const OPACITY = 0.9;

const STRIPS_PER_BOX = 4;

export interface HighlightField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  show(boxes: readonly HighlightBox[]): void;
  widen(width: number): void;
  dispose(): void;
}

export function buildHighlightField(): HighlightField {
  // After the map overlay's 2, so a ring is laid over its tint.
  const quads = buildGroundQuads({ name: 'highlight', size: 1, opacity: OPACITY, renderOrder: 3 });

  let shown: readonly HighlightBox[] = [];
  let ringWidth = 0;

  function writeColours(): void {
    const { mesh } = quads;
    const colours = mesh.instanceColor!.array;
    for (let box = 0; box < shown.length; box++) {
      const hex = HIGHLIGHT_COLOURS[shown[box]!.colour] ?? 0xffffff;
      for (let strip = 0; strip < STRIPS_PER_BOX; strip++) {
        const at = (box * STRIPS_PER_BOX + strip) * 3;
        colours[at] = ((hex >> 16) & 0xff) / 255;
        colours[at + 1] = ((hex >> 8) & 0xff) / 255;
        colours[at + 2] = (hex & 0xff) / 255;
      }
    }
    mesh.instanceColor!.needsUpdate = true;
  }

  function writeMatrices(): void {
    const { mesh } = quads;
    const matrices = mesh.instanceMatrix.array;
    let slot = 0;
    for (const box of shown) {
      for (const strip of ringStripsOf(box, ringWidth)) {
        const at = slot * 16;
        matrices.fill(0, at, at + 16);
        matrices[at] = strip.sizeX;
        matrices[at + 5] = 1;
        matrices[at + 10] = strip.sizeZ;
        matrices[at + 12] = strip.x;
        matrices[at + 13] = box.y + HIGHLIGHT_LIFT;
        matrices[at + 14] = strip.z;
        matrices[at + 15] = 1;
        slot++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Without this the frustum test uses the sphere of the last rings and culls the new ones.
    if (shown.length > 0) mesh.computeBoundingSphere();
  }

  return {
    group: quads.group,
    get drawCalls() {
      return quads.mesh.visible ? 1 : 0;
    },
    get triangleCount() {
      return quads.mesh.visible ? quads.mesh.count * 2 : 0;
    },
    show(boxes) {
      const strips = boxes.length * STRIPS_PER_BOX;
      quads.fit(strips);
      shown = boxes;
      quads.mesh.visible = strips > 0 && ringWidth > 0;
      if (strips === 0) return;
      writeColours();
      if (ringWidth > 0) writeMatrices();
    },
    widen(width) {
      if (width === ringWidth) return;
      ringWidth = width;
      quads.mesh.visible = shown.length > 0 && width > 0;
      if (shown.length > 0) writeMatrices();
    },
    dispose: quads.dispose,
  };
}
