import { useEffect, useId, useMemo, useReducer, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { useMotion } from '../../../lib/motion';
import {
  ACTORS,
  DB_RANGE,
  DEFAULT_CONDITIONS,
  RTT_RANGE,
  buildJourney,
  compareJourneys,
  formatMs,
  type ActorId,
  type Conditions,
  type Journey,
  type JourneyStep,
} from '../model/journey';
import { SOURCES } from '../model/sources';
import { createPlayer, keyToTraceCommand, playerReducer, type TraceCommand } from '../model/tracePlayer';

export const SIMULATOR_FIGURE_ID = 'request-journey-simulator';
const TICK_MS = 1200;

const ACTOR_INDEX = new Map(ACTORS.map((a, i) => [a.id, i]));
const actorName = (id: ActorId) => ACTORS.find((a) => a.id === id)!.name;
const roundTrips = (n: number) => `${n} network round trip${n === 1 ? '' : 's'}`;

interface Option<V extends string> {
  value: V;
  label: string;
}

function Segmented<V extends string>({
  legend,
  value,
  options,
  onChange,
  hint,
}: {
  legend: string;
  value: V;
  options: readonly Option<V>[];
  onChange: (v: V) => void;
  hint?: string;
}) {
  const name = useId();
  const hintId = `${name}-hint`;
  return (
    <fieldset className="segmented wr-control" aria-describedby={hint ? hintId : undefined}>
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="segmented__option">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
      {hint && (
        <p className="hint wr-control__hint" id={hintId}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint: string;
}) {
  const id = useId();
  return (
    <div className="field field--stack wr-control">
      <label htmlFor={id}>{label}</label>
      <div className="wr-slider">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-describedby={`${id}-hint`}
          aria-valuetext={`${value} milliseconds`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output htmlFor={id} className="mono wr-slider__value">
          {value} ms
        </output>
      </div>
      <p className="hint wr-control__hint" id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  );
}

function Controls({ c, onChange }: { c: Conditions; onChange: (patch: Partial<Conditions>) => void }) {
  const httpCacheId = useId();
  const reused = c.connection === 'reused';
  return (
    <div className="wr-controls">
      <div className="field field--stack wr-control">
        <label htmlFor={httpCacheId}>Browser HTTP cache</label>
        <select
          id={httpCacheId}
          value={c.httpCache}
          onChange={(e) => onChange({ httpCache: e.target.value as Conditions['httpCache'] })}
        >
          <option value="miss">Nothing cached</option>
          <option value="stale">Stale copy (revalidate with ETag)</option>
          <option value="fresh">Fresh copy (within max-age)</option>
        </select>
      </div>
      <Segmented
        legend="DNS"
        value={c.dns}
        onChange={(dns) => onChange({ dns })}
        options={[
          { value: 'cold', label: 'Not cached' },
          { value: 'warm', label: 'Cached' },
        ]}
      />
      <Segmented
        legend="Connection"
        value={c.connection}
        onChange={(connection) => onChange({ connection })}
        options={[
          { value: 'new', label: 'New' },
          { value: 'reused', label: 'Reused (kept alive)' },
        ]}
      />
      <Segmented
        legend="Protocol"
        value={c.protocol}
        onChange={(protocol) => onChange({ protocol })}
        options={[
          { value: 'h2', label: 'HTTP/2 over TCP' },
          { value: 'h3', label: 'HTTP/3 over QUIC' },
        ]}
      />
      <Segmented
        legend="TLS"
        value={c.tls}
        onChange={(tls) => onChange({ tls })}
        hint={reused ? 'Only matters for a new connection — a reused one is already encrypted.' : undefined}
        options={[
          { value: 'full', label: 'Full handshake' },
          { value: 'resumed', label: 'Resumed' },
          { value: 'early', label: 'Resumed + 0-RTT' },
        ]}
      />
      <Segmented
        legend="Server cache"
        value={c.appCache}
        onChange={(appCache) => onChange({ appCache })}
        options={[
          { value: 'miss', label: 'Miss' },
          { value: 'hit', label: 'Hit' },
        ]}
      />
      <Slider
        label="Network round-trip time (RTT)"
        value={c.rttMs}
        min={RTT_RANGE.min}
        max={RTT_RANGE.max}
        onChange={(rttMs) => onChange({ rttMs })}
        hint="Same city ≈ 5–20 ms, across a continent ≈ 50–80 ms, across an ocean ≈ 100–200 ms."
      />
      <Slider
        label="Database query time"
        value={c.dbMs}
        min={DB_RANGE.min}
        max={DB_RANGE.max}
        onChange={(dbMs) => onChange({ dbMs })}
        hint="An indexed lookup by primary key ≈ 1–5 ms; a heavy report query can take far longer."
      />
    </div>
  );
}

function feedback(journey: Journey): string {
  const { rttMs, dbMs } = journey.conditions;
  const baseline = buildJourney({ ...DEFAULT_CONDITIONS, rttMs, dbMs });
  const diff = compareJourneys(baseline, journey);
  const titles = diff.newlySkipped.map((id) => baseline.steps.find((s) => s.id === id)!.title);
  const parts: string[] = [];
  if (diff.savedMs > 0) {
    parts.push(
      `${formatMs(diff.savedMs)} faster than a first visit at this RTT` +
        (diff.savedRoundTrips > 0 ? ` (${roundTrips(diff.savedRoundTrips).replace('network ', '')} fewer).` : '.'),
    );
  } else if (diff.savedMs < 0) {
    parts.push(`${formatMs(-diff.savedMs)} slower than a first visit at this RTT.`);
  } else {
    parts.push('This is the first-visit path: every lookup and handshake happens.');
  }
  if (titles.length) parts.push(`Skipped: ${titles.join(', ')}.`);
  if (journey.conditions.protocol === 'h3' && journey.active.some((s) => s.id === 'quic')) {
    parts.push('QUIC does the transport and TLS handshakes in one round trip.');
  }
  if (journey.status.startsWith('304')) parts.push('The server still ran the controller and query; only the body was saved.');
  return parts.join(' ');
}

function Lanes({ step }: { step: JourneyStep }) {
  const a = ACTOR_INDEX.get(step.from)!;
  const b = ACTOR_INDEX.get(step.to)!;
  const lane = 100 / ACTORS.length;
  // From lane centre to lane centre; a step within one actor is drawn as a loop on its lane.
  const style: CSSProperties =
    a === b
      ? { left: `${(a + 0.5) * lane}%` }
      : { left: `${(Math.min(a, b) + 0.5) * lane}%`, width: `${Math.abs(a - b) * lane}%` };
  const dir = a === b ? 'self' : a < b ? 'right' : 'left';
  return (
    <div className="wr-lanes" aria-hidden="true">
      {ACTORS.map((actor, i) => (
        <span key={actor.id} className="wr-lanes__lane" style={{ left: `${(i + 0.5) * lane}%` }} />
      ))}
      <span className={`wr-lanes__arrow wr-lanes__arrow--${dir}`} style={style} />
    </div>
  );
}

function Bar({ step, total }: { step: JourneyStep; total: number }) {
  if (total <= 0 || step.status === 'skipped') return <span className="wr-bar" aria-hidden="true" />;
  const style: CSSProperties = {
    left: `${(step.startMs / total) * 100}%`,
    width: `max(2px, ${(step.durationMs / total) * 100}%)`,
  };
  return (
    <span className={`wr-bar wr-bar--${step.layer}`} aria-hidden="true">
      <span className="wr-bar__fill" style={style} />
    </span>
  );
}

function TraceList({ journey, cursor, deep }: { journey: Journey; cursor: number; deep: boolean }) {
  const titleId = useId();
  const order = new Map(journey.active.map((s, i) => [s.id, i]));
  return (
    <div className="wr-trace">
      <p className="visually-hidden" id={titleId}>
        Request trace
      </p>
      <div className="wr-trace__head" aria-hidden="true">
        <span className="wr-trace__head-label">Step</span>
        <div className="wr-lanes wr-lanes--head">
          {ACTORS.map((a, i) => (
            <span key={a.id} className="wr-lanes__name" style={{ gridColumn: i + 1 }}>
              {a.name}
            </span>
          ))}
        </div>
        <span className="wr-trace__head-label">Time</span>
      </div>
      <ol className="wr-trace__list" aria-labelledby={titleId}>
        {journey.steps.map((s) => {
          const i = order.get(s.id);
          const done = i !== undefined && i < cursor;
          const current = i !== undefined && i === cursor - 1;
          const state = s.status === 'skipped' ? 'skipped' : current ? 'current' : done ? 'done' : 'pending';
          return (
            <li
              key={s.id}
              className={`wr-step wr-step--${state}`}
              data-status={s.status}
              aria-current={current ? 'step' : undefined}
            >
              <span className="wr-step__num mono" aria-hidden="true">
                {i === undefined ? '–' : i + 1}
              </span>
              <div className="wr-step__body">
                <p className="wr-step__title">
                  <strong>{s.title}</strong>
                  <span className="wr-step__route">
                    {' '}
                    · {actorName(s.from)} → {actorName(s.to)}
                  </span>
                  {s.status === 'skipped' && <span className="wr-step__tag"> · skipped</span>}
                </p>
                <Lanes step={s} />
                {s.status === 'skipped' ? (
                  <p className="wr-step__text">{s.skipReason}</p>
                ) : done ? (
                  <p className="wr-step__text">{s.outcome}</p>
                ) : (
                  <p className="wr-step__text wr-step__text--pending">Not reached yet.</p>
                )}
                {deep && s.status === 'active' && (
                  <p className="wr-step__detail">
                    {s.detail} <span className="wr-step__source">See {s.source.map((id) => SOURCES[id].short).join(', ')}.</span>
                  </p>
                )}
              </div>
              <div className="wr-step__time">
                <span className="mono">{s.status === 'skipped' ? '0 ms' : formatMs(s.durationMs)}</span>
                {s.roundTrips > 0 && <span className="wr-step__rtt">{s.roundTrips === 0.5 ? '½' : s.roundTrips} RTT</span>}
                <Bar step={s} total={journey.totalMs} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface JourneySimulatorProps {
  conditions: Conditions;
  initialStep: number;
  deep: boolean;
  onChange: (patch: Partial<Conditions>) => void;
  onStep: (cursor: number) => void;
}

/** The live simulation: conditions in, a computed journey and a steppable trace out. */
export function JourneySimulator({ conditions, initialStep, deep, onChange, onStep }: JourneySimulatorProps) {
  const { reducedMotion } = useMotion();
  const signature = JSON.stringify(conditions);
  // Keyed on the signature: the conditions object is rebuilt on every render, its contents rarely change.
  const journey = useMemo(() => buildJourney(JSON.parse(signature) as Conditions), [signature]);
  const length = journey.active.length;
  const [player, dispatch] = useReducer(playerReducer, undefined, () => createPlayer(length, initialStep));

  // New conditions mean a new journey: rewind the trace.
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    dispatch({ type: 'load', length });
  }, [signature, length]);

  useEffect(() => {
    if (reducedMotion) dispatch({ type: 'pause' });
  }, [reducedMotion]);

  const playing = player.playing && !reducedMotion;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => dispatch({ type: 'tick' }), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  // Share the trace position, but not every frame of playback.
  useEffect(() => {
    if (!playing) onStep(player.cursor);
  }, [player.cursor, playing, onStep]);

  const cursor = Math.min(player.cursor, length);
  const current = cursor > 0 ? journey.active[cursor - 1] : undefined;

  const run = (command: TraceCommand) => {
    if (reducedMotion && (command === 'toggle' || command === 'replay')) return;
    dispatch({ type: command });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = keyToTraceCommand(event, (event.target as HTMLElement).tagName);
    if (!command) return;
    event.preventDefault();
    run(command);
  };

  return (
    <ExhibitFigure
      kind="simulation"
      id={SIMULATOR_FIGURE_ID}
      title="Request journey simulator"
      description="GET https://shop.example/api/orders/42, fetched by a page script from a Spring application. Change the conditions; the path, timings and trace update immediately."
    >
      <Controls c={conditions} onChange={onChange} />

      <div className="wr-summary" data-testid="journey-summary" role="status">
        <p className="wr-summary__total">
          <span className="wr-summary__label">Total</span> <span className="mono">{formatMs(journey.totalMs)}</span>
        </p>
        <p>
          {roundTrips(journey.roundTrips)} · <span className="mono">{journey.status}</span> ·{' '}
          {journey.reachesDatabase
            ? 'reaches the database'
            : journey.reachesServer
              ? 'answered by the server cache'
              : 'never leaves the browser'}
        </p>
      </div>
      <p className="hint wr-feedback" data-testid="journey-feedback">
        {feedback(journey)}
      </p>

      <div className="wr-player" onKeyDown={onKeyDown}>
        <div className="wr-player__controls" role="group" aria-label="Trace controls">
          <button type="button" className="btn" onClick={() => run('back')} disabled={cursor === 0}>
            <span aria-hidden="true">← </span>Previous step
          </button>
          <button type="button" className="btn btn--primary" onClick={() => run('step')} disabled={cursor >= length}>
            Next step<span aria-hidden="true"> →</span>
          </button>
          {!reducedMotion && (
            <>
              <button type="button" className="btn" aria-pressed={playing} onClick={() => run('toggle')}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" className="btn" onClick={() => run('replay')}>
                Replay
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => run('end')} disabled={cursor >= length}>
            Show all steps
          </button>
          <button type="button" className="btn" onClick={() => run('reset')} disabled={cursor === 0}>
            Reset
          </button>
        </div>
        <p className="hint wr-player__keys">
          Keys while the trace controls have focus: <kbd>→</kbd>/<kbd>N</kbd> next, <kbd>←</kbd>/<kbd>B</kbd> previous,{' '}
          {!reducedMotion && (
            <>
              <kbd>P</kbd> play/pause, <kbd>Shift</kbd>+<kbd>R</kbd> replay,{' '}
            </>
          )}
          <kbd>R</kbd>/<kbd>Home</kbd> reset, <kbd>End</kbd> show all.
          {reducedMotion && ' Autoplay is off while reduced motion is on — step through at your own pace.'}
        </p>
        <p className="wr-player__status" data-testid="trace-status" aria-live={playing ? 'off' : 'polite'}>
          {current ? (
            <>
              <span className="wr-player__count">
                Step {cursor} of {length} · t = {formatMs(current.startMs)}
              </span>{' '}
              <strong>{current.title}.</strong> {current.outcome}
            </>
          ) : (
            <>
              <span className="wr-player__count">Ready · {length} steps</span> Press Next step
              {reducedMotion ? '' : ' or Play'} to follow the request.
            </>
          )}
        </p>
        <TraceList journey={journey} cursor={cursor} deep={deep} />
      </div>
    </ExhibitFigure>
  );
}
