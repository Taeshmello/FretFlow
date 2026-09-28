import { percentile, type Sample } from '../bench/latency';

interface StatsProps {
  samples: readonly Sample[];
  conditions: string;
  buildMs: number | null;
}

function format(value: number): string {
  return Number.isNaN(value) ? '—' : `${value.toFixed(1)}ms`;
}

export function Stats({ samples, conditions, buildMs }: StatsProps) {
  const totals = samples.map(s => s.total);
  const renders = samples.map(s => s.render);

  return (
    <aside className="stats">
      <table>
        <thead>
          <tr>
            <th />
            <th>p50</th>
            <th>p95</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>키→화면</th>
            <td className="headline">{format(percentile(totals, 50))}</td>
            <td className="headline">{format(percentile(totals, 95))}</td>
          </tr>
          <tr>
            <th>키→렌더완료</th>
            <td>{format(percentile(renders, 50))}</td>
            <td>{format(percentile(renders, 95))}</td>
          </tr>
        </tbody>
      </table>
      <p className="meta">표본 {samples.length} / 100</p>
      {buildMs !== null && <p className="meta">악보 생성 {buildMs.toFixed(1)}ms</p>}
      <p className="meta conditions">{conditions}</p>
    </aside>
  );
}
