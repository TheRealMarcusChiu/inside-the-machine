import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { useMotion } from '../../../lib/motion';
import {
  bestCaseFailures,
  cleanFailures,
  LAYOUT_LABEL,
  resiliency,
  worstCaseFailures,
  type PoolConfig,
  type VdevHealth,
} from '../model/topology';
import { initialTracer, traceFailures, tracerKeyAction, tracerReducer, type TraceStep, type TracerAction } from '../model/tracer';
import { plural } from '../format';

export const TRACER_FIGURE_ID = 'zfs-failure-tracer';
const TICK_MS = 1000;

function narrate(step: TraceStep, config: PoolConfig): string {
  if (!step.event) {
    return step.index === 0 ? 'All disks online. Fail a disk, or use a preset below.' : '';
  }
  const { vdev, position } = step.event;
  const v = step.health.vdevs[vdev]!;
  const head = `Disk ${position + 1} of vdev ${vdev + 1} failed.`;
  if (v.state === 'FAULTED') {
    const already = step.lostDataHere ? '' : ' The pool had already lost its data.';
    return `${head} vdev ${vdev + 1} has lost ${v.failedCount} disks but tolerates ${v.tolerance}, so the vdev has failed — and because ZFS spreads data across every top-level vdev, the pool’s data is lost.${already}`;
  }
  const others = step.health.vdevs.filter((o) => o.index !== vdev && o.failedCount > 0).length;
  return `${head} vdev ${vdev + 1} is DEGRADED and can lose ${plural(v.margin, 'more disk')}${
    v.margin === 0 ? ' — the next failure in this vdev loses the pool' : ''
  }. Pool DEGRADED${config.vdevs > 1 ? `; ${plural(others, 'other vdev')} also degraded` : ''}.`;
}

function vdevSummary(v: VdevHealth): string {
  if (v.state === 'FAULTED') return `FAULTED · ${v.failedCount} lost, tolerates ${v.tolerance}`;
  return `${v.state} · can lose ${plural(v.margin, 'more')}`;
}

