import { PixelIcon } from './PixelIcon';

export interface CostProps {
  readonly amount: number;
}

export function Cost({ amount }: CostProps) {
  return (
    <span className="ui-cost">
      <PixelIcon name="money" scale={1} />
      {amount.toLocaleString('en-US')}
    </span>
  );
}
