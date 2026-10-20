import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { alternatives, totalDisks, type PoolConfig } from '../model/topology';
import { describeConfig, fmtPercent, fmtTB } from '../format';

const same = (a: PoolConfig, b: PoolConfig) => a.layout === b.layout && a.width === b.width && a.vdevs === b.vdevs;

export function LayoutComparison({ config, onApply }: { config: PoolConfig; onApply: (c: PoolConfig) => void }) {
  const disks = totalDisks(config);
  const alts = alternatives(disks, config.diskSizeTB);
  return (
    <ExhibitFigure
      kind="simulation"
      title="Same disks, other layouts"
      description={`Every supported layout for your ${disks} disks of ${fmtTB(config.diskSizeTB)}.`}
    >
      <div className="table-scroll">
        <table className="zfs-table zfs-table--compare">
          <caption>Geometry estimates; tolerance is per vdev and depends on where failures land.</caption>
          <thead>
            <tr>
              <th scope="col">Layout</th>
              <th scope="col">Estimated usable</th>
              <th scope="col">Of raw</th>
              <th scope="col">Always survives any</th>
              <th scope="col">Can lose data at</th>
              <th scope="col">Survives at most (spread)</th>
            </tr>
          </thead>
          <tbody>
            {alts.map((a) => {
              const current = same(a.config, config);
              return (
                <tr key={describeConfig(a.config)} aria-current={current || undefined} className={current ? 'is-current' : undefined}>
                  <th scope="row">
                    {current ? (
                      <span>
                        {describeConfig(a.config)} <span className="zfs-tag">yours</span>
                      </span>
                    ) : (
                      <button type="button" className="zfs-link-button" onClick={() => onApply(a.config)}>
                        {describeConfig(a.config)}
                        <span className="visually-hidden"> — use this layout</span>
                      </button>
                    )}
                  </th>
                  <td>{fmtTB(a.capacity.estimatedUsableTB)}</td>
                  <td>{fmtPercent(a.capacity.efficiency)}</td>
                  <td>{a.resiliency.guaranteedSurvivable}</td>
                  <td>{a.resiliency.fewestFailuresThatCanLoseData} in one vdev</td>
                  <td>{a.resiliency.mostFailuresThatCanBeSurvived}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ExhibitFigure>
  );
}
