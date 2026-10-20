import { Component, lazy, Suspense, useEffect, useRef, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from './components/KindBadge';
import { EXHIBITS, getOpenExhibits, getPlannedExhibits } from './exhibits/registry';
import type { ExhibitProps, OpenExhibit } from './exhibits/types';
import { MotionProvider, nextMotionSetting, useMotion, type MotionSetting } from './lib/motion';
import { exhibitPath, resolveRoute, type Route } from './lib/router';
import { useHashLocation } from './lib/useHashLocation';

const MUSEUM_NAME = 'Inside the Machine';

// One lazy component per exhibit, created once so navigating back and forth never remounts the chunk loader.
const lazyExhibits = new Map<string, ComponentType<ExhibitProps>>();
function exhibitComponent(exhibit: OpenExhibit): ComponentType<ExhibitProps> {
  let component = lazyExhibits.get(exhibit.slug);
  if (!component) {
    component = lazy(exhibit.load);
    lazyExhibits.set(exhibit.slug, component);
  }
  return component;
}

const MOTION_LABEL: Record<MotionSetting, string> = { system: 'System', reduce: 'Reduced', full: 'Full' };

function MotionToggle() {
  const { setting, reducedMotion, setSetting } = useMotion();
  const effect = reducedMotion ? 'animations are reduced' : 'animations are on';
  return (
    <button
      type="button"
      className="motion-toggle"
      onClick={() => setSetting(nextMotionSetting(setting))}
      title={`Motion follows: ${MOTION_LABEL[setting]} (${effect}). Click to cycle System → Reduced → Full.`}
    >
      <span className="motion-toggle__icon" aria-hidden="true">
        {reducedMotion ? '◼' : '◐'}
      </span>
      Motion: <span className="motion-toggle__value">{MOTION_LABEL[setting]}</span>
    </button>
  );
}

function routeTitle(route: Route): string {
  if (route.kind === 'exhibit') return `${route.exhibit.title} · ${MUSEUM_NAME}`;
  if (route.kind === 'not-found') return `Not on display · ${MUSEUM_NAME}`;
  return MUSEUM_NAME;
}

function Home() {
  const open = getOpenExhibits();
  const planned = getPlannedExhibits();
  return (
    <article className="home">
      <div className="hero">
        <p className="eyebrow">A museum of computing that runs in your browser</p>
        <h1 className="hero__title">{MUSEUM_NAME}</h1>
        <p className="hero__lede">
          Computers are built from astonishingly simple parts. Each room of this museum takes one idea apart and lets
          you operate it yourself — no installs, no accounts, nothing sent anywhere.
        </p>
      </div>

      <section className="legend" aria-labelledby="legend-title">
        <h2 id="legend-title" className="section-kicker">
          How to read the exhibits
        </h2>
        <dl className="legend__list">
          <div className="legend__item">
            <dt>
              <KindBadge kind="simulation" />
            </dt>
            <dd>
              A live simulation computes everything you see from a working model, the moment you change an input. If it
              shows a carry, the model really carried.
            </dd>
          </div>
          <div className="legend__item">
            <dt>
              <KindBadge kind="explanation" />
            </dt>
            <dd>
              An explanatory animation is a scripted illustration of an idea. It never autoplays, and you can step
              through it frame by frame.
            </dd>
          </div>
        </dl>
      </section>

      <section className="gallery" aria-labelledby="gallery-title">
        <h2 id="gallery-title">The gallery</h2>
        <ol className="gallery__open" role="list">
          {open.map((exhibit) => (
            <li key={exhibit.slug} className="exhibit-card">
              <p className="exhibit-card__room">Room {exhibit.number} · Open</p>
              <h3 className="exhibit-card__title">
                <a href={`#${exhibitPath(exhibit.slug)}`}>{exhibit.title}</a>
              </h3>
              <p className="exhibit-card__subtitle">{exhibit.subtitle}</p>
              <p className="exhibit-card__summary">{exhibit.summary}</p>
              <ul className="topic-list" aria-label="Topics">
                {exhibit.topics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <span className="exhibit-card__cta" aria-hidden="true">
                Enter the room →
              </span>
            </li>
          ))}
        </ol>

        {planned.length > 0 && (
          <>
            <h3 id="planned-title" className="gallery__planned-title">
              In preparation
            </h3>
            <p className="gallery__planned-note">
              These rooms are being built. They will open only when every simulation in them is complete.
            </p>
            <ul className="gallery__planned" aria-labelledby="planned-title">
              {planned.map((exhibit) => (
                <li key={exhibit.slug}>
                  <span className="planned__room">Room {exhibit.number}</span>
                  <span className="planned__title">{exhibit.title}</span>
                  <span className="planned__subtitle">{exhibit.subtitle}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </article>
  );
}

function NotFound({ path }: { path: string }) {
  const slug = path.startsWith('/exhibits/') ? path.slice('/exhibits/'.length) : undefined;
  const planned = EXHIBITS.find((e) => e.status === 'planned' && e.slug === slug);
  return (
    <article className="not-found">
      <p className="eyebrow">Gallery map</p>
      <h1>Not on display</h1>
      {planned ? (
        <p>
          <strong>{planned.title}</strong> is still in preparation. It will open once its simulations are finished —
          the museum never shows half-built rooms.
        </p>
      ) : (
        <p>
          There is no room at <code>{path}</code>. The link may be mistyped, or it may point to an exhibit that has
          moved.
        </p>
      )}
      <p>
        <a className="btn btn--primary" href="#/">
          Return to the gallery
        </a>
      </p>
    </article>
  );
}

interface BoundaryState {
  failed: boolean;
}

/** Catches failures while loading or rendering an exhibit (e.g. a chunk that failed to download). */
class ExhibitBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <article className="not-found" role="alert">
        <h1>This room could not be opened</h1>
        <p>Part of the exhibit failed to load, perhaps because the connection dropped. Reloading usually fixes it.</p>
        <p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>{' '}
          <a className="btn" href="#/">
            Return to the gallery
          </a>
        </p>
      </article>
    );
  }
}

function Shell() {
  const { path } = useHashLocation();
  const route = resolveRoute(path, EXHIBITS);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    document.title = routeTitle(route);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // On navigation, start at the top and move focus to the new page so screen readers announce it.
    document.documentElement.scrollTop = 0;
    mainRef.current?.focus({ preventScroll: true });
    // Keyed on the path only: query-string changes are in-page state, not navigation.
  }, [path]);

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    // A plain "#main" link would replace the hash route, so move focus by hand instead.
    event.preventDefault();
    mainRef.current?.focus();
  };

  let page: ReactNode;
  if (route.kind === 'home') page = <Home />;
  else if (route.kind === 'not-found') page = <NotFound path={route.path} />;
  else {
    const Exhibit = exhibitComponent(route.exhibit);
    page = (
      <ExhibitBoundary key={route.exhibit.slug}>
        <Suspense
          fallback={
            <p className="loading" role="status">
              Opening the exhibit…
            </p>
          }
        >
          <Exhibit />
        </Suspense>
      </ExhibitBoundary>
    );
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#/">
          <span className="brand__mark" aria-hidden="true" />
          {MUSEUM_NAME}
        </a>
        <nav className="site-nav" aria-label="Museum">
          <a href="#/" aria-current={route.kind === 'home' ? 'page' : undefined}>
            Gallery
          </a>
          <MotionToggle />
        </nav>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="site-main">
        {page}
      </main>
      <footer className="site-footer">
        <p>
          {MUSEUM_NAME} is a static site: every simulation runs on your device, and nothing you do here is recorded or
          sent anywhere.
        </p>
        <p>Open source under the MIT licence.</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <MotionProvider>
      <Shell />
    </MotionProvider>
  );
}
