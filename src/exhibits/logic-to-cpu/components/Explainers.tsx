import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { ExplanatoryAnimation, type AnimationFrame } from '../../../components/ExplanatoryAnimation';
import { add4 } from '../sim/adder';
import { assemble } from '../sim/assembler';
import { createCpu, encodeInstruction, OPCODES, step } from '../sim/cpu';
import { getPreset } from '../sim/programs';

const nibble = (n: number) => n.toString(2).padStart(4, '0');

/* ── How a carry ripples: 1111 + 0001 ─────────────────────────────────────── */

// The animation is scripted, but its numbers come from the real adder so they can never drift.
const RIPPLE = add4(15, 1, 0);
const STAGES = [3, 2, 1, 0] as const;

const RIPPLE_FRAMES: AnimationFrame[] = [
  {
    label: 'Inputs arrive',
    caption: 'Every stage sees its own A and B bits at once (1111 + 0001), but only stage 0 knows its carry-in.',
  },
  ...[0, 1, 2, 3].map((i) => ({
    label: `Stage ${i} settles`,
    caption: `Stage ${i} receives carry ${RIPPLE.carries[i]}, so it can finally decide: sum ${RIPPLE.sumBits[i]}, carry out ${
      RIPPLE.carries[i + 1]
    }. Under the unit-delay model this carry is ready after ${RIPPLE.delays.carry[i + 1]} gate delays.`,
  })),
  {
    label: 'Result',
    caption: `The sum reads 0000 with carry-out ${RIPPLE.carryOut}: 15 + 1 = 16. A wider adder waits proportionally longer, which is why fast CPUs use carry-lookahead instead.`,
  },
];

function RippleStage({ frame }: { frame: number }) {
  return (
    <ol className="ripple" aria-hidden="true">
      <li className={`ripple__cout${frame >= 4 ? ' is-on' : ''}`}>
        <span className="ripple__k">Cout</span>
        <span className="ripple__v">{frame >= 4 ? RIPPLE.carryOut : '?'}</span>
      </li>
      {STAGES.map((i) => {
        // Stage i learns its carry-in once stage i − 1 has settled (frame i).
        const carryKnown = i === 0 || frame >= i;
        const settled = frame >= i + 1;
        return (
          <li key={i} className={`ripple__stage${settled ? ' is-settled' : ''}${frame === i + 1 ? ' is-active' : ''}`}>
            <span className="ripple__k">FA{i}</span>
            <span className="ripple__bits">
              {RIPPLE.aBits[i]} + {RIPPLE.bBits[i]}
            </span>
            <span className="ripple__carry">carry in {carryKnown ? RIPPLE.carries[i] : '?'}</span>
            <span className="ripple__v">sum {settled ? RIPPLE.sumBits[i] : '?'}</span>
            <span className={`ripple__token${settled && RIPPLE.carries[i + 1] ? ' is-on' : ''}`}>←</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CarryRippleExplainer() {
  return (
    <ExhibitFigure
      kind="explanation"
      title="How a carry ripples"
      description="A scripted walk through 1111 + 0001, the slowest case for a 4-bit ripple-carry adder."
    >
      <ExplanatoryAnimation frames={RIPPLE_FRAMES}>{(frame) => <RippleStage frame={frame} />}</ExplanatoryAnimation>
    </ExhibitFigure>
  );
}

/* ── Fetch, decode, execute: ADD 15 from the worked example ───────────────── */

const ADD_PRESET = assemble(getPreset('add')!.source);
if (!ADD_PRESET.ok) throw new Error('worked-example program failed to assemble');
const BEFORE = step(createCpu(ADD_PRESET.program, ADD_PRESET.ram)).state; // after LDA 14
const { state: AFTER, event: ADD_EVENT } = step(BEFORE);
const BYTE = encodeInstruction(ADD_EVENT.instruction);
const ARG = ADD_EVENT.instruction.arg;

type Unit = 'pc' | 'memory' | 'decoder' | 'alu' | 'acc';

const FETCH_FRAMES: (AnimationFrame & { active: Unit[] })[] = [
  {
    label: 'Fetch',
    active: ['pc', 'memory'],
    caption: `The program counter holds ${BEFORE.pc}, so the control unit reads program-memory slot ${BEFORE.pc}: the byte ${nibble(
      BYTE >> 4,
    )} ${nibble(BYTE & 0xf)}.`,
  },
  {
    label: 'Decode',
    active: ['decoder'],
    caption: `The top four bits, ${nibble(OPCODES.ADD)}, select ADD. The bottom four, ${nibble(ARG)}, name RAM address ${ARG}.`,
  },
  {
    label: 'Execute',
    active: ['alu', 'acc'],
    caption: `RAM[${ARG}] = ${BEFORE.ram[ARG]} and A = ${BEFORE.a} enter the ripple-carry adder. The 4-bit sum ${AFTER.a} is written back into A; flags become Z = ${
      AFTER.flags.z ? 1 : 0
    }, C = ${AFTER.flags.c ? 1 : 0}.`,
  },
  {
    label: 'Advance',
    active: ['pc'],
    caption: `The program counter steps to ${AFTER.pc} and the cycle starts again with the next instruction, ${AFTER.program[AFTER.pc]!.op}.`,
  },
];

function FetchStage({ frame }: { frame: number }) {
  const { active } = FETCH_FRAMES[frame]!;
  const executed = frame >= 2;
  const advanced = frame >= 3;
  const units: { id: Unit; name: string; value: string }[] = [
    { id: 'pc', name: 'Program counter', value: String(advanced ? AFTER.pc : BEFORE.pc) },
    { id: 'memory', name: 'Program memory', value: `${nibble(BYTE >> 4)} ${nibble(BYTE & 0xf)}` },
    { id: 'decoder', name: 'Decoder', value: frame >= 1 ? `ADD ${ARG}` : '…' },
    { id: 'alu', name: 'Adder (ALU)', value: executed ? `${BEFORE.a} + ${BEFORE.ram[ARG]} = ${AFTER.a}` : '…' },
    { id: 'acc', name: 'Accumulator A', value: String(executed ? AFTER.a : BEFORE.a) },
  ];
  return (
    <ol className="datapath" aria-hidden="true">
      {units.map((u) => (
        <li key={u.id} className={`datapath__unit${active.includes(u.id) ? ' is-active' : ''}`}>
          <span className="datapath__name">{u.name}</span>
          <span className="datapath__value">{u.value}</span>
        </li>
      ))}
    </ol>
  );
}

export function FetchCycleExplainer() {
  return (
    <ExhibitFigure
      kind="explanation"
      title="Fetch, decode, execute"
      description="One instruction — ADD 15 from the worked example — passing through the machine."
    >
      <ExplanatoryAnimation frames={FETCH_FRAMES}>{(frame) => <FetchStage frame={frame} />}</ExplanatoryAnimation>
    </ExhibitFigure>
  );
}
