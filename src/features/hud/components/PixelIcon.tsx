import { pixelArt, type PixelArt } from '../domain/pixelArt';
import { ICONS, INKS, type IconName } from './pixelIcons';

const ART = Object.fromEntries(
  Object.entries(ICONS).map(([name, rows]) => [name, pixelArt(rows)]),
) as { readonly [name in IconName]: PixelArt };

export interface PixelIconProps {
  readonly name: IconName;
  // Whole numbers only: anything else lands pixels between screen pixels and blurs them.
  readonly scale?: number;
}

export function PixelIcon({ name, scale = 2 }: PixelIconProps) {
  const art = ART[name];
  return (
    <svg
      className="pixel-icon"
      width={art.width * scale}
      height={art.height * scale}
      viewBox={`0 0 ${art.width} ${art.height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {art.runs.map((run) => (
        <rect
          key={`${run.x},${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={INKS[run.ink]}
        />
      ))}
    </svg>
  );
}
