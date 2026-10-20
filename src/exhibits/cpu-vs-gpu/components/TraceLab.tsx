import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { useMotion } from '../../../lib/motion';
import {
  MAX_LANES,
  MAX_PATHS,
  buildTrace,
  createPlayback,
  currentStep,
  elapsedCycles,
  isFinished,
  pathName,
  resetPlayback,
  stepPlayback,
  traceLength,
  visibleSteps,
  type Playback,
  type Regularity,
  type Trace,
  type Unit,
  type Workload,
} from '../model';
import { WARP_WIDTHS } from '../urlConfig';

export const TRACE_FIGURE_ID = 'trace-lab';

type Command = 'step' | 'toggle-play' | 'reset' | 'replay';
const FORM_FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** S steps, P plays or pauses, R resets, Shift+R replays. Keys typed into form fields are left alone. */
function keyToCommand(event: KeyboardEvent, targetTag: string): Command | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey || FORM_FIELDS.has(targetTag)) return undefined;
  const key = event.key.toLowerCase();
  if (key === 's') return 'step';
  if (key === 'p') return 'toggle-play';
  if (key === 'r') return event.shiftKey ? 'replay' : 'reset';
  return undefined;
}

const PLAY_INTERVAL_MS = 700;

interface TraceLabProps {
  workload: Workload;
  onChange: (patch: Partial<Workload>) => void;
}

