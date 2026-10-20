import { useEffect, useId, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import { estimatePhase, footprintBytes, normaliseConfig, WORKED_EXAMPLE } from './model/bottleneck';
import { formatBytes, formatFlops, formatIntensity, formatRate, formatSeconds, formatTokensPerSecond, sig3 } from './model/format';
import { Challenges } from './components/Challenges';
import { Explorer, EXPLORER_FIGURE_ID } from './components/Explorer';
import { GenerationReplay } from './components/GenerationReplay';
import { RooflineChart } from './components/RooflineChart';
import { StepBudget } from './components/StepBudget';
import { DEFAULT_LLM_STATE, toConfig, type Depth } from './urlConfig';
import { useLlmUrlState } from './useLlmUrlState';
import './exhibit.css';

const SLUG = 'llm-bottleneck';

const SECTIONS = [
  { id: 'explorer', toc: 'Explorer', title: 'The explorer' },
  { id: 'roofline', toc: 'Roofline', title: 'The roofline: two ceilings' },
  { id: 'bytes', toc: 'Bytes', title: 'Where the bytes go' },
  { id: 'replay', toc: 'Replay', title: 'Replay a generation' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: a 7B model, one token at a time' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Assumptions & limits', title: 'Assumptions, units & limitations' },
  { id: 'sources', toc: 'Sources', title: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

function Section({ id, children, className }: { id: SectionId; children: ReactNode; className?: string }) {
  const { title } = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={`llm-${id}`} className={`llm-section${className ? ` ${className}` : ''}`} aria-labelledby={`llm-${id}-title`}>
      <h2 id={`llm-${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Deep({ children }: { children: ReactNode }) {
  return (
    <div className="llm-deep">
      <p className="llm-deep__label" aria-hidden="true">
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
    <fieldset className="segmented llm-depth">
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
    if (!navigator.clipboard) {
      setMessage('Copying is unavailable here — copy the address bar instead.');
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(
      () => setMessage('Link copied. It reproduces exactly these settings.'),
      () => setMessage('Could not copy — copy the address bar instead.'),
    );
  };
  return (
    <div className="llm-copy">
      <button type="button" className="btn" onClick={copy}>
        Copy a link to this exact state
      </button>
      <span className="hint" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

function WorkedExample({ onLoad }: { onLoad: () => void }) {
  const c = WORKED_EXAMPLE;
  const d = estimatePhase(c, 'decode');
  const p = estimatePhase(c, 'prefill');
  return (
    <>
      <p>
        Take a {c.paramsB}B-parameter model shaped like Llama 2 7B — {c.layers} layers, {c.heads} heads of dimension{' '}
        {c.headDim}, full multi-head attention so Hkv = {c.kvHeads} — stored in 16-bit numbers (b = {c.bytesPerParam}{' '}
        bytes). Give it {c.context.toLocaleString('en-US')} tokens of context, one sequence (B = {c.batch}), on an
        illustrative accelerator with {c.peakTflops} TFLOP/s of compute and {c.bandwidthTBs} TB/s of memory bandwidth.
      </p>
      <ol className="llm-steps">
        <li>
          <strong>Raw weights = P × b</strong> = {c.paramsB} × 10⁹ × {c.bytesPerParam} = {formatBytes(d.weightBytes)}.
        </li>
        <li>
          <strong>KV cache = 2 × L × T × Hkv × dh × b</strong> = 2 × {c.layers} × {c.context} × {c.kvHeads} × {c.headDim} ×{' '}
          {c.bytesPerParam} = {formatBytes(d.kvBytes)} per sequence.
        </li>
        <li>
          <strong>Decode FLOPs.</strong> Each weight is used in one multiply–add per token: 2 × P ={' '}
          {formatFlops(d.matmulFlops)}. Attention against the cache adds 4 × L × B × T × H × dh ={' '}
          {formatFlops(d.attentionFlops)}. Total {formatFlops(d.flops)}.
        </li>
        <li>
          <strong>Decode bytes.</strong> Every weight and every cached K and V must be read once: {formatBytes(d.bytes)}.
        </li>
        <li>
          <strong>Arithmetic intensity</strong> = {formatFlops(d.flops)} ÷ {formatBytes(d.bytes)} ≈{' '}
          {formatIntensity(d.intensity)}. The ridge is {c.peakTflops} ÷ {c.bandwidthTBs} = {sig3(d.ridge)} FLOP/byte, so the
          step is far left of it: bandwidth-bound.
        </li>
        <li>
          <strong>Roofline.</strong> Attainable = min({c.peakTflops} TFLOP/s, {c.bandwidthTBs} TB/s × {sig3(d.intensity)}) ={' '}
          {formatRate(d.attainableFlopsPerSecond)} — under 1% of peak. Memory needs {formatSeconds(d.memorySeconds)};
          compute only {formatSeconds(d.computeSeconds)}. So at best ≈ {formatTokensPerSecond(d.tokensPerSecondUpperBound)}.
        </li>
        <li>
          <strong>Prefill</strong> of the same {c.context.toLocaleString('en-US')}-token prompt does {formatFlops(p.flops)} of
          work for the same {formatBytes(p.bytes)} of traffic: {formatIntensity(p.intensity)}, compute-bound, at least{' '}
          {formatSeconds(p.timeLowerBoundSeconds)}.
        </li>
      </ol>
      <p>
        Same model, same machine, two different bottlenecks: reading the prompt is limited by arithmetic, writing the answer
        token by token is limited by bytes.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={onLoad}>
          Load the worked example into the explorer
        </button>
      </div>
    </>
  );
}

export default function LlmBottleneckExhibit() {
  const [state, update] = useLlmUrlState();
  const focusTarget = useFocusTarget();
  const deep = state.depth === 'deep';

  const { config, notes } = useMemo(() => normaliseConfig(toConfig(state)), [state]);
  const estimates = useMemo(
    () => ({ decode: estimatePhase(config, 'decode'), prefill: estimatePhase(config, 'prefill') }),
    [config],
  );
  const active = estimates[state.phase];
  const footprint = footprintBytes(config);
  const configKey = JSON.stringify(config);

  useEffect(() => {
    const at = parseHash(window.location.hash).params.get('at');
    if (at && SECTION_IDS.has(at)) focusTarget(`llm-${at}-title`);
    // Only on arrival; later jumps come from the table of contents.
  }, []);

  const jumpTo = (id: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    replaceHashParams((params) => {
      params.set('at', id);
      return params;
    });
    focusTarget(`llm-${id}-title`);
  };

  const loadWorkedExample = () => {
    update({ ...DEFAULT_LLM_STATE, depth: state.depth });
    focusTarget(EXPLORER_FIGURE_ID);
  };

  return (
    <article className="llm-exhibit" aria-labelledby="llm-exhibit-title">
      <div className="llm-header">
        <p className="eyebrow">Inside an LLM</p>
        <h1 id="llm-exhibit-title">The LLM bottleneck explorer: compute versus memory bandwidth</h1>
        <p className="llm-header__subtitle">
          Why a model that does trillions of operations a second can still wait on memory — and when it doesn’t.
        </p>
        <div className="llm-disclaimer" role="note">
          <strong>Estimates, not measurements.</strong> Every number here comes from simple formulas and idealised peak
          hardware figures. They are estimates and upper bounds on speed (lower bounds on time), not benchmarks: real
          systems are slower, sometimes by a wide margin.
        </div>
        <div className="llm-header__controls">
          <DepthSwitch depth={state.depth} onChange={(d) => update({ depth: d })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds the derivations, caveats and history.
          </p>
        </div>
        <div className="llm-header__legend">
          <p>
            <KindBadge kind="simulation" /> figures recompute from the cost model as you change the settings.
          </p>
          <CopyLink />
        </div>
      </div>

      <div className="llm-layout">
        <nav className="llm-toc" aria-label="On this page">
          <p className="llm-toc__title" aria-hidden="true">
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

        <div className="llm-body">
          <Section id="explorer">
            <p className="llm-lede">
              A language model produces text in two phases. In <em>prefill</em> it reads the whole prompt in one pass. In{' '}
              <em>decode</em> it produces one new token per sequence per step, and every step must touch every weight in
              the model. Each step needs arithmetic (FLOPs) and needs bytes moved from memory. Whichever takes longer at the
              machine’s peak rate is the bottleneck.
            </p>
            {deep && (
              <Deep>
                <p>
                  A transformer layer (Vaswani et al., 2017) multiplies each token’s activations by its weight matrices and
                  then lets the token attend to earlier tokens through their keys and values. A matrix–vector product with
                  P weights costs about 2P FLOPs — one multiply and one add per weight — which is why “2 × P FLOPs per
                  token” is the standard back-of-envelope count (Pope et al., 2022).
                </p>
                <p>
                  During decode the keys and values of past tokens are kept in a <em>KV cache</em> rather than recomputed
                  (Hugging Face documentation). That saves arithmetic but adds bytes: the cache must be read, in full, for
                  every new token.
                </p>
              </Deep>
            )}
            <Explorer state={state} estimate={active} footprint={footprint} notes={notes} onChange={update} />
          </Section>

          <Section id="roofline">
            <p className="llm-lede">
              The Roofline model (Williams, Waterman and Patterson, 2009) draws a machine’s two ceilings on one chart. The
              x-axis is <em>arithmetic intensity</em> (AI): FLOPs performed per byte moved. Below the ridge point, memory
              can’t feed the arithmetic units fast enough and speed rises with AI along the bandwidth slope; above it, the
              arithmetic units are saturated. Attainable = min(peak compute, bandwidth × AI).
            </p>
            <p className="llm-callout">
              Small-batch decode is often bandwidth-bound — but not always. Each step reads all the weights to make only B
              tokens, so its intensity is low; but a large batch with a short context, fewer KV heads, or a machine whose
              compute is slow relative to its bandwidth can push it past the ridge. Try them in the explorer.
            </p>
            {deep && (
              <Deep>
                <p>
                  With 16-bit weights and a short context, decode intensity is roughly 2PB ÷ 2P ≈ B FLOP/byte: the batch
                  size itself. On a machine whose ridge is near 150 FLOP/byte, that suggests a batch of about 150 before
                  decode stops being bandwidth-bound — the crossover Pope et al. (2022) analyse when partitioning inference
                  across chips. At long context the cache term grows with B too, and intensity saturates near (2P + 4LTH·dh) ÷
                  (2LT·Hkv·dh·b), which no batch size can raise. Grouped- or multi-query attention lowers Hkv and so lifts
                  that ceiling.
                </p>
                <p>
                  Techniques such as speculative decoding, which verify several drafted tokens in one pass, raise decode
                  intensity in the same way a bigger batch does. Conversely, quantising weights to fewer bytes lowers the
                  bytes term and speeds up a bandwidth-bound step even with no change in FLOPs.
                </p>
                <p>
                  The roof is an ideal. Real kernels lose time to launch overhead, imperfect overlap of compute and memory
                  traffic, caches, communication between chips and scheduling. The original Roofline paper used
                  “operational intensity” measured at DRAM; here it is computed from formulas, not counters.
                </p>
              </Deep>
            )}
            <RooflineChart
              peakFlopsPerSecond={config.peakTflops * 1e12}
              bytesPerSecond={config.bandwidthTBs * 1e12}
              estimates={estimates}
              active={state.phase}
            />
          </Section>

          <Section id="bytes">
            <p className="llm-lede">
              Two things fill memory. The <strong>raw weights = P × b</strong>: P parameters at b bytes each. And the{' '}
              <strong>simplified KV cache = 2 × L × T × Hkv × dh × b</strong> per sequence: one key and one value vector
              (the 2) per layer, per token in context, per KV head. Weights are shared by the whole batch; the cache is
              not — each sequence has its own, so it grows with both B and T.
            </p>
            {deep && (
              <Deep>
                <p>
                  Multi-head attention keeps one KV head per query head (Hkv = H). Multi-query attention shares one (Hkv =
                  1); grouped-query attention sits between, as in Llama 3 8B with 8 KV heads for 32 query heads. The cache
                  shrinks by H ÷ Hkv.
                </p>
                <p>
                  Serving systems also lose memory to fragmentation when caches are reserved for a maximum length.
                  PagedAttention (Kwon et al., 2023) stores the cache in fixed-size blocks, like virtual-memory pages, so
                  more sequences fit — but the bytes read per token are unchanged.
                </p>
                <p>
                  The formula ignores activations, the score matrix and framework overhead. FlashAttention (Dao et al.,
                  2022) is why ignoring the T × T score matrix is reasonable: it computes attention in on-chip tiles and
                  never writes that matrix to main memory.
                </p>
              </Deep>
            )}
            <StepBudget config={config} estimate={active} />
          </Section>

          <Section id="replay">
            <p className="llm-lede">
              As a sequence grows, its KV cache grows with it, so each decode step reads more bytes than the last. Step or
              play through a long generation to see the per-step time climb. The replay always shows decode, whatever phase
              is selected above.
            </p>
            {deep && (
              <Deep>
                <p>
                  Each chunk of steps is charged at its starting context — a left-endpoint sum — so the elapsed time is a
                  lower bound twice over: once from the roofline, once from the sum. The exact sum would add a fraction of a
                  per-cent here.
                </p>
              </Deep>
            )}
            <GenerationReplay key={configKey} config={config} />
          </Section>

          <Section id="worked-example">
            <WorkedExample onLoad={loadWorkedExample} />
          </Section>

          <Section id="challenge">
            <Challenges config={config} onGoToExplorer={() => focusTarget(EXPLORER_FIGURE_ID)} />
          </Section>

          <Section id="limits" className="llm-section--reference">
            <ul className="llm-reference-list">
              <li>
                <strong>Estimates and upper bounds, not benchmarks.</strong> Times are lower bounds at peak rates; speeds
                are upper bounds. No kernel, framework or hardware measurement is involved.
              </li>
              <li>
                <strong>Units.</strong> Decimal SI prefixes: 1 GB = 10⁹ bytes, 1 TB/s = 10¹² bytes per second, 1 TFLOP/s =
                10¹² floating-point operations per second. One multiply–add counts as 2 FLOPs. Parameters are entered in
                billions (10⁹). Intensity is FLOP per byte.
              </li>
              <li>
                <strong>What is counted.</strong> FLOPs: 2 × P per token for the weight matrices, plus attention’s QKᵀ and
                AV products (4 × L × B × T × H × dh in decode; 2 × L × B × T² × H × dh in causal prefill). Bytes: every
                weight once per step, plus each sequence’s KV cache read (decode) or written (prefill) once.
              </li>
              <li>
                <strong>What is not.</strong> Activations, softmax, normalisation, embeddings, the attention score matrix
                (assumed kept on chip, as FlashAttention does), communication between devices, kernel launch overhead and
                imperfect overlap of compute with memory traffic.
              </li>
              <li>
                <strong>One precision.</strong> b applies to weights and the KV cache alike. Real deployments often mix
                them (for example 4-bit weights with a 16-bit cache).
              </li>
              <li>
                <strong>Perfect reuse.</strong> Weights are assumed to be read once per step and shared by the whole batch;
                caches never hold them between steps. Real on-chip caches are far smaller than the weights of these
                models, so this is close for decode.
              </li>
              <li>
                <strong>Capacity is reported, not enforced.</strong> The resident-memory figure is weights + B × KV cache;
                the explorer does not stop you exceeding a device’s memory.
              </li>
              <li>
                <strong>Presets are illustrative.</strong> Model shapes follow published architectures with rounded
                parameter counts; machine presets are round numbers at the scale of real parts, not any product’s
                specification.
              </li>
              <li>
                <strong>Privacy.</strong> Everything runs in your browser; state lives only in the page address.
              </li>
            </ul>
          </Section>

          <Section id="sources" className="llm-section--reference">
            <ul className="llm-source-list">
              <li>
                Ashish Vaswani et al., “Attention Is All You Need,” <cite>Advances in Neural Information Processing Systems
                30</cite> (2017). arXiv:1706.03762. The transformer and its attention products.
              </li>
              <li>
                Samuel Williams, Andrew Waterman and David Patterson, “Roofline: An Insightful Visual Performance Model for
                Multicore Architectures,” <cite>Communications of the ACM</cite> 52, no. 4 (2009): 65–76.
                doi:10.1145/1498765.1498785. The Roofline model.
              </li>
              <li>
                Reiner Pope et al., “Efficiently Scaling Transformer Inference,” <cite>Proceedings of MLSys</cite> (2023).
                arXiv:2211.05102. Memory-time versus compute-time analysis of decode and prefill, and the role of batch
                size and multi-query attention.
              </li>
              <li>
                Woosuk Kwon et al., “Efficient Memory Management for Large Language Model Serving with PagedAttention,”{' '}
                <cite>Proceedings of SOSP</cite> (2023). arXiv:2309.06180. KV-cache memory as the limit on batch size.
              </li>
              <li>
                Tri Dao et al., “FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness,”{' '}
                <cite>Advances in Neural Information Processing Systems 35</cite> (2022). arXiv:2205.14135. IO-aware
                attention that keeps the score matrix on chip.
              </li>
              <li>
                <a href="https://huggingface.co/docs/transformers/kv_cache">
                  Hugging Face Transformers documentation: KV cache
                </a>
                . What the cache stores and the cache strategies available in practice.
              </li>
              <li>
                Hugo Touvron et al., “Llama 2: Open Foundation and Fine-Tuned Chat Models” (2023). arXiv:2307.09288; and
                Llama Team, “The Llama 3 Herd of Models” (2024). arXiv:2407.21783. Architecture shapes used by the presets.
              </li>
              <li>
                Joshua Ainslie et al., “GQA: Training Generalized Multi-Query Transformer Models from Multi-Head
                Checkpoints,” <cite>Proceedings of EMNLP</cite> (2023). arXiv:2305.13245. Grouped-query attention.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
