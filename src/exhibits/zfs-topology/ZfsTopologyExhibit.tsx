import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import { Challenges } from './components/Challenges';
import { FailureTracer, TRACER_FIGURE_ID } from './components/FailureTracer';
import { LayoutComparison } from './components/LayoutComparison';
import { ParityExplainer } from './components/ParityExplainer';
import { BUILDER_FIGURE_ID, PoolBuilder } from './components/PoolBuilder';
import { ResiliencySummary, SurvivalTable } from './components/Resiliency';
import { fmtPercent, fmtTiB } from './format';
import { capacity, survivalOdds, type PoolConfig } from './model/topology';
import { DEFAULT_ZFS_STATE, type Depth } from './urlConfig';
import { useZfsUrlState } from './useZfsUrlState';
import './exhibit.css';

const SLUG = 'zfs-topology';

const SECTIONS = [
  { id: 'pool', toc: 'Build a pool', title: 'Build a pool' },
  { id: 'resiliency', toc: 'Failures', title: 'Which disks fail matters' },
  { id: 'parity', toc: 'Parity', title: 'Distributed parity, not a parity disk' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: 12 disks as two RAIDZ2 vdevs' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Assumptions & limits', title: 'Assumptions, units & limitations' },
  { id: 'sources', toc: 'Sources', title: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

const MANPAGE = 'https://openzfs.github.io/openzfs-docs/man/master/7/zpoolconcepts.7.html';

function Section({ id, children, className }: { id: SectionId; children: ReactNode; className?: string }) {
  const { title } = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} className={`exhibit-section${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Deep({ children }: { children: ReactNode }) {
  return (
    <div className="deep">
      <p className="deep__label" aria-hidden="true">
        Deep dive
      </p>
      {children}
    </div>
  );
}

function useFocusTarget() {
  const { reducedMotion } = useMotion();
  return (elementId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
}

function DepthSwitch({ depth, onChange }: { depth: Depth; onChange: (d: Depth) => void }) {
  const name = useId();
  return (
    <fieldset className="segmented segmented--depth">
      <legend>Explanation depth</legend>
      {(['short', 'deep'] as const).map((d) => (
        <label key={d} className="segmented__option">
          <input type="radio" name={name} value={d} checked={depth === d} onChange={() => onChange(d)} />
          <span>{d === 'short' ? 'Short' : 'Deep'}</span>
        </label>
      ))}
    </fieldset>
  );
}

function CopyLink() {
  const [message, setMessage] = useState('');
  const copy = () => {
    if (!navigator.clipboard) {
      setMessage('Copying is unavailable here — copy the address bar instead.');
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(
      () => setMessage('Link copied. It reproduces this pool and its failure sequence.'),
      () => setMessage('Could not copy — copy the address bar instead.'),
    );
  };
  return (
    <div className="copy-link">
      <button type="button" className="btn" onClick={copy}>
        Copy a link to this exact pool
      </button>
      <span className="hint" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

const EXAMPLE: PoolConfig = {
  layout: DEFAULT_ZFS_STATE.layout,
  width: DEFAULT_ZFS_STATE.width,
  vdevs: DEFAULT_ZFS_STATE.vdevs,
  diskSizeTB: DEFAULT_ZFS_STATE.diskSizeTB,
};

function WorkedExample({ onLoad }: { onLoad: (failed: number[]) => void }) {
  const cap = capacity(EXAMPLE);
  const three = survivalOdds(EXAMPLE, 3);
  const four = survivalOdds(EXAMPLE, 4);
  return (
    <>
      <p>
        Twelve 10 TB disks, arranged as two top-level RAIDZ2 vdevs of six disks each (
        <code>zpool create tank raidz2 d1…d6 raidz2 d7…d12</code>).
      </p>
      <ol className="zfs-steps">
        <li>
          <strong>Raw:</strong> 12 × 10 TB = {cap.rawTB} TB. That is what was bought, not what can be stored.
        </li>
        <li>
          <strong>Estimated usable:</strong> each vdev holds about (N − P) × X = (6 − 2) × 10 TB = 40 TB; two vdevs give{' '}
          {cap.estimatedUsableTB} TB (≈ {fmtTiB(cap.estimatedUsableTB)}), {fmtPercent(cap.efficiency)} of raw. The
          other 40 TB holds parity — spread across all twelve disks, not parked on four “parity drives”.
        </li>
        <li>
          <strong>Live free space:</strong> unknown until the pool exists. <code>zfs list</code> will show less than 80
          TB, because metadata, reserved space and RAIDZ allocation padding all take a share.
        </li>
        <li>
          <strong>Failures:</strong> each vdev tolerates 2. So <em>any</em> 2 failed disks are survived. A third
          failure is survived if it lands in the other vdev, and fatal if it lands in the vdev that already lost two.
          Four failures are survivable only as 2 + 2.
        </li>
        <li>
          <strong>Counting placements:</strong> of the {three.totalSets.toString()} ways to pick 3 failed disks,{' '}
          {three.survivingSets.toString()} ({fmtPercent(three.fraction)}) are survived; of the{' '}
          {four.totalSets.toString()} ways to pick 4, only {four.survivingSets.toString()} (
          {fmtPercent(four.fraction)}) are.
        </li>
      </ol>
      <p>So “this pool survives 4 failures” is false, and “this pool survives 2 failures” is the only unconditional truth.</p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => onLoad([0, 1, 6])}>
          Load it with a survivable 2 + 1
        </button>
        <button type="button" className="btn" onClick={() => onLoad([0, 1, 2])}>
          Load it with a fatal 3 + 0
        </button>
      </div>
    </>
  );
}

export default function ZfsTopologyExhibit() {
  const [state, update] = useZfsUrlState();
  const focusTarget = useFocusTarget();
  const deep = state.depth === 'deep';
  const config: PoolConfig = {
    layout: state.layout,
    width: state.width,
    vdevs: state.vdevs,
    diskSizeTB: state.diskSizeTB,
  };

  // Deep links such as ?at=sources open the page at that section.
  useEffect(() => {
    const at = parseHash(window.location.hash).params.get('at');
    if (at && SECTION_IDS.has(at)) focusTarget(`${at}-title`);
    // Only on arrival; later jumps come from the table of contents.
  }, []);

  const jumpTo = (id: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    replaceHashParams((params) => {
      params.set('at', id);
      return params;
    });
    focusTarget(`${id}-title`);
  };

  return (
    <article className="exhibit zfs" aria-labelledby="exhibit-title">
      <div className="exhibit-header">
        <p className="eyebrow">Storage · ZFS</p>
        <h1 id="exhibit-title">ZFS pool topology explorer</h1>
        <p className="exhibit-header__subtitle">
          Mirrors, RAIDZ and top-level vdevs: what you buy, what you can store, and which failures you survive.
        </p>
        <div className="exhibit-header__controls">
          <DepthSwitch depth={state.depth} onChange={(depth) => update({ depth })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds the accounting details, history
            and trade-offs.
          </p>
        </div>
        <div className="exhibit-header__legend">
          <p>
            <KindBadge kind="simulation" /> figures compute what they show from the pool model as you interact.{' '}
            <KindBadge kind="explanation" /> figures are scripted illustrations you step through.
          </p>
          <CopyLink />
        </div>
      </div>

      <div className="exhibit-layout">
        <nav className="toc" aria-label="On this page">
          <p className="toc__title" aria-hidden="true">
            On this page
          </p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#/exhibits/${SLUG}?at=${s.id}`} onClick={jumpTo(s.id)}>
                  {s.toc}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="exhibit-body">
          <Section id="pool">
            <p className="lede">
              A ZFS pool is built from <em>top-level vdevs</em>, and ZFS spreads data across all of them. Each vdev
              brings its own redundancy: a <em>mirror</em> keeps identical copies on every disk; a <em>RAIDZ</em> vdev
              adds one, two or three disks’ worth of parity (RAIDZ1, RAIDZ2, RAIDZ3). Three numbers are easy to
              confuse: <strong>raw</strong> capacity (every disk added up), <strong>estimated usable</strong> capacity
              (what the geometry leaves for data) and <strong>live free space</strong> (what a real pool reports
              today). This exhibit computes the first two and is honest that it cannot know the third.
            </p>
            {deep && (
              <Deep>
                <p>
                  Disk makers sell decimal terabytes (10<sup>12</sup> bytes); most tools print binary tebibytes (2
                  <sup>40</sup> bytes), about 9% smaller. A “10 TB” disk is about 9.1 TiB before ZFS does anything.
                </p>
                <p>
                  Even the pool’s own numbers differ by tool. For RAIDZ vdevs, <code>zpool list</code> SIZE and FREE
                  count raw space including parity; for mirrors they count one copy. <code>zfs list</code> AVAIL is the
                  space datasets can actually use: it excludes parity, metadata and the pool’s <em>slop space</em> — a
                  reserve (by default about 1/32 of the pool, set by the <code>spa_slop_shift</code> module parameter,
                  with lower and upper bounds) that keeps a full pool administrable.
                </p>
                <p>
                  RAIDZ’s (N − P) × X is approximate because every block is its own stripe. Small blocks pay
                  proportionally more parity and padding (each allocation is rounded up to a multiple of P + 1
                  sectors), so the real ratio depends on <code>recordsize</code>/<code>volblocksize</code>, sector
                  size (<code>ashift</code>), compression and the shape of your data.
                </p>
              </Deep>
            )}
            <PoolBuilder config={config} onChange={update} />
            <LayoutComparison
              config={config}
              onApply={(c) => {
                update({ ...c, failed: [] });
                focusTarget(BUILDER_FIGURE_ID);
              }}
            />
          </Section>

          <Section id="resiliency">
            <p className="lede">
              A mirror of N disks survives N − 1 failures; a RAIDZ<em>P</em> vdev survives <em>P</em>. But a pool with
              several vdevs has no single “survives this many failures” number. It survives exactly when{' '}
              <em>every</em> vdev stays within its own tolerance, and it loses its data the moment any one vdev does
              not — so the answer depends on <em>which</em> disks fail.
            </p>
            <ResiliencySummary config={config} />
            {deep && (
              <Deep>
                <p>
                  Why does one dead vdev take the whole pool with it? ZFS does not keep whole files on one vdev; it
                  spreads blocks across all top-level vdevs, and pool metadata refers to all of them. Lose one vdev and
                  some of every large file — and of the metadata — is gone. Redundancy lives inside vdevs, never
                  between them.
                </p>
                <p>
                  Real failures are not independent coin flips. Disks from one batch age together, and a resilver reads
                  every surviving disk in the degraded vdev for hours or days, which is when a second or third failure
                  is most likely. That is the usual argument for RAIDZ2/RAIDZ3 on large disks and for keeping vdevs
                  narrow.
                </p>
              </Deep>
            )}
            <FailureTracer config={config} failed={state.failed} onFailedChange={(failed) => update({ failed })} />
            <SurvivalTable config={config} />
          </Section>

          <Section id="parity">
            <p className="lede">
              RAIDZ is not “data disks plus a parity disk”. The OpenZFS manual describes it as a variation on RAID-5
              with better distribution of parity: data and parity are striped across all disks within a raidz group.
              There is no dedicated parity drive — every disk holds some data and some parity, and losing any disk is
              handled the same way. A mirror needs no parity at all: every disk holds a full copy.
            </p>
            {deep && (
              <Deep>
                <p>
                  Classic RAID-5 updates a fixed-width stripe in place, so a crash between writing data and writing
                  parity leaves them inconsistent — the RAID-5 “write hole”. RAIDZ avoids it: every block is written to
                  new space as its own full stripe (copy-on-write), with parity computed for that block, and the block
                  only becomes live when the metadata pointing to it is committed.
                </p>
                <p>
                  RAID levels 4 and 5 differ only in where parity lives: RAID-4 keeps it on one disk, which every
                  write must touch; RAID-5 rotates it. Patterson, Gibson and Katz’s 1988 paper introduced that
                  taxonomy.
                </p>
              </Deep>
            )}
            <ParityExplainer config={config} />
          </Section>

          <Section id="worked-example">
            <WorkedExample
              onLoad={(failed) => {
                update({ ...EXAMPLE, failed });
                focusTarget(TRACER_FIGURE_ID);
              }}
            />
          </Section>

          <Section id="challenge">
            <Challenges config={config} failed={state.failed} onGoToTracer={() => focusTarget(TRACER_FIGURE_ID)} />
          </Section>

          <Section id="limits" className="exhibit-section--reference">
            <ul className="reference-list">
              <li>
                <strong>A geometry estimate, not a zpool capacity prediction.</strong> Usable capacity applies the
                zpoolconcepts(7) rules — X per mirror, about (N − P) × X per RAIDZ vdev — and nothing else. Live free
                space is not modelled at all.
              </li>
              <li>
                <strong>Units.</strong> TB means decimal terabytes, 10^12 bytes, as on disk labels. TiB means 2^40
                bytes. Failure counts are whole disks.
              </li>
              <li>
                <strong>Equal disks, one layout.</strong> Every disk is the same size and every top-level vdev has the
                same layout and width. ZFS allows mixed vdevs (and a mirror or RAIDZ vdev is limited by its smallest
                disk); this explorer does not model them.
              </li>
              <li>
                <strong>What is left out.</strong> dRAID, hot spares, special, log (SLOG), cache (L2ARC) and dedup
                vdevs; RAIDZ expansion; <code>copies=</code>; compression; performance and IOPS.
              </li>
              <li>
                <strong>Failure model.</strong> A failed disk is wholly gone. Silent corruption, unreadable sectors
                during resilver, controller or enclosure failures, and correlated failures are not modelled. The
                placement table counts combinations; it is not a reliability, MTTDL or annual-failure-rate estimate.
              </li>
              <li>
                <strong>Labels.</strong> ONLINE, DEGRADED and FAULTED follow <code>zpool status</code> wording, but
                this is a model: a real pool may report other states (UNAVAIL, REMOVED) and degrades on errors short
                of a whole-disk loss.
              </li>
              <li>
                <strong>Parity picture.</strong> The sector map is simplified: real RAIDZ lays a block out column by
                column from its allocation offset. It keeps the two properties that matter here — each block row has P
                parity sectors on distinct disks, and parity moves between disks.
              </li>
              <li>
                <strong>Privacy.</strong> Everything runs in your browser. The pool lives only in the page address, so
                a link reproduces it exactly; nothing is sent anywhere.
              </li>
            </ul>
          </Section>

          <Section id="sources" className="exhibit-section--reference">
            <ul className="source-list">
              <li>
                OpenZFS, <cite>zpoolconcepts(7)</cite>, section “Virtual Devices (vdevs)”:{' '}
                <a href={MANPAGE}>{MANPAGE}</a>. Mirror (N disks of size X hold X, withstand N − 1 failures) and raidz
                (N disks with P parity hold approximately (N − P) × X, withstand P failures; parity distributed, data
                and parity striped across the group) definitions used by this exhibit.
              </li>
              <li>
                OpenZFS, <cite>zpoolprops(7)</cite>, space usage properties:{' '}
                <a href="https://openzfs.github.io/openzfs-docs/man/master/7/zpoolprops.7.html">
                  openzfs.github.io/openzfs-docs/man/master/7/zpoolprops.7.html
                </a>
                . Why <code>zpool list</code> space differs from what datasets can use.
              </li>
              <li>
                OpenZFS, <cite>zfs(4)</cite> module parameters, <code>spa_slop_shift</code>:{' '}
                <a href="https://openzfs.github.io/openzfs-docs/man/master/4/zfs.4.html">
                  openzfs.github.io/openzfs-docs/man/master/4/zfs.4.html
                </a>
                . The space a pool holds in reserve.
              </li>
              <li>
                OpenZFS source, <code>module/zfs/vdev_raidz.c</code>:{' '}
                <a href="https://github.com/openzfs/zfs/blob/master/module/zfs/vdev_raidz.c">
                  github.com/openzfs/zfs/blob/master/module/zfs/vdev_raidz.c
                </a>
                . How a block maps onto RAIDZ columns, parity and padding.
              </li>
              <li>
                Matthew Ahrens, “How I Learned to Stop Worrying and Love RAIDZ” (Delphix blog, 2014). RAIDZ parity and
                padding overhead as a function of block size and stripe width.
              </li>
              <li>
                David A. Patterson, Garth Gibson and Randy H. Katz, “A Case for Redundant Arrays of Inexpensive Disks
                (RAID),” <cite>Proceedings of the 1988 ACM SIGMOD International Conference on Management of Data</cite>,
                109–116. RAID levels, including dedicated (RAID-4) versus rotated (RAID-5) parity.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
