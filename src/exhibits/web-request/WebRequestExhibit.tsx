import { useCallback, useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import { Challenges } from './components/Challenges';
import { JourneySimulator, SIMULATOR_FIGURE_ID } from './components/JourneySimulator';
import { PathExplainer } from './components/PathExplainer';
import { ASSUMED_MS, buildJourney, DEFAULT_CONDITIONS, formatMs, type Conditions } from './model/journey';
import { SOURCE_ORDER, SOURCES } from './model/sources';
import { toConditions, type Depth } from './urlConfig';
import { useWebRequestUrlState } from './useWebRequestUrlState';
import './exhibit.css';

const SLUG = 'web-request';

const SECTIONS = [
  { id: 'journey', toc: 'The journey', title: 'The journey of one request' },
  { id: 'changes', toc: 'What changes the path', title: 'What changes the path' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: one order, two requests' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Assumptions & limits', title: 'Assumptions, units & limitations' },
  { id: 'sources', toc: 'Sources', title: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

function Section({ id, children, className }: { id: SectionId; children: ReactNode; className?: string }) {
  const { title } = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} className={`wr-section${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Deep({ children }: { children: ReactNode }) {
  return (
    <div className="wr-deep">
      <p className="wr-deep__label" aria-hidden="true">
        Deep dive
      </p>
      {children}
    </div>
  );
}

function useFocusTarget() {
  const { reducedMotion } = useMotion();
  return (elementId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
}

function DepthSwitch({ depth, onChange }: { depth: Depth; onChange: (d: Depth) => void }) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend>Explanation depth</legend>
      {(['short', 'deep'] as const).map((d) => (
        <label key={d} className="segmented__option">
          <input type="radio" name={name} value={d} checked={depth === d} onChange={() => onChange(d)} />
          <span>{d === 'short' ? 'Short' : 'Deep'}</span>
        </label>
      ))}
    </fieldset>
  );
}

function CopyLink() {
  const [message, setMessage] = useState('');
  const copy = () => {
    if (!navigator.clipboard) {
      setMessage('Copying is unavailable here — copy the address bar instead.');
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(
      () => setMessage('Link copied. It reproduces these conditions and this trace step.'),
      () => setMessage('Could not copy — copy the address bar instead.'),
    );
  };
  return (
    <div className="wr-copy-link">
      <button type="button" className="btn" onClick={copy}>
        Copy a link to this exact state
      </button>
      <span className="hint" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

const SECOND_REQUEST: Conditions = { ...DEFAULT_CONDITIONS, connection: 'reused' };

function WorkedExample({ onLoad }: { onLoad: (c: Conditions) => void }) {
  const first = buildJourney(DEFAULT_CONDITIONS);
  const second = buildJourney(SECOND_REQUEST);
  const serverMs = ASSUMED_MS.dispatch + ASSUMED_MS.appCache + ASSUMED_MS.dbNetwork + DEFAULT_CONDITIONS.dbMs + ASSUMED_MS.serialize;
  return (
    <>
      <p>
        A shopper in Lisbon opens an order page; the page script calls <code>GET /api/orders/42</code> on a server whose
        network round-trip time (RTT) from them is 50 ms. The database lookup by primary key takes 4 ms. Nothing is
        cached yet.
      </p>
      <ol className="wr-worked-steps">
        {first.active
          .filter((s) => s.durationMs > 0)
          .map((s) => (
            <li key={s.id}>
              {s.title}: <span className="mono">{formatMs(s.durationMs)}</span>
              {s.roundTrips > 0 ? ` (${s.roundTrips === 0.5 ? 'half a round trip' : `${s.roundTrips} round trip`})` : ''}
            </li>
          ))}
      </ol>
      <p>
        Network: 4 round trips × 50 ms = <span className="mono">200 ms</span>. Server and database:{' '}
        {ASSUMED_MS.dispatch} + {ASSUMED_MS.appCache} + ({ASSUMED_MS.dbNetwork} + {DEFAULT_CONDITIONS.dbMs}) +{' '}
        {ASSUMED_MS.serialize} = <span className="mono">{formatMs(serverMs)}</span>. Total{' '}
        <span className="mono">{formatMs(first.totalMs)}</span>, of which the database is about{' '}
        {Math.round(((ASSUMED_MS.dbNetwork + DEFAULT_CONDITIONS.dbMs) / first.totalMs) * 100)}%.
      </p>
      <p>
        A second later the page asks again on the same connection. DNS, TCP and TLS are already done, so only the request
        and response cross the network: 1 round trip × 50 ms + {formatMs(serverMs)} ={' '}
        <span className="mono">{formatMs(second.totalMs)}</span> — nearly four times faster, with the very same server
        work. On a first visit, distance costs far more than the database.
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => onLoad(DEFAULT_CONDITIONS)}>
          Load the first visit into the simulator
        </button>
        <button type="button" className="btn" onClick={() => onLoad(SECOND_REQUEST)}>
          Load the second request into the simulator
        </button>
      </div>
    </>
  );
}

export default function WebRequestExhibit() {
  const [state, update] = useWebRequestUrlState();
  const focusTarget = useFocusTarget();
  const deep = state.depth === 'deep';
  const conditions = toConditions(state);
  const onStep = useCallback((step: number) => update({ step }), [update]);

  // Deep links such as ?at=sources open the page at that section.
  useEffect(() => {
    const at = parseHash(window.location.hash).params.get('at');
    if (at && SECTION_IDS.has(at)) focusTarget(`${at}-title`);
    // Only on arrival; later section jumps come from the table of contents.
  }, []);

  const jumpTo = (id: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    replaceHashParams((params) => {
      params.set('at', id);
      return params;
    });
    focusTarget(`${id}-title`);
  };

  return (
    <article className="wr-exhibit" aria-labelledby="exhibit-title">
      <div className="wr-header">
        <p className="eyebrow">Networks &amp; servers · Representative model</p>
        <h1 id="exhibit-title">The journey of a web request</h1>
        <p className="wr-header__subtitle">From a URL in your browser to a row in a database, and back again.</p>
        <div className="wr-header__controls">
          <DepthSwitch depth={state.depth} onChange={(depth) => update({ depth })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds what travels on the wire, what Spring
            does inside, and where each idea is specified.
          </p>
        </div>
        <div className="wr-header__legend">
          <p>
            <KindBadge kind="simulation" /> figures compute their output from a working model as you interact.{' '}
            <KindBadge kind="explanation" /> figures are scripted illustrations you step through.
          </p>
          <CopyLink />
        </div>
      </div>

      <div className="wr-layout">
        <nav className="wr-toc" aria-label="On this page">
          <p className="wr-toc__title" aria-hidden="true">
            On this page
          </p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#/exhibits/${SLUG}?at=${s.id}`} onClick={jumpTo(s.id)}>
                  {s.toc}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="wr-body">
          <Section id="journey">
            <aside className="wr-model-note" role="note" aria-labelledby="wr-model-note-title">
              <p className="wr-model-note__title" id="wr-model-note-title">
                A representative model, not every request
              </p>
              <p>
                This exhibit follows one typical HTTPS API call to a Java application built with Spring. It is an
                explanatory model: it shows the usual order of events and their rough cost, not every request. Real
                requests may skip steps, add others (proxies, load balancers, CDNs, authentication, redirects) or
                overlap them. Timings come from a few stated assumptions, not measurements.
              </p>
            </aside>
            <p className="wr-lede">
              When a page asks for <code>https://shop.example/api/orders/42</code>, the browser must first find the
              server (DNS), open a connection to it (TCP), make that connection private (TLS) and only then send the HTTP
              request. On the server, Spring hands the request to a controller method, which asks a service, which asks
              the database. The answer retraces the path as an HTTP response. The browser never talks directly to the
              database: only the application can reach it.
            </p>
            {deep && (
              <Deep>
                <p>
                  Each network step costs at least one <em>round trip</em> — a message there and a reply back — and
                  nothing in this model can go faster than light in fibre (roughly 200 km per millisecond). That is why
                  the round-trip time (RTT), not bandwidth, dominates small API calls: the request and its JSON answer
                  are a few kilobytes, but a first visit needs several round trips before the first byte of the answer
                  can even be sent.
                </p>
                <p>
                  Inside the server, embedded Tomcat parses the request and passes it through the servlet filter chain
                  to Spring’s DispatcherServlet — the single front controller — which asks its handler mappings which
                  method is annotated <code>@GetMapping("/api/orders/{'{id}'}")</code>. The controller delegates to a
                  service; the service (or a <code>@Cacheable</code> proxy around it) delegates to a Spring Data
                  repository, which borrows a pooled JDBC connection and sends SQL. On the way out, an HTTP message
                  converter (Jackson) writes the object as JSON.
                </p>
              </Deep>
            )}
            <JourneySimulator
              conditions={conditions}
              initialStep={state.step}
              deep={deep}
              onChange={(patch) => update({ ...patch, step: 0 })}
              onStep={onStep}
            />
          </Section>

          <Section id="changes">
            <p className="wr-lede">
              The full path above is the worst case. Most requests take a shortcut somewhere, and each shortcut removes
              whole round trips:
            </p>
            <ul className="wr-change-list">
              <li>
                <strong>DNS cache.</strong> Browsers, operating systems and resolvers keep answers for the record’s
                time-to-live (TTL). A cached answer removes the DNS round trip.
              </li>
              <li>
                <strong>Browser HTTP cache.</strong> A response marked fresh (for example <code>Cache-Control: max-age=60</code>)
                is reused without any network traffic. A stale one is revalidated with <code>If-None-Match</code>; a{' '}
                <code>304 Not Modified</code> saves sending the body again, but not the round trip.
              </li>
              <li>
                <strong>Reused connection.</strong> HTTP keeps connections open, and HTTP/2 and HTTP/3 multiplex many
                requests over one. The second request on a warm connection skips DNS, TCP and TLS entirely.
              </li>
              <li>
                <strong>TLS resumption.</strong> A returning browser can resume with a key from its last visit: no
                certificate is sent. With 0-RTT early data it can even send a safe request in its first flight.
              </li>
              <li>
                <strong>CDN.</strong> A content delivery network answers DNS with a nearby edge server, so the handshakes
                cross a short distance. The edge may answer from its own cache or forward to the origin over a connection
                it already holds open. The simulator does not model a CDN; the scene below sketches it.
              </li>
              <li>
                <strong>HTTP/3.</strong> HTTP/3 runs over QUIC on UDP, which combines the transport and TLS handshakes
                into one round trip — and survives a phone switching from Wi-Fi to mobile data.
              </li>
              <li>
                <strong>Server-side caches.</strong> A cache in the application (or in front of it) can answer without a
                database query. The request still crosses the network.
              </li>
            </ul>
            <p>
              What never changes: the browser never talks directly to the database. The database lives on a private
              network and accepts connections only from the application, with credentials only the application holds. The
              browser speaks HTTP to the server; the server speaks SQL to the database.
            </p>
            {deep && (
              <Deep>
                <p>
                  Caching layers stack. A single request may be answered by the browser cache, a service worker, a CDN
                  edge, a reverse proxy, an application cache or the database’s own buffer pool — each one closer to the
                  user is cheaper, and each one risks serving data that is slightly out of date. HTTP gives the server the
                  vocabulary to choose: <code>max-age</code> for how long a copy is fresh, <code>ETag</code> and{' '}
                  <code>If-None-Match</code> for checking cheaply, <code>no-store</code> for data that must never be kept.
                </p>
                <p>
                  0-RTT early data has a cost: an attacker can capture and replay it, so servers should accept it only
                  for idempotent requests such as this GET — never for “place order”.
                </p>
              </Deep>
            )}
            <PathExplainer />
          </Section>

          <Section id="worked-example">
            <WorkedExample
              onLoad={(c) => {
                update({ ...c, step: 0 });
                focusTarget(SIMULATOR_FIGURE_ID);
              }}
            />
            {deep && (
              <Deep>
                <p>
                  The same arithmetic explains why APIs that need several sequential calls feel slow from far away: three
                  dependent calls on a reused connection cost three RTTs, whatever the server does. Batching them into
                  one request, or moving the server (or a CDN edge) closer, helps more than a faster query.
                </p>
              </Deep>
            )}
          </Section>

          <Section id="challenge">
            <Challenges conditions={conditions} onGoToSimulator={() => focusTarget(SIMULATOR_FIGURE_ID)} />
          </Section>

          <Section id="limits" className="wr-section--reference">
            <ul className="wr-reference-list">
              <li>
                <strong>Units.</strong> Times are in milliseconds (ms). Network costs are counted in round trips (RTT):
                one message to the server and one back. A one-way trip counts as half a round trip.
              </li>
              <li>
                <strong>Strictly sequential.</strong> Each step starts when the previous one ends. Real stacks overlap
                work — TCP Fast Open, early data, pipelining, parallel requests — and this model only includes 0-RTT.
              </li>
              <li>
                <strong>Fixed server costs.</strong> Spring dispatch {ASSUMED_MS.dispatch} ms, cache lookup{' '}
                {ASSUMED_MS.appCache} ms, application ↔ database network {ASSUMED_MS.dbNetwork} ms, JSON serialisation{' '}
                {ASSUMED_MS.serialize} ms. These are illustrative orders of magnitude for a small JSON response on a
                warm JVM, not benchmarks.
              </li>
              <li>
                <strong>DNS.</strong> A lookup costs one RTT to a resolver that already has the answer. A resolver
                starting from scratch also asks the root, top-level-domain and authoritative servers, which can take
                much longer.
              </li>
              <li>
                <strong>Not modelled.</strong> Bandwidth, packet loss and retransmission, TCP slow start, certificate
                revocation checks, redirects, authentication, load balancers, CDN edges, connection-pool waits, garbage
                collection pauses and page rendering.
              </li>
              <li>
                <strong>One architecture.</strong> The server side is a conventional Spring MVC application with
                controller, service and repository layers and a relational database. Other frameworks, reactive stacks,
                serverless functions and NoSQL stores differ in detail, but the network path is the same.
              </li>
              <li>
                <strong>Simulation versus explanation.</strong> The live simulation computes every step and time from
                the journey model as you change conditions. The explanatory animation is scripted, though its numbers
                come from the same model; its CDN scene is illustrative only.
              </li>
              <li>
                <strong>Privacy.</strong> This exhibit runs entirely in your browser. It makes no network requests of
                its own; the state lives only in the page address, so a link reproduces a view exactly.
              </li>
            </ul>
          </Section>

          <Section id="sources" className="wr-section--reference">
            <ul className="wr-source-list">
              {SOURCE_ORDER.map((id) => {
                const s = SOURCES[id];
                return (
                  <li key={id}>
                    {s.authors}, {s.short.startsWith('RFC') ? `${s.short}, ` : ''}
                    <cite>{s.title}</cite> ({s.publisher}). <a href={s.url}>{s.url.replace(/^https:\/\//, '')}</a>.{' '}
                    {s.use}
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
