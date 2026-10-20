import { useEffect, useId, useState } from 'react';
import { useMotion } from '../../../lib/motion';
import { GUIDE_FRAMES } from '../urlConfig';

const FRAME_MS = 2200;

/** Scripted captions. The figure shows shapes only; it does no arithmetic. */
const FRAMES: readonly { label: string; caption: string }[] = [
  {
    label: 'Compare',
    caption: 'One token’s query is compared with the key of every token, including its own.',
  },
  {
    label: 'Score',
    caption: 'Each comparison gives a score: larger when the query and the key point the same way.',
  },
  {
    label: 'Share out',
    caption: 'Scaling and softmax turn the scores into shares of attention that add up to 1.',
  },
  {
    label: 'Blend',
    caption: 'The token’s new vector is a blend of every value, mixed in those shares.',
  },
];

/** Illustrative shares — deliberately not linked to the numbers in the lab. */
const SHARES = [0.6, 0.15, 0.25];
const KEY_Y = [50, 120, 190];
const BAR_MAX = 90;

export function AttentionGuide({ frame, onFrame }: { frame: number; onFrame: (frame: number) => void }) {
  const { reducedMotion } = useMotion();
  const uid = useId();
  const [playing, setPlaying] = useState(false);
  const isPlaying = playing && !reducedMotion;
  const last = GUIDE_FRAMES - 1;

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setTimeout(() => onFrame(frame >= last ? 0 : frame + 1), FRAME_MS);
    return () => window.clearTimeout(id);
  }, [isPlaying, frame, last, onFrame]);

  const go = (f: number) => {
    setPlaying(false);
    onFrame(Math.min(Math.max(f, 0), last));
  };
  const current = FRAMES[frame]!;

  return (
    <figure
      className="exhibit-figure exhibit-figure--explanation tt-figure tt-figure--guide"
      aria-labelledby={`${uid}-kind ${uid}-title`}
      data-frame={frame}
      data-playing={isPlaying || undefined}
    >
      <figcaption className="exhibit-figure__caption">
        <span id={`${uid}-kind`} className="kind-badge kind-badge--explanation">
          <span className="kind-badge__icon" aria-hidden="true">
            ▷
          </span>
          Animation (visual guide only)
        </span>
        <span className="exhibit-figure__title" id={`${uid}-title`}>
          How one token gathers information from the others
        </span>
        <span className="exhibit-figure__description">
          A scripted illustration with made-up proportions. It does not use your numbers — the lab below does the real
          arithmetic.
        </span>
      </figcaption>
      <div className="exhibit-figure__body">
        <svg className="tt-guide" viewBox="0 0 520 240" role="img" aria-labelledby={`${uid}-caption`}>
          {/* Query */}
          <g className="tt-guide__query">
            <circle cx="60" cy="120" r="26" />
            <text x="60" y="126" textAnchor="middle">
              query
            </text>
          </g>
          {/* Comparison lines, thickness = share once scored */}
          {KEY_Y.map((y, j) => (
            <line
              key={`l${j}`}
              className="tt-guide__link"
              x1="86"
              y1="120"
              x2="174"
              y2={y}
              style={{ strokeWidth: frame >= 1 ? 1 + SHARES[j]! * 9 : 2 }}
            />
          ))}
          {/* Keys with their values */}
          {KEY_Y.map((y, j) => (
            <g key={`k${j}`} className="tt-guide__key">
              <rect x="174" y={y - 18} width="64" height="36" rx="6" />
              <text x="206" y={y + 5} textAnchor="middle">
                key {j + 1}
              </text>
              <rect className="tt-guide__value" x="250" y={y - 18} width="64" height="36" rx="6" />
              <text x="282" y={y + 5} textAnchor="middle">
                value {j + 1}
              </text>
            </g>
          ))}
          {/* Score / share bars */}
          {KEY_Y.map((y, j) => (
            <rect
              key={`b${j}`}
              className="tt-guide__bar"
              x="326"
              y={y - 6}
              height="12"
              rx="3"
              width={BAR_MAX}
              style={{ transform: `scaleX(${frame >= 2 ? SHARES[j]! : frame === 1 ? 0.3 + SHARES[j]! * 0.7 : 0})` }}
            />
          ))}
          {/* Blend into the output */}
          {KEY_Y.map((y, j) => (
            <line
              key={`m${j}`}
              className="tt-guide__mix"
              x1="314"
              y1={y}
              x2="440"
              y2="120"
              style={{ strokeWidth: 1 + SHARES[j]! * 9 }}
            />
          ))}
          <g className="tt-guide__output">
            <rect x="440" y="96" width="70" height="48" rx="8" />
            <text x="475" y="125" textAnchor="middle">
              output
            </text>
          </g>
        </svg>
        <p className="tt-guide__caption" id={`${uid}-caption`} aria-live={isPlaying ? 'off' : 'polite'}>
          <span className="tt-guide__count">
            Frame {frame + 1} of {GUIDE_FRAMES} · {current.label}
          </span>{' '}
          {current.caption}
        </p>
        <ol className="tt-guide__dots" aria-hidden="true">
          {FRAMES.map((f, i) => (
            <li key={f.label} data-current={i === frame || undefined} />
          ))}
        </ol>
        <div className="button-row" role="group" aria-label="Visual guide controls">
          <button type="button" className="btn" onClick={() => go(frame - 1)} disabled={frame === 0}>
            <span aria-hidden="true">← </span>Previous frame
          </button>
          {reducedMotion ? (
            <span className="hint">Auto-advance is off while reduced motion is on — step through at your own pace.</span>
          ) : (
            <button type="button" className="btn" onClick={() => setPlaying((p) => !p)}>
              {isPlaying ? 'Pause guide' : 'Play guide'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => go(frame + 1)} disabled={frame === last}>
            Next frame<span aria-hidden="true"> →</span>
          </button>
        </div>
      </div>
    </figure>
  );
}