function WorkloadControls({ workload, onChange }: TraceLabProps) {
  const uid = useId();
  return (
    <fieldset className="workload">
      <legend>Workload</legend>
      <div className="field field--range">
        <label htmlFor={`${uid}-lanes`}>Lanes (work items)</label>
        <input
          id={`${uid}-lanes`}
          type="range"
          min={1}
          max={MAX_LANES}
          value={workload.lanes}
          onChange={(e) => onChange({ lanes: Number(e.target.value) })}
        />
        <span className="field__value">{workload.lanes}</span>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-warp`}>GPU warp width</label>
        <select
          id={`${uid}-warp`}
          value={workload.warpWidth}
          onChange={(e) => onChange({ warpWidth: Number(e.target.value) })}
        >
          {WARP_WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
      <div className="field field--range">
        <label htmlFor={`${uid}-div`}>Branch paths</label>
        <input
          id={`${uid}-div`}
          type="range"
          min={1}
          max={MAX_PATHS}
          value={workload.divergence}
          aria-valuetext={workload.divergence === 1 ? '1 path: every lane takes the same branch' : `${workload.divergence} paths`}
          onChange={(e) => onChange({ divergence: Number(e.target.value) })}
        />
        <span className="field__value">{workload.divergence}</span>
      </div>
      <fieldset className="segmented" role="radiogroup" aria-labelledby={`${uid}-access`}>
        <legend id={`${uid}-access`}>Memory access</legend>
        {(['regular', 'irregular'] as const satisfies readonly Regularity[]).map((r) => (
          <label key={r} className="segmented__option">
            <input
              type="radio"
              name={`${uid}-access`}
              value={r}
              checked={workload.regularity === r}
              onChange={() => onChange({ regularity: r })}
            />
            <span>{r === 'regular' ? 'Regular (neighbours)' : 'Irregular (scattered)'}</span>
          </label>
        ))}
      </fieldset>
      <label className="workload__check">
        <input type="checkbox" checked={workload.transfer} onChange={(e) => onChange({ transfer: e.target.checked })} />
        Include host ↔ device transfer
      </label>
    </fieldset>
  );
}

type LaneState = 'waiting' | 'active' | 'masked' | 'stalled' | 'done';

const LANE_STATE_TEXT: Record<LaneState, string> = {
  waiting: 'waiting',
  active: 'running',
  masked: 'masked off',
  stalled: 'waiting for memory',
  done: 'done',
};

function laneStates(p: Playback, unit: Unit): LaneState[] {
  const { lanes, divergence } = p.trace.workload;
  const finishedPath = new Set(
    visibleSteps(p, unit)
      .filter((s) => s.kind === 'compute')
      .flatMap((s) => s.activeLanes),
  );
  const now = currentStep(p, unit);
  const groupWidth = p.trace[unit].groupWidth;
  return Array.from({ length: lanes }, (_, lane) => {
    if (now && now.group === Math.floor(lane / groupWidth)) {
      if (now.kind === 'memory') return 'stalled';
      if (now.activeLanes.includes(lane)) return 'active';
      if (lane % divergence !== now.path) return 'masked';
    }
    return finishedPath.has(lane) ? 'done' : 'waiting';
  });
}

function UnitLanes({ playback, unit }: { playback: Playback; unit: Unit }) {
  const t = playback.trace[unit];
  const { lanes } = playback.trace.workload;
  const states = laneStates(playback, unit);
  const groups = Math.ceil(lanes / t.groupWidth);
  const noun = unit === 'cpu' ? 'vector' : 'warp';
  const now = currentStep(playback, unit);
  const elapsed = elapsedCycles(playback, unit);
  const finished = playback.position >= t.steps.length;

  return (
    <div
      role="group"
      className={`unit unit--${unit}`}
      aria-label={`${t.label}: ${groups} ${noun}${groups === 1 ? '' : 's'} of ${t.groupWidth} lanes`}
    >
      <h3 className="unit__title">
        {t.label} <span className="unit__shape">· {noun}s of {t.groupWidth}</span>
      </h3>
      <div className="unit__groups">
        {Array.from({ length: groups }, (_, g) => (
          <ol
            key={g}
            className={`lane-group${now?.group === g ? ' lane-group--current' : ''}`}
            aria-label={`${noun} ${g}`}
            start={g * t.groupWidth}
          >
            {states.slice(g * t.groupWidth, (g + 1) * t.groupWidth).map((state, i) => {
              const lane = g * t.groupWidth + i;
              const path = lane % playback.trace.workload.divergence;
              return (
                <li
                  key={lane}
                  className={`lane lane--${state} lane--path-${path}`}
                  aria-current={state === 'active' ? 'step' : undefined}
                >
                  <span className="lane__index">{lane}</span>
                  <span className="lane__path" aria-hidden="true">
                    {pathName(path)}
                  </span>
                  <span className="visually-hidden">
                    , path {pathName(path)}, {LANE_STATE_TEXT[state]}
                  </span>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
      <p className="unit__now">
        {now ? now.note : finished && playback.position > 0 ? 'Finished.' : 'Ready.'}
      </p>
      <div className="unit__meter" aria-hidden="true">
        <span style={{ width: `${t.totalCycles ? (100 * elapsed) / t.totalCycles : 0}%` }} />
      </div>
      <p className="unit__cycles">
        Elapsed {elapsed} of{' '}
        <span data-testid={`${unit}-total`}>
          {t.totalCycles} cycles
          {t.transferCycles > 0 && `, including ${t.transferCycles} for transfer`}
        </span>
      </p>
    </div>
  );
}

function statusText(p: Playback): string {
  const length = traceLength(p.trace);
  const base = `Step ${p.position} of ${length}.`;
  if (!isFinished(p)) return p.position === 0 ? `${base} Press Step or Play to start both machines.` : base;
  const { cpu, gpu } = p.trace;
  if (cpu.totalCycles === gpu.totalCycles) return `${base} Both machines finish in ${cpu.totalCycles} cycles.`;
  const [winner, loser] = cpu.totalCycles < gpu.totalCycles ? [cpu, gpu] : [gpu, cpu];
  return `${base} ${winner.label} finishes first: ${winner.totalCycles} cycles against ${loser.totalCycles}.`;
}

function usePlayback(trace: Trace) {
  const [playback, setPlayback] = useState(() => createPlayback(trace));
  const [playing, setPlaying] = useState(false);

  // A new workload means a new trace: start again from step 0.
  if (playback.trace !== trace) {
    setPlayback(createPlayback(trace));
    setPlaying(false);
  }

  const finished = isFinished(playback);
  useEffect(() => {
    if (!playing) return;
    if (finished) {
      setPlaying(false);
      return;
    }
    const id = window.setInterval(() => setPlayback(stepPlayback), PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, finished]);

  const command = (cmd: Command) => {
    if (cmd === 'step') {
      setPlaying(false);
      setPlayback(stepPlayback);
    } else if (cmd === 'toggle-play') {
      if (playing) setPlaying(false);
      else {
        if (finished) setPlayback(resetPlayback);
        setPlaying(true);
      }
    } else if (cmd === 'reset') {
      setPlaying(false);
      setPlayback(resetPlayback);
    } else {
      setPlayback(resetPlayback);
      setPlaying(true);
    }
  };

  return { playback, playing, command };
}

/** Both machines run the same workload side by side, one trace step at a time. */
export function TraceLab({ workload, onChange }: TraceLabProps) {
  const { lanes, warpWidth, divergence, regularity, transfer } = workload;
  const trace = useMemo(
    () => buildTrace({ lanes, warpWidth, divergence, regularity, transfer }),
    [lanes, warpWidth, divergence, regularity, transfer],
  );
  const { playback, playing, command } = usePlayback(trace);
  const { reducedMotion } = useMotion();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cmd = keyToCommand(event, (event.target as HTMLElement).tagName);
    if (!cmd) return;
    event.preventDefault();
    command(cmd);
  };

  return (
    <ExhibitFigure
      kind="simulation"
      id={TRACE_FIGURE_ID}
      title="Execution trace: CPU SIMD vs GPU SIMT"
      description="The same loop over the same lanes, run by a 4-wide CPU vector unit and by GPU warps. Change the workload, then step both machines."
      className={`trace-lab${reducedMotion ? ' trace-lab--still' : ''}`}
    >
      <div className="trace-lab__bench" onKeyDown={onKeyDown}>
        <WorkloadControls workload={workload} onChange={onChange} />

        {divergence > 1 && (
          <p className="trace-lab__callout">
            Lanes diverge: lane i takes branch path i mod {divergence}, so each vector and warp runs every path its
            lanes need, one after another, with the other lanes masked off.
          </p>
        )}

        <div className="trace-lab__toolbar" role="group" aria-label="Playback controls">
          <button type="button" className="btn btn--primary" aria-keyshortcuts="S" onClick={() => command('step')}>
            Step <kbd aria-hidden="true">S</kbd>
          </button>
          <button type="button" className="btn" aria-keyshortcuts="P" onClick={() => command('toggle-play')}>
            {playing ? 'Pause' : 'Play'} <kbd aria-hidden="true">P</kbd>
          </button>
          <button type="button" className="btn" aria-keyshortcuts="R" onClick={() => command('reset')}>
            Reset <kbd aria-hidden="true">R</kbd>
          </button>
          <button type="button" className="btn" aria-keyshortcuts="Shift+R" onClick={() => command('replay')}>
            Replay <kbd aria-hidden="true">⇧R</kbd>
          </button>
        </div>
        <p role="status" className="trace-lab__status">
          {statusText(playback)}
        </p>

        <div className="trace-lab__units">
          <UnitLanes playback={playback} unit="cpu" />
          <UnitLanes playback={playback} unit="gpu" />
        </div>

        <p className="hint trace-lab__legend">
          Each tile is one lane, labelled with its branch path. Filled tiles are running, hatched tiles are masked off,
          dotted tiles are waiting for memory, and ticked tiles are done.
        </p>
      </div>
    </ExhibitFigure>
  );
}
