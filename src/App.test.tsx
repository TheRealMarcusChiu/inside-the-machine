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

  it('links the open exhibit and lists planned exhibits without links', () => {
    render(<App />);
    const gallery = screen.getByRole('region', { name: /gallery/i });
    expect(within(gallery).getByRole('link', { name: /logic gates/i })).toHaveAttribute('href', '#/exhibits/logic-to-cpu');
    const planned = screen.getByRole('list', { name: /in preparation/i });
    expect(within(planned).queryAllByRole('link')).toHaveLength(0);
    expect(within(planned).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('explains the simulation vs. explanation legend on the home page', () => {
    render(<App />);
    expect(screen.getAllByText(/live simulation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/explanatory animation/i).length).toBeGreaterThan(0);
  });

  it('shows a not-found page for planned or unknown exhibit URLs', async () => {
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
