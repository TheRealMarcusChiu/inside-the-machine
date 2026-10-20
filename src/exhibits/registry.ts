import type { ExhibitEntry, OpenExhibit, PlannedExhibit } from './types';

/**
 * The single source of truth for the museum's galleries.
 * All seven rooms are open, numbered 1–7 in gallery order. To add an exhibit:
 * build it under src/exhibits/<slug>/, then add an "open" entry with a `load`
 * import (or a "planned" entry, which has no route). See README → "Adding an exhibit".
 */
export const EXHIBITS: readonly ExhibitEntry[] = [
  {
    status: 'open',
    slug: 'logic-to-cpu',
    number: 1,
    title: 'Logic gates → binary adder → miniature CPU',
    subtitle: 'From a rule about two wires to a machine that runs a program',
    summary:
      'Flip bits through real gate logic, watch a 4-bit ripple-carry adder carry, then step a tiny 4-bit CPU through programs that use that very adder.',
    topics: ['Boolean logic', 'Binary arithmetic', 'Two’s complement', 'Fetch–decode–execute'],
    load: () => import('./logic-to-cpu/LogicToCpuExhibit'),
  },
  {
    status: 'open',
    slug: 'memory-hierarchy',
    number: 2,
    title: 'Memory hierarchy and caches',
    subtitle: 'Why the nearest byte is the fastest',
    summary: 'Registers, caches and main memory, with a cache simulator driven by real access patterns.',
    topics: ['Locality', 'Cache lines', 'Latency'],
    load: () => import('./memory-hierarchy/MemoryHierarchyExhibit'),
  },
  {
    status: 'open',
    slug: 'cpu-vs-gpu',
    number: 3,
    title: 'CPU SIMD vs GPU SIMT',
    subtitle: 'Two ways to do the same thing to many numbers at once',
    summary:
      'Run the same additions on CPU vector lanes and on GPU threads side by side, then compare how each machine spreads the work.',
    topics: ['Parallelism', 'SIMD', 'SIMT'],
    load: () => import('./cpu-vs-gpu/CpuVsGpuExhibit'),
  },
  {
    status: 'open',
    slug: 'tiny-transformer',
    number: 4,
    title: 'Tiny transformer: scaled dot-product attention',
    subtitle: 'How each word decides which other words to listen to',
    summary:
      'Step through real attention on three tokens: queries meet keys, scores pass through softmax, and the weights blend the values.',
    topics: ['Attention', 'Dot products', 'Softmax'],
    load: () => import('./tiny-transformer/TinyTransformerExhibit'),
  },
  {
    status: 'open',
    slug: 'llm-bottleneck',
    number: 5,
    title: 'The LLM bottleneck explorer',
    subtitle: 'Compute versus memory bandwidth in LLM inference',
    summary:
      'Size the weights and KV cache, place prefill and decode on a Roofline, and see when generation waits on memory rather than arithmetic.',
    topics: ['LLM inference', 'Roofline', 'KV cache', 'Memory bandwidth'],
    load: () => import('./llm-bottleneck/LlmBottleneckExhibit'),
  },
  {
    status: 'open',
    slug: 'web-request',
    number: 6,
    title: 'The journey of a web request',
    subtitle: 'From a URL in your browser to a row in a database, and back again',
    summary:
      'Follow one HTTPS API call through DNS, TCP/TLS or QUIC, HTTP, a Spring controller, caches and the database, and see which steps caching and connection reuse remove.',
    topics: ['DNS', 'TLS', 'HTTP', 'Caching'],
    load: () => import('./web-request/WebRequestExhibit'),
  },
  {
    status: 'open',
    slug: 'zfs-topology',
    number: 7,
    title: 'ZFS pool topology explorer',
    subtitle: 'Mirrors, RAIDZ and top-level vdevs',
    summary:
      'Build a pool from mirrors or RAIDZ vdevs, compare raw and usable capacity, and trace which disk failures the pool survives.',
    topics: ['ZFS', 'RAIDZ', 'Mirrors', 'Redundancy'],
    load: () => import('./zfs-topology/ZfsTopologyExhibit'),
  },
];

export function getOpenExhibits(): OpenExhibit[] {
  return EXHIBITS.filter((e): e is OpenExhibit => e.status === 'open');
}

export function getPlannedExhibits(): PlannedExhibit[] {
  return EXHIBITS.filter((e): e is PlannedExhibit => e.status === 'planned');
}
