# TDD log

This project was built test-first. This file records the red → green cycle for the foundation.

## 1. Red — tests written before implementation (2026-10-19)

Tooling (`package.json`, `vite.config.ts`, `tsconfig*.json`, `src/test/setup.ts`) was configured, then
16 test files were written against the intended module APIs before any implementation existed:

| Area | Test file |
| --- | --- |
| Gates, NAND universality | `src/exhibits/logic-to-cpu/sim/gates.test.ts` |
| Half/full/ripple-carry adder, overflow, unit-delay timing | `src/exhibits/logic-to-cpu/sim/adder.test.ts` |
| Mini CPU ISA, encoding, stepping, traces | `src/exhibits/logic-to-cpu/sim/cpu.test.ts` |
| Assembler + preset programs | `src/exhibits/logic-to-cpu/sim/assembler.test.ts` |
| Challenge checker | `src/exhibits/logic-to-cpu/sim/challenge.test.ts` |
| CPU lab state machine + keyboard map | `src/exhibits/logic-to-cpu/cpuLabState.test.ts` |
| Exhibit URL configuration | `src/exhibits/logic-to-cpu/urlConfig.test.ts` |
| Generic URL state codecs | `src/lib/url/urlState.test.ts` |
| Hash location parsing | `src/lib/url/hashLocation.test.ts` |
| Router (planned exhibits never routed) | `src/lib/router.test.ts` |
| BASE_URL asset helper | `src/lib/assets.test.ts` |
| Reduced-motion preference | `src/lib/motion.test.ts` |
| Exhibit registry | `src/exhibits/registry.test.ts` |
| Worker protocol + client (inline fallback, id correlation) | `src/worker/simulationClient.test.ts` |
| Museum shell (landmarks, skip link, gallery, 404, motion toggle) | `src/App.test.tsx` |
| Exhibit accessibility + interaction | `src/exhibits/logic-to-cpu/LogicToCpuExhibit.test.tsx` |

Command: `npx vitest run`

Result (expected failure):

```
 FAIL  src/exhibits/logic-to-cpu/sim/gates.test.ts
Error: Failed to resolve import "./gates" from "src/exhibits/logic-to-cpu/sim/gates.test.ts". Does the file exist?
...
 Test Files  16 failed (16)
      Tests  no tests
```

Every file failed because none of the modules under test existed yet.

## 2. Green — simulation and library layers

The pure modules (`sim/*`, `cpuLabState`, `urlConfig`, `lib/*`, `worker/*`) were implemented until their tests
passed. At that point 13 of 16 files passed (98 tests); the three remaining failures were the UI layer, which did
not exist yet: `App.test.tsx`, `LogicToCpuExhibit.test.tsx`, and `registry.test.ts` (which lazy-loads the exhibit).

## 3. Red → green — CPU stretch challenge

Four tests for `checkCpuChallenge` (compute 9 − 4 with SUB, OUT 5, halt) were added to
`sim/challenge.test.ts` first and failed (`4 failed | 3 passed`), then `CPU_CHALLENGE` / `checkCpuChallenge` were
implemented in `sim/challenge.ts` (`7 passed`).

## 4. Green — museum shell and exhibit UI (2026-10-19)

Implemented `index.html`, `src/main.tsx`, `src/App.tsx`, shared figure components, `styles/global.css`, the
exhibit page and its labs, `exhibit.css`, the README and the GitHub Pages workflow. One test failed on the first
run — the home page's in-article `<header>` was exposed as a second `banner` landmark — and was fixed by using a
`<div>` for in-page headers.

```
$ npm test -- --run
 Test Files  16 passed (16)
      Tests  126 passed (126)

$ npm run build
✓ built
```
