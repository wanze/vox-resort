import { RenderTarget, UnsignedByteType } from 'three/webgpu';
import type { Camera, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import { tightRows, type PhotoPixels, type PhotoSize } from '../domain/photoPixels';

export interface PhotoCapture {
  // Any camera at any size, so a guest's own snapshot can be taken too; one GPU round trip each.
  capture(scene: Scene, camera: Camera, size: PhotoSize): Promise<PhotoPixels>;
}

const ASPECT_SLACK = 0.01;

const isPerspective = (camera: Camera): camera is PerspectiveCamera =>
  (camera as PerspectiveCamera).isPerspectiveCamera === true;

const bottomUp = (renderer: WebGPURenderer): boolean =>
  (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;

// Three refreshes the lights' uniforms once per animation frame, not per render, so a capture
// that moved the sun or the ambient would be lit as the frame was. Internal to Three.js: without
// it the picture keeps the frame's light rather than breaking.
function nextNodeFrame(renderer: WebGPURenderer): void {
  const nodes = Reflect.get(renderer, '_nodes') as { nodeFrame?: { update(): void } } | undefined;
  nodes?.nodeFrame?.update();
}

// An output target, not a plain one: three then still runs its output pass, the sRGB encode and
// the multisample resolve, into it. Not sRGB-typed itself, or the encode would happen twice.
export function createPhotoCapture(renderer: WebGPURenderer): PhotoCapture {
  return {
    async capture(scene, camera, size) {
      const { width, height } = size;
      if (isPerspective(camera) && Math.abs(camera.aspect / (width / height) - 1) > ASPECT_SLACK) {
        throw new Error(
          `A camera at aspect ${camera.aspect} cannot take a ${width}x${height} photo`,
        );
      }
      const target = new RenderTarget(width, height, { type: UnsignedByteType, depthBuffer: true });
      try {
        const previousOutput = renderer.getOutputRenderTarget();
        const previous = renderer.getRenderTarget();
        try {
          renderer.setOutputRenderTarget(target);
          nextNodeFrame(renderer);
          renderer.render(scene, camera);
        } finally {
          // Again, so a render later in this frame reads the light the caller puts back.
          nextNodeFrame(renderer);
          // Both: render() leaves the output target set as the current one too, and every frame
          // after would draw into this disposed target instead of the canvas.
          renderer.setOutputRenderTarget(previousOutput);
          renderer.setRenderTarget(previous);
        }
        const bytes = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        return { width, height, data: tightRows(bytes, width, height, bottomUp(renderer)) };
      } finally {
        target.dispose();
      }
    },
  };
}
