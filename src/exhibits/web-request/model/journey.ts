/**
 * A representative model of one HTTPS request: a page script fetches
 * GET https://shop.example/api/orders/42 from a Spring MVC application backed by
 * a relational database. It is an explanatory model, not a measurement — every
 * step is timed from a few stated assumptions, and steps run strictly one after
 * another. Conditions decide which steps happen at all.
 */

export type DnsState = 'cold' | 'warm';
export type ConnectionState = 'new' | 'reused';
/** full = new TLS 1.3 handshake; resumed = PSK resumption; early = resumption with 0-RTT early data. */
export type TlsMode = 'full' | 'resumed' | 'early';
export type Protocol = 'h2' | 'h3';
export type HttpCacheState = 'miss' | 'stale' | 'fresh';
export type AppCacheState = 'miss' | 'hit';

export interface Conditions {
  dns: DnsState;
  connection: ConnectionState;
  tls: TlsMode;
  protocol: Protocol;
  httpCache: HttpCacheState;
  appCache: AppCacheState;
  /** Browser ↔ server network round-trip time, in milliseconds. */
  rttMs: number;
  /** Time the database spends executing the query, in milliseconds. */
  dbMs: number;
}

export const ALL_CONDITION_VALUES = {
  dns: ['cold', 'warm'],
  connection: ['new', 'reused'],
  tls: ['full', 'resumed', 'early'],
  protocol: ['h2', 'h3'],
  httpCache: ['miss', 'stale', 'fresh'],
  appCache: ['miss', 'hit'],
} as const satisfies { [K in keyof Omit<Conditions, 'rttMs' | 'dbMs'>]: readonly Conditions[K][] };

export const RTT_RANGE = { min: 1, max: 400 } as const;
export const DB_RANGE = { min: 1, max: 500 } as const;

/** The worked example: a first visit. */
export const DEFAULT_CONDITIONS: Conditions = {
  dns: 'cold',
  connection: 'new',
  tls: 'full',
  protocol: 'h2',
  httpCache: 'miss',
  appCache: 'miss',
  rttMs: 50,
  dbMs: 4,
};

/** Fixed server-side costs, in milliseconds. Illustrative orders of magnitude, not benchmarks. */
export const ASSUMED_MS = {
  /** Tomcat accepts the request, runs the filter chain, DispatcherServlet finds and calls the controller. */
  dispatch: 0.5,
  /** In-memory cache lookup in the service layer. */
  appCache: 0.1,
  /** Application ↔ database round trip inside one data centre. */
  dbNetwork: 0.5,
  /** Jackson writes the result as JSON. */
  serialize: 0.5,
} as const;

export type ActorId = 'page' | 'browser' | 'resolver' | 'server' | 'app' | 'db';

export const ACTORS: readonly { id: ActorId; name: string; where: string }[] = [
  { id: 'page', name: 'Page script', where: 'your tab' },
  { id: 'browser', name: 'Browser', where: 'your device' },
  { id: 'resolver', name: 'DNS resolver', where: 'your ISP or a public resolver' },
  { id: 'server', name: 'Web server', where: 'Tomcat inside Spring Boot' },
  { id: 'app', name: 'Spring app', where: 'controller → service → repository' },
  { id: 'db', name: 'Database', where: 'private network, behind the app' },
];

export type StepId =
  | 'browser-cache'
  | 'dns'
  | 'tcp'
  | 'tls'
  | 'quic'
  | 'request'
  | 'dispatch'
  | 'app-cache'
  | 'database'
  | 'serialize'
  | 'response'
  | 'deliver';

export type SourceId = 'rfc1034' | 'rfc8446' | 'rfc9110' | 'rfc9111' | 'rfc9293' | 'rfc9000' | 'rfc9114' | 'spring-mvc' | 'spring-cache' | 'spring-data';

export type Layer = 'browser' | 'network' | 'server' | 'data';

export interface JourneyStep {
  id: StepId;
  title: string;
  layer: Layer;
  from: ActorId;
  to: ActorId;
  status: 'active' | 'skipped';
  /** Why the step did not happen under these conditions. */
  skipReason?: string;
  /** What happened, given these conditions. */
  outcome: string;
  /** What actually travels or runs, in plain words (deep text). */
  detail: string;
  /** Network round trips this step costs (0.5 for a one-way trip). */
  roundTrips: number;
  durationMs: number;
  startMs: number;
  source: SourceId[];
}

