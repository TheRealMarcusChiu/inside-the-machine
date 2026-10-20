import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZfsTopologyExhibit from './ZfsTopologyExhibit';
import { MotionProvider, MOTION_STORAGE_KEY } from '../../lib/motion';

function renderExhibit(query = '') {
  window.location.hash = `#/exhibits/zfs-topology${query}`;
  return render(
    <MotionProvider>
      <ZfsTopologyExhibit />
    </MotionProvider>,
  );
}

const builder = () => screen.getByRole('figure', { name: /pool builder/i });
const tracer = () => screen.getByRole('figure', { name: /failure placement tracer/i });
const disk = (vdev: number, n: number) => within(tracer()).getByRole('button', { name: `vdev ${vdev}, disk ${n}` });

describe('ZFS topology explorer', () => {
  beforeEach(() => localStorage.clear());

  it('has a titled article with the required sections', () => {
    renderExhibit();
    expect(screen.getByRole('heading', { level: 1, name: /zfs/i })).toBeInTheDocument();
    for (const name of [
      /build a pool/i,
      /which disks fail/i,
      /distributed parity/i,
      /worked example/i,
      /challenge/i,
      /assumptions, units/i,
      /sources/i,
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('labels live simulations and explanatory animations differently', () => {
    renderExhibit();
    const sims = screen.getAllByRole('figure', { name: /live simulation/i });
    const anims = screen.getAllByRole('figure', { name: /explanatory animation/i });
    expect(sims.length).toBeGreaterThanOrEqual(3);
    expect(anims.length).toBeGreaterThanOrEqual(1);
    for (const f of sims) expect(f).toHaveAttribute('data-kind', 'simulation');
    for (const f of anims) expect(f).toHaveAttribute('data-kind', 'explanation');
  });

  it('keeps raw, estimated usable and live free space distinct, and labels the estimate', () => {
    renderExhibit();
    const b = builder();
    expect(within(b).getByTestId('cap-raw')).toHaveTextContent('120 TB');
    expect(within(b).getByTestId('cap-usable')).toHaveTextContent('80 TB');
    expect(within(b).getByTestId('cap-free')).toHaveTextContent(/not predicted/i);
    expect(within(b).getByText(/geometry estimate/i)).toBeInTheDocument();
    expect(within(b).getByText(/not a zpool capacity prediction/i)).toBeInTheDocument();
  });

  it('updates capacity immediately and records the layout in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    await user.click(within(builder()).getByRole('radio', { name: /^mirror/i }));
    expect(window.location.hash).toContain('lay=mirror');
    // 6-wide is clamped to the mirror maximum (6): 2 × 6-way mirror of 10 TB.
    expect(within(builder()).getByTestId('cap-raw')).toHaveTextContent('120 TB');
    expect(within(builder()).getByTestId('cap-usable')).toHaveTextContent('20 TB');
    fireEvent.change(within(builder()).getByRole('slider', { name: /disks per vdev/i }), { target: { value: '2' } });
    expect(within(builder()).getByTestId('cap-usable')).toHaveTextContent('20 TB');
    expect(within(builder()).getByTestId('cap-raw')).toHaveTextContent('40 TB');
    fireEvent.change(within(builder()).getByRole('slider', { name: /top-level vdevs/i }), { target: { value: '3' } });
    fireEvent.change(within(builder()).getByRole('slider', { name: /disk size/i }), { target: { value: '4' } });
    expect(within(builder()).getByTestId('cap-usable')).toHaveTextContent('12 TB');
    expect(window.location.hash).toMatch(/w=2/);
    expect(window.location.hash).toMatch(/v=3/);
    expect(window.location.hash).toMatch(/tb=4/);
  });

  it('restores a shared configuration from the URL', () => {
    renderExhibit('?lay=raidz1&w=5&v=1&tb=4&fail=2');
    expect(within(builder()).getByRole('radio', { name: /^raidz1/i })).toBeChecked();
    expect(within(builder()).getByTestId('cap-usable')).toHaveTextContent('16 TB');
    expect(disk(1, 3)).toHaveAttribute('aria-pressed', 'true');
    expect(within(tracer()).getByTestId('pool-state')).toHaveTextContent('DEGRADED');
  });

  it('never states an unconditional pool-wide failure count', () => {
    renderExhibit();
    const summary = screen.getByTestId('resiliency-summary');
    expect(summary).toHaveTextContent(/any 2 failed disks/i);
    expect(summary).toHaveTextContent(/3 failures in the same vdev/i);
    expect(summary).toHaveTextContent(/up to 4.*only if/i);
  });

  it('shows that which disks fail decides survival', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const state = () => within(tracer()).getByTestId('pool-state');
    expect(state()).toHaveTextContent('ONLINE');
    await user.click(disk(1, 1));
    expect(disk(1, 1)).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.hash).toContain('fail=0');
    await user.click(disk(1, 2));
    await user.click(disk(2, 1));
    expect(state()).toHaveTextContent('DEGRADED');
    await user.click(disk(2, 1));
    await user.click(disk(1, 3));
    expect(state()).toHaveTextContent('FAULTED');
    expect(within(tracer()).getByRole('status')).toHaveTextContent(/vdev 1/i);
  });

  it('tracer: step, back, reset and replay through the failure order, with keyboard shortcuts', async () => {
    const user = userEvent.setup();
    renderExhibit('?fail=0.6.1.2');
    const t = tracer();
    const state = () => within(t).getByTestId('pool-state');
    const counter = () => within(t).getByTestId('tracer-step');
    expect(counter()).toHaveTextContent('4 of 4');
    expect(state()).toHaveTextContent('FAULTED');
    await user.click(within(t).getByRole('button', { name: /^reset/i }));
    expect(counter()).toHaveTextContent('0 of 4');
    expect(state()).toHaveTextContent('ONLINE');
    await user.click(within(t).getByRole('button', { name: /^step/i }));
    expect(counter()).toHaveTextContent('1 of 4');
    expect(state()).toHaveTextContent('DEGRADED');
    fireEvent.keyDown(within(t).getByRole('button', { name: /^step/i }), { key: 's' });
    fireEvent.keyDown(within(t).getByRole('button', { name: /^step/i }), { key: 's' });
    expect(counter()).toHaveTextContent('3 of 4');
    expect(state()).toHaveTextContent('DEGRADED');
    fireEvent.keyDown(within(t).getByRole('button', { name: /^step/i }), { key: 'ArrowLeft' });
    expect(counter()).toHaveTextContent('2 of 4');
    expect(within(t).getByRole('button', { name: /^replay/i })).toBeInTheDocument();
    expect(within(t).getByRole('button', { name: /^play/i })).toBeInTheDocument();
  });

  it('tracer: play advances on a timer and pauses', async () => {
    renderExhibit('?fail=0.1');
    const t = tracer();
    fireEvent.click(within(t).getByRole('button', { name: /^replay/i }));
    expect(within(t).getByTestId('tracer-step')).toHaveTextContent('0 of 2');
    expect(within(t).getByRole('button', { name: /^pause/i })).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 1300)));
    expect(within(t).getByTestId('tracer-step')).not.toHaveTextContent('0 of 2');
  });

  it('tracer: with reduced motion there is no autoplay; replay only rewinds', () => {
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    renderExhibit('?fail=0.1');
    const t = tracer();
    expect(within(t).queryByRole('button', { name: /^play/i })).not.toBeInTheDocument();
    fireEvent.click(within(t).getByRole('button', { name: /^replay/i }));
    expect(within(t).getByTestId('tracer-step')).toHaveTextContent('0 of 2');
    expect(within(t).queryByRole('button', { name: /^pause/i })).not.toBeInTheDocument();
  });

  it('presets place failures in the best and worst positions', async () => {
    const user = userEvent.setup();
    renderExhibit();
    await user.click(within(tracer()).getByRole('button', { name: /spread/i }));
    expect(within(tracer()).getByTestId('pool-state')).toHaveTextContent('DEGRADED');
    expect(window.location.hash).toContain('fail=0.6.1.7');
    await user.click(within(tracer()).getByRole('button', { name: /concentrate/i }));
    expect(within(tracer()).getByTestId('pool-state')).toHaveTextContent('FAULTED');
    await user.click(within(tracer()).getByRole('button', { name: /clear/i }));
    expect(within(tracer()).getByTestId('pool-state')).toHaveTextContent('ONLINE');
  });

  it('explains distributed parity, not a dedicated parity drive', () => {
    renderExhibit();
    const section = screen.getByRole('region', { name: /distributed parity/i });
    expect(within(section).getAllByText(/no dedicated parity (disk|drive)/i).length).toBeGreaterThan(0);
    expect(within(section).getByRole('figure', { name: /explanatory animation/i })).toBeInTheDocument();
  });

  it('switches between short and deep explanations and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    expect(screen.queryByText(/slop space/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /deep/i }));
    expect(screen.getAllByText(/slop space/i).length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('depth=deep');
  });

  it('challenge: detects a solved goal', () => {
    renderExhibit('?fail=0.1.6.7');
    const challenge = screen.getByRole('region', { name: /challenge/i });
    expect(within(challenge).getAllByRole('status')[0]).toHaveTextContent(/solved/i);
  });

  it('compares other layouts for the same disks and applies one', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const fig = screen.getByRole('figure', { name: /same disks/i });
    const table = within(fig).getByRole('table');
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(3);
    await user.click(within(fig).getByRole('button', { name: /6 × 2-way mirror/i }));
    expect(within(builder()).getByTestId('cap-usable')).toHaveTextContent('60 TB');
  });

  it('cites the OpenZFS zpoolconcepts manual and states units and limits', () => {
    renderExhibit();
    const sources = screen.getByRole('region', { name: /sources/i });
    expect(within(sources).getAllByText(/zpoolconcepts/i).length).toBeGreaterThan(0);
    const limits = screen.getByRole('region', { name: /assumptions, units/i });
    expect(within(limits).getByText(/10\^12/)).toBeInTheDocument();
    expect(within(limits).getAllByText(/draid/i).length).toBeGreaterThan(0);
  });
});
