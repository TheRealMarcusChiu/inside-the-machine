# Inside the Machine

An interactive museum of computing that runs entirely in the browser. Each room takes one idea apart and lets
visitors operate it themselves. It is a static site: no server, no accounts, no tracking.

All seven rooms are open. They are numbered in the order the gallery presents them, from logic gates up to
storage:

| Room | Exhibit | Deep link | What you operate |
| --- | --- | --- | --- |
| 1 | Logic gates → binary adder → miniature CPU | `#/exhibits/logic-to-cpu` | Flip bits through real gate logic, add two 4-bit numbers on a ripple-carry adder, then step the invented 4-bit “Museum-4” CPU, whose ADD and SUB run on that same adder. |
| 2 | Memory hierarchy and caches | `#/exhibits/memory-hierarchy` | Follow one memory request through L1, L2 and RAM, choosing hits, misses and latencies, and see where a page fault to storage fits. |
| 3 | CPU SIMD vs GPU SIMT | `#/exhibits/cpu-vs-gpu` | Run the same additions on CPU vector lanes and GPU threads side by side, varying lanes, warp width, divergence, memory access and host–device transfer. |
| 4 | Tiny transformer: scaled dot-product attention | `#/exhibits/tiny-transformer` | Edit Q, K and V for three tokens and step through scores, scaling, softmax and the weighted blend of values. |
| 5 | The LLM bottleneck explorer | `#/exhibits/llm-bottleneck` | Size the weights and KV cache, place prefill and decode on a Roofline, and replay a generation to see when it waits on memory bandwidth rather than arithmetic. |
| 6 | The journey of a web request | `#/exhibits/web-request` | Trace one HTTPS API call through DNS, TCP/TLS or QUIC, HTTP, a Spring controller, caches and the database, and see what caching and connection reuse remove. |
| 7 | ZFS pool topology explorer | `#/exhibits/zfs-topology` | Build a pool from mirror or RAIDZ vdevs, compare raw and usable capacity, and fail disks to see which losses the pool survives. |

Every room follows the same pattern: a short/deep explanation switch, at least one live simulation, a worked
example, an automatically checked challenge, stated assumptions, units and limitations, and sources.

Everything runs in the browser. There is no backend, no account, no analytics and no network request at run time
beyond loading the site's own static files; the web-request room *models* a request rather than sending one.
External links appear only as cited sources.

## Principles

- **Simulation and explanation are labelled differently.** Figures marked *Live simulation* compute what they show
  from a working model as you interact. Figures marked *Explanatory animation* are scripted (though their numbers
  come from the same models). The two badges differ in wording, icon and border style, not only colour.
- **Accessible by default.** Landmarks, a skip link, a single `h1` per page, focus moved on navigation, labelled
  controls, `aria-pressed` bit switches, live regions for results, accessible error messages, keyboard shortcuts
  scoped to the CPU lab, and visible focus rings.
- **Reduced motion is respected.** The OS setting is followed by default and can be overridden from the header
  (System → Reduced → Full; stored in `localStorage`). With reduced motion, transitions are disabled and
  explanatory animations step manually instead of playing. Nothing autoplays.
- **State lives in the URL.** Each room writes its controls to the hash query string
  (`#/exhibits/logic-to-cpu?a=9&b=9`, `#/exhibits/zfs-topology?lay=raidz2&w=6&v=2`), so any view can be shared
  exactly. Invalid values fall back to the room's worked example.
- **Heavy work stays off the main thread.** In Room 1, CPU trace replays and the exhaustive adder check run in a
  Web Worker, with an inline fallback. The other rooms' models are small closed-form calculations or bounded traces
  and run inline.

## Getting started

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit, component and accessibility tests for all seven rooms (Vitest + Testing Library)
npm run build        # type-check (tsc -b) and build the static site to dist/
npm run preview      # serve the production build at http://localhost:4173
```

## Deploying to GitHub Pages

The build output in `dist/` is plain static files, so any static host works. `.github/workflows/deploy.yml` runs
`npm ci`, the full test suite and `npm run build`, then publishes `dist/` to GitHub Pages on every push to `main`.

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

The workflow passes the Pages base path to Vite as `VITE_BASE_PATH`, so the same code works on a project site
(`https://user.github.io/repo/`) and a user site (`https://user.github.io/`). Routing uses the URL hash, so no
404 rewrites are needed and every room's deep link (`…/#/exhibits/<slug>`) works directly. To build for a subpath
locally: `VITE_BASE_PATH=/repo/ npm run build`.

## Project layout

```
src/
  App.tsx                    museum shell: header, gallery, routing, 404, motion toggle
  main.tsx                   entry point (fonts, global CSS)
  styles/global.css          design tokens, shell and shared components
  components/                figure frame, kind badges, explanatory-animation player
  lib/                       hash router, URL state codecs, motion preference, asset URLs
  worker/                    simulation Web Worker (used by Room 1), protocol and client
  exhibits/
    registry.ts              the gallery: one entry per room, in order, numbered 1–7
    logic-to-cpu/            Room 1 — gates, adders, Museum-4 CPU and assembler (sim/)
    memory-hierarchy/        Room 2 — memory request trace (sim/)
    cpu-vs-gpu/              Room 3 — SIMD/SIMT work-distribution model
    tiny-transformer/        Room 4 — attention math and stage-by-stage lab
    llm-bottleneck/          Room 5 — weight/KV-cache sizing and Roofline model (model/)
    web-request/             Room 6 — request journey model (model/)
    zfs-topology/            Room 7 — pool capacity and failure-tolerance model (model/)
docs/TDD-LOG.md              record of the test-first build
```

Each room folder holds its page (`*Exhibit.tsx`), components, pure models with their tests, and a `urlConfig.ts`
describing its shareable URL state.

## Adding an exhibit

1. Write the models and tests first under `src/exhibits/<slug>/`.
2. Build the page as the default export of a component that takes no props, using `ExhibitFigure` with
   `kind="simulation"` or `kind="explanation"` for every interactive figure.
3. Describe shareable state with a schema in `urlConfig.ts` (see `src/lib/url/urlState.ts`).
4. In `src/exhibits/registry.ts`, add an entry with `status: "open"`, the next room number and
   `load: () => import('./<slug>/YourExhibit')`, and update the expected gallery order in `registry.test.ts` and
   `App.test.tsx`. Only open exhibits get routes; the page is code-split automatically. (An entry with
   `status: "planned"` is listed under “In preparation” without a route; there are none at present.)

## Room 1: the Museum-4 at a glance

| Opcode | Mnemonic | Effect |
| --- | --- | --- |
| 0000 | `NOP` | do nothing |
| 0001 | `LDI n` | A ← n |
| 0010 | `LDA addr` | A ← RAM[addr] |
| 0011 | `STA addr` | RAM[addr] ← A |
| 0100 | `ADD addr` | A ← A + RAM[addr]; sets Z, C |
| 0101 | `SUB addr` | A ← A − RAM[addr]; sets Z, C (C = 1 means no borrow) |
| 0110 | `JMP addr` | PC ← addr |
| 0111 | `JZ addr` | jump if Z |
| 1000 | `JC addr` | jump if C |
| 1001 | `OUT` | display A |
| 1010 | `HLT` | stop |

Instructions are one byte (opcode nibble + operand nibble). Program memory and RAM each hold 16 nibbles. The
assembler accepts labels, `; comments`, `.data address value`, and decimal, `0x` or `0b` numbers.

## Licence

MIT — see [LICENSE](LICENSE).
