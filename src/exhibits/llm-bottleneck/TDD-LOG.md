# TDD log — LLM bottleneck explorer

Red → green record for this exhibit. Command: `npx vitest run src/exhibits/llm-bottleneck`.

## 1. Red — tests before implementation (2026-10-20)

Five test files were written against the intended APIs before any implementation existed:

| Area | Test file |
| --- | --- |
| Formulas: P × b, 2·L·T·Hkv·dh·b, attention products, Roofline, worked example, timeline | `model/bottleneck.test.ts` |
| SI / duration formatting | `model/format.test.ts` |
| Challenge checker | `model/challenges.test.ts` |
| URL state (defaults, round trip, tampering) | `urlConfig.test.ts` |
| Page: sections, disclaimers, controls, chart, replay, reduced motion, sources | `LlmBottleneckExhibit.test.tsx` |

Observed result:

```
 FAIL  src/exhibits/llm-bottleneck/model/bottleneck.test.ts
Error: Failed to resolve import "./bottleneck" from "src/exhibits/llm-bottleneck/model/bottleneck.test.ts". Does the file exist?
...
 Test Files  5 failed (5)
      Tests  no tests
```

## 2. Green — pure model

`model/bottleneck.ts`, `model/format.ts` and `model/challenges.ts` were implemented: `3 passed (3)`, `34 passed (34)`.

## 3. Red → green — field input helpers

`parseFieldInput` and `scaleField` had been drafted ahead of their tests, so they were removed, three tests were
added to `urlConfig.test.ts`, and the run was observed failing (`TypeError: parseFieldInput is not a function`,
3 failed). Restoring the helpers made the model and URL suites pass: `4 passed (4)`, `44 passed (44)`.

## 4. Green — exhibit UI

The page, components and stylesheet were implemented. The first run had one failure, in the challenge test: its
fixture (`kv=1&B=512`) solved both challenges, because 48.4 GB fits the 80 GB budget. The fixture was corrected to
`kv=1&B=1024` (82.7 GB, over budget), and a mirror case was added (`kv=8&B=32`: fits, but bandwidth-bound).
Result: `5 passed (5)`, `68 passed (68)`.

## 5. Visual check

Headless Chromium screenshots at 1280 px and 390 px showed two layout bugs that the tests could not catch: number
fields overflowing their grid cells, and chart labels colliding on a narrow screen. Both were fixed in CSS and in the
chart's label placement.
