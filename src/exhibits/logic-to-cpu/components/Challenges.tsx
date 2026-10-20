import { add4 } from '../sim/adder';
import { ADDER_CHALLENGE, CPU_CHALLENGE, checkAdderChallenge, checkCpuChallenge } from '../sim/challenge';
import type { Bit } from '../sim/gates';
import type { ProgramChoice } from '../urlConfig';

const nibble = (n: number) => n.toString(2).padStart(4, '0');

interface ChallengesProps {
  a: number;
  b: number;
  cin: Bit;
  program: ProgramChoice;
  source: string;
  onGoToAdder: () => void;
  onGoToCpu: () => void;
}

/** Both challenges are judged live from the exhibit's shared state — solve them in the labs above. */
export function Challenges({ a, b, cin, program, source, onGoToAdder, onGoToCpu }: ChallengesProps) {
  const adder = checkAdderChallenge(a, b, cin);
  const r = add4(a, b, cin);
  const cpu = program === 'custom' ? checkCpuChallenge(source) : undefined;

  return (
    <div className="challenges">
      <article className={`challenge-card${adder.solved ? ' is-solved' : ''}`}>
        <h3>The lost sixteen</h3>
        <p>{ADDER_CHALLENGE.prompt}</p>
        <p className="challenge-card__attempt">
          The adder is set to {a} + {b}
          {cin ? ' + carry-in 1' : ''}, showing <span className="mono">{nibble(r.sum)}</span> with carry-out {r.carryOut}.
        </p>
        <p role="status" className="challenge-card__verdict">
          <span aria-hidden="true">{adder.solved ? '✓ ' : '… '}</span>
          {adder.hint}
        </p>
        <p>
          <button type="button" className="btn" onClick={onGoToAdder}>
            Go to the 4-bit adder
          </button>
        </p>
        <details className="spoiler">
          <summary>Show the reasoning</summary>
          <p>
            The carry-out wire is the adder’s fifth bit, worth 16. Showing 0010 with carry-out 1 therefore means a true
            total of 16 + 2 = 18. Any inputs that add up to 18 work: 9 + 9, 15 + 3, or 8 + 9 with the carry-in set.
          </p>
        </details>
      </article>

      <article className={`challenge-card challenge-card--stretch${cpu?.solved ? ' is-solved' : ''}`}>
        <h3>Stretch: make the CPU subtract</h3>
        <p>{CPU_CHALLENGE.prompt}</p>
        <p className="challenge-card__verdict" aria-live="polite">
          {cpu ? (
            <>
              <span aria-hidden="true">{cpu.solved ? '✓ ' : '… '}</span>
              {cpu.hint}
            </>
          ) : (
            'Not attempted yet: choose “Your own program” in the CPU lab, write it, and press Assemble and load. It is checked here automatically.'
          )}
        </p>
        <p>
          <button type="button" className="btn" onClick={onGoToCpu}>
            Go to the CPU lab
          </button>
        </p>
      </article>
    </div>
  );
}
