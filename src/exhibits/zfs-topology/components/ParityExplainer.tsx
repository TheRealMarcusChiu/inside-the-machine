import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { ExplanatoryAnimation, type AnimationFrame } from '../../../components/ExplanatoryAnimation';
import { DEMO_BLOCKS, layoutBlocks } from '../model/raidzLayout';
import { LAYOUT_LABEL, parityOf, type PoolConfig } from '../model/topology';
import { plural } from '../format';

/** Uses the visitor's RAIDZ geometry when they have one; a mirror pool falls back to a 5-wide RAIDZ1. */
function demoGeometry(config: PoolConfig) {
  return config.layout === 'mirror'
    ? { width: 5, parity: 1, label: '5-wide RAIDZ1 (your pool is mirrored, so here is a RAIDZ example)' }
    : { width: config.width, parity: parityOf(config.layout), label: `${config.width}-wide ${LAYOUT_LABEL[config.layout]}, like one of your vdevs` };
}

export function ParityExplainer({ config }: { config: PoolConfig }) {
  const { width, parity, label } = demoGeometry(config);
  const { rows, blocks } = layoutBlocks(width, parity, DEMO_BLOCKS);
  const lastBlock = blocks.length - 1;

  const frames: AnimationFrame[] = [
    ...blocks.map((b) => ({
      label: `Block ${String.fromCharCode(65 + b.index)}`,
      caption: (
        <>
          A {plural(b.dataSectors, 'sector')} block is written with {plural(b.paritySectors, 'parity sector')}
          {b.skipSectors ? ` and ${plural(b.skipSectors, 'padding sector')}` : ''}. Its parity lands on disk
          {b.parityDisks.length === 1 ? '' : 's'} {[...new Set(b.parityDisks)].map((d) => d + 1).join(', ')}.
        </>
      ),
    })),
    {
      label: 'A disk fails',
      caption: (
        <>
          Disk 1 fails. Each block row loses at most one sector, and each row carries{' '}
          {plural(parity, 'parity sector')}, so the missing sector — data or parity — can be recomputed from the rest.
          Parity is spread over all the disks: there is no dedicated parity disk to become a bottleneck.
        </>
      ),
    },
  ];

  return (
    <ExhibitFigure
      kind="explanation"
      title="Where RAIDZ puts parity"
      description={`Simplified sector map of a ${label}.`}
    >
      <ExplanatoryAnimation frames={frames}>
        {(frame) => {
          const shownUpTo = Math.min(frame, lastBlock);
          const diskFailed = frame > lastBlock;
          return (
            <div className="zfs-sectors" style={{ gridTemplateColumns: `repeat(${width}, minmax(1.6rem, 1fr))` }}>
              {Array.from({ length: width }, (_, d) => (
                <span key={`h${d}`} className={`zfs-sectors__head${diskFailed && d === 0 ? ' is-failed' : ''}`}>
                  disk {d + 1}
                </span>
              ))}
              {rows.flat().map((cell, i) => {
                const visible = cell.block !== null && cell.block <= shownUpTo;
                const kind = visible ? cell.kind : 'empty';
                const lost = diskFailed && cell.disk === 0 && visible;
                return (
                  <span
                    key={i}
                    className={`zfs-sector zfs-sector--${kind}${cell.block === shownUpTo && !diskFailed ? ' is-new' : ''}${lost ? ' is-lost' : ''}`}
                    aria-hidden="true"
                  >
                    {visible ? `${String.fromCharCode(65 + cell.block!)}${kind === 'parity' ? 'p' : kind === 'skip' ? '·' : ''}` : ''}
                  </span>
                );
              })}
            </div>
          );
        }}
      </ExplanatoryAnimation>
      <p className="hint zfs-sectors__legend">
        Key: <span className="zfs-sector zfs-sector--data">A</span> data,{' '}
        <span className="zfs-sector zfs-sector--parity">Ap</span> parity,{' '}
        <span className="zfs-sector zfs-sector--skip">A·</span> padding. Letters name the block each sector belongs to.
      </p>
    </ExhibitFigure>
  );
}
