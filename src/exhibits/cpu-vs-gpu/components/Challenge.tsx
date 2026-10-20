import { useMemo } from 'react';
import { buildTrace, cpuWins, type Workload } from '../model';

interface ChallengeProps {
  workload: Workload;
  onGoToLab: () => void;
}

/** Judged live from the workload in the URL — solve it with the lab's controls. */
export function Challenge({ workload, onGoToLab }: ChallengeProps) {
  const { lanes, warpWidth, divergence, regularity, transfer } = workload;
  const trace = useMemo(
    () => buildTrace({ lanes, warpWidth, divergence, regularity, transfer }),
    [lanes, warpWidth, divergence, regularity, transfer],
  );
  const won = cpuWins(trace);
  const { cpu, gpu } = trace;

  return (
    <article className={`challenge-card${won ? ' is-solved' : ''}`}>
      <h3>Make the CPU win</h3>
      <p>
        GPUs are not simply faster. Find a workload where the 4-wide CPU vector unit finishes the whole job in fewer
        cycles than the GPU.
      </p>
      <p className="challenge-card__attempt">
        Current workload: CPU SIMD {cpu.totalCycles} cycles, GPU SIMT {gpu.totalCycles} cycles.
      </p>
      <p role="status" className="challenge-card__verdict">
        <span aria-hidden="true">{won ? '✓ ' : '… '}</span>
        {won
          ? `Solved: the CPU finishes ${gpu.totalCycles - cpu.totalCycles} cycles sooner. Which change made the difference?`
          : 'Not yet: the GPU is ahead or level. Hint: what must happen before the GPU’s first warp can start, and after its last?'}
      </p>
      <p>
        <button type="button" className="btn" onClick={onGoToLab}>
          Go to the execution trace
        </button>
      </p>
      <details className="spoiler">
        <summary>Show the reasoning</summary>
        <p>
          A GPU wins by spreading a large, uniform job across wide warps. Take that away and its overheads show: a
          host ↔ device copy costs more than a tiny job saves, divergent branches make a warp run each path in turn,
          and scattered addresses turn one memory transaction into one per lane. At this toy scale the copy alone is
          enough; add four branch paths and irregular access to eight lanes and the CPU is far ahead. Real GPUs need
          millions of elements, and plenty of arithmetic per element, before the copy pays for itself.
        </p>
      </details>
    </article>
  );
}
