import { checkMaxSurvive, checkMinLoss } from '../model/challenge';
import { resiliency, type PoolConfig } from '../model/topology';
import { describeConfig } from '../format';

function Card({ title, task, result, onGo }: { title: string; task: string; result: { solved: boolean; message: string }; onGo: () => void }) {
  return (
    <article className={`zfs-challenge${result.solved ? ' is-solved' : ''}`}>
      <h3>{title}</h3>
      <p>{task}</p>
      <p role="status" className="zfs-challenge__verdict">
        {result.solved ? '✓ ' : ''}
        {result.message}
      </p>
      <button type="button" className="btn" onClick={onGo}>
        Go to the tracer
      </button>
    </article>
  );
}

export function Challenges({ config, failed, onGoToTracer }: { config: PoolConfig; failed: number[]; onGoToTracer: () => void }) {
  const r = resiliency(config);
  return (
    <>
      <p>
        Both goals use your current pool, <strong>{describeConfig(config)}</strong>, and the disks failed in the tracer.
        Change the pool above and the goals change with it.
      </p>
      <div className="zfs-challenges">
        <Card
          title="1 · Bend, don’t break"
          task={`Fail as many disks as you can — ${r.mostFailuresThatCanBeSurvived} is possible — while the pool keeps its data.`}
          result={checkMaxSurvive(config, failed)}
          onGo={onGoToTracer}
        />
        <Card
          title="2 · The weakest point"
          task={`Lose the pool’s data with the fewest failed disks — ${r.fewestFailuresThatCanLoseData} is enough.`}
          result={checkMinLoss(config, failed)}
          onGo={onGoToTracer}
        />
      </div>
      <details className="spoiler">
        <summary>Hint</summary>
        <p>
          Only the failures inside each vdev count against that vdev. Spread failures to survive; concentrate them to
          destroy.
        </p>
      </details>
    </>
  );
}
