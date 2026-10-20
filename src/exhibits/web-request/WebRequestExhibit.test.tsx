import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider, MOTION_STORAGE_KEY } from '../../lib/motion';
import WebRequestExhibit from './WebRequestExhibit';

function renderExhibit(hash = '#/exhibits/web-request') {
  window.location.hash = hash;
  return render(
    <MotionProvider>
      <WebRequestExhibit />
    </MotionProvider>,
  );
}

const simulator = () => screen.getByRole('figure', { name: /live simulation.*request journey/i });
const trace = () => screen.getByRole('list', { name: /request trace/i });
const currentStep = () => within(trace()).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step');
const summary = () => screen.getByTestId('journey-summary');

describe('Web request journey exhibit', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('has one h1 and the required sections', () => {
    renderExhibit();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /web request/i })).toBeInTheDocument();
    for (const name of [/the journey/i, /what changes the path/i, /worked example/i, /challenge/i, /assumptions, units/i, /sources/i]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('labels itself as a representative model, not every request', () => {
    renderExhibit();
    const notice = screen.getByRole('note', { name: /representative model/i });
    expect(notice).toHaveTextContent(/not every request/i);
  });

  it('says the browser never talks directly to the database', () => {
    renderExhibit();
    expect(screen.getAllByText(/browser never talks (directly )?to the database/i).length).toBeGreaterThan(0);
  });

  it('labels the simulation and the explanatory figure differently', () => {
    renderExhibit();
    expect(simulator()).toHaveAttribute('data-kind', 'simulation');
    const anims = screen.getAllByRole('figure', { name: /explanatory animation/i });
    expect(anims.length).toBeGreaterThanOrEqual(1);
    for (const f of anims) expect(f).toHaveAttribute('data-kind', 'explanation');
  });

  it('shows the first-visit totals with units', () => {
    renderExhibit();
    expect(summary()).toHaveTextContent('205.6 ms');
    expect(summary()).toHaveTextContent(/4 network round trips/i);
    expect(summary()).toHaveTextContent('200 OK');
  });

  it('gives immediate feedback when a condition changes, and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const sim = simulator();
    await user.click(within(sim).getByRole('radio', { name: /reused/i }));
    expect(summary()).toHaveTextContent('55.6 ms');
    expect(summary()).toHaveTextContent(/1 network round trip\b/i);
    expect(within(sim).getByTestId('journey-feedback')).toHaveTextContent(/150 ms faster/i);
    expect(within(sim).getByTestId('journey-feedback')).toHaveTextContent(/DNS lookup.*TCP handshake.*TLS handshake/i);
    expect(window.location.hash).toContain('conn=reused');
    const tcp = within(trace()).getByText(/TCP handshake/i).closest('li')!;
    expect(tcp).toHaveAttribute('data-status', 'skipped');
    expect(tcp).toHaveTextContent(/skipped/i);
  });

  it('a fresh browser-cache hit never leaves the browser', async () => {
    const user = userEvent.setup();
    renderExhibit();
    await user.selectOptions(within(simulator()).getByRole('combobox', { name: /browser http cache/i }), 'fresh');
    expect(summary()).toHaveTextContent('0 ms');
    expect(summary()).toHaveTextContent(/from browser cache/i);
  });

  it('adjusting the RTT slider recomputes the journey', () => {
    renderExhibit();
    fireEvent.change(within(simulator()).getByRole('slider', { name: /round-trip time/i }), { target: { value: '100' } });
    expect(summary()).toHaveTextContent('405.6 ms');
    expect(window.location.hash).toContain('rtt=100');
  });

  it('restores conditions from a shared URL', () => {
    renderExhibit('#/exhibits/web-request?conn=reused&rtt=100&proto=h3');
    expect(within(simulator()).getByRole('radio', { name: /reused/i })).toBeChecked();
    expect(within(simulator()).getByRole('radio', { name: /HTTP\/3/i })).toBeChecked();
    expect(summary()).toHaveTextContent('105.6 ms');
  });

  it('steps, goes back and resets the trace, announcing the current step', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const sim = simulator();
    expect(currentStep()).toBeUndefined();
    await user.click(within(sim).getByRole('button', { name: /^next step/i }));
    expect(currentStep()).toHaveTextContent(/browser checks its HTTP cache/i);
    await user.click(within(sim).getByRole('button', { name: /^next step/i }));
    expect(currentStep()).toHaveTextContent(/DNS lookup/i);
    expect(within(sim).getByTestId('trace-status')).toHaveTextContent(/step 2 of 11/i);
    await user.click(within(sim).getByRole('button', { name: /^previous step/i }));
    expect(currentStep()).toHaveTextContent(/HTTP cache/i);
    await user.click(within(sim).getByRole('button', { name: /^reset/i }));
    expect(currentStep()).toBeUndefined();
  });

  it('supports keyboard shortcuts scoped to the trace controls', () => {
    renderExhibit();
    const next = within(simulator()).getByRole('button', { name: /^next step/i });
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    fireEvent.keyDown(next, { key: 'n' });
    expect(currentStep()).toHaveTextContent(/DNS lookup/i);
    fireEvent.keyDown(next, { key: 'End' });
    expect(currentStep()).toHaveTextContent(/page receives/i);
    fireEvent.keyDown(next, { key: 'r' });
    expect(currentStep()).toBeUndefined();
  });

  it('plays, pauses and replays the trace on a timer', () => {
    vi.useFakeTimers();
    renderExhibit();
    const sim = simulator();
    fireEvent.click(within(sim).getByRole('button', { name: /^play/i }));
    expect(within(sim).getByRole('button', { name: /^pause/i })).toHaveAttribute('aria-pressed', 'true');
    act(() => vi.advanceTimersByTime(2500));
    expect(currentStep()).toHaveTextContent(/DNS lookup/i);
    fireEvent.click(within(sim).getByRole('button', { name: /^pause/i }));
    act(() => vi.advanceTimersByTime(5000));
    expect(currentStep()).toHaveTextContent(/DNS lookup/i);
    fireEvent.click(within(sim).getByRole('button', { name: /^replay/i }));
    act(() => vi.advanceTimersByTime(1300));
    expect(currentStep()).toHaveTextContent(/HTTP cache/i);
  });

  it('withdraws autoplay under reduced motion but keeps manual stepping', () => {
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    renderExhibit();
    const sim = simulator();
    expect(within(sim).queryByRole('button', { name: /^play/i })).not.toBeInTheDocument();
    expect(within(sim).queryByRole('button', { name: /^replay/i })).not.toBeInTheDocument();
    expect(within(sim).getByText(/reduced motion/i)).toBeInTheDocument();
    expect(within(sim).getByRole('button', { name: /^next step/i })).toBeEnabled();
    expect(within(sim).getByRole('button', { name: /show all steps/i })).toBeEnabled();
  });

  it('restores the trace position from the URL', () => {
    renderExhibit('#/exhibits/web-request?step=2');
    expect(currentStep()).toHaveTextContent(/DNS lookup/i);
  });

  it('switches between short and deep text and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    expect(screen.queryByText(/DispatcherServlet/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^deep$/i }));
    expect(screen.getAllByText(/DispatcherServlet/).length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('depth=deep');
  });

  it('worked example loads the second request on a reused connection', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const example = screen.getByRole('region', { name: /worked example/i });
    await user.click(within(example).getByRole('button', { name: /second request/i }));
    expect(summary()).toHaveTextContent('55.6 ms');
    await user.click(within(example).getByRole('button', { name: /first visit/i }));
    expect(summary()).toHaveTextContent('205.6 ms');
  });

  it('judges the challenges live from the simulator state', () => {
    renderExhibit('#/exhibits/web-request?conn=reused');
    const challenge = screen.getByRole('region', { name: /challenge/i });
    const verdicts = within(challenge).getAllByRole('status');
    expect(verdicts[0]).toHaveTextContent(/solved/i);
    expect(verdicts[1]).not.toHaveTextContent(/solved/i);
  });

  it('cites the RFCs and Spring documentation and states units and limitations', () => {
    renderExhibit();
    const sources = screen.getByRole('region', { name: /sources/i });
    for (const cite of [/RFC 1034/, /RFC 8446/, /RFC 9110/, /Spring Framework/]) {
      expect(within(sources).getAllByText(cite).length).toBeGreaterThan(0);
    }
    const limits = screen.getByRole('region', { name: /assumptions, units/i });
    expect(within(limits).getByText(/milliseconds/i)).toBeInTheDocument();
    expect(within(limits).getAllByText(/CDN/).length).toBeGreaterThan(0);
    expect(within(limits).getByText(/runs entirely in your browser/i)).toBeInTheDocument();
  });

  it('explains how DNS, caches, reused connections, CDNs and HTTP/3 alter the path', () => {
    renderExhibit();
    const changes = screen.getByRole('region', { name: /what changes the path/i });
    for (const topic of [/DNS cache/i, /HTTP cache/i, /reused connection/i, /TLS resumption/i, /CDN/i, /HTTP\/3/i]) {
      expect(within(changes).getAllByText(topic).length).toBeGreaterThan(0);
    }
  });
});
