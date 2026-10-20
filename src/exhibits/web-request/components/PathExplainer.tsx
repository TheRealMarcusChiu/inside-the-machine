import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { ExplanatoryAnimation, type AnimationFrame } from '../../../components/ExplanatoryAnimation';
import { buildJourney, DEFAULT_CONDITIONS, formatMs, type Conditions } from '../model/journey';

interface Scene {
  frame: AnimationFrame;
  /** Simulated scenes are computed by the journey model; the CDN and database scenes are drawn by hand. */
  conditions?: Partial<Conditions>;
  nodes: { name: string; visited: boolean; note?: string }[];
  hops?: string[];
  forbidden?: boolean;
}

const NODE_NAMES = ['Browser', 'DNS resolver', 'Web server', 'Spring app', 'Database'] as const;

function simulated(patch: Partial<Conditions>): Pick<Scene, 'nodes' | 'hops'> & { total: string; rtts: number } {
  const j = buildJourney({ ...DEFAULT_CONDITIONS, ...patch });
  const ran = new Set(j.active.map((s) => s.id));
  const visited = [true, ran.has('dns'), j.reachesServer, j.reachesServer, j.reachesDatabase];
  return {
    nodes: NODE_NAMES.map((name, i) => ({ name, visited: visited[i]! })),
    hops: j.active.filter((s) => s.roundTrips > 0).map((s) => `${s.title} (${s.roundTrips === 0.5 ? '½' : s.roundTrips} RTT)`),
    total: formatMs(j.totalMs),
    rtts: j.roundTrips,
  };
}

const first = simulated({});
const dnsWarm = simulated({ dns: 'warm' });
const reused = simulated({ connection: 'reused' });
const h3 = simulated({ protocol: 'h3' });
const fresh = simulated({ httpCache: 'fresh' });

const SCENES: Scene[] = [
  {
    frame: {
      label: 'First visit',
      caption: `Nothing is cached and no connection exists: DNS, TCP and TLS each cost a round trip before the request can even be sent — ${first.rtts} round trips, ${first.total} at 50 ms RTT.`,
    },
    ...first,
  },
  {
    frame: {
      label: 'DNS cache',
      caption: `With the address cached (until its TTL runs out) the DNS query disappears: ${dnsWarm.rtts} round trips, ${dnsWarm.total}.`,
    },
    ...dnsWarm,
  },
  {
    frame: {
      label: 'Reused connection',
      caption: `The next request on an open, already-encrypted connection skips DNS, TCP and TLS altogether: ${reused.rtts} round trip, ${reused.total}. This is why browsers keep connections alive.`,
    },
    ...reused,
  },
  {
    frame: {
      label: 'HTTP/3',
      caption: `HTTP/3 runs over QUIC, which performs the transport and TLS 1.3 handshakes together: ${h3.rtts} round trips, ${h3.total}.`,
    },
    ...h3,
  },
  {
    frame: {
      label: 'Browser HTTP cache',
      caption: `A fresh cached response is answered without any network traffic: ${fresh.rtts} round trips, ${fresh.total}. Nothing reaches the server or the database.`,
    },
    ...fresh,
  },
  {
    frame: {
      label: 'CDN (not simulated)',
      caption:
        'With a CDN, DNS points the browser at a nearby edge server. TCP and TLS end there, over a short RTT; the edge either answers from its own cache or forwards the request to the origin over a connection it keeps open.',
    },
    nodes: [
      { name: 'Browser', visited: true },
      { name: 'CDN edge', visited: true, note: 'nearby' },
      { name: 'Web server', visited: true, note: 'only on a miss' },
      { name: 'Spring app', visited: true, note: 'only on a miss' },
      { name: 'Database', visited: true, note: 'only on a miss' },
    ],
    hops: ['Handshakes to the edge (short RTT)', 'Edge → origin on a warm connection (on a miss)'],
  },
  {
    frame: {
      label: 'Never: browser → database',
      caption:
        'In every variation the database sits on a private network that only the application can reach, with credentials only the application holds. The browser talks HTTP to the server; the server talks SQL to the database.',
    },
    nodes: NODE_NAMES.map((name) => ({ name, visited: true })),
    forbidden: true,
  },
];

const FRAMES = SCENES.map((s) => s.frame);

function Stage({ scene }: { scene: Scene }) {
  return (
    <div className="wr-scene">
      <ol className="wr-scene__nodes" aria-label="Who takes part">
        {scene.nodes.map((n) => (
          <li key={n.name} className={`wr-scene__node${n.visited ? ' is-visited' : ''}`}>
            <span>{n.name}</span>
            <span className="wr-scene__note">{n.visited ? (n.note ?? 'involved') : 'not involved'}</span>
          </li>
        ))}
      </ol>
      {scene.forbidden && (
        <p className="wr-scene__forbidden">
          <span aria-hidden="true">✕ </span>No direct path from the browser to the database.
        </p>
      )}
      {scene.hops && (
        <ul className="wr-scene__hops" aria-label="Network waits">
          {scene.hops.length ? scene.hops.map((h) => <li key={h}>{h}</li>) : <li>None</li>}
        </ul>
      )}
    </div>
  );
}

export function PathExplainer() {
  return (
    <ExhibitFigure
      kind="explanation"
      title="How the path changes"
      description="A scripted comparison. The round trips and times in each caption are computed by the same journey model, at 50 ms RTT and a 4 ms query; the CDN scene is illustrative and not simulated."
    >
      <ExplanatoryAnimation frames={FRAMES} intervalMs={3200}>
        {(frame) => <Stage scene={SCENES[frame]!} />}
      </ExplanatoryAnimation>
    </ExhibitFigure>
  );
}
