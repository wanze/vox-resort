import { PixelIcon, PixelPicture } from '../../../shared/components/PixelIcon';
import { operatorNamed } from '../domain/operators';
import { LOGOS } from './operatorArt';

export interface OperatorLogoProps {
  readonly operator: string;
  readonly scale?: number;
}

// A name no longer listed, from an old save, keeps the desk's own letter rather than no mark.
export function OperatorLogo({ operator, scale = 2 }: OperatorLogoProps) {
  const listed = operatorNamed(operator);
  return (
    <span className="bookings-logo" data-brand={listed?.brand}>
      {listed ? (
        <PixelPicture art={LOGOS[listed.brand]} scale={scale} />
      ) : (
        <PixelIcon name="bookings" scale={scale} />
      )}
    </span>
  );
}
