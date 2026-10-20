import { CHALLENGES, checkDatabaseBottleneck, checkOneRoundTrip } from '../model/challenge';
import type { Conditions } from '../model/journey';

const CHECKS = {
  'one-round-trip': checkOneRoundTrip,
  'db-bottleneck': checkDatabaseBottleneck,
} as const;

const REASONING = {
  'one-round-trip':
    'Reuse the connection: DNS, TCP and TLS are already done, so only the request and response cross the network. Alternatively, with a cached DNS answer, HTTP/3 and 0-RTT resumption, the request leaves with the very first handshake packet. Turning on the browser or server cache does not count — then the database is never asked.',
  'db-bottleneck':
    'A new connection pays four round trips, so the query must take longer than about four RTTs: at 5 ms RTT (a server in your own city) anything above about 21 ms works; at 50 ms it needs more than about 201 ms. Far from the server, the network dominates; close to it, slow queries do.',
} as const;

/** Both challenges are judged live from the simulator's conditions — solve them with the controls above. */
export function Challenges({ conditions, onGoToSimulator }: { conditions: Conditions; onGoToSimulator: () => void }) {
  return (
    <div className="wr-challenges">
      {CHALLENGES.map((challenge) => {
        const result = CHECKS[challenge.id](conditions);
        return (
          <article key={challenge.id} className={`wr-challenge${result.solved ? ' is-solved' : ''}`}>
            <h3>{challenge.title}</h3>
            <p>{challenge.prompt}</p>
            <p role="status" className="wr-challenge__verdict">
              <span aria-hidden="true">{result.solved ? '✓ ' : '… '}</span>
              {result.hint}
            </p>
            <p>
              <button type="button" className="btn" onClick={onGoToSimulator}>
                Go to the simulator
              </button>
            </p>
            <details className="wr-spoiler">
              <summary>Show the reasoning</summary>
              <p>{REASONING[challenge.id]}</p>
            </details>
          </article>
        );
      })}
    </div>
  );
}
