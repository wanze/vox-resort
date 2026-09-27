import { Spherical, Vector3, type Camera } from 'three/webgpu';
import { driftedOrbit, type Orbit } from '../domain/cameraDrift';

export interface CameraDrift {
  advance(elapsedSeconds: number): void;
}

// Takes the camera over from the controls: they must be disabled and not updated while it runs.
export function startCameraDrift(camera: Camera, target: Vector3): CameraDrift {
  const offset = new Vector3().subVectors(camera.position, target);
  const framed = new Spherical().setFromVector3(offset);
  const base: Orbit = { radius: framed.radius, polar: framed.phi, azimuth: framed.theta };
  const spherical = new Spherical();
  let seconds = 0;

  return {
    advance(elapsedSeconds) {
      seconds += elapsedSeconds;
      const orbit = driftedOrbit(base, seconds);
      spherical.set(orbit.radius, orbit.polar, orbit.azimuth);
      camera.position.copy(target).add(offset.setFromSpherical(spherical));
      camera.lookAt(target);
    },
  };
}
