import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import { Challenge } from './components/Challenge';
import { TRACE_FIGURE_ID, TraceLab } from './components/TraceLab';
import { COSTS, CPU_SIMD_WIDTH, DEFAULT_WORKLOAD, buildTrace, type Workload } from './model';
import { useExhibitUrlState } from './useExhibitUrlState';
import type { Depth } from './urlConfig';
import './exhibit.css';

const SLUG = 'cpu-vs-gpu';

const SECTIONS = [
  { id: 'lanes', toc: 'Lanes', title: 'One instruction, many lanes' },
  { id: 'trace', toc: 'Run both', title: 'Run both machines' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: 16 additions, two ways' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Assumptions & limits', title: 'Assumptions, units & limitations' },
  { id: 'sources', toc: 'Sources', title: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

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
      () => setMessage('Link copied. It reproduces exactly what you see.'),
      () => setMessage('Could not copy — copy the address bar instead.'),
    );
  };
  return (
    <div className="copy-link">
      <button type="button" className="btn" onClick={copy}>
        Copy a link to this exact state
      </button>
      <span className="hint" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

function WorkedExample({ onLoad }: { onLoad: () => void }) {
  const { workload: w, cpu, gpu } = buildTrace(DEFAULT_WORKLOAD);
  const vectors = Math.ceil(w.lanes / CPU_SIMD_WIDTH);
  const warps = Math.ceil(w.lanes / w.warpWidth);
  const transferEach = COSTS.transferLatency + COSTS.transferPerLane * w.lanes;
  return (
    <>
      <p>
        Add two arrays element by element: c[i] = a[i] + b[i] for {w.lanes} lanes, every lane taking the same branch
        and reading the element next to its neighbour’s.
      </p>
      <ol className="worked-steps">
        <li>
          The CPU packs the work into {vectors} vectors of {CPU_SIMD_WIDTH}. Each vector needs one pass of{' '}
          {COSTS.cpuPath} cycles, so the job takes {vectors} × {COSTS.cpuPath} = {cpu.totalCycles} cycles.
        </li>
        <li>
          The GPU packs the same work into {warps} warps of {w.warpWidth}. A warp instruction is slower ({COSTS.gpuPath}{' '}
          cycles) but covers twice as many elements: {warps} × {COSTS.gpuPath} = {gpu.totalCycles} cycles.
        </li>
        <li>
          The data already sits in GPU memory, so there is no copy. Had it started in host memory, copying it in and
          the results out would add {transferEach} cycles each way and hand the win to the CPU.
        </li>
      </ol>
      <p>
        The GPU finishes first, {gpu.totalCycles} cycles against {cpu.totalCycles}, purely because each instruction it
        issues does more work. Step the trace and watch both machines retire one group per step.
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={onLoad}>
          Load this example
        </button>
      </div>
    </>
  );
}

export default function CpuVsGpuExhibit() {
  const [state, update] = useExhibitUrlState();
  const focusTarget = useFocusTarget();
  const deep = state.depth === 'deep';
  const workload: Workload = {
    lanes: state.lanes,
    warpWidth: state.warpWidth,
    divergence: state.divergence,
    regularity: state.regularity,
    transfer: state.transfer,
  };

  // Deep links such as ?at=sources open the page at that section.
  useEffect(() => {
    const at = parseHash(window.location.hash).params.get('at');
    if (at && SECTION_IDS.has(at)) focusTarget(`${at}-title`);
    // Only on arrival; later section jumps come from the table of contents.
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
    <article className="exhibit" aria-labelledby="exhibit-title">
      <div className="exhibit-header">
        <p className="eyebrow">Parallelism</p>
        <h1 id="exhibit-title">CPU SIMD vs GPU SIMT</h1>
        <p className="exhibit-header__subtitle">Two ways to do the same thing to many numbers at once.</p>
        <div className="exhibit-header__controls">
          <DepthSwitch depth={state.depth} onChange={(depth) => update({ depth })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds the hardware details and the
            trade-offs.
          </p>
        </div>
        <div className="exhibit-header__legend">
          <p>
            <KindBadge kind="simulation" /> figures compute their output from a working model as you interact.
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
          <Section id="lanes">
            <p className="lede">
              Much of computing is the same small calculation applied to many numbers: brighten every pixel, add two
              arrays, score every word. Both CPUs and GPUs speed this up by issuing one instruction that acts on many{' '}
              <em>lanes</em> of data at once.
            </p>
            <p>
              A CPU does it with SIMD — single instruction, multiple data. One core holds a short vector register, here
              {` ${CPU_SIMD_WIDTH}`} numbers wide, and each vector instruction transforms all of them together. The
              programmer or compiler writes the loop in vector-sized chunks.
            </p>
            <p>
              A GPU does it with SIMT — single instruction, multiple threads. You write the code for one thread; the
              hardware bundles neighbouring threads into a <em>warp</em> and runs the warp in lock-step, one instruction
              for all of them. When threads disagree at a branch, the warp runs each side in turn and switches off the
              threads that did not take it.
            </p>
            {deep && (
              <Deep>
                <p>
                  Flynn’s 1972 taxonomy named SIMD; vector supercomputers such as the Cray-1 (1976) made it famous, and
                  desktop CPUs adopted short SIMD registers with MMX (1997), SSE (128 bits) and AVX (256 and 512 bits).
                  A 128-bit register holds four 32-bit floats, the width modelled here. Branches inside a SIMD loop are
                  handled with masks: compute both sides, then blend, which is exactly what the CPU trace shows.
                </p>
                <p>
                  On an NVIDIA GPU a warp is 32 threads (AMD calls its equivalent a wavefront, 32 or 64 wide). Each
                  streaming multiprocessor has a warp scheduler that picks a ready warp every cycle and issues its next
                  instruction. While one warp waits hundreds of cycles for memory, the warp scheduler simply issues from
                  another, so GPUs hide latency with sheer numbers of warps rather than with large caches. Since the
                  Volta generation (2017) each thread also has its own program counter, but a warp still executes one
                  path at a time.
                </p>
              </Deep>
            )}
          </Section>

          <Section id="trace">
            <p className="lede">
              Set a workload, then step both machines side by side. Each step retires one vector on the CPU and one
              warp on the GPU, or one branch path of it when lanes disagree.
            </p>
            <p>
              Watch three things push the GPU back: branch paths that split a warp, scattered memory addresses that
              cannot be fetched together, and the copy between host and device memory that a discrete GPU needs before
              and after its work.
            </p>
            {deep && (
              <Deep>
                <p>
                  Memory coalescing: when the 32 threads of a warp read 32 consecutive 4-byte words, the hardware
                  combines them into a single 128-byte transaction. Scattered addresses need up to one transaction per
                  thread. CPUs feel the same effect through gather instructions and cache lines, but large caches soften
                  it. The model charges both machines one cycle per lane for scattered access.
                </p>
                <p>
                  A discrete GPU has its own memory across a PCI Express link, whose bandwidth is a small fraction of
                  either side’s local memory. Unless data already lives on the device, or the job does a lot of
                  arithmetic per byte, the copies can cost more than the kernel saves.
                </p>
              </Deep>
            )}
            <TraceLab workload={workload} onChange={update} />
          </Section>

          <Section id="worked-example">
            <WorkedExample
              onLoad={() => {
                update(DEFAULT_WORKLOAD);
                focusTarget(TRACE_FIGURE_ID);
              }}
            />
            {deep && (
              <Deep>
                <p>
                  Scale it up and the gap widens: at 64 lanes with 32-wide warps the CPU needs 16 vector passes and the
                  GPU only two warp passes. A real GPU goes further still, running many warps on many multiprocessors at
                  the same time, where this model runs them one after another; its warp scheduler interleaves them to
                  keep every lane busy.
                </p>
              </Deep>
            )}
          </Section>

          <Section id="challenge">
            <Challenge workload={workload} onGoToLab={() => focusTarget(TRACE_FIGURE_ID)} />
          </Section>

          <Section id="limits" className="exhibit-section--reference">
            <ul className="reference-list">
              <li>
                <strong>An educational cost model.</strong> The trace is not cycle-accurate and models no particular
                chip. Costs are fixed abstract numbers chosen to show the trade-offs: {COSTS.cpuPath} cycles per CPU
                vector pass, {COSTS.gpuPath} per GPU warp pass, {COSTS.gatherPerLane} per lane for scattered access,
                and {COSTS.transferLatency} plus {COSTS.transferPerLane} per lane for each copy.
              </li>
              <li>
                <strong>One group at a time.</strong> Each machine runs its vectors or warps one after another. Real
                CPUs have several cores and pipeline independent instructions; real GPUs run thousands of threads on
                dozens of multiprocessors at once and hide memory latency by switching warps.
              </li>
              <li>
                <strong>Units.</strong> Times are abstract cycles, not nanoseconds; the two machines’ clocks are treated
                as equal. A lane is one 32-bit element. Lane i takes branch path i mod the number of paths, so paths
                are spread evenly.
              </li>
              <li>
                <strong>Memory.</strong> Regular access is assumed fully hidden behind computation. Caches, bandwidth
                limits, bank conflicts and prefetching are not modelled.
              </li>
              <li>
                <strong>Transfers.</strong> The host ↔ device copy is charged to the GPU only, as for a discrete card
                on PCI Express. Integrated and unified-memory GPUs may avoid it.
              </li>
              <li>
                <strong>Simulation.</strong> The figure is computed from the exhibit’s model as you interact, and the
                model’s rules are checked by the test suite. Play and Replay only animate the precomputed trace.
              </li>
              <li>
                <strong>Privacy.</strong> Everything runs in your browser. State lives only in the page address, so
                links reproduce a view exactly; nothing is stored on a server.
              </li>
            </ul>
          </Section>

          <Section id="sources" className="exhibit-section--reference">
            <ul className="source-list">
              <li>
                NVIDIA Corporation, <cite>CUDA C++ Programming Guide</cite> (docs.nvidia.com/cuda). The SIMT
                architecture, warps, branch divergence and the memory hierarchy.
              </li>
              <li>
                NVIDIA Corporation, <cite>CUDA C++ Best Practices Guide</cite> (docs.nvidia.com/cuda). Coalesced access
                and the cost of host ↔ device transfers.
              </li>
              <li>
                Michael J. Flynn, “Some Computer Organizations and Their Effectiveness,” <cite>IEEE Transactions on
                Computers</cite> C-21, no. 9 (1972): 948–960. The taxonomy that named SIMD.
              </li>
              <li>
                Erik Lindholm, John Nickolls, Stuart Oberman and John Montrym, “NVIDIA Tesla: A Unified Graphics and
                Computing Architecture,” <cite>IEEE Micro</cite> 28, no. 2 (2008): 39–55. The paper that introduced
                SIMT.
              </li>
              <li>
                John L. Hennessy and David A. Patterson, <cite>Computer Architecture: A Quantitative Approach</cite>,
                6th ed. (Morgan Kaufmann, 2019), chapter 4: data-level parallelism in vector, SIMD and GPU
                architectures.
              </li>
              <li>
                Chris Gregg and Kim Hazelwood, “Where Is the Data? Why You Cannot Debate CPU vs. GPU Performance Without
                the Answer,” <cite>IEEE International Symposium on Performance Analysis of Systems and Software</cite>{' '}
                (2011): 134–144. Transfer overheads in CPU–GPU comparisons.
              </li>
              <li>
                Intel Corporation, <cite>Intel 64 and IA-32 Architectures Software Developer’s Manual</cite>. The SSE and
                AVX vector instruction sets, including masked and gather operations.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
