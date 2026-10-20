import type { LlmConfig } from '../model/bottleneck';
import { CHALLENGES, checkChallenge } from '../model/challenges';

export function Challenges({ config, onGoToExplorer }: { config: LlmConfig; onGoToExplorer: () => void }) {
  return (
    <div className="llm-challenges">
      {CHALLENGES.map((c) => {
        const r = checkChallenge(c.id, config);
        return (
          <article key={c.id} className={`llm-challenge${r.solved ? ' is-solved' : ''}`} aria-labelledby={`llm-ch-${c.id}`}>
            <h3 id={`llm-ch-${c.id}`}>{c.title}</h3>
            <p>{c.prompt}</p>
            <p className="llm-challenge__verdict" aria-live="polite">
              <strong>{r.solved ? '✓ Solved.' : 'Not yet.'}</strong> {r.detail}
            </p>
            <details className="llm-spoiler">
              <summary>Hint</summary>
              <p>{c.hint}</p>
            </details>
            <button type="button" className="btn" onClick={onGoToExplorer}>
              Go to the controls
            </button>
          </article>
        );
      })}
    </div>
  );
}
