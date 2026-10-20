import { useEffect, useMemo, useState } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { useMotion } from '../../../lib/motion';
import { decodeTimeline, type LlmConfig } from '../model/bottleneck';
import { formatBytes, formatCount, formatSeconds } from '../model/format';
import { boundLabel } from './Explorer';

export const REPLAY_FRAMES = 8;
export const TOKENS_PER_FRAME = 512;
const INTERVAL_MS = 900;

/**
 * Replays a generation in chunks of {@link TOKENS_PER_FRAME} decode steps. Every number comes from
 * the cost model; the timer only paces the reveal. Autoplay is withdrawn under reduced motion.
 */
export function GenerationReplay({ config }: { config: LlmConfig }) {
  const { reducedMotion } = useMotion();
  const frames = useMemo(() => decodeTimeline(config, REPLAY_FRAMES, TOKENS_PER_FRAME), [config]);
  const last = frames.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const isPlaying = playing && !reducedMotion;

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setIndex((i) => Math.min(i + 1, last)), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPlaying, last]);

  // Stop at the final frame rather than looping: the replay tells one story.
  useEffect(() => {
    if (index >= last) setPlaying(false);
  }, [index, last]);

  const frame = frames[index]!;
  const maxStep = frames[last]!.secondsPerStep;

  const step = () => {
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, last));
  };
  const reset = () => {
    setPlaying(false);
    setIndex(0);
  };
  const togglePlay = () => {
    if (!isPlaying && index >= last) setIndex(0);
    setPlaying((p) => !p);
  };
  const replay = () => {
    setIndex(0);
    setPlaying(true);
  };

  return (
    <ExhibitFigure
      kind="simulation"
      title="Generation replay"
      description={`Decode ${formatCount(REPLAY_FRAMES * TOKENS_PER_FRAME)} more tokens per sequence, ${TOKENS_PER_FRAME} at a time. Each bar is the lower-bound time of one decode step at that context.`}
    >
      <div className="llm-replay">
        <ol className="llm-replay__bars" aria-hidden="true">
          {frames.map((f) => (
            <li
              key={f.index}
              className={`llm-replay__bar${f.index === index ? ' is-current' : ''}${f.index > index ? ' is-future' : ''}`}
            >
              <span style={{ height: `${Math.max(4, (100 * f.secondsPerStep) / maxStep)}%` }} />
              <small>{f.context >= 1000 ? `${Number((f.context / 1000).toPrecision(3))}k` : f.context}</small>
            </li>
          ))}
        </ol>
        <p className="llm-replay__status" role="status" aria-live={isPlaying ? 'off' : 'polite'}>
          <span className="llm-replay__count">
            Frame {index + 1} of {frames.length}
          </span>{' '}
          Context {formatCount(frame.context)} tokens · generated {formatCount(frame.generatedTokens)} tokens in total ·
          KV cache {formatBytes(frame.kvBytesTotal)} · each step ≥ {formatSeconds(frame.secondsPerStep)} (
          {boundLabel(frame.bound).toLowerCase()}) · elapsed ≥ {formatSeconds(frame.elapsedSeconds)}
        </p>
        <div className="button-row" role="group" aria-label="Replay controls">
          <button type="button" className="btn" onClick={step} disabled={index >= last}>
            Step forward<span aria-hidden="true"> →</span>
          </button>
          {!reducedMotion && (
            <button type="button" className="btn" aria-pressed={isPlaying} onClick={togglePlay}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}
          <button type="button" className="btn" onClick={reset} disabled={index === 0 && !isPlaying}>
            Reset
          </button>
          {!reducedMotion && (
            <button type="button" className="btn" onClick={replay}>
              Replay from the start
            </button>
          )}
        </div>
        {reducedMotion && (
          <p className="hint">Autoplay is off while reduced motion is on — use Step forward at your own pace.</p>
        )}
      </div>
    </ExhibitFigure>
  );
}
