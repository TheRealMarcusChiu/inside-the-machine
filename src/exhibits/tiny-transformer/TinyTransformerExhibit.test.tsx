import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TinyTransformerExhibit from './TinyTransformerExhibit';
import { MotionProvider } from '../../lib/motion';

function renderExhibit(hash = '#/exhibits/tiny-transformer') {
  window.location.hash = hash;
  return render(
    <MotionProvider>
      <TinyTransformerExhibit />
    </MotionProvider>,
  );
}

/** The live attention simulation figure. */
function getSimulation() {
  return screen.getByRole('figure', { name: /simulation/i });
}

/** The element marked as the current stage (aria-current="step"). */
function currentStage(container: HTMLElement) {
  const current = container.querySelector('[aria-current="step"]');
  expect(current).not.toBeNull();
  return current as HTMLElement;
}

describe('Tiny transformer: scaled dot-product attention', () => {
  beforeEach(() => localStorage.clear());

  it('has a heading that names scaled dot-product attention', () => {
    renderExhibit();
    expect(
      screen.getByRole('heading', { level: 1, name: /scaled dot-product attention/i }),
    ).toBeInTheDocument();
  });

  it('labels the real computation and the visual guide separately', () => {
    renderExhibit();
    const sim = screen.getByRole('figure', { name: /simulation/i });
    const anim = screen.getByRole('figure', { name: /animation/i });
    expect(sim).not.toBe(anim);
    expect(within(sim).getByText(/simulation/i)).toHaveTextContent(/real computation/i);
    expect(within(anim).getByText(/animation/i)).toHaveTextContent(/visual guide/i);
  });

  it('offers Step, Pause/Play, Reset and Replay controls', () => {
    renderExhibit();
    const sim = getSimulation();
    expect(within(sim).getByRole('button', { name: /^step/i })).toBeInTheDocument();
    expect(within(sim).getByRole('button', { name: /^(play|pause)/i })).toBeInTheDocument();
    expect(within(sim).getByRole('button', { name: /^reset/i })).toBeInTheDocument();
    expect(within(sim).getByRole('button', { name: /^replay/i })).toBeInTheDocument();
  });

  it('Step advances the indicated current stage', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const sim = getSimulation();
    const before = currentStage(sim).textContent;
    await user.click(within(sim).getByRole('button', { name: /^step/i }));
    const after = currentStage(sim).textContent;
    expect(after).not.toBe(before);
    await user.click(within(sim).getByRole('button', { name: /^reset/i }));
    expect(currentStage(sim).textContent).toBe(before);
  });

  it('has an editable, labelled query input that drives the computation', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const sim = getSimulation();
    const queryInputs = within(sim)
      .getAllByLabelText(/query/i)
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    expect(queryInputs.length).toBeGreaterThan(0);
    const input = queryInputs[0]!;
    expect(input).toBeEnabled();
    expect(input).not.toHaveAttribute('readonly');

    const rawBefore = within(sim).getAllByLabelText(/raw scores/i)[0]!.textContent;
    await user.clear(input);
    await user.type(input, '3');
    expect(input).toHaveValue(input.type === 'number' ? 3 : '3');
    expect(within(sim).getAllByLabelText(/raw scores/i)[0]!.textContent).not.toBe(rawBefore);
  });

  it('exposes raw scores, scaled scores, softmax weights and the weighted V output', () => {
    renderExhibit();
    const sim = getSimulation();
    for (const name of [/raw scores/i, /scaled scores/i, /softmax weights/i, /weighted.*\bV\b|output/i]) {
      const els = within(sim).getAllByLabelText(name);
      expect(els.length).toBeGreaterThan(0);
      expect(els[0]!.textContent).toMatch(/-?\d/);
    }
  });

  it('switches between short and deep explanations', async () => {
    const user = userEvent.setup();
    renderExhibit();
    const short = screen.getByRole('radio', { name: /short/i });
    const deep = screen.getByRole('radio', { name: /deep/i });
    expect(short).toBeChecked();
    await user.click(deep);
    expect(deep).toBeChecked();
    expect(short).not.toBeChecked();
  });

  it('has worked example, challenge, assumptions/limitations and sources sections', () => {
    renderExhibit();
    for (const name of [/worked example/i, /challenge/i, /assumptions/i, /sources/i]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    const limits = screen.getByRole('region', { name: /assumptions/i });
    expect(limits).toHaveTextContent(/units?/i);
    expect(limits).toHaveTextContent(/limitation/i);
  });

  it('cites Vaswani et al. 2017 with a link to the paper', () => {
    renderExhibit();
    const sources = screen.getByRole('region', { name: /sources/i });
    expect(sources).toHaveTextContent(/vaswani/i);
    expect(sources).toHaveTextContent(/2017/);
    const link = within(sources)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === 'https://arxiv.org/abs/1706.03762');
    expect(link).toBeDefined();
  });
});
