import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider, MOTION_STORAGE_KEY } from '../../lib/motion';
import LlmBottleneckExhibit from './LlmBottleneckExhibit';

function renderExhibit(query = '') {
  window.location.hash = `#/exhibits/llm-bottleneck${query ? `?${query}` : ''}`;
  return render(
    <MotionProvider>
      <LlmBottleneckExhibit />
    </MotionProvider>,
  );
}

const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const explorer = () => screen.getByRole('figure', { name: /model and machine/i });
const estimate = () => screen.getByRole('group', { name: /estimate/i });

describe('LLM compute and memory-bandwidth bottleneck explorer', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('has a titled article with every required section', () => {
    renderExhibit();
    expect(screen.getByRole('heading', { level: 1, name: /bottleneck/i })).toBeInTheDocument();
    for (const name of [
      /^the explorer$/i,
      /roofline/i,
      /where the bytes go/i,
      /replay a generation/i,
      /worked example/i,
      /^challenge$/i,
      /assumptions, units/i,
      /^sources$/i,
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('navigation', { name: /on this page/i })).toBeInTheDocument();
  });

  it('states up front that the numbers are estimates and upper bounds, not benchmarks', () => {
    renderExhibit();
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/estimates/i);
    expect(note).toHaveTextContent(/upper bounds/i);
    expect(note).toHaveTextContent(/not benchmarks/i);
  });

  it('says plainly that small-batch decode can be bandwidth-bound, but not always', () => {
    renderExhibit();
    expect(screen.getAllByText(/small-batch decode (is often|can be) bandwidth-bound.*not always/i).length).toBeGreaterThan(0);
  });

  it('labels the formulas it uses', () => {
    renderExhibit();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/raw weights\s*=\s*P\s*×\s*b/i);
    expect(text).toMatch(/2\s*×\s*L\s*×\s*T\s*×\s*Hkv\s*×\s*dh\s*×\s*b/);
    expect(text).toMatch(/min\(\s*peak compute\s*,\s*bandwidth\s*×\s*AI\s*\)/i);
    expect(text).toMatch(/4\s*×\s*L\s*×\s*B\s*×\s*T\s*×\s*H\s*×\s*dh/);
  });

  it('exposes every adjustable parameter as a labelled control', () => {
    renderExhibit();
    const fig = explorer();
    for (const name of [
      /parameters \(billions\)/i,
      /^layers/i,
      /query heads/i,
      /kv heads/i,
      /head dimension/i,
      /context length/i,
      /batch size/i,
      /peak compute/i,
      /memory bandwidth/i,
    ]) {
      expect(within(fig).getByRole('spinbutton', { name })).toBeInTheDocument();
    }
    expect(within(fig).getByRole('radio', { name: /16-bit/i })).toBeChecked();
    expect(within(fig).getByRole('radio', { name: /^decode/i })).toBeChecked();
  });

  it('shows the worked-example estimate by default: bandwidth-bound decode at ~1 FLOP/byte', () => {
    renderExhibit();
    const est = estimate();
    expect(est).toHaveTextContent(/1\.00 FLOP\/byte/);
    expect(est).toHaveTextContent(/bandwidth-bound/i);
    expect(est).toHaveTextContent(/14\.0 GB/);
    expect(est).toHaveTextContent(/2\.15 GB/);
    expect(est).toHaveTextContent(/124 tokens\/s/);
  });

  it('updates immediately and records the change in the URL', () => {
    renderExhibit();
    const ctx = within(explorer()).getByRole('spinbutton', { name: /context length/i });
    fireEvent.change(ctx, { target: { value: '128' } });
    const batch = within(explorer()).getByRole('spinbutton', { name: /batch size/i });
    fireEvent.change(batch, { target: { value: '1024' } });
    expect(hashParams().get('T')).toBe('128');
    expect(hashParams().get('B')).toBe('1024');
    expect(estimate()).toHaveTextContent(/compute-bound/i);
  });

  it('rejects invalid input without changing the state', () => {
    renderExhibit();
    const layers = within(explorer()).getByRole('spinbutton', { name: /^layers/i });
    fireEvent.change(layers, { target: { value: '0' } });
    expect(layers).toHaveAttribute('aria-invalid', 'true');
    expect(within(explorer()).getByText(/between 1 and/i)).toBeInTheDocument();
    expect(hashParams().get('L')).toBeNull();
    fireEvent.blur(layers);
    expect(layers).toHaveValue(32);
    expect(layers).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('halve and double buttons work from the keyboard', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const double = within(explorer()).getByRole('button', { name: /double batch size/i });
    double.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(hashParams().get('B')).toBe('4');
    await user.click(within(explorer()).getByRole('button', { name: /halve batch size/i }));
    expect(hashParams().get('B')).toBe('2');
    expect(within(explorer()).getByRole('button', { name: /halve batch size/i })).toBeEnabled();
  });

  it('switches precision and phase', async () => {
    const user = userEvent.setup();
    renderExhibit();
    await user.click(within(explorer()).getByRole('radio', { name: /8-bit/i }));
    expect(hashParams().get('b')).toBe('1');
    expect(estimate()).toHaveTextContent(/7\.00 GB/);
    await user.click(within(explorer()).getByRole('radio', { name: /^prefill/i }));
    expect(hashParams().get('phase')).toBe('prefill');
    expect(estimate()).toHaveTextContent(/compute-bound/i);
  });

  it('applies a model preset', async () => {
    const user = userEvent.setup();
    renderExhibit();
    await user.click(screen.getByRole('button', { name: /8b.*gqa/i }));
    expect(hashParams().get('kv')).toBe('8');
    expect(within(explorer()).getByRole('spinbutton', { name: /kv heads/i })).toHaveValue(8);
  });

  it('warns when KV heads exceed query heads', () => {
    renderExhibit('H=8&kv=32');
    expect(within(explorer()).getByText(/kv heads.*clamped/i)).toBeInTheDocument();
  });

  it('draws a Roofline chart with an accessible description and a data table', () => {
    renderExhibit();
    const fig = screen.getByRole('figure', { name: /roofline/i });
    expect(fig).toHaveAttribute('data-kind', 'simulation');
    const img = within(fig).getByRole('img', { name: /roofline/i });
    expect(img).toHaveAccessibleName(/ridge.*156 FLOP\/byte/i);
    expect(img).toHaveAccessibleName(/decode.*1\.00 FLOP\/byte.*bandwidth-bound/i);
    const table = within(fig).getByRole('table', { name: /roofline/i });
    expect(within(table).getByRole('rowheader', { name: /decode/i })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /prefill/i })).toBeInTheDocument();
  });

  it('switches between short and deep explanations and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    expect(screen.queryByText(/speculative decoding/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^deep$/i }));
    expect(screen.getAllByText(/speculative decoding/i).length).toBeGreaterThan(0);
    expect(hashParams().get('depth')).toBe('deep');
  });

  it('restores a shared configuration from the URL', () => {
    renderExhibit('p=70&L=80&H=64&kv=8&B=16&phase=prefill');
    expect(within(explorer()).getByRole('spinbutton', { name: /parameters/i })).toHaveValue(70);
    expect(within(explorer()).getByRole('radio', { name: /^prefill/i })).toBeChecked();
  });

  it('replay: step, reset and replay through a generation', async () => {
    const user = userEvent.setup();
    localStorage.setItem(MOTION_STORAGE_KEY, 'full');
    renderExhibit();
    const fig = screen.getByRole('figure', { name: /generation replay/i });
    const status = within(fig).getByRole('status');
    expect(status).toHaveTextContent(/frame 1 of 9/i);
    expect(status).toHaveTextContent(/4,096 tokens/);
    await user.click(within(fig).getByRole('button', { name: /^step/i }));
    expect(status).toHaveTextContent(/frame 2 of 9/i);
    expect(status).toHaveTextContent(/4,608 tokens/);
    await user.click(within(fig).getByRole('button', { name: /^reset/i }));
    expect(status).toHaveTextContent(/frame 1 of 9/i);
    expect(within(fig).getByRole('button', { name: /^play/i })).toBeInTheDocument();
    await user.click(within(fig).getByRole('button', { name: /^replay/i }));
    expect(within(fig).getByRole('button', { name: /^pause/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(fig).getByRole('button', { name: /^pause/i }));
    expect(within(fig).getByRole('button', { name: /^play/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('replay: playing advances frames on a timer and stops at the end', () => {
    vi.useFakeTimers();
    localStorage.setItem(MOTION_STORAGE_KEY, 'full');
    renderExhibit();
    const fig = screen.getByRole('figure', { name: /generation replay/i });
    fireEvent.click(within(fig).getByRole('button', { name: /^play/i }));
    act(() => vi.advanceTimersByTime(20000));
    expect(within(fig).getByRole('status')).toHaveTextContent(/frame 9 of 9/i);
    expect(within(fig).getByRole('button', { name: /^play/i })).toBeInTheDocument();
    expect(within(fig).getByRole('button', { name: /^step/i })).toBeDisabled();
  });

  it('replay: reduced motion withdraws autoplay in favour of stepping', () => {
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    renderExhibit();
    const fig = screen.getByRole('figure', { name: /generation replay/i });
    expect(within(fig).queryByRole('button', { name: /^play/i })).not.toBeInTheDocument();
    expect(within(fig).queryByRole('button', { name: /^replay/i })).not.toBeInTheDocument();
    expect(within(fig).getByText(/reduced motion/i)).toBeInTheDocument();
    expect(within(fig).getByRole('button', { name: /^step/i })).toBeEnabled();
  });

  it('worked example button restores the default configuration', async () => {
    const user = userEvent.setup();
    renderExhibit('B=64&T=128');
    const section = screen.getByRole('region', { name: /worked example/i });
    expect(section).toHaveTextContent(/14\.0 GB/);
    await user.click(within(section).getByRole('button', { name: /load the worked example/i }));
    expect(hashParams().get('B')).toBeNull();
    expect(hashParams().get('T')).toBeNull();
  });

  it('challenges report progress and recognise a solution', () => {
    // One KV head and a huge batch crosses the ridge, but 1024 caches overflow 80 GB.
    renderExhibit('kv=1&B=1024');
    const section = screen.getByRole('region', { name: /^challenge$/i });
    const cards = within(section).getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(/✓ solved/i);
    expect(cards[1]).toHaveTextContent(/not yet.*82\.7 GB/i);
  });

  it('challenges: grouped-query attention at batch 32 fits memory but stays bandwidth-bound', () => {
    renderExhibit('kv=8&B=32');
    const cards = within(screen.getByRole('region', { name: /^challenge$/i })).getAllByRole('article');
    expect(cards[0]).toHaveTextContent(/not yet/i);
    expect(cards[1]).toHaveTextContent(/✓ solved/i);
  });

  it('cites the required sources', () => {
    renderExhibit();
    const sources = screen.getByRole('region', { name: /^sources$/i });
    for (const needle of [/vaswani/i, /10\.1145\/1498765\.1498785/, /2211\.05102/, /2309\.06180/, /2205\.14135/, /hugging face/i]) {
      expect(sources).toHaveTextContent(needle);
    }
    expect(within(sources).getByRole('link', { name: /hugging face/i })).toHaveAttribute(
      'href',
      expect.stringContaining('huggingface.co/docs/transformers'),
    );
  });

  it('documents units and limitations', () => {
    renderExhibit();
    const limits = screen.getByRole('region', { name: /assumptions, units/i });
    expect(limits).toHaveTextContent(/1 GB = 10⁹ bytes/);
    expect(limits).toHaveTextContent(/not benchmarks/i);
    expect(limits).toHaveTextContent(/FlashAttention/);
  });

  it('offers a copy-link control for the exact state', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderExhibit('B=8');
    await user.click(screen.getByRole('button', { name: /copy a link/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('B=8'));
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
  });
});
