import { useEffect, useId, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { ExhibitFigure } from '../../components/ExhibitFigure';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import {
  buildMemoryTrace,
  buildPageFaultPath,
  DEFAULT_LATENCIES_NS,
  LATENCY_BOUNDS_NS,
  LATENCY_NOTE,
  type MemoryLevel,
  type MemoryTrace,
  type TraceStep,
} from './sim/memoryTrace';
import { traceConfigFromState, type Depth, type MemoryExhibitUrlState } from './urlConfig';
import { useMemoryExhibitUrlState } from './useMemoryExhibitUrlState';
import './memoryHierarchy.css';

/*
 * No Web Worker is used here: the request trace is a bounded explanatory timeline of at most
 * seven fixed steps, computed synchronously in microseconds, so it can never block the page.
 */

const SECTIONS = [
  { id: 'hierarchy', toc: 'The hierarchy', title: 'Near and small, far and large' },
  { id: 'lab', toc: 'Request lab', title: 'Follow one memory request' },
  { id: 'page-fault', toc: 'Page faults', title: 'Where storage fits: page faults' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: a miss all the way to RAM' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Sources & limits', title: 'Sources, assumptions, units & limitations' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));
const SLUG = 'memory-hierarchy';
const TRACE_FIGURE_ID = 'mh-trace-figure';
const LAB_FIGURE_ID = 'mh-lab-figure';
const LEVELS: readonly MemoryLevel[] = ['CPU', 'L1', 'L2', 'RAM'];
const PLAY_INTERVAL_MS = 1100;

const LEVEL_INFO: Record<MemoryLevel, { name: string; size: string }> = {
  CPU: { name: 'CPU core', size: 'registers' },
  L1: { name: 'L1 cache', size: 'tens of KiB' },
  L2: { name: 'L2 cache', size: 'hundreds of KiB – a few MiB' },
  RAM: { name: 'Main memory (RAM)', size: 'gigabytes' },
};

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const { title } = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={`mh-${id}`} className="mh-section" aria-labelledby={`mh-${id}-title`}>
      <h2 id={`mh-${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Deep({ children }: { children: ReactNode }) {
  return (
    <div className="mh-deep">
      <p className="mh-deep__label" aria-hidden="true">
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
    <fieldset className="segmented">
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

function HitMissSwitch({
  legend,
  hit,
  disabled,
  onChange,
}: {
  legend: string;
  hit: boolean;
  disabled?: boolean;
  onChange: (hit: boolean) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented mh-hitmiss" disabled={disabled}>
      <legend>{legend}</legend>
      {([true, false] as const).map((h) => (
        <label key={String(h)} className="segmented__option">
          <input type="radio" name={name} checked={hit === h} onChange={() => onChange(h)} />
          <span>{h ? 'Hit' : 'Miss'}</span>
        </label>
      ))}
    </fieldset>
  );
}

function LatencySlider({
  id,
  label,
  value,
  bounds,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  bounds: { min: number; max: number };
  onChange: (n: number) => void;
}) {
  return (
    <div className="mh-slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={value}
        aria-valuetext={`${value} nanoseconds`}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span className="mh-slider__value mono" aria-hidden="true">
        {value} ns
      </span>
    </div>
  );
}

type LevelState = 'idle' | 'hit' | 'miss' | 'served' | 'skipped' | 'origin';

/** How each level took part in a completed trace. */
function levelStates(trace: MemoryTrace): Record<MemoryLevel, LevelState> {
  const states: Record<MemoryLevel, LevelState> = { CPU: 'origin', L1: 'skipped', L2: 'skipped', RAM: 'skipped' };
  for (const step of trace.steps) {
    if (step.level === 'CPU') continue;
    if (step.outcome === 'miss') states[step.level] = 'miss';
    else if (step.outcome === 'hit' || step.action === 'fetch') states[step.level] = 'served';
  }
  return states;
}

const STATE_TEXT: Record<LevelState, string> = {
  idle: '',
  origin: 'requester',
  hit: 'hit',
  miss: 'miss',
  served: 'supplies the data',
  skipped: 'not consulted',
};

function latencyFor(level: MemoryLevel, state: MemoryExhibitUrlState): number | undefined {
  if (level === 'L1') return state.l1Latency;
  if (level === 'L2') return state.l2Latency;
  if (level === 'RAM') return state.ramLatency;
  return undefined;
}

/** The CPU / L1 / L2 / RAM stack, widening as levels get larger and slower. */
function HierarchyStack({
  states,
  latencies,
  active,
  packet,
}: {
  states: Record<MemoryLevel, LevelState>;
  latencies: MemoryExhibitUrlState;
  active?: MemoryLevel;
  packet?: TraceStep;
}) {
  return (
    <ol className="mh-stack" aria-label="Memory hierarchy, nearest to the CPU first">
      {LEVELS.map((level, i) => {
        const ns = latencyFor(level, latencies);
        const s = states[level];
        return (
          <li
            key={level}
            className={`mh-level mh-level--${level.toLowerCase()} is-${s}${active === level ? ' is-active' : ''}`}
            style={{ ['--mh-depth' as string]: i }}
            aria-current={active === level ? 'step' : undefined}
          >
            <span className="mh-level__name">{LEVEL_INFO[level].name}</span>
            <span className="mh-level__meta mono">
              {ns === undefined ? LEVEL_INFO[level].size : `${ns} ns · ${LEVEL_INFO[level].size}`}
            </span>
            {s !== 'idle' && <span className="mh-level__state">{STATE_TEXT[s]}</span>}
            {packet && active === level && (
              <span className={`mh-packet mh-packet--${packet.direction}`} aria-hidden="true">
                {packet.direction === 'down' ? '▼' : '▲'}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function pathText(trace: MemoryTrace): string {
  return trace.steps.map((s) => (s.outcome ? `${s.level} (${s.outcome})` : s.level)).join(' → ');
}

function RequestLab({
  state,
  trace,
  update,
}: {
  state: MemoryExhibitUrlState;
  trace: MemoryTrace;
  update: (patch: Partial<MemoryExhibitUrlState>) => void;
}) {
  const uid = useId();
  // Changing the configuration restarts the explanatory trace from its first step.
  const set = (patch: Partial<MemoryExhibitUrlState>) => update({ ...patch, step: 0 });
  const charged = trace.steps.filter((s) => s.latencyNs > 0);

  return (
    <ExhibitFigure
      kind="simulation"
      id={LAB_FIGURE_ID}
      title="Request lab"
      description="Choose where the data is found and how long each level takes; the path and total latency are computed by the model as you change them."
    >
      <div className="mh-lab">
        <div className="mh-lab__controls">
          <HitMissSwitch legend="L1 lookup" hit={state.l1Hit} onChange={(l1Hit) => set({ l1Hit })} />
          <HitMissSwitch
            legend="L2 lookup"
            hit={state.l2Hit}
            disabled={state.l1Hit}
            onChange={(l2Hit) => set({ l2Hit })}
          />
          {state.l1Hit && <p className="hint mh-lab__note">L2 is only consulted after an L1 miss.</p>}
          <LatencySlider
            id={`${uid}-l1`}
            label="L1 latency (ns)"
            value={state.l1Latency}
            bounds={LATENCY_BOUNDS_NS.l1}
            onChange={(l1Latency) => set({ l1Latency })}
          />
          <LatencySlider
            id={`${uid}-l2`}
            label="L2 latency (ns)"
            value={state.l2Latency}
            bounds={LATENCY_BOUNDS_NS.l2}
            onChange={(l2Latency) => set({ l2Latency })}
          />
          <LatencySlider
            id={`${uid}-ram`}
            label="RAM latency (ns)"
            value={state.ramLatency}
            bounds={LATENCY_BOUNDS_NS.ram}
            onChange={(ramLatency) => set({ ramLatency })}
          />
          <button
            type="button"
            className="btn"
            onClick={() =>
              set({
                l1Latency: DEFAULT_LATENCIES_NS.l1,
                l2Latency: DEFAULT_LATENCIES_NS.l2,
                ramLatency: DEFAULT_LATENCIES_NS.ram,
              })
            }
          >
            Restore illustrative latencies
          </button>
        </div>

        <div className="mh-lab__result">
          <HierarchyStack states={levelStates(trace)} latencies={state} />
          <output className="mh-total" role="status" aria-live="polite">
            <span className="mh-total__label">Served by {trace.servedBy}</span>
            <span className="mh-total__value mono">{trace.totalLatencyNs} ns</span>
          </output>
          <p className="mh-path mono">
            <span className="visually-hidden">Request path: </span>
            {pathText(trace)}
          </p>
          <ul className="mh-breakdown" aria-label="Latency breakdown">
            {charged.map((s) => (
              <li key={s.index}>
                <span className="mh-breakdown__label">
                  {s.level} {s.outcome ?? 'access'}
                </span>
                <span className="mh-breakdown__bar" aria-hidden="true">
                  <span style={{ width: `${(s.latencyNs / trace.totalLatencyNs) * 100}%` }} />
                </span>
                <span className="mh-breakdown__ns mono">{s.latencyNs} ns</span>
              </li>
            ))}
          </ul>
          <p className="hint">{LATENCY_NOTE}</p>
        </div>
      </div>
    </ExhibitFigure>
  );
}

function RequestTrace({
  trace,
  state,
  update,
}: {
  trace: MemoryTrace;
  state: MemoryExhibitUrlState;
  update: (patch: Partial<MemoryExhibitUrlState>) => void;
}) {
  const { reducedMotion } = useMotion();
  const [playing, setPlaying] = useState(false);
  const last = trace.steps.length - 1;
  const step = Math.min(state.step, last);
  const current = trace.steps[step]!;
  const atEnd = step >= last;
  const isPlaying = playing && !reducedMotion;

  useEffect(() => {
    if (!isPlaying) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => update({ step: step + 1 }), PLAY_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [isPlaying, atEnd, step, update]);

  const visited = trace.steps.slice(0, step + 1);
  const states: Record<MemoryLevel, LevelState> = { CPU: 'origin', L1: 'idle', L2: 'idle', RAM: 'idle' };
  for (const s of visited) {
    if (s.level === 'CPU') continue;
    if (s.outcome) states[s.level] = s.outcome;
    else if (s.action === 'fetch') states[s.level] = 'served';
  }

  const doStep = () => {
    setPlaying(false);
    if (!atEnd) update({ step: step + 1 });
  };
  const reset = () => {
    setPlaying(false);
    update({ step: 0 });
  };
  const replay = () => {
    update({ step: 0 });
    setPlaying(!reducedMotion);
  };
  const togglePlay = () => {
    if (isPlaying) return setPlaying(false);
    if (atEnd) update({ step: 0 });
    setPlaying(true);
  };

  return (
    <ExhibitFigure
      kind="explanation"
      id={TRACE_FIGURE_ID}
      title="Request trace"
      description="A scripted walk through the request configured in the lab, one step at a time. It illustrates the order of events; it does not time them."
    >
      <div className="mh-trace" data-playing={isPlaying || undefined}>
        <div className="mh-trace__stage">
          <HierarchyStack states={states} latencies={state} active={current.level} packet={current} />
          <ol className="mh-timeline" aria-label="Trace steps">
            {trace.steps.map((s) => (
              <li
                key={s.index}
                className={s.index === step ? 'is-current' : s.index < step ? 'is-done' : undefined}
                aria-current={s.index === step ? 'step' : undefined}
              >
                <span className="mh-timeline__dot" aria-hidden="true" />
                <span className="visually-hidden">Step {s.index + 1}: </span>
                <span className="mh-timeline__label">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="explainer__caption" aria-live={isPlaying ? 'off' : 'polite'}>
          <span className="explainer__count">
            Step {step + 1} of {trace.steps.length} · {current.level}
          </span>{' '}
          {current.label}.{' '}
          <span className="mono">
            {current.latencyNs > 0 ? `+${current.latencyNs} ns, ` : ''}running total {current.cumulativeNs} ns
          </span>
        </p>
        <div className="explainer__controls" role="group" aria-label="Trace controls">
          <button type="button" className="btn" onClick={doStep} aria-disabled={atEnd || undefined}>
            Step<span aria-hidden="true"> →</span>
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={isPlaying}
            disabled={reducedMotion}
            onClick={togglePlay}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn" onClick={reset}>
            Reset
          </button>
          <button type="button" className="btn" onClick={replay}>
            Replay
          </button>
          {reducedMotion && (
            <span className="explainer__note">
              Autoplay is off while reduced motion is on — use Step to move through the trace.
            </span>
          )}
        </div>
      </div>
    </ExhibitFigure>
  );
}

function PageFaultAside() {
  const path = buildPageFaultPath();
  return (
    <aside className="mh-pagefault" aria-labelledby="mh-pagefault-title">
      <p className="mh-pagefault__kicker">
        <KindBadge kind="explanation" /> <span>Separate illustration — not part of the routine trace</span>
      </p>
      <h3 id="mh-pagefault-title">Page fault: the operating system brings a page in from storage</h3>
      <p>{path.summary}</p>
      <ol className="mh-pagefault__flow">
        {path.steps.map((s, i) => (
          <li key={i} className={`mh-pagefault__step is-${s.level.toLowerCase()}`}>
            <span className="mh-pagefault__level mono">{s.level === 'Storage' ? 'SSD / NVMe' : s.level}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="hint">
        Storage access goes through OS page-fault and I/O handling and takes on the order of microseconds or more. It
        is deliberately not given a latency slider here: it is not the next stop after an L2 miss.
      </p>
    </aside>
  );
}

const WORKED = buildMemoryTrace({
  l1Hit: false,
  l2Hit: false,
  l1LatencyNs: DEFAULT_LATENCIES_NS.l1,
  l2LatencyNs: DEFAULT_LATENCIES_NS.l2,
  ramLatencyNs: DEFAULT_LATENCIES_NS.ram,
});

function WorkedExample({ onLoad }: { onLoad: () => void }) {
  const { l1, l2, ram } = DEFAULT_LATENCIES_NS;
  return (
    <>
      <p>
        Suppose a program reads a value that is in neither cache. With the illustrative latencies — L1 {l1} ns, L2{' '}
        {l2} ns, RAM {ram} ns — the request checks L1 (miss, {l1} ns), then L2 (miss, {l2} ns), then reads the line
        from RAM ({ram} ns). The line is filled into L2 and L1 on the way back so the next nearby read can hit.
      </p>
      <p className="mh-equation mono">
        {l1} + {l2} + {ram} = {WORKED.totalLatencyNs} ns
      </p>
      <p>
        Compared with a {l1} ns L1 hit, that single read is {WORKED.totalLatencyNs / l1}× slower — which is why
        programs that reuse nearby data run faster.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={onLoad}>
          Load the L1 → L2 → RAM miss example
        </button>
      </div>
    </>
  );
}

const CHALLENGE_ACCESSES = 10;
/** Nine L1 hits plus one access that misses both caches, at the illustrative default latencies. */
const CHALLENGE_ANSWER = (CHALLENGE_ACCESSES - 1) * DEFAULT_LATENCIES_NS.l1 + WORKED.totalLatencyNs;

function Challenge() {
  const inputId = useId();
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<'correct' | 'wrong' | 'invalid' | undefined>();
  const check = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return setVerdict('invalid');
    setVerdict(Number(trimmed) === CHALLENGE_ANSWER ? 'correct' : 'wrong');
  };
  const { l1, l2, ram } = DEFAULT_LATENCIES_NS;
  return (
    <article className={`mh-challenge${verdict === 'correct' ? ' is-solved' : ''}`}>
      <h3>One slow read in ten</h3>
      <p>
        A loop makes {CHALLENGE_ACCESSES} reads. Nine hit in L1; one misses both caches and goes to RAM. Using the
        illustrative latencies (L1 {l1} ns, L2 {l2} ns, RAM {ram} ns), how many nanoseconds do all{' '}
        {CHALLENGE_ACCESSES} reads take together?
      </p>
      <form className="mh-challenge__form" onSubmit={check}>
        <label htmlFor={inputId}>Total time (ns)</label>
        <input
          id={inputId}
          className="mh-input mono"
          inputMode="decimal"
          autoComplete="off"
          value={answer}
          onChange={(e) => {
            setAnswer(e.currentTarget.value);
            setVerdict(undefined);
          }}
        />
        <button type="submit" className="btn">
          Check answer
        </button>
      </form>
      <p role="status" className="mh-challenge__verdict">
        {verdict === 'correct' && (
          <>
            <span aria-hidden="true">✓ </span>Correct: {CHALLENGE_ANSWER} ns. The single miss costs more than the nine
            hits combined.
          </>
        )}
        {verdict === 'wrong' && (
          <>
            <span aria-hidden="true">… </span>Not quite. Add the nine L1 hits, then the full cost of the miss (L1 + L2 +
            RAM). Try the lab with both caches set to Miss.
          </>
        )}
        {verdict === 'invalid' && 'Enter a number of nanoseconds, such as 42.'}
      </p>
      <details className="mh-spoiler">
        <summary>Show the reasoning</summary>
        <p>
          Nine hits: 9 × {l1} = {9 * l1} ns. The miss pays every level it passes: {l1} + {l2} + {ram} ={' '}
          {WORKED.totalLatencyNs} ns. Total {9 * l1} + {WORKED.totalLatencyNs} = {CHALLENGE_ANSWER} ns, an average of{' '}
          {CHALLENGE_ANSWER / CHALLENGE_ACCESSES} ns per read — nearly ten times the L1 hit time.
        </p>
      </details>
    </article>
  );
}

const SOURCES = [
  {
    href: 'https://people.freebsd.org/~lstewart/articles/cpumemory.pdf',
    title: 'Ulrich Drepper, “What Every Programmer Should Know About Memory” (2007)',
    note: 'Cache organisation, cache lines, associativity and how access patterns affect performance.',
  },
  {
    href: 'https://docs.kernel.org/mm/',
    title: 'The Linux kernel documentation — Memory Management',
    note: 'Virtual memory, page tables and how the kernel handles page faults.',
  },
  {
    href: 'https://nvmexpress.org/specifications/',
    title: 'NVM Express — specifications',
    note: 'The interface by which the OS issues I/O commands to NVMe solid-state storage.',
  },
] as const;

export default function MemoryHierarchyExhibit() {
  const [state, update] = useMemoryExhibitUrlState();
  const focusTarget = useFocusTarget();
  const deep = state.depth === 'deep';
  const trace = buildMemoryTrace(traceConfigFromState(state));

  // Deep links such as ?at=challenge open the page at that section.
  useEffect(() => {
    const at = parseHash(window.location.hash).params.get('at');
    if (at && SECTION_IDS.has(at)) focusTarget(`mh-${at}-title`);
    // Only on arrival; later jumps come from the table of contents.
  }, []);

  const jumpTo = (id: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    replaceHashParams((params) => {
      params.set('at', id);
      return params;
    });
    focusTarget(`mh-${id}-title`);
  };

  return (
    <article className="mh-exhibit" aria-labelledby="mh-title">
      <header className="mh-header">
        <p className="mh-eyebrow">Room 2 · Open</p>
        <h1 id="mh-title">Memory hierarchy and caches</h1>
        <p className="mh-header__subtitle">Why the nearest byte is the fastest.</p>
        <div className="mh-header__controls">
          <DepthSwitch depth={state.depth} onChange={(depth) => update({ depth })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds cache lines, associativity,
            average access time and virtual memory.
          </p>
        </div>
        <p className="mh-header__legend">
          <KindBadge kind="simulation" /> figures compute their result from the model as you change it.{' '}
          <KindBadge kind="explanation" /> figures are scripted illustrations you step through.
        </p>
      </header>

      <div className="mh-layout">
        <nav className="mh-toc" aria-label="On this page">
          <p className="mh-toc__title" aria-hidden="true">
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

        <div className="mh-body">
          <Section id="hierarchy">
            <p className="mh-lede">
              A processor can work far faster than main memory can answer. So computers keep small, fast copies of
              recently used data close to the core — <em>caches</em> — backed by larger, slower levels further away.
              When the CPU asks for data it checks L1 first; on a <em>miss</em> it asks L2, and on another miss it
              reads main memory (RAM). The answer is copied into the caches on the way back, betting that it will be
              needed again soon.
            </p>
            {deep && (
              <Deep>
                <p>
                  Caches move data in fixed-size <em>cache lines</em> (commonly 64 bytes), so reading one byte also
                  brings in its neighbours — that is <em>spatial locality</em>. Keeping recently used lines rewards{' '}
                  <em>temporal locality</em>. Each cache is split into sets; an address may only live in the few
                  “ways” of its set (<em>set associativity</em>), and a replacement policy chooses which line to evict.
                </p>
                <p>
                  The average cost of an access is often summarised as average memory access time: AMAT = hit time +
                  miss rate × miss penalty, applied level by level. Many processors add an L3 cache shared between
                  cores, prefetchers that guess the next lines, and out-of-order execution that hides some latency by
                  doing other work while a miss is outstanding. None of those are modelled here.
                </p>
              </Deep>
            )}
          </Section>

          <Section id="lab">
            <p>
              Set whether the data is found in each cache and adjust how long each level takes. The lab recomputes the
              path and the total latency immediately; the trace below replays the same request step by step.
            </p>
            <RequestLab state={state} trace={trace} update={update} />
            <RequestTrace trace={trace} state={state} update={update} />
          </Section>

          <Section id="page-fault">
            <p>
              The routine path above ends at RAM. Solid-state storage (SSD/NVMe) is not another cache level that the
              hardware checks after an L2 miss. Data arrives in RAM from storage when the operating system handles a{' '}
              <em>page fault</em> or other I/O — a different mechanism, and far slower.
            </p>
            {deep && (
              <Deep>
                <p>
                  Programs use virtual addresses. The memory-management unit translates them through page tables
                  (cached in the TLB). If the page is not present, the CPU raises a page-fault exception and the
                  kernel’s handler decides what to do: map a zeroed page, copy a page for copy-on-write, or read the
                  page from a file or swap area on storage. Only the last involves the storage device, and it is
                  driven by the kernel’s I/O stack, not by the cache hardware.
                </p>
              </Deep>
            )}
            <PageFaultAside />
          </Section>

          <Section id="worked-example">
            <WorkedExample
              onLoad={() => {
                update({
                  l1Hit: false,
                  l2Hit: false,
                  l1Latency: DEFAULT_LATENCIES_NS.l1,
                  l2Latency: DEFAULT_LATENCIES_NS.l2,
                  ramLatency: DEFAULT_LATENCIES_NS.ram,
                  step: 0,
                });
                focusTarget(TRACE_FIGURE_ID);
              }}
            />
          </Section>

          <Section id="challenge">
            <Challenge />
          </Section>

          <Section id="limits">
            <ul className="mh-reference-list">
              <li>
                <strong>Illustrative, not universal.</strong> Cache organisation and latencies are
                architecture-specific. The nanosecond values here are illustrative defaults you can change, not
                measurements of any particular processor.
              </li>
              <li>
                <strong>Routine path.</strong> A routine cache miss goes to the next lower cache and then to RAM. RAM
                is the last level this model consults.
              </li>
              <li>
                <strong>Storage.</strong> SSD/NVMe storage enters only through operating-system page-fault and I/O
                handling, not ordinarily directly after a cache miss. It is shown in a separate illustration with no
                modelled latency.
              </li>
              <li>
                <strong>Units.</strong> Latencies are whole nanoseconds (ns; 1 ns = 10⁻⁹ s). Bounds: L1{' '}
                {LATENCY_BOUNDS_NS.l1.min}–{LATENCY_BOUNDS_NS.l1.max} ns, L2 {LATENCY_BOUNDS_NS.l2.min}–
                {LATENCY_BOUNDS_NS.l2.max} ns, RAM {LATENCY_BOUNDS_NS.ram.min}–{LATENCY_BOUNDS_NS.ram.max} ns.
              </li>
              <li>
                <strong>Simplifications.</strong> Latencies simply add up level by level. Not modelled: L3 and
                shared caches, TLBs, prefetching, parallel or overlapped lookups, out-of-order execution, write
                policies, coherence between cores, bandwidth limits and queueing.
              </li>
              <li>
                <strong>Animation timing.</strong> The request trace advances at a fixed, readable pace. Its timing
                has no relation to real nanoseconds.
              </li>
            </ul>
            <h3 className="mh-sources-title">Sources</h3>
            <ul className="mh-source-list">
              {SOURCES.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noreferrer noopener">
                    {s.title}
                  </a>
                  <span className="hint"> — {s.note}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
