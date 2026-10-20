import { cleanFailures, evaluatePool, resiliency, type PoolConfig } from './topology';

export interface ChallengeResult {
  solved: boolean;
  message: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Fail as many disks as possible while the pool keeps its data. */
export function checkMaxSurvive(c: PoolConfig, failed: readonly number[]): ChallengeResult {
  const goal = resiliency(c).mostFailuresThatCanBeSurvived;
  const health = evaluatePool(c, failed);
  const n = health.failedCount;
  if (health.dataLoss) {
    const lost = health.vdevs.find((v) => v.state === 'FAULTED')!;
    return {
      solved: false,
      message: `Data lost: vdev ${lost.index + 1} has ${lost.failedCount} failed disks but tolerates ${lost.tolerance}.`,
    };
  }
  if (n >= goal) return { solved: true, message: `Solved — ${plural(n, 'failed disk')} and the pool still has its data.` };
  return { solved: false, message: `${n} of ${goal} failures placed, pool still alive. Keep going.` };
}

/** Lose the pool with as few failed disks as possible. */
export function checkMinLoss(c: PoolConfig, failed: readonly number[]): ChallengeResult {
  const goal = resiliency(c).fewestFailuresThatCanLoseData;
  const health = evaluatePool(c, failed);
  const n = cleanFailures(c, failed).length;
  if (!health.dataLoss) {
    return { solved: false, message: `${plural(n, 'failed disk')}, and the pool still survives.` };
  }
  if (n > goal) return { solved: false, message: `Data lost with ${n} failures — it can be done with fewer.` };
  return { solved: true, message: `Solved — ${plural(n, 'failure')} in one vdev is enough to lose the pool.` };
}
