import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CpuVsGpuExhibit from './CpuVsGpuExhibit';
import { MotionProvider } from '../../lib/motion';

function renderExhibit(hash = '#/exhibits/cpu-vs-gpu') {
  window.location.hash = hash;
  return render(
    <MotionProvider>
      <CpuVsGpuExhibit />
    </MotionProvider>,
  );
}

const liveFigure = () => screen.getByRole('figure', { name: /live simulation.*cpu simd.*gpu simt/i });
const controls = () => screen.getByRole('group', { name: /workload/i });

describe('CPU SIMD vs GPU SIMT exhibit', () => {
  beforeEach(() => localStorage.clear());

  it('has a titled article with the required sections', () => {
    renderExhibit();
    expect(screen.getByRole('heading', { level: 1, name: /cpu.*gpu/i })).toBeInTheDocument();
    for (const name of [/worked example/i, /challenge/i, /limitations/i, /sources/i]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('labels every workload control', () => {
    renderExhibit();
    const group = controls();
    expect(within(group).getByRole('slider', { name: /lanes/i })).toHaveValue('16');
    expect(within(group).getByRole('combobox', { name: /warp width/i })).toHaveValue('8');
    expect(within(group).getByRole('slider', { name: /branch paths/i })).toHaveValue('1');
    const access = within(group).getByRole('radiogroup', { name: /memory access/i });
    expect(within(access).getByRole('radio', { name: /^regular/i })).toBeChecked();
    expect(within(access).getByRole('radio', { name: /^irregular/i })).not.toBeChecked();
    expect(within(group).getByRole('checkbox', { name: /transfer/i })).not.toBeChecked();
  });

  it('shows a live execution figure with separate CPU SIMD and GPU SIMT lanes', () => {
    renderExhibit();
    const fig = liveFigure();
    expect(fig).toHaveAttribute('data-kind', 'simulation');
    expect(within(fig).getByRole('group', { name: /^cpu simd/i })).toBeInTheDocument();
    expect(within(fig).getByRole('group', { name: /^gpu simt/i })).toBeInTheDocument();
    expect(within(fig).getByTestId('gpu-total')).toHaveTextContent(/cycles/i);
    expect(within(fig).getByTestId('cpu-total')).toHaveTextContent(/cycles/i);
  });

  it('step, pause, reset and replay controls drive the trace with immediate status feedback', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const fig = liveFigure();
    const status = within(fig).getByRole('status');
    expect(status).toHaveTextContent(/step 0/i);

    await user.click(within(fig).getByRole('button', { name: /^step/i }));
    expect(status).toHaveTextContent(/step 1/i);
    await user.click(within(fig).getByRole('button', { name: /^step/i }));
    expect(status).toHaveTextContent(/step 2/i);

    await user.click(within(fig).getByRole('button', { name: /^play/i }));
    const pause = within(fig).getByRole('button', { name: /^pause/i });
    await user.click(pause);
    expect(within(fig).getByRole('button', { name: /^play/i })).toBeInTheDocument();

    await user.click(within(fig).getByRole('button', { name: /^reset/i }));
    expect(status).toHaveTextContent(/step 0/i);

    expect(within(fig).getByRole('button', { name: /^replay/i })).toBeInTheDocument();
  });

  it('marks the active warp lanes for assistive tech as the trace advances', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const fig = liveFigure();
    const gpu = within(fig).getByRole('group', { name: /^gpu simt/i });
    expect(within(gpu).queryAllByRole('listitem').filter((l) => l.getAttribute('aria-current') === 'step')).toHaveLength(0);
    await user.click(within(fig).getByRole('button', { name: /^step/i }));
    // Default workload: no transfer, so the first GPU step runs warp 0 — all 8 lanes at once.
    expect(within(gpu).getAllByRole('listitem').filter((l) => l.getAttribute('aria-current') === 'step')).toHaveLength(8);
  });

  it('steps from the keyboard', () => {
    renderExhibit();
    const fig = liveFigure();
    const status = within(fig).getByRole('status');
    fireEvent.keyDown(within(fig).getByRole('button', { name: /^step/i }), { key: 's' });
    expect(status).toHaveTextContent(/step 1/i);
    fireEvent.keyDown(within(fig).getByRole('button', { name: /^step/i }), { key: 'r' });
    expect(status).toHaveTextContent(/step 0/i);
  });

  it('ignores step shortcuts typed into form fields', () => {
    renderExhibit();
    const fig = liveFigure();
    fireEvent.keyDown(within(controls()).getByRole('combobox', { name: /warp width/i }), { key: 's' });
    expect(within(fig).getByRole('status')).toHaveTextContent(/step 0/i);
  });

  it('changing a control records it in the URL and resets the trace', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const fig = liveFigure();
    await user.click(within(fig).getByRole('button', { name: /^step/i }));
    await user.selectOptions(within(controls()).getByRole('combobox', { name: /warp width/i }), '32');
    expect(window.location.hash).toContain('warp=32');
    expect(within(fig).getByRole('status')).toHaveTextContent(/step 0/i);
    await user.click(within(controls()).getByRole('radio', { name: /^irregular/i }));
    expect(window.location.hash).toContain('access=irregular');
    await user.click(within(controls()).getByRole('checkbox', { name: /transfer/i }));
    expect(window.location.hash).toContain('xfer=1');
  });

  it('explains divergence when lanes take different branch paths', () => {
    renderExhibit('#/exhibits/cpu-vs-gpu?div=2');
    const fig = liveFigure();
    expect(within(fig).getByText(/diverge/i)).toBeInTheDocument();
  });

  it('shows the transfer overhead in the GPU total when enabled', () => {
    renderExhibit('#/exhibits/cpu-vs-gpu?xfer=1');
    const fig = liveFigure();
    expect(within(fig).getByTestId('gpu-total')).toHaveTextContent(/transfer/i);
  });

  it('restores a shared configuration from the URL', () => {
    renderExhibit('#/exhibits/cpu-vs-gpu?lanes=40&warp=4&div=3&access=irregular&xfer=1&depth=deep');
    const group = controls();
    expect(within(group).getByRole('slider', { name: /lanes/i })).toHaveValue('40');
    expect(within(group).getByRole('combobox', { name: /warp width/i })).toHaveValue('4');
    expect(within(group).getByRole('slider', { name: /branch paths/i })).toHaveValue('3');
    expect(within(group).getByRole('radio', { name: /^irregular/i })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: /transfer/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /deep/i })).toBeChecked();
  });

  it('falls back to defaults for a tampered URL', () => {
    renderExhibit('#/exhibits/cpu-vs-gpu?lanes=9999&warp=7&div=-1&access=%3Cscript%3E');
    const group = controls();
    expect(within(group).getByRole('slider', { name: /lanes/i })).toHaveValue('16');
    expect(within(group).getByRole('combobox', { name: /warp width/i })).toHaveValue('8');
    expect(within(group).getByRole('slider', { name: /branch paths/i })).toHaveValue('1');
    expect(within(group).getByRole('radio', { name: /^regular/i })).toBeChecked();
  });

  it('switches between short and deep explanations and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    expect(screen.getAllByText(/simd/i, { selector: 'p' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/warp scheduler/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /deep/i }));
    expect(screen.getAllByText(/warp scheduler/i).length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('depth=deep');
  });

  it('walks through a worked example that matches the default workload', async () => {
    const user = userEvent.setup();
    renderExhibit('#/exhibits/cpu-vs-gpu?warp=32&div=4');
    const example = screen.getByRole('region', { name: /worked example/i });
    expect(within(example).getByText(/16 lanes/i)).toBeInTheDocument();
    expect(within(example).getByText(/warps? of 8/i)).toBeInTheDocument();
    await user.click(within(example).getByRole('button', { name: /load (this|the worked) example/i }));
    expect(within(controls()).getByRole('combobox', { name: /warp width/i })).toHaveValue('8');
    expect(within(controls()).getByRole('slider', { name: /branch paths/i })).toHaveValue('1');
  });

  it('challenge: starts unsolved for the default workload', () => {
    renderExhibit();
    const challenge = screen.getByRole('region', { name: /challenge/i });
    expect(within(challenge).getByRole('status')).not.toHaveTextContent(/solved/i);
  });

  it('challenge: a configuration where the CPU wins is recognised', () => {
    // Heavy divergence, scattered access and a host↔device copy for a tiny job: the GPU loses its edge.
    renderExhibit('#/exhibits/cpu-vs-gpu?lanes=8&warp=32&div=4&access=irregular&xfer=1');
    const challenge = screen.getByRole('region', { name: /challenge/i });
    expect(within(challenge).getByRole('status')).toHaveTextContent(/solved/i);
  });

  it('lists real sources and stated limitations', () => {
    renderExhibit();
    const sources = screen.getByRole('region', { name: /sources/i });
    expect(within(sources).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
    expect(within(sources).getByText(/cuda c\+\+ programming guide/i)).toBeInTheDocument();
    const limits = screen.getByRole('region', { name: /limitations/i });
    expect(within(limits).getByText(/not cycle-accurate/i)).toBeInTheDocument();
  });

  it('copies a link to the exact configuration', async () => {
    const user = userEvent.setup();
    renderExhibit('#/exhibits/cpu-vs-gpu?div=2&xfer=1');
    await user.click(screen.getByRole('button', { name: /copy a link/i }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('#/exhibits/cpu-vs-gpu');
    expect(copied).toContain('div=2');
    expect(copied).toContain('xfer=1');
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
  });
});
