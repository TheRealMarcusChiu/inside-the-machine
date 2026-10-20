import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { KindBadge } from '../../components/KindBadge';
import { useMotion } from '../../lib/motion';
import { parseHash } from '../../lib/url/hashLocation';
import { replaceHashParams } from '../../lib/useHashLocation';
import { add4 } from './sim/adder';
import { OPCODE_SUMMARY, OPCODES, OPERAND_KIND, type Opcode } from './sim/cpu';
import { AdderLab, ADDER_FIGURE_ID } from './components/AdderLab';
import { Challenges } from './components/Challenges';
import { CpuLab, CPU_FIGURE_ID, sourceFor } from './components/CpuLab';
import { CarryRippleExplainer, FetchCycleExplainer } from './components/Explainers';
import { FullAdderLab } from './components/FullAdderLab';
import { GateLab } from './components/GateLab';
import { RUN_STEP_BUDGET } from './cpuLabState';
import { useExhibitUrlState } from './useExhibitUrlState';
import type { Depth } from './urlConfig';
import './exhibit.css';

const SECTIONS = [
  { id: 'gates', toc: 'Gates', title: 'A gate is a rule about wires' },
  { id: 'adding', toc: 'Adding', title: 'Adding with gates' },
  { id: 'cpu', toc: 'The CPU', title: 'A miniature CPU' },
  { id: 'worked-example', toc: 'Worked example', title: 'Worked example: 6 + 7, by hand and by machine' },
  { id: 'challenge', toc: 'Challenge', title: 'Challenge' },
  { id: 'limits', toc: 'Assumptions & limits', title: 'Assumptions, units & limitations' },
  { id: 'sources', toc: 'Sources', title: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

const nibble = (n: number) => n.toString(2).padStart(4, '0');

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

function WorkedExample({ onSetAdder, onLoadCpu }: { onSetAdder: () => void; onLoadCpu: () => void }) {
  const r = add4(6, 7, 0);
  return (
    <>
      <p>
        Add 6 and 7. In binary, 6 is <span className="mono">0110</span> (4 + 2) and 7 is{' '}
        <span className="mono">0111</span> (4 + 2 + 1). Work right to left, one column at a time, exactly as a full
        adder does:
      </p>
      <ol className="worked-steps">
        {r.stages.map((stage, i) => {
          const total = r.aBits[i]! + r.bBits[i]! + r.carries[i]!;
          return (
            <li key={i}>
              <span className="mono">
                bit {i} (worth {2 ** i})
              </span>
              : {r.aBits[i]} + {r.bBits[i]}
              {r.carries[i] ? ' + carry 1' : ''} = {total}
              {total >= 2 ? ` (binary ${total.toString(2)})` : ''} → write {stage.sum}, carry {stage.carryOut}
            </li>
          );
        })}
      </ol>
      <p>
        Reading the sum bits from the top down gives <span className="mono">{nibble(r.sum)}</span> = 8 + 4 + 1 ={' '}
        {r.sum}, with carry-out {r.carryOut}: the answer fits in four bits.
      </p>
      <p>
        On the Museum-4 the same addition is a four-line program. <code>LDA 14</code> loads the 6 stored at RAM address
        14 into A; <code>ADD 15</code> sends A and the 7 at address 15 through the adder; <code>OUT</code> displays 13;{' '}
        <code>HLT</code> stops the clock. Step through it and watch the adder trace under the registers.
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={onSetAdder}>
          Set the adder to 6 + 7
        </button>
        <button type="button" className="btn" onClick={onLoadCpu}>
          Load this program into the CPU
        </button>
      </div>
    </>
  );
}

const OPCODE_LIST = Object.keys(OPCODES) as Opcode[];

function InstructionSet() {
  return (
    <div className="table-scroll">
      <table className="isa-table">
        <caption>The Museum-4 instruction set</caption>
        <thead>
          <tr>
            <th scope="col">Opcode</th>
            <th scope="col">Mnemonic</th>
            <th scope="col">Operand</th>
            <th scope="col">Effect</th>
          </tr>
        </thead>
        <tbody>
          {OPCODE_LIST.map((op) => (
            <tr key={op}>
              <td className="mono">{nibble(OPCODES[op])}</td>
              <td className="mono">{op}</td>
              <td>{OPERAND_KIND[op] === 'none' ? '—' : OPERAND_KIND[op]}</td>
              <td>{OPCODE_SUMMARY[op]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LogicToCpuExhibit() {
  const [state, update] = useExhibitUrlState();
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

  const cpuSource = sourceFor(state.program, state.source);

  return (
    <article className="exhibit" aria-labelledby="exhibit-title">
      <div className="exhibit-header">
        <p className="eyebrow">Room 1 · Open</p>
        <h1 id="exhibit-title">Logic gates → binary adder → miniature CPU</h1>
        <p className="exhibit-header__subtitle">From a rule about two wires to a machine that runs a program.</p>
        <div className="exhibit-header__controls">
          <DepthSwitch depth={state.depth} onChange={(depth) => update({ depth })} />
          <p className="hint">
            <strong>Short</strong> gives the essentials. <strong>Deep</strong> adds the mathematics, the history and the
            trade-offs.
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
                <a href={`#/exhibits/logic-to-cpu?at=${s.id}`} onClick={jumpTo(s.id)}>
                  {s.toc}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="exhibit-body">
          <Section id="gates">
            <p className="lede">
              Inside a computer, every wire is in one of two states — a high or a low voltage — which we write as 1 and
              0. A <em>logic gate</em> is a tiny circuit that looks at one or two input wires and sets its output wire
              by a fixed rule. AND, OR and NOT are enough to express any yes-or-no decision; the others are convenient
              combinations.
            </p>
            {deep && (
              <Deep>
                <p>
                  George Boole’s 1854 algebra treated logic as arithmetic on two values. In 1938 Claude Shannon showed
                  that relay circuits obey exactly that algebra, so any Boolean expression can be built as a circuit —
                  the founding insight of digital design. Two-input gates come in sixteen possible rules (one per way of
                  filling the four-row truth table); a handful have names.
                </p>
                <p>
                  Gates convert into each other by De Morgan’s laws: NOT(A AND B) = (NOT A) OR (NOT B), and NOT(A OR B)
                  = (NOT A) AND (NOT B). That is why a set like {'{'}AND, OR, NOT{'}'} — or NAND alone — is{' '}
                  <em>functionally complete</em>: it can express every possible truth table.
                </p>
              </Deep>
            )}
            <GateLab
              gate={state.gate}
              a={state.ga}
              b={state.gb}
              deep={deep}
              onChange={update}
            />
          </Section>

          <Section id="adding">
            <p className="lede">
              Binary addition is school column addition with only two digits. Each column holds 0 or 1, and 1 + 1 =
              10 in binary: write 0, carry 1. A <em>half adder</em> handles one column with two gates — XOR makes the
              sum bit, AND makes the carry. A <em>full adder</em> also accepts the carry from the column to its right.
              Chain four full adders and you can add any two numbers from 0 to 15.
            </p>
            {deep && (
              <Deep>
                <p>
                  Four bits can only represent 0–15, so results wrap around modulo 16 and the carry-out records the lost
                  16. Because each stage must wait for its neighbour’s carry, a ripple-carry adder’s delay grows in
                  proportion to its width. Real processors use carry-lookahead or prefix adders that compute all the
                  carries in parallel, trading extra gates for speed.
                </p>
                <p>
                  The same circuit also subtracts. In two’s complement, −M is NOT(M) + 1, so A − M = A + NOT(M) + 1:
                  invert one input and set the carry-in. The CPU below does exactly that for SUB.
                </p>
              </Deep>
            )}
            <FullAdderLab />
            <AdderLab
              a={state.a}
              b={state.b}
              cin={state.cin}
              deep={deep}
              onChange={update}
            />
            <CarryRippleExplainer />
          </Section>

          <Section id="cpu">
            <p className="lede">
              A CPU repeats one loop forever: <em>fetch</em> the next instruction from memory, <em>decode</em> what it
              means, <em>execute</em> it, move on. The Museum-4 is a deliberately tiny, invented machine with a 4-bit
              accumulator called A, a program counter (PC), zero and carry flags, 16 instruction slots and 16 four-bit
              data cells. Its ADD and SUB are computed by the very same ripple-carry adder you just operated.
            </p>
            {deep && (
              <Deep>
                <p>
                  Each instruction is one byte: the high four bits are the opcode, the low four the operand. SUB runs
                  A + NOT(M) + 1 through the adder, so the carry flag means “no borrow”, as on the 6502 and ARM.
                  Conditional jumps on the flags give loops and decisions, which is all a machine needs to compute
                  anything that fits in its memory — here, a mere 16 instructions.
                </p>
                <p>
                  Program and data live in separate memories (a Harvard layout). Von Neumann’s 1945 EDVAC report
                  described the alternative almost every general-purpose computer uses: one memory holding both, so
                  programs can be loaded — or even written — as data.
                </p>
              </Deep>
            )}
            <InstructionSet />
            <FetchCycleExplainer />
            <CpuLab
              key={`${state.program}:${state.program === 'custom' ? state.source : ''}`}
              choice={state.program}
              customSource={state.source}
              onChoose={(program) => update({ program, source: program === 'custom' ? state.source || cpuSource : '' })}
              onAssemble={(source) => update({ program: 'custom', source })}
            />
          </Section>

          <Section id="worked-example">
            <WorkedExample
              onSetAdder={() => {
                update({ a: 6, b: 7, cin: 0 });
                focusTarget(ADDER_FIGURE_ID);
              }}
              onLoadCpu={() => {
                update({ program: 'add', source: '' });
                focusTarget(CPU_FIGURE_ID);
              }}
            />
            {deep && (
              <Deep>
                <p>
                  The program needs only four of the sixteen slots. Its bytes, in memory order, are{' '}
                  <span className="mono">0010 1110</span>, <span className="mono">0100 1111</span>,{' '}
                  <span className="mono">1001 0000</span> and <span className="mono">1010 0000</span>: LDA 14, ADD 15,
                  OUT and HLT. Machine code is nothing more than these patterns; the assembler only spares you from
                  writing them by hand.
                </p>
              </Deep>
            )}
          </Section>

          <Section id="challenge">
            <Challenges
              a={state.a}
              b={state.b}
              cin={state.cin}
              program={state.program}
              source={state.source}
              onGoToAdder={() => focusTarget(ADDER_FIGURE_ID)}
              onGoToCpu={() => focusTarget(CPU_FIGURE_ID)}
            />
          </Section>

          <Section id="limits" className="exhibit-section--reference">
            <ul className="reference-list">
              <li>
                <strong>Ideal logic.</strong> Every wire is exactly 0 or 1. Voltages, noise margins, fan-out, power and
                metastability are not modelled.
              </li>
              <li>
                <strong>Timing.</strong> Settle times use a unit-delay model: every gate takes one “gate delay” and
                inputs are ready at time 0. Real propagation delay depends on the gate type, its load, temperature and
                manufacturing — from picoseconds on a modern chip to milliseconds in a relay.
              </li>
              <li>
                <strong>Units.</strong> Values are bits, grouped in 4-bit nibbles. Numbers are unsigned (0–15) unless
                described as two’s-complement signed (−8 to 7). Times are in gate delays, not seconds.
              </li>
              <li>
                <strong>An invented machine.</strong> The Museum-4 is a teaching design, not a model of any real
                processor. One Step executes a whole instruction; real CPUs split each instruction into several clock
                cycles of micro-operations. The Clock slider sets the animation rate, not a hardware frequency.
              </li>
              <li>
                <strong>Wrap-around.</strong> The program counter is four bits wide, so it wraps from 15 to 0. Run
                pauses after {RUN_STEP_BUDGET} steps in case a program never reaches HLT.
              </li>
              <li>
                <strong>Simulation versus explanation.</strong> Figures marked live simulation are computed by the
                exhibit’s models as you interact, and the adder model is checked against ordinary arithmetic for all 512
                inputs in the test suite. Figures marked explanatory animation are scripted, though their numbers are
                computed by the same models.
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
                Claude E. Shannon, “A Symbolic Analysis of Relay and Switching Circuits,” <cite>Transactions of the
                American Institute of Electrical Engineers</cite> 57, no. 12 (1938): 713–723. Boolean algebra as circuit
                design.
              </li>
              <li>
                George Boole, <cite>An Investigation of the Laws of Thought</cite> (London: Walton and Maberly, 1854). The
                two-valued algebra behind every gate.
              </li>
              <li>
                Henry M. Sheffer, “A Set of Five Independent Postulates for Boolean Algebras, with Application to Logical
                Constants,” <cite>Transactions of the American Mathematical Society</cite> 14, no. 4 (1913): 481–488. A
                single operation (the Sheffer stroke, i.e. NAND) suffices.
              </li>
              <li>
                Charles Petzold, <cite>Code: The Hidden Language of Computer Hardware and Software</cite>, 2nd ed.
                (Microsoft Press, 2022). From relays and gates to adders and a simple processor.
              </li>
              <li>
                Noam Nisan and Shimon Schocken, <cite>The Elements of Computing Systems: Building a Modern Computer from
                First Principles</cite>, 2nd ed. (MIT Press, 2021). The NAND-to-computer course behind nand2tetris.org.
              </li>
              <li>
                Albert Paul Malvino and Jerald A. Brown, <cite>Digital Computer Electronics</cite>, 3rd ed.
                (Glencoe/McGraw-Hill, 1993). The SAP-1 teaching computer, an inspiration for the Museum-4.
              </li>
              <li>
                David Money Harris and Sarah L. Harris, <cite>Digital Design and Computer Architecture</cite>, 2nd ed.
                (Morgan Kaufmann, 2012). Full adders, ripple-carry and carry-lookahead adders, gate timing.
              </li>
              <li>
                John von Neumann, <cite>First Draft of a Report on the EDVAC</cite> (Moore School of Electrical
                Engineering, University of Pennsylvania, 1945). The stored-program design contrasted with the
                Museum-4’s Harvard layout.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}
