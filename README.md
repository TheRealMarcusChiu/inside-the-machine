# Inside the Machine

An interactive museum of computing that runs entirely in the browser. Each room takes one idea apart and lets
visitors operate it themselves. It is a static site: no server, no accounts, no tracking.

**Open now — Room 1: Logic gates → binary adder → miniature CPU.** Flip bits through real gate logic, add two
4-bit numbers on a ripple-carry adder built from full adders, then step a tiny invented 4-bit CPU (the
“Museum-4”) whose ADD and SUB run on that same adder. It includes a worked example (6 + 7), two automatically
checked challenges, a short/deep explanation switch, stated assumptions and limitations, and sources.

Rooms on memory hierarchies, floating point and compilers are listed in the gallery as *in preparation*. They have
no pages or routes until they are complete.

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
- **State lives in the URL.** Every control writes to the hash query string (`#/exhibits/logic-to-cpu?a=9&b=9`), so
  any view can be shared exactly. Invalid values fall back to the worked example.
- **Heavy work stays off the main thread.** CPU trace replays and the exhaustive adder check run in a Web Worker,
  with an inline fallback.

## Getting started

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev          # http://localhost:5173
npm test -- --run    # unit, component and accessibility tests (Vitest + Testing Library)
npm run build        # type-check and build to dist/
npm run preview      # serve the production build
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`.

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

The workflow passes the Pages base path to Vite as `VITE_BASE_PATH`, so the same code works on a project site
(`https://user.github.io/repo/`) and a user site (`https://user.github.io/`). Routing uses the URL hash, so no
404 rewrites are needed. To build for a subpath locally: `VITE_BASE_PATH=/repo/ npm run build`.

## Project layout

```
src/
  App.tsx                    museum shell: header, gallery, routing, 404, motion toggle
  main.tsx                   entry point (fonts, global CSS)
  styles/global.css          design tokens, shell and shared components
  components/                figure frame, kind badges, explanatory-animation player
  lib/                       hash router, URL state codecs, motion preference, asset URLs
  worker/                    simulation Web Worker, protocol and client
  exhibits/
    registry.ts              the gallery: one entry per exhibit, "open" or "planned"
    logic-to-cpu/
      LogicToCpuExhibit.tsx  the room: sections, text, sources
      components/            gate lab, full adder, 4-bit adder, CPU lab, explainers, challenges
      sim/                   pure models: gates, adders, CPU, assembler, programs, challenges
      cpuLabState.ts         CPU lab state machine and keyboard map
      urlConfig.ts           the exhibit's shareable URL schema
docs/TDD-LOG.md              record of the test-first build
```

## Adding an exhibit

1. Write the models and tests first under `src/exhibits/<slug>/`.
2. Build the page as the default export of a component that takes no props, using `ExhibitFigure` with
   `kind="simulation"` or `kind="explanation"` for every interactive figure.
3. Describe shareable state with a schema in `urlConfig.ts` (see `src/lib/url/urlState.ts`).
4. In `src/exhibits/registry.ts`, change the entry's `status` from `"planned"` to `"open"` and add
   `load: () => import('./<slug>/YourExhibit')`. Only open exhibits get routes; the page is code-split automatically.

## The Museum-4 at a glance

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
