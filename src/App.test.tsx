import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('museum shell', () => {
  it('renders landmarks, a skip link and the museum title', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: /skip to content/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /inside the machine/i })).toBeInTheDocument();
  });

  it('skip link moves focus to main content without breaking the hash route', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/';
    render(<App />);
    await user.click(screen.getByRole('link', { name: /skip to content/i }));
    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.hash).toBe('#/');
  });

  it('lists exactly the seven open rooms, numbered 1–7 in order, with no planned section', () => {
    window.location.hash = '#/';
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    const cards = within(gallery).getAllByRole('heading', { level: 3 }).map((h) => {
      const link = within(h).getByRole('link');
      return [h.previousElementSibling?.textContent, link.getAttribute('href')];
    });
    expect(cards).toEqual([
      ['Room 1 · Open', '#/exhibits/logic-to-cpu'],
      ['Room 2 · Open', '#/exhibits/memory-hierarchy'],
      ['Room 3 · Open', '#/exhibits/cpu-vs-gpu'],
      ['Room 4 · Open', '#/exhibits/tiny-transformer'],
      ['Room 5 · Open', '#/exhibits/llm-bottleneck'],
      ['Room 6 · Open', '#/exhibits/web-request'],
      ['Room 7 · Open', '#/exhibits/zfs-topology'],
    ]);
    expect(screen.queryByRole('list', { name: /in preparation/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/in preparation/i)).not.toBeInTheDocument();
  });

  it('explains the simulation vs. explanation legend on the home page', () => {
    render(<App />);
    expect(screen.getAllByText(/live simulation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/explanatory animation/i).length).toBeGreaterThan(0);
  });

  it('shows a not-found page for retired or unknown exhibit URLs', async () => {
    window.location.hash = '#/exhibits/floating-point';
    render(<App />);
    expect(await screen.findByRole('heading', { name: /not on display/i })).toBeInTheDocument();
  });

  it('navigates to the exhibit when the hash changes', async () => {
    render(<App />);
    await act(async () => {
      window.location.hash = '#/exhibits/logic-to-cpu';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: /logic gates/i })).toBeInTheDocument();
  });

  it('routes to the tiny transformer exhibit from the gallery', async () => {
    window.location.hash = '#/';
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    expect(within(gallery).getByRole('link', { name: /tiny transformer/i })).toHaveAttribute(
      'href',
      '#/exhibits/tiny-transformer',
    );
    await act(async () => {
      window.location.hash = '#/exhibits/tiny-transformer';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: /scaled dot-product attention/i })).toBeInTheDocument();
  });

  it('routes to the CPU vs GPU exhibit from the gallery', async () => {
    window.location.hash = '#/';
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    expect(within(gallery).getByRole('link', { name: /cpu simd vs gpu simt/i })).toHaveAttribute(
      'href',
      '#/exhibits/cpu-vs-gpu',
    );
    await act(async () => {
      window.location.hash = '#/exhibits/cpu-vs-gpu';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: /cpu simd vs gpu simt/i })).toBeInTheDocument();
  });

  it('routes to the web request exhibit from the gallery', async () => {
    window.location.hash = '#/';
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    expect(within(gallery).getByRole('link', { name: /journey of a web request/i })).toHaveAttribute(
      'href',
      '#/exhibits/web-request',
    );
    await act(async () => {
      window.location.hash = '#/exhibits/web-request';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: /journey of a web request/i })).toBeInTheDocument();
  });

  it('routes to the ZFS topology exhibit from the gallery', async () => {
    window.location.hash = '#/';
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    expect(within(gallery).getByRole('link', { name: /zfs pool topology explorer/i })).toHaveAttribute(
      'href',
      '#/exhibits/zfs-topology',
    );
    await act(async () => {
      window.location.hash = '#/exhibits/zfs-topology';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: /zfs pool topology explorer/i })).toBeInTheDocument();
  });

  it('routes to the LLM bottleneck exhibit from the gallery', async () => {
    window.location.hash = '#/';
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    expect(within(gallery).getByRole('link', { name: /llm bottleneck explorer/i })).toHaveAttribute(
      'href',
      '#/exhibits/llm-bottleneck',
    );
    await act(async () => {
      window.location.hash = '#/exhibits/llm-bottleneck';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: /llm bottleneck explorer/i })).toBeInTheDocument();
  });

  it('offers a motion preference control that cycles and reports its state', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: /motion/i });
    expect(button).toHaveTextContent(/system/i);
    await user.click(button);
    expect(button).toHaveTextContent(/reduced/i);
    expect(document.documentElement.dataset.motion).toBe('reduce');
    await user.click(button);
    expect(button).toHaveTextContent(/full/i);
    expect(document.documentElement.dataset.motion).toBe('full');
    await user.click(button);
  });
});
