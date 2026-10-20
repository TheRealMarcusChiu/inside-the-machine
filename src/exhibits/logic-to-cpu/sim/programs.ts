export interface PresetProgram {
  id: string;
  title: string;
  description: string;
  source: string;
  /** What OUT should have displayed once the program halts (verified by tests). */
  expectedOutputs: number[];
}

export const PRESET_PROGRAMS: readonly PresetProgram[] = [
  {
    id: 'add',
    title: 'Add two numbers (worked example)',
    description: 'Loads 6 from RAM, adds 7 with the ripple-carry adder, outputs 13.',
    source: `; Worked example: 6 + 7
        LDA 14    ; A ← RAM[14] (6)
        ADD 15    ; A ← A + RAM[15] (7)
        OUT       ; show A
        HLT
.data 14 6
.data 15 7`,
    expectedOutputs: [13],
  },
  {
    id: 'countdown',
    title: 'Count down (loop + conditional jump)',
    description: 'Outputs 5, 4, 3, 2, 1, 0 using SUB and JZ.',
    source: `; Count down from 5 to 0
        LDA 14    ; A ← 5
loop:   OUT
        SUB 15    ; A ← A − 1, sets Z when A reaches 0
        JZ done
        JMP loop
done:   OUT
        HLT
.data 14 5
.data 15 1`,
    expectedOutputs: [5, 4, 3, 2, 1, 0],
  },
  {
    id: 'multiply',
    title: 'Multiply 3 × 4 (repeated addition)',
    description: 'There is no multiply instruction, so the program adds 3 four times.',
    source: `; Multiply by repeated addition: RAM[13] = 3 × 4
loop:   LDA 13    ; product
        ADD 12    ; += 3
        STA 13
        LDA 14    ; counter
        SUB 15    ; −1
        STA 14
        JZ done
        JMP loop
done:   LDA 13
        OUT
        HLT
.data 12 3
.data 14 4
.data 15 1`,
    expectedOutputs: [12],
  },
  {
    id: 'overflow',
    title: 'Overflow: 9 + 9 in four bits',
    description: '18 does not fit in 4 bits: OUT shows 2, then the carry flag triggers a jump that outputs 15 as a warning.',
    source: `; 9 + 9 = 18, which needs 5 bits
        LDA 14
        ADD 15    ; A ← 2, C ← 1
        OUT       ; shows the wrapped value
        JC warn
        HLT
warn:   LDI 15    ; signal "carry happened"
        OUT
        HLT
.data 14 9
.data 15 9`,
    expectedOutputs: [2, 15],
  },
];

export type PresetId = (typeof PRESET_PROGRAMS)[number]['id'];

export function getPreset(id: string): PresetProgram | undefined {
  return PRESET_PROGRAMS.find((p) => p.id === id);
}
