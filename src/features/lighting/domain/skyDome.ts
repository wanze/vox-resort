import { mixColor, smoothstep, type SkyState, type Vector3 } from './dayNight';

// The sine of the elevation where the gradient has reached the zenith colour.
export const ZENITH_REACH = 0.6;
// About 3.6 degrees across, seven times the real sun: a true-size disc is a dot on a phone.
export const DISC_COS = 0.9995;
export const DISC_SOFT = 0.0004;
export const HALO_POWER = 12;
export const HALO_STRENGTH = 0.45;
export const BAND_POWER = 3;
// The sine of the elevation the dusk band has faded out by.
export const BAND_HEIGHT = 0.18;

const channelsOf = (color: number): [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff,
];

const colorOf = ([r, g, b]: readonly number[]): number =>
  ((Math.round(r!) << 16) | (Math.round(g!) << 8) | Math.round(b!)) >>> 0;

// The dot of the two directions' horizontal parts, normalised: how far round towards the sun.
function alongSun(direction: Vector3, sun: Vector3): number {
  const look = Math.hypot(direction.x, direction.z);
  const towards = Math.hypot(sun.x, sun.z);
  if (look === 0 || towards === 0) return 0;
  return Math.max(0, (direction.x * sun.x + direction.z * sun.z) / (look * towards));
}

// The shader does the same sums in linear colour, so mid-gradient tones differ by a few levels.
export function skyColourAt(sky: SkyState, direction: Vector3): number {
  if (direction.y <= 0) return sky.skyColor;
  const base = mixColor(sky.skyColor, sky.zenithColor, smoothstep(0, ZENITH_REACH, direction.y));
  const sun = sky.sunDirection;
  const facing = Math.max(0, direction.x * sun.x + direction.y * sun.y + direction.z * sun.z);
  const halo = facing ** HALO_POWER * HALO_STRENGTH * sky.sunGlow;
  const fade = 1 - smoothstep(0, BAND_HEIGHT, direction.y);
  const band = sky.dusk * alongSun(direction, sun) ** BAND_POWER * fade;
  const disc = smoothstep(DISC_COS - DISC_SOFT, DISC_COS, facing) * sky.sunGlow;
  const sunLight = channelsOf(sky.sunColor);
  const glowing = channelsOf(base).map((channel, index) =>
    Math.min(255, channel + sunLight[index]! * (halo + band)),
  );
  return mixColor(colorOf(glowing), sky.sunColor, disc);
}
