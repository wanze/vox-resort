import type { StatChange } from '../domain/comparison';

export interface StatTableProps {
  readonly stats: readonly StatChange[];
}

const percent = (ratio: number): string => {
  const change = Math.round((ratio - 1) * 100);
  return change === 0 ? '±0%' : `${change > 0 ? '+' : ''}${change}%`;
};

export function StatTable({ stats }: StatTableProps) {
  return (
    <table className="compare-stats">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">Current</th>
          <th scope="col">New</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((stat) => (
          <tr key={stat.name}>
            <th scope="row">{stat.name}</th>
            <td>{stat.original.toLocaleString()}</td>
            <td>{stat.variant.toLocaleString()}</td>
            <td>{percent(stat.ratio)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
