import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogicToCpuExhibit from './LogicToCpuExhibit';
import { MotionProvider } from '../../lib/motion';

function renderExhibit(hash = '#/exhibits/logic-to-cpu') {
  window.location.hash = hash;
  return render(
    <MotionProvider>
      <LogicToCpuExhibit />
    </MotionProvider>,
  );
}

describe('Logic gates → binary adder → miniature CPU', () => {
  beforeEach(() => localStorage.clear());

  it('has a titled article with the required sections', () => {
    renderExhibit();
    expect(screen.getByRole('heading', { level: 1, name: /logic gates/i })).toBeInTheDocument();
    for (const name of [
      /a gate is a rule/i,
      /adding with gates/i,
      /a miniature cpu/i,
      /worked example/i,
      /challenge/i,
      /assumptions, units/i,
      /sources/i,
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('provides an in-page table of contents that keeps the route', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const toc = screen.getByRole('navigation', { name: /on this page/i });
    await user.click(within(toc).getByRole('link', { name: /sources/i }));
    expect(window.location.hash.startsWith('#/exhibits/logic-to-cpu')).toBe(true);
    expect(screen.getByRole('heading', { name: /^sources$/i })).toHaveFocus();
  });

  it('switches between short and deep explanations and records it in the URL', async () => {
    const user = userEvent.setup();
    renderExhibit();
    expect(screen.queryByText(/functionally complete/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /deep/i }));
    expect(screen.getAllByText(/functionally complete/i).length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('depth=deep');
  });

  it('visibly labels live simulations and explanatory animations differently', () => {
    renderExhibit();
    const sims = screen.getAllByRole('figure', { name: /live simulation/i });
    const anims = screen.getAllByRole('figure', { name: /explanatory animation/i });
    expect(sims.length).toBeGreaterThanOrEqual(3);
    expect(anims.length).toBeGreaterThanOrEqual(1);
    for (const f of sims) expect(f).toHaveAttribute('data-kind', 'simulation');
    for (const f of anims) expect(f).toHaveAttribute('data-kind', 'explanation');
  });

  it('gate lab: toggling input bits changes the output', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const lab = screen.getByRole('figure', { name: /gate lab/i });
    const output = within(lab).getByRole('status');
    expect(output).toHaveTextContent('0');
    await user.click(within(lab).getByRole('button', { name: /input a/i }));
    await user.click(within(lab).getByRole('button', { name: /input b/i }));
    expect(within(lab).getByRole('button', { name: /input a/i })).toHaveAttribute('aria-pressed', 'true');
    expect(output).toHaveTextContent('1');
    await user.click(within(lab).getByRole('radio', { name: 'XOR' }));
    expect(output).toHaveTextContent('0');
    expect(window.location.hash).toContain('gate=XOR');
  });

  it('adder lab: shows the worked example and responds to bit toggles', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const lab = screen.getByRole('figure', { name: /4-bit adder/i });
    expect(within(lab).getByTestId('adder-result')).toHaveTextContent('6 + 7 = 13');
    await user.click(within(lab).getByRole('button', { name: /a bit 3/i })); // +8
    expect(within(lab).getByTestId('adder-result')).toHaveTextContent('14 + 7 = 21');
    expect(within(lab).getByTestId('adder-result')).toHaveTextContent(/wraps to 5/i);
    expect(within(lab).getByTestId('adder-carry-out')).toHaveTextContent('1');
  });

  it('CPU lab: step, reset and keyboard shortcuts', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const lab = screen.getByRole('figure', { name: /miniature cpu/i });
    const pc = within(lab).getByTestId('reg-pc');
    expect(pc).toHaveTextContent('0');
    await user.click(within(lab).getByRole('button', { name: /^step/i }));
    expect(pc).toHaveTextContent('1');
    expect(within(lab).getByTestId('reg-a')).toHaveTextContent('6');
    fireEvent.keyDown(within(lab).getByRole('button', { name: /^step/i }), { key: 's' });
    expect(pc).toHaveTextContent('2');
    expect(within(lab).getByTestId('reg-a')).toHaveTextContent('13');
    await user.click(within(lab).getByRole('button', { name: /^reset/i }));
    expect(pc).toHaveTextContent('0');
    expect(within(lab).getByRole('button', { name: /^run/i })).toBeInTheDocument();
    expect(within(lab).getByRole('button', { name: /^replay/i })).toBeInTheDocument();
  });

  it('CPU lab: highlights the current instruction for assistive tech', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const lab = screen.getByRole('figure', { name: /miniature cpu/i });
    const rows = within(lab).getByRole('table', { name: /program memory/i });
    expect(within(rows).getAllByRole('row').find((r) => r.getAttribute('aria-current') === 'step')).toHaveTextContent('LDA');
    await user.click(within(lab).getByRole('button', { name: /^step/i }));
    expect(within(rows).getAllByRole('row').find((r) => r.getAttribute('aria-current') === 'step')).toHaveTextContent('ADD');
  });

  it('CPU lab: loading a preset restores it from the URL', () => {
    renderExhibit('#/exhibits/logic-to-cpu?prog=multiply');
    const lab = screen.getByRole('figure', { name: /miniature cpu/i });
    expect(within(lab).getByRole('combobox', { name: /program/i })).toHaveValue('multiply');
  });

  it('CPU lab: custom assembly reports errors accessibly', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const lab = screen.getByRole('figure', { name: /miniature cpu/i });
    const editor = within(lab).getByRole('textbox', { name: /assembly/i });
    await user.clear(editor);
    await user.type(editor, 'BOGUS 1');
    await user.click(within(lab).getByRole('button', { name: /assemble/i }));
    expect(within(lab).getByRole('alert')).toHaveTextContent(/line 1/i);
  });

  it('challenge: detects a correct solution', async () => {
    renderExhibit('#/exhibits/logic-to-cpu?a=9&b=9');
    const challenge = screen.getByRole('region', { name: /challenge/i });
    expect(within(challenge).getByRole('status')).toHaveTextContent(/solved/i);
  });

  it('lists real sources and stated limitations', () => {
    renderExhibit();
    const sources = screen.getByRole('region', { name: /sources/i });
    expect(within(sources).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(within(sources).getByText(/shannon/i)).toBeInTheDocument();
    const limits = screen.getByRole('region', { name: /assumptions, units/i });
    expect(within(limits).getByText(/propagation delay/i)).toBeInTheDocument();
  });
});
