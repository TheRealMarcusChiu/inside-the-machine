import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import { AttentionChallenge } from './components/AttentionChallenge';
import { AttentionGuide } from './components/AttentionGuide';
import { AttentionLab, LAB_FIGURE_ID } from './components/AttentionLab';
import { fixed, fmt, fmtVector, term } from './format';
import { DEFAULT_K, DEFAULT_Q, DEFAULT_V, attention } from './math';
import { ENTRY_MAX, ENTRY_MIN, LAST_STAGE, type Depth } from './urlConfig';
import { useTinyTransformerUrlState } from './useTinyTransformerUrlState';
import './exhibit.css';

const SLUG = 'tiny-transformer';

const SECTIONS = [
  { id: 'idea', toc: 'The idea', title: 'Looking things up by similarity' },
  { id: 'lab', toc: 'The lab', title: 'Attention, one stage at a time' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: token 1, by hand' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Assumptions & limits', title: 'Assumptions, units & limitations' },
  { id: 'sources', toc: 'Sources', title: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

/** The worked example always uses the default numbers, whatever the lab currently shows. */
const EXAMPLE = attention(DEFAULT_Q, DEFAULT_K, DEFAULT_V);

function Section({ id, children, className }: { id: SectionId; children: ReactNode; className?: string }) {
  const { title } = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} className={`exhibit-section${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Deep({ children }: { children: ReactNode }) {
  return (
    <div className="deep">
      <p className="deep__label" aria-hidden="true">
        Deep dive
      </p>
      {children}
    </div>
  );
}

function useFocusTarget() {
  const { reducedMotion } = useMotion();
  return (elementId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
}

function DepthSwitch({ depth, onChange }: { depth: Depth; onChange: (d: Depth) => void }) {
  const name = useId();
  return (
    <fieldset className="segmented segmented--depth">
      <legend>Explanation depth</legend>
      {(['short', 'deep'] as const).map((d) => (
        <label key={d} className="segmented__option">
          <input type="radio" name={name} value={d} checked={depth === d} onChange={() => onChange(d)} />
          <span>{d === 'short' ? 'Short' : 'Deep'}</span>
        </label>
      ))}
    </fieldset>
  );
}

function CopyLink() {
  const [message, setMessage] = useState('');
  const copy = () => {
    const done = (text: string) => setMessage(text);
    if (!navigator.clipboard) {
      done('Copying is unavailable here — copy the address bar instead.');
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(
      () => done('Link copied. It reproduces exactly what you see.'),
      () => done('Could not copy — copy the address bar instead.'),
    );
  };
  return (
    <div className="copy-link">
      <button type="button" className="btn" onClick={copy}>
        Copy a link to this exact state
      </button>
      <span className="hint" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

function WorkedExample({ onShowInLab }: { onShowInLab: () => void }) {
  const q = DEFAULT_Q[0]!;
  const raw = EXAMPLE.scores[0]!;
  const scaled = EXAMPLE.scaledScores[0]!;
  const weights = EXAMPLE.weights[0]!;
  const out = EXAMPLE.output[0]!;
  return (
    <>
      <p>
        Follow token 1 through all four steps with the example numbers. Its query is q<sub>1</sub> ={' '}
        <span className="mono">{fmtVector(q)}</span>, and there are three keys to compare it with.
      </p>
      <ol className="worked-steps">
        <li>
          <span className="mono">Dot products</span>:{' '}
          {DEFAULT_K.map((k, j) => (
            <span key={j}>
              {j > 0 && ', '}q<sub>1</sub>·k<sub>{j + 1}</sub> = {q.map((x, c) => `${term(x)}×${term(k[c]!)}`).join(' + ')}{' '}
              = {fmt(raw[j]!)}
            </span>
          ))}
          .
        </li>
        <li>
          <span className="mono">Scale</span>: d<sub>k</sub> = {EXAMPLE.dk}, so divide by √{EXAMPLE.dk} ={' '}
          {fmt(EXAMPLE.scale)}, giving <span className="mono">{fmtVector(scaled)}</span>.
        </li>
        <li>
          <span className="mono">Softmax</span>: e to the power of each scaled score, divided by their sum, gives the
          weights <span className="mono">[{weights.map((w) => fixed(w)).join(', ')}]</span>, which add up to 1.
        </li>
        <li>
          <span className="mono">Mix</span>: {weights.map((w, j) => `${fixed(w)} × v${j + 1}`).join(' + ')} ={' '}
          <span className="mono">{fmtVector(out)}</span>.
        </li>
      </ol>
      <p>
        Query 1 points the same way as key 1, so token 1 takes about half its new vector from v<sub>1</sub> = [1, 0]
        and the rest from the other two values. Its output leans towards [1, 0] without becoming it: attention blends,
        it never simply copies.
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={onShowInLab}>
          Show this example in the lab
        </button>
      </div>
    </>
  );
}

export default function TinyTransformerExhibit() {
  const [state, update] = useTinyTransformerUrlState();
  const focusTarget = useFocusTarget();
  const deep = state.depth === 'deep';

  // Deep links such as ?at=sources open the page at that section.
  useEffect(() => {
    const at = parseHash(window.location.hash).params.get('at');
    if (at && SECTION_IDS.has(at)) focusTarget(`${at}-title`);
    // Only on arrival; later section jumps come from the table of contents.
  }, []);

  const jumpTo = (id: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    replaceHashParams((params) => {
      params.set('at', id);
      return params;
    });
    focusTarget(`${id}-title`);
  };

  return (
    <article className="exhibit" aria-labelledby="exhibit-title">
      <div className="exhibit-header">
        <p className="eyebrow">Tiny transformer · Open</p>
        <h1 id="exhibit-title">Tiny transformer: scaled dot-product attention</h1>
        <p className="exhibit-header__subtitle">
          How each word in a transformer decides which other words to listen to — computed for real, on three tokens.
        </p>
        <div className="exhibit-header__controls">
          <DepthSwitch depth={state.depth} onChange={(depth) => update({ depth })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds the mathematics and the reasons
            behind each step.
          </p>
        </div>
        <div className="exhibit-header__legend">
          <p>
            <KindBadge kind="simulation" /> figures compute their output from a working model as you interact.{' '}
            <KindBadge kind="explanation" /> figures are scripted illustrations you step through.
          </p>
          <CopyLink />
        </div>
      </div>

      <div className="exhibit-layout">
        <nav className="toc" aria-label="On this page">
          <p className="toc__title" aria-hidden="true">
            On this page
          </p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#/exhibits/${SLUG}?at=${s.id}`} onClick={jumpTo(s.id)}>
                  {s.toc}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="exhibit-body">
          <Section id="idea">
            <p className="lede">
              A transformer reads a sentence as a list of <em>tokens</em>, each a list of numbers. To work out what a
              token means in context, it lets every token look at every other token and take a blend of what it finds.
              The rule for that blend is <em>attention</em>: each token asks a question (its <em>query</em>), every
              token advertises what it holds (its <em>key</em>), and the answer is a mix of their contents (their{' '}
              <em>values</em>), weighted by how well each key matches the query.
            </p>
            {deep && (
              <Deep>
                <p>
                  In matrix form the whole operation is one line: Attention(Q, K, V) = softmax(Q·K<sup>ᵀ</sup> ÷
                  √d<sub>k</sub>)·V. Q, K and V hold one row per token. In a real model they are produced by multiplying
                  each token’s embedding by three learned weight matrices; here you type them in directly.
                </p>
                <p>
                  Every query is compared with every key, so the cost grows with the square of the number of tokens. That
                  all-pairs comparison is what lets a word at the end of a paragraph draw on one at the start in a single
                  step, without passing information along a chain as a recurrent network must.
                </p>
              </Deep>
            )}
            <AttentionGuide frame={state.guide} onFrame={(guide) => update({ guide })} />
          </Section>

          <Section id="lab">
            <p className="lede">
              Below, three tokens each have a four-number query and key and a two-number value. Edit any number and every
              intermediate is recomputed: the raw scores, the scaled scores, the softmax weights and the blended output.
              Step through the stages to see the arithmetic for one token written out in full.
            </p>
            <AttentionLab state={state} update={update} deep={deep} />
          </Section>

          <Section id="worked-example">
            <WorkedExample
              onShowInLab={() => {
                update({ q: DEFAULT_Q, k: DEFAULT_K, v: DEFAULT_V, row: 0, stage: LAST_STAGE });
                focusTarget(LAB_FIGURE_ID);
              }}
            />
            {deep && (
              <Deep>
                <p>
                  Tokens 1 and 2 are mirror images: q<sub>2</sub> matches k<sub>2</sub> exactly as q<sub>1</sub> matches
                  k<sub>1</sub>, so their weights are the same numbers in swapped places and their outputs are{' '}
                  <span className="mono">{fmtVector(EXAMPLE.output[0]!)}</span> and{' '}
                  <span className="mono">{fmtVector(EXAMPLE.output[1]!)}</span>. Token 3 half-matches both, splitting its
                  attention evenly between them, so its output lands at exactly{' '}
                  <span className="mono">{fmtVector(EXAMPLE.output[2]!)}</span>.
                </p>
              </Deep>
            )}
          </Section>

          <Section id="challenge">
            <AttentionChallenge Q={state.q} K={state.k} V={state.v} onGoToLab={() => focusTarget(LAB_FIGURE_ID)} />
          </Section>

          <Section id="limits" className="exhibit-section--reference">
            <ul className="reference-list">
              <li>
                <strong>One head, no learning.</strong> This is a single attention head on hand-typed numbers. A real
                transformer learns the matrices that produce Q, K and V, runs many heads in parallel, and adds
                positional information, residual connections, layer normalisation and feed-forward layers. None of those
                are modelled here.
              </li>
              <li>
                <strong>No masking.</strong> Every token may attend to every token, including those after it. Text
                generators use a causal mask that hides later tokens; this toy has none.
              </li>
              <li>
                <strong>Units.</strong> The numbers are dimensionless: queries, keys and values have no physical units,
                and attention weights are proportions from 0 to 1. Entries are limited to {fmt(ENTRY_MIN)} to{' '}
                {fmt(ENTRY_MAX)} and rounded to four decimal places so that links stay short.
              </li>
              <li>
                <strong>Arithmetic.</strong> Everything is computed in 64-bit floating point. Softmax subtracts the
                largest score before exponentiating, which leaves the result unchanged but prevents overflow. Displayed
                values are rounded to three decimals, so a row of weights may appear to add up to 0.999 or 1.001.
              </li>
              <li>
                <strong>Fixed size.</strong> The lab is fixed at three tokens with d<sub>k</sub> = 4 and d<sub>v</sub> =
                2. Real models use thousands of tokens and widths in the hundreds or thousands, which is a limitation of
                this display, not of the mathematics.
              </li>
              <li>
                <strong>Simulation versus explanation.</strong> The figure marked simulation computes every number from
                your inputs with the same functions the test suite checks against hand-calculated values. The figure
                marked animation is a scripted guide with made-up proportions and does no arithmetic.
              </li>
              <li>
                <strong>Privacy.</strong> Everything runs in your browser. State lives only in the page address, so
                links reproduce a view exactly; nothing is stored on a server.
              </li>
            </ul>
          </Section>

          <Section id="sources" className="exhibit-section--reference">
            <ul className="source-list">
              <li>
                Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser
                and Illia Polosukhin, “Attention Is All You Need,” <cite>Advances in Neural Information Processing
                Systems</cite> 30 (2017).{' '}
                <a href="https://arxiv.org/abs/1706.03762" rel="noopener noreferrer">
                  arXiv:1706.03762
                </a>
                . Defines scaled dot-product attention and the √d<sub>k</sub> scaling used here.
              </li>
              <li>
                Dzmitry Bahdanau, Kyunghyun Cho and Yoshua Bengio, “Neural Machine Translation by Jointly Learning to
                Align and Translate,” <cite>International Conference on Learning Representations</cite> (2015).{' '}
                <a href="https://arxiv.org/abs/1409.0473" rel="noopener noreferrer">
                  arXiv:1409.0473
                </a>
                . The earlier attention mechanism that transformers built on.
              </li>
              <li>
                Ian Goodfellow, Yoshua Bengio and Aaron Courville, <cite>Deep Learning</cite> (MIT Press, 2016), §4.1.
                Numerically stable softmax by subtracting the maximum.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
