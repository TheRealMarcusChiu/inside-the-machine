import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemoryHierarchyExhibit from './MemoryHierarchyExhibit';
import { MotionProvider, MOTION_STORAGE_KEY } from '../../lib/motion';

function renderExhibit(hash = '#/exhibits/memory-hierarchy') {
  window.location.hash = hash;
  return render(
    <MotionProvider>
      <MemoryHierarchyExhibit />
    </MotionProvider>,
  );
}

const lab = () => screen.getByRole('figure', { name: /live simulation request lab/i });
const traceFigure = () => screen.getByRole('figure', { name: /explanatory animation request trace/i });
const total = () => within(lab()).getByRole('status');
const caption = () => within(traceFigure()).getByText(/^Step \d+ of \d+/).closest('p')!;

describe('Memory hierarchy exhibit', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('has a titled article with the required sections', () => {
    renderExhibit();
    expect(screen.getByRole('heading', { level: 1, name: /memory hierarchy/i })).toBeInTheDocument();
    for (const name of [/near and small/i, /follow one memory request/i, /page faults/i, /worked example/i, /challenge/i, /sources, assumptions, units/i]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('labels the live simulation and the explanatory trace with distinct badges', () => {
    renderExhibit();
    expect(lab()).toHaveAttribute('data-kind', 'simulation');
    expect(traceFigure()).toHaveAttribute('data-kind', 'explanation');
  });

  it('toggles short/deep explanations and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    expect(screen.queryByText(/set associativity/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /deep/i }));
    expect(screen.getByText(/set associativity/i)).toBeInTheDocument();
    expect(window.location.hash).toContain('depth=deep');
  });

  it('updates the path and total latency immediately when hits, misses and latencies change', async () => {
    const user = userEvent.setup();
    renderExhibit('#/exhibits/memory-hierarchy?motion=reduce');
    expect(total()).toHaveTextContent(/served by L1/i);
    expect(total()).toHaveTextContent('1 ns');

    const l2Group = within(lab()).getByRole('group', { name: /l2 lookup/i });
    expect(within(l2Group).getByRole('radio', { name: 'Hit' })).toBeDisabled();

    await user.click(within(within(lab()).getByRole('group', { name: /l1 lookup/i })).getByRole('radio', { name: 'Miss' }));
    expect(total()).toHaveTextContent(/served by RAM/i);
    expect(total()).toHaveTextContent('85 ns');

    await user.click(within(l2Group).getByRole('radio', { name: 'Hit' }));
    expect(total()).toHaveTextContent(/served by L2/i);
    expect(total()).toHaveTextContent('5 ns');

    fireEvent.change(within(lab()).getByLabelText(/l2 latency/i), { target: { value: '20' } });
    expect(total()).toHaveTextContent('21 ns');
    expect(window.location.hash).toContain('l2Latency=20');
    expect(window.location.hash).toContain('motion=reduce');
  });

  it('never shows storage in the live simulation path', async () => {
    renderExhibit('#/exhibits/memory-hierarchy?l1Hit=0&l2Hit=0');
    expect(lab()).not.toHaveTextContent(/SSD|NVMe|storage/i);
    expect(traceFigure()).not.toHaveTextContent(/SSD|NVMe/i);
    const aside = screen.getByRole('complementary', { name: /page fault/i });
    expect(aside).toHaveTextContent(/SSD\s*\/\s*NVMe/);
    expect(aside).toHaveTextContent(/explanatory animation/i);
  });

  it('steps, resets and replays the trace with keyboard-operable buttons', async () => {
    const user = userEvent.setup();
    renderExhibit('#/exhibits/memory-hierarchy?l1Hit=0&l2Hit=0');
    expect(caption()).toHaveTextContent('Step 1 of 7');

    const step = within(traceFigure()).getByRole('button', { name: /^step/i });
    step.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(caption()).toHaveTextContent('Step 3 of 7');
    expect(caption()).toHaveTextContent(/L2 cache miss/i);
    expect(window.location.hash).toContain('step=2');

    await user.click(within(traceFigure()).getByRole('button', { name: /reset/i }));
    expect(caption()).toHaveTextContent('Step 1 of 7');
  });

  it('plays, pauses and replays automatically when motion is allowed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    localStorage.setItem(MOTION_STORAGE_KEY, 'full');
    renderExhibit('#/exhibits/memory-hierarchy?l1Hit=0&l2Hit=1');

    const play = within(traceFigure()).getByRole('button', { name: /^play$/i });
    play.focus();
    await user.keyboard('{Enter}');
    expect(play).toHaveAttribute('aria-pressed', 'true');
    await act(async () => vi.advanceTimersByTime(1200));
    expect(caption()).toHaveTextContent('Step 2 of 5');

    await user.keyboard('{Enter}'); // Pause, still focused
    expect(play).toHaveTextContent(/play/i);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(caption()).toHaveTextContent('Step 2 of 5');

    await user.click(within(traceFigure()).getByRole('button', { name: /replay/i }));
    expect(caption()).toHaveTextContent('Step 1 of 5');
    await act(async () => vi.advanceTimersByTime(1200));
    await act(async () => vi.advanceTimersByTime(1200));
    await act(async () => vi.advanceTimersByTime(1200));
    await act(async () => vi.advanceTimersByTime(1200));
    expect(caption()).toHaveTextContent('Step 5 of 5');
    expect(play).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not autoplay under reduced motion', async () => {
    const user = userEvent.setup();
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    renderExhibit('#/exhibits/memory-hierarchy?l1Hit=0&l2Hit=0');
    expect(within(traceFigure()).getByRole('button', { name: /^play$/i })).toBeDisabled();
    expect(within(traceFigure()).getByText(/autoplay is off/i)).toBeInTheDocument();
    await user.click(within(traceFigure()).getByRole('button', { name: /replay/i }));
    expect(caption()).toHaveTextContent('Step 1 of 7');
  });

  it('worked example configures an L1 → L2 → RAM miss', async () => {
    const user = userEvent.setup();
    renderExhibit('#/exhibits/memory-hierarchy?ramLatency=200');
    await user.click(screen.getByRole('button', { name: /load the l1 → l2 → ram miss example/i }));
    expect(total()).toHaveTextContent(/served by RAM/i);
    expect(total()).toHaveTextContent('85 ns');
    expect(caption()).toHaveTextContent('Step 1 of 7');
    expect(traceFigure()).toHaveFocus();
  });

  it('checks the challenge answer', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const region = screen.getByRole('region', { name: /challenge/i });
    const input = within(region).getByLabelText(/total time/i);
    await user.type(input, '90');
    await user.click(within(region).getByRole('button', { name: /check answer/i }));
    expect(within(region).getByRole('status')).toHaveTextContent(/not quite/i);
    await user.clear(input);
    await user.type(input, '94');
    await user.click(within(region).getByRole('button', { name: /check answer/i }));
    expect(within(region).getByRole('status')).toHaveTextContent(/correct/i);
  });

  it('lists clickable sources and states the caveats', () => {
    renderExhibit();
    const region = screen.getByRole('region', { name: /sources, assumptions/i });
    for (const href of [
      'https://people.freebsd.org/~lstewart/articles/cpumemory.pdf',
      'https://docs.kernel.org/mm/',
      'https://nvmexpress.org/specifications/',
    ]) {
      expect(within(region).getAllByRole('link').some((a) => a.getAttribute('href') === href)).toBe(true);
    }
    expect(region).toHaveTextContent(/architecture-specific/i);
    expect(region).toHaveTextContent(/illustrative/i);
    expect(region).toHaveTextContent(/page-fault and I\/O handling/i);
  });
});
