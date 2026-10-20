import { useEffect, useState, type ReactNode } from 'react';
import { useMotion } from '../lib/motion';

export interface AnimationFrame {
  label: string;
  caption: ReactNode;
}

interface ExplanatoryAnimationProps {
  frames: readonly AnimationFrame[];
  /** Draw the stage for a frame index. */
  children: (frame: number) => ReactNode;
  intervalMs?: number;
}

/**
 * A scripted, frame-by-frame illustration. It never autoplays: the visitor presses Play,
 * and when reduced motion is in effect Play is withdrawn in favour of manual stepping.
 */
export function ExplanatoryAnimation({ frames, children, intervalMs = 1800 }: ExplanatoryAnimationProps) {
  const { reducedMotion } = useMotion();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const isPlaying = playing && !reducedMotion;
  const last = frames.length - 1;

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setFrame((f) => (f >= last ? 0 : f + 1)), intervalMs);
    return () => window.clearInterval(id);
  }, [isPlaying, last, intervalMs]);

  const current = frames[frame]!;
  const go = (f: number) => {
    setPlaying(false);
    setFrame(Math.min(Math.max(f, 0), last));
  };

  return (
    <div className="explainer" data-playing={isPlaying || undefined}>
      <div className="explainer__stage">{children(frame)}</div>
      <p className="explainer__caption" aria-live={isPlaying ? 'off' : 'polite'}>
        <span className="explainer__count">
          Step {frame + 1} of {frames.length} · {current.label}
        </span>{' '}
        {current.caption}
      </p>
      <div className="explainer__controls" role="group" aria-label="Animation controls">
        <button type="button" className="btn" onClick={() => go(frame - 1)} disabled={frame === 0}>
          <span aria-hidden="true">← </span>Previous step
        </button>
        {reducedMotion ? (
          <span className="explainer__note">Autoplay is off while reduced motion is on — step through at your own pace.</span>
        ) : (
          <button type="button" className="btn" aria-pressed={isPlaying} onClick={() => setPlaying((p) => !p)}>
            {isPlaying ? 'Pause animation' : 'Play animation'}
          </button>
        )}
        <button type="button" className="btn" onClick={() => go(frame + 1)} disabled={frame === last}>
          Next step<span aria-hidden="true"> →</span>
        </button>
      </div>
    </div>
  );
}
