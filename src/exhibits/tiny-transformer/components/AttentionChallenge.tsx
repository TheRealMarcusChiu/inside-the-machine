import { fixed, fmtVector } from '../format';
import { DEFAULT_K, DEFAULT_Q, DEFAULT_V, attention, type Matrix } from '../math';

/** Token 1 must give key 2 at least this share of its attention. */
export const CHALLENGE_TARGET = 0.9;

const sameMatrix = (a: Matrix, b: Matrix) => JSON.stringify(a) === JSON.stringify(b);

/** One query that solves it, checked by the same attention code the lab uses. */
const SAMPLE_Q1 = [-2, 4, -2, 4];
const SAMPLE = attention([SAMPLE_Q1, ...DEFAULT_Q.slice(1)], DEFAULT_K, DEFAULT_V);

export function checkChallenge(Q: Matrix, K: Matrix, V: Matrix): { solved: boolean; share: number; hint: string } {
  const share = attention(Q, K, V).weights[0]![1]!;
  if (!sameMatrix(K, DEFAULT_K) || !sameMatrix(V, DEFAULT_V)) {
    return {
      solved: false,
      share,
      hint: 'K or V has been edited. Restore the example numbers, then change only the query q₁.',
    };
  }
  if (share >= CHALLENGE_TARGET) {
    return {
      solved: true,
      share,
      hint: `Solved: token 1 now gives key 2 a weight of ${fixed(share)}.`,
    };
  }
  return {
    solved: false,
    share,
    hint: `Token 1 gives key 2 a weight of ${fixed(share)}; it needs at least ${fixed(CHALLENGE_TARGET, 2)}.`,
  };
}

interface AttentionChallengeProps {
  Q: Matrix;
  K: Matrix;
  V: Matrix;
  onGoToLab: () => void;
}

/** Judged live from the lab's numbers — solve it by editing q₁ in the simulation above. */
export function AttentionChallenge({ Q, K, V, onGoToLab }: AttentionChallengeProps) {
  const result = checkChallenge(Q, K, V);
  return (
    <div className="challenges">
      <article className={`challenge-card${result.solved ? ' is-solved' : ''}`}>
        <h3>Point the query</h3>
        <p>
          Keep K and V as in the example and edit only the first query, q<sub>1</sub>, until token 1 gives key 2 at
          least {fixed(CHALLENGE_TARGET, 2)} of its attention.
        </p>
        <p className="challenge-card__attempt">
          q<sub>1</sub> is now <span className="mono">{fmtVector(Q[0]!)}</span>.
        </p>
        <p role="status" className="challenge-card__verdict">
          <span aria-hidden="true">{result.solved ? '✓ ' : '… '}</span>
          {result.hint}
        </p>
        <p>
          <button type="button" className="btn" onClick={onGoToLab}>
            Go to the attention lab
          </button>
        </p>
        <details className="spoiler">
          <summary>Show the reasoning</summary>
          <p>
            k<sub>2</sub> = <span className="mono">{fmtVector(DEFAULT_K[1]!)}</span>, so large positive 2nd and 4th
            components raise q<sub>1</sub>·k<sub>2</sub>. But k<sub>3</sub> ={' '}
            <span className="mono">{fmtVector(DEFAULT_K[2]!)}</span> also uses the 4th component, so make the 3rd
            negative to push k<sub>3</sub>’s score down, and the 1st negative to do the same for k<sub>1</sub>. For
            example q<sub>1</sub> = <span className="mono">{fmtVector(SAMPLE_Q1)}</span> gives raw scores{' '}
            <span className="mono">{fmtVector(SAMPLE.scores[0]!)}</span> and a weight of{' '}
            {fixed(SAMPLE.weights[0]![1]!)} on key 2. Softmax rewards gaps between scores, not their size alone.
          </p>
        </details>
      </article>
    </div>
  );
}