export interface Journey {
  conditions: Conditions;
  /** Every step considered, in order, including skipped ones. */
  steps: JourneyStep[];
  active: JourneyStep[];
  totalMs: number;
  roundTrips: number;
  reachesServer: boolean;
  reachesDatabase: boolean;
  status: string;
}

type Draft = Omit<JourneyStep, 'status' | 'startMs' | 'durationMs' | 'roundTrips' | 'skipReason'> &
  ({ skip: string } | { skip?: undefined; roundTrips?: number; durationMs?: number });

const round = (ms: number) => Math.round(ms * 1e6) / 1e6;

export function buildJourney(c: Conditions): Journey {
  const fromCache = c.httpCache === 'fresh';
  const reused = c.connection === 'reused';
  const h3 = c.protocol === 'h3';
  const revalidate = c.httpCache === 'stale';
  const cacheHit = c.appCache === 'hit';
  const rtt = c.rttMs;
  const offline = 'Served from the browser’s HTTP cache — nothing leaves your device.';

  const drafts: Draft[] = [];

  drafts.push({
    id: 'browser-cache',
    title: 'Browser checks its HTTP cache',
    layer: 'browser',
    from: 'page',
    to: 'browser',
    outcome: fromCache
      ? 'Fresh copy found (still within its max-age): the browser answers by itself.'
      : revalidate
        ? 'Stale copy found: the browser must ask the server whether it is still current.'
        : 'Nothing cached for this URL: the request must go to the network.',
    detail:
      'The page calls fetch("/api/orders/42"). Before touching the network, the browser looks for a stored response keyed by the URL. Cache-Control headers from an earlier response decide whether a copy is fresh, stale or absent.',
    source: ['rfc9111'],
    durationMs: 0,
  });

  const dnsSkip = fromCache
    ? offline
    : reused
      ? 'An already open connection is reused, so the server’s address is already known.'
      : c.dns === 'warm'
        ? 'The address is in the browser or OS DNS cache (its TTL has not expired), so no query is sent.'
        : undefined;
  drafts.push({
    id: 'dns',
    title: 'DNS lookup',
    layer: 'network',
    from: 'browser',
    to: 'resolver',
    outcome: 'The resolver answers: shop.example has address 203.0.113.10.',
    detail:
      'The browser asks a recursive resolver for the A/AAAA records of shop.example. This model assumes the resolver already has the answer cached, so the lookup costs one round trip; a resolver starting from scratch would also ask the root, .example and authoritative name servers.',
    source: ['rfc1034'],
    ...(dnsSkip ? { skip: dnsSkip } : { roundTrips: 1 }),
  });

  const tcpSkip = fromCache
    ? offline
    : h3
      ? 'HTTP/3 runs over QUIC on UDP, so there is no TCP handshake.'
      : reused
        ? 'The TCP connection from the previous request is already open (HTTP keeps connections alive).'
        : undefined;
  drafts.push({
    id: 'tcp',
    title: 'TCP handshake',
    layer: 'network',
    from: 'browser',
    to: 'server',
    outcome: 'SYN → SYN-ACK → ACK: a reliable byte stream to port 443 is open.',
    detail:
      'The browser sends SYN, the server replies SYN-ACK, and the browser’s ACK can travel with its first data. That costs one round trip before anything else can be sent.',
    source: ['rfc9293'],
    ...(tcpSkip ? { skip: tcpSkip } : { roundTrips: 1 }),
  });

  const tlsOutcome =
    c.tls === 'full'
      ? 'Keys agreed; the server sent its certificate and proved it owns the matching private key.'
      : c.tls === 'resumed'
        ? 'Resumed with a pre-shared key from an earlier visit: no certificate sent, still one round trip.'
        : 'Resumed with 0-RTT: the GET travels as early data alongside the ClientHello — no certificate, no extra wait.';
  const tlsDetail =
    'TLS 1.3: the ClientHello carries a key share; the ServerHello answers with its own, and both sides derive the same encryption keys. From here on everything — including the URL path and headers — is encrypted.' +
    (c.tls === 'early'
      ? ' Early data can be replayed by an attacker, so it is only safe for idempotent requests such as this GET.'
      : '');
  const tlsSkip = fromCache
    ? offline
    : h3
      ? 'With HTTP/3 the TLS 1.3 handshake is carried inside the QUIC handshake (next step).'
      : reused
        ? 'The open connection is already encrypted, so no new TLS handshake is needed.'
        : undefined;
  drafts.push({
    id: 'tls',
    title: 'TLS handshake',
    layer: 'network',
    from: 'browser',
    to: 'server',
    outcome: tlsOutcome,
    detail: tlsDetail,
    source: ['rfc8446'],
    ...(tlsSkip ? { skip: tlsSkip } : c.tls === 'early' ? { roundTrips: 0 } : { roundTrips: 1 }),
  });

  if (h3) {
    const quicSkip = fromCache
      ? offline
      : reused
        ? 'The QUIC connection from the previous request is already open and encrypted.'
        : undefined;
    drafts.push({
      id: 'quic',
      title: 'QUIC handshake (transport + TLS 1.3 together)',
      layer: 'network',
      from: 'browser',
      to: 'server',
      outcome: c.tls === 'early' ? '0-RTT: the request rides in the first flight.' : tlsOutcome,
      detail:
        'QUIC runs over UDP and performs the transport and TLS 1.3 handshakes in the same round trip, saving the separate TCP round trip.',
      source: ['rfc9000', 'rfc9114', 'rfc8446'],
      ...(quicSkip ? { skip: quicSkip } : c.tls === 'early' ? { roundTrips: 0 } : { roundTrips: 1 }),
    });
  }

  drafts.push({
    id: 'request',
    title: 'HTTP request travels to the server',
    layer: 'network',
    from: 'browser',
    to: 'server',
    outcome: revalidate
      ? 'GET /api/orders/42 with If-None-Match: "v7" (the stored copy’s ETag).'
      : 'GET /api/orders/42 with Accept: application/json.',
    detail: `The request is ${h3 ? 'an HTTP/3 HEADERS frame on a QUIC stream' : 'an HTTP/2 HEADERS frame on a stream of the TCP connection'}, encrypted by TLS. Method, path and headers mean the same in every HTTP version; only the framing differs.`,
    source: h3 ? ['rfc9110', 'rfc9114'] : ['rfc9110'],
    ...(fromCache ? { skip: offline } : { roundTrips: 0.5 }),
  });

  drafts.push({
    id: 'dispatch',
    title: 'Spring routes the request to a controller',
    layer: 'server',
    from: 'server',
    to: 'app',
    outcome: 'OrderController.getOrder(42) is called — the {id} path variable is already parsed.',
    detail:
      'Embedded Tomcat decrypts and parses the request and passes it through the servlet filter chain to Spring’s DispatcherServlet, which asks its HandlerMappings for the method annotated @GetMapping("/api/orders/{id}") and invokes it.',
    source: ['spring-mvc'],
    ...(fromCache ? { skip: offline } : { durationMs: ASSUMED_MS.dispatch }),
  });

  drafts.push({
    id: 'app-cache',
    title: 'Service checks its cache',
    layer: 'server',
    from: 'app',
    to: 'app',
    outcome: cacheHit ? 'Hit: order 42 is in memory, so the database is not asked.' : 'Miss: the service must ask the repository.',
    detail:
      'The controller calls OrderService.find(42), annotated @Cacheable("orders"). Spring’s cache abstraction looks up the key 42 before running the method body.',
    source: ['spring-cache'],
    ...(fromCache ? { skip: offline } : { durationMs: ASSUMED_MS.appCache }),
  });

  drafts.push({
    id: 'database',
    title: 'Repository queries the database',
    layer: 'data',
    from: 'app',
    to: 'db',
    outcome: 'SELECT … FROM orders WHERE id = ? returns one row, mapped to an Order object.',
    detail:
      'A Spring Data repository borrows a pooled JDBC connection and sends a parameterised SQL query over the private network. Only the application holds database credentials; the database is never reachable from the internet.',
    source: ['spring-data'],
    ...(fromCache
      ? { skip: offline }
      : cacheHit
        ? { skip: 'The service cache already had order 42, so the repository is never called.' }
        : { durationMs: ASSUMED_MS.dbNetwork + c.dbMs }),
  });

  drafts.push({
    id: 'serialize',
    title: 'Spring writes the response',
    layer: 'server',
    from: 'app',
    to: 'server',
    outcome: revalidate
      ? 'The body’s ETag still matches "v7", so the body is dropped: 304 Not Modified.'
      : '200 OK, Content-Type: application/json, with an ETag and Cache-Control.',
    detail:
      'An HttpMessageConverter (Jackson) turns the Order into JSON. If ShallowEtagHeaderFilter is installed it hashes that body into an ETag and, when it matches If-None-Match, replaces the response with 304 — saving bandwidth, but not the server work above it.',
    source: ['spring-mvc', 'rfc9110'],
    ...(fromCache ? { skip: offline } : { durationMs: ASSUMED_MS.serialize }),
  });

  drafts.push({
    id: 'response',
    title: 'HTTP response travels back',
    layer: 'network',
    from: 'server',
    to: 'browser',
    outcome: revalidate ? '304 Not Modified, with no body.' : '200 OK with a small JSON body (assumed to fit in one flight).',
    detail:
      'The response travels back over the same encrypted connection. The browser stores it in its HTTP cache if the headers allow, and keeps the connection open for the next request.',
    source: ['rfc9110'],
    ...(fromCache ? { skip: offline } : { roundTrips: 0.5 }),
  });

  drafts.push({
    id: 'deliver',
    title: 'The page receives the response',
    layer: 'browser',
    from: 'browser',
    to: 'page',
    outcome: fromCache
      ? 'The cached JSON is handed to the page.'
      : revalidate
        ? 'The browser hands the page its cached copy, now confirmed current (the page sees 200).'
        : 'The fetch() promise resolves with the JSON.',
    detail: 'Rendering, JavaScript and the rest of the page are outside this model.',
    source: ['rfc9110'],
    durationMs: 0,
  });

  let clock = 0;
  const steps: JourneyStep[] = drafts.map((d) => {
    const { skip, ...rest } = d as Draft & { skip?: string; roundTrips?: number; durationMs?: number };
    if (skip) return { ...rest, status: 'skipped', skipReason: skip, roundTrips: 0, durationMs: 0, startMs: clock };
    const roundTrips = rest.roundTrips ?? 0;
    const durationMs = round(rest.durationMs ?? roundTrips * rtt);
    const s: JourneyStep = { ...rest, status: 'active', roundTrips, durationMs, startMs: clock };
    clock = round(clock + durationMs);
    return s;
  });

  const active = steps.filter((s) => s.status === 'active');
  const has = (id: StepId) => active.some((s) => s.id === id);
  return {
    conditions: c,
    steps,
    active,
    totalMs: clock,
    roundTrips: active.reduce((n, s) => n + s.roundTrips, 0),
    reachesServer: has('dispatch'),
    reachesDatabase: has('database'),
    status: fromCache ? '200 OK (from browser cache)' : revalidate ? '304 Not Modified' : '200 OK',
  };
}

