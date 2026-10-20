import { resiliency, survivalOdds, totalDisks, type PoolConfig } from '../model/topology';
import { fmtPercent, plural } from '../format';

/** The pool's failure tolerance, always stated together with where the failures land. */
export function ResiliencySummary({ config }: { config: PoolConfig }) {
  const r = resiliency(config);
  const unit = config.layout === 'mirror' ? `${config.width}-way mirror` : 'RAIDZ vdev';
  return (
    <ul className="zfs-resiliency" data-testid="resiliency-summary">
      <li className="zfs-resiliency__item zfs-resiliency__item--safe">
        <strong>Any {plural(r.guaranteedSurvivable, 'failed disk')}</strong> — always survived, wherever they are.
        Each {unit} tolerates {r.perVdevTolerance}.
      </li>
      <li className="zfs-resiliency__item zfs-resiliency__item--loss">
        <strong>{plural(r.fewestFailuresThatCanLoseData, 'failure')} in the same vdev</strong> — data lost. That vdev
        fails, and a pool cannot survive losing a top-level vdev.
      </li>
      {config.vdevs > 1 ? (
        <li className="zfs-resiliency__item zfs-resiliency__item--maybe">
          <strong>Up to {plural(r.mostFailuresThatCanBeSurvived, 'failure')}</strong> can be survived — but only if
          they are spread so that no vdev loses more than {r.perVdevTolerance}.
        </li>
      ) : (
        <li className="zfs-resiliency__item zfs-resiliency__item--maybe">
          With a single vdev, {r.perVdevTolerance} is both the guarantee and the limit.
        </li>
      )}
    </ul>
  );
}

/** Of every possible set of exactly k failed disks, the share the pool survives. */
export function SurvivalTable({ config }: { config: PoolConfig }) {
  const r = resiliency(config);
  const top = Math.min(totalDisks(config), r.mostFailuresThatCanBeSurvived + 1);
  const rows = Array.from({ length: top }, (_, i) => i + 1);
  return (
    <div className="table-scroll">
      <table className="zfs-table">
        <caption>
          If exactly k disks fail, how many of the possible placements does the pool survive? Every placement is
          counted once; this is not a probability that disks fail.
        </caption>
        <thead>
          <tr>
            <th scope="col">Failed disks (k)</th>
            <th scope="col">Placements survived</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => {
            const o = survivalOdds(config, k);
            return (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className="mono">
                  {o.survivingSets.toLocaleString('en-US')} of {o.totalSets.toLocaleString('en-US')}
                </td>
                <td>
                  <span className="zfs-share" aria-hidden="true">
                    <span style={{ width: `${o.fraction * 100}%` }} />
                  </span>{' '}
                  {o.fraction === 1 ? '100%' : o.fraction === 0 ? '0%' : fmtPercent(o.fraction)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
