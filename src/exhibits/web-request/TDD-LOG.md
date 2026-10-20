# TDD log — The journey of a web request

Built test-first under `src/exhibits/web-request/`. No shared files (registry, App, `lib/`, `components/`, global CSS)
were changed; the exhibit is not routable until its registry entry is added.

## 1. Red — tests before implementation (2026-10-20)

Five test files were written against the intended APIs before any implementation existed:

| Area | Test file |
| --- | --- |
| Journey model: step order, timings, skips, invariants over all 144 discrete condition combinations × RTT × DB | `model/journey.test.ts` |
| Trace player reducer + keyboard map | `model/tracePlayer.test.ts` |
| Challenge checkers | `model/challenge.test.ts` |
| Shareable URL schema | `urlConfig.test.ts` |
| Page: sections, labels, controls, feedback, step/play/pause/replay/reset, keyboard, reduced motion, URL restore, depth, worked example, challenges, sources | `WebRequestExhibit.test.tsx` |

`npx vitest run src/exhibits/web-request` → `Test Files 5 failed (5)`, `Tests no tests` (modules did not exist).

## 2. Green — models

`model/journey.ts`, `model/tracePlayer.ts`, `model/challenge.ts` and `urlConfig.ts` were implemented:
4 files, 49 tests passing. `model/sources.ts` was written alongside the UI; its test (`model/sources.test.ts`)
was added straight after, not before — the one exception to test-first here.

## 3. Green — UI

`WebRequestExhibit.tsx`, `components/*`, `useWebRequestUrlState.ts` and `exhibit.css`: 6 files, 71 tests passing.
`npm run build` caught one unused local, which was removed. The full suite then passed.