export interface JourneyComparison {
  savedMs: number;
  savedRoundTrips: number;
  /** Steps that ran in the baseline but are skipped now, in order. */
  newlySkipped: StepId[];
}

export function compareJourneys(baseline: Journey, current: Journey): JourneyComparison {
  const ran = new Set(baseline.active.map((s) => s.id));
  return {
    savedMs: round(baseline.totalMs - current.totalMs),
    savedRoundTrips: baseline.roundTrips - current.roundTrips,
    newlySkipped: current.steps.filter((s) => s.status === 'skipped' && ran.has(s.id)).map((s) => s.id),
  };
}

/** Every discrete combination of conditions, crossed with the given RTT and database times. */
export function allConditionCombinations(rtts: readonly number[], dbs: readonly number[]): Conditions[] {
  const out: Conditions[] = [];
  const v = ALL_CONDITION_VALUES;
  for (const dns of v.dns)
    for (const connection of v.connection)
      for (const tls of v.tls)
        for (const protocol of v.protocol)
          for (const httpCache of v.httpCache)
            for (const appCache of v.appCache)
              for (const rttMs of rtts)
                for (const dbMs of dbs) out.push({ dns, connection, tls, protocol, httpCache, appCache, rttMs, dbMs });
  return out;
}

export function formatMs(ms: number): string {
  const r = Math.round(ms * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} ms`;
}