export function FailureTracer({
  config,
  failed,
  onFailedChange,
}: {
  config: PoolConfig;
  failed: number[];
  onFailedChange: (failed: number[]) => void;
}) {
  const { reducedMotion } = useMotion();
  const uid = useId();
  const order = cleanFailures(config, failed);
  const steps = traceFailures(config, order);
  const key = `${config.layout}/${config.width}/${config.vdevs}:${order.join('.')}`;

  // The tracer follows the failure list: a new list jumps to its end (the visitor's latest edit).
  const [tracked, setTracked] = useState({ key, tracer: initialTracer(order.length) });
  let tracer = tracked.tracer;
  if (tracked.key !== key) {
    tracer = tracerReducer(tracer, { type: 'sync', length: order.length });
    setTracked({ key, tracer });
  }
  const dispatch = (a: TracerAction) => setTracked((t) => ({ ...t, tracer: tracerReducer(t.tracer, a) }));

  const playing = tracer.playing && !reducedMotion;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => dispatch({ type: 'tick' }), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const current = steps[tracer.step] ?? steps[steps.length - 1]!;
  const failedAt = new Map(order.map((d, i) => [d, i]));
  const res = resiliency(config);

  const toggleDisk = (d: number) =>
    onFailedChange(failedAt.has(d) ? order.filter((x) => x !== d) : [...order, d]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const action = tracerKeyAction(e.key);
    if (!action) return;
    e.preventDefault();
    if (action.type === 'toggle' && reducedMotion) return;
    dispatch(action);
  };

  return (
    <ExhibitFigure
      kind="simulation"
      id={TRACER_FIGURE_ID}
      title="Failure placement tracer"
      description="Click disks to fail them, then trace the sequence one failure at a time."
    >
      <div className="zfs-tracer" onKeyDown={onKeyDown}>
        <div className="zfs-tracer__head">
          <p className="zfs-tracer__state">
            Pool:{' '}
            <span data-testid="pool-state" className={`zfs-state zfs-state--${current.health.state.toLowerCase()}`}>
              {current.health.state}
            </span>
          </p>
          <p className="zfs-tracer__count" data-testid="tracer-step">
            Failure {tracer.step} of {order.length}
          </p>
        </div>

        <div className="zfs-pool" role="group" aria-label={`Pool: ${plural(config.vdevs, 'top-level vdev')}`}>
          {current.health.vdevs.map((v) => (
            <div
              key={v.index}
              role="group"
              aria-label={`vdev ${v.index + 1}, ${LAYOUT_LABEL[config.layout]}: ${vdevSummary(v)}`}
              className={`zfs-vdev zfs-vdev--${v.state.toLowerCase()}`}
            >
              <p className="zfs-vdev__title" aria-hidden="true">
                vdev {v.index + 1} <span className="zfs-vdev__state">{vdevSummary(v)}</span>
              </p>
              <div className="zfs-vdev__disks">
                {Array.from({ length: config.width }, (_, p) => {
                  const d = v.index * config.width + p;
                  const at = failedAt.get(d);
                  const status = at === undefined ? 'online' : at < tracer.step ? 'failed' : 'queued';
                  const descId = `${uid}-d${d}`;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`zfs-disk zfs-disk--${status}`}
                      aria-label={`vdev ${v.index + 1}, disk ${p + 1}`}
                      aria-describedby={descId}
                      aria-pressed={at !== undefined}
                      onClick={() => toggleDisk(d)}
                    >
                      <span aria-hidden="true" className="zfs-disk__num">
                        {p + 1}
                      </span>
                      <span aria-hidden="true" className="zfs-disk__mark">
                        {status === 'online' ? '' : status === 'failed' ? '✕' : `#${at! + 1}`}
                      </span>
                      <span id={descId} className="visually-hidden">
                        {status === 'online'
                          ? 'online'
                          : status === 'failed'
                            ? `failed (failure ${at! + 1})`
                            : `will fail at step ${at! + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p role="status" className={`zfs-narration${current.health.dataLoss ? ' is-lost' : ''}`}>
          {narrate(current, config)}
        </p>

        <div className="button-row" role="group" aria-label="Tracer controls">
          <button type="button" className="btn" onClick={() => dispatch({ type: 'back' })} disabled={tracer.step === 0}>
            <span aria-hidden="true">← </span>Back
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => dispatch({ type: 'step' })}
            disabled={tracer.step >= order.length}
          >
            Step<span aria-hidden="true"> →</span>
          </button>
          {!reducedMotion && (
            <button
              type="button"
              className="btn"
              aria-pressed={playing}
              onClick={() => dispatch({ type: 'toggle' })}
              disabled={order.length === 0}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => dispatch({ type: 'reset' })} disabled={order.length === 0}>
            Reset
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'replay', autoplay: !reducedMotion })}
            disabled={order.length === 0}
          >
            Replay
          </button>
        </div>
        <p className="hint">
          Shortcuts while focus is in this figure: <kbd>S</kbd> or <kbd>→</kbd> step, <kbd>←</kbd> back,{' '}
          {reducedMotion ? '' : (
            <>
              <kbd>P</kbd> play/pause,{' '}
            </>
          )}
          <kbd>R</kbd> reset.
          {reducedMotion && ' Autoplay is off while reduced motion is on; Replay rewinds so you can step.'}
        </p>

        <div className="button-row" role="group" aria-label="Failure presets">
          <button type="button" className="btn" onClick={() => onFailedChange(bestCaseFailures(config, res.mostFailuresThatCanBeSurvived))}>
            Spread {plural(res.mostFailuresThatCanBeSurvived, 'failure')} (best case)
          </button>
          <button type="button" className="btn" onClick={() => onFailedChange(worstCaseFailures(config))}>
            Concentrate {plural(res.fewestFailuresThatCanLoseData, 'failure')} (worst case)
          </button>
          <button type="button" className="btn" onClick={() => onFailedChange([])} disabled={order.length === 0}>
            Clear failures
          </button>
        </div>
      </div>
    </ExhibitFigure>
  );
}
