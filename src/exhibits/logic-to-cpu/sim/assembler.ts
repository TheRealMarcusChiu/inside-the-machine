import { MAX_PROGRAM_LENGTH, OPCODES, OPERAND_KIND, RAM_SIZE, type Instruction, type Opcode } from './cpu';

export interface AssemblyError {
  line: number;
  message: string;
}

export type AssemblyResult =
  | { ok: true; program: Instruction[]; ram: number[] }
  | { ok: false; errors: AssemblyError[] };

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseNumber(token: string): number | undefined {
  if (/^0x[0-9a-f]+$/i.test(token)) return parseInt(token.slice(2), 16);
  if (/^0b[01]+$/i.test(token)) return parseInt(token.slice(2), 2);
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return undefined;
}

function isOpcode(word: string): word is Opcode {
  return Object.prototype.hasOwnProperty.call(OPCODES, word);
}

interface PendingLine {
  line: number;
  op: Opcode;
  operand?: string;
}

/**
 * Two-pass assembler for the Museum-4.
 *
 *   label:  MNEMONIC operand   ; comment
 *   .data   address value       ; initialise a RAM nibble
 *
 * Numbers may be decimal, 0x-hex or 0b-binary. Labels may be used as jump targets.
 */
export function assemble(source: string): AssemblyResult {
  const errors: AssemblyError[] = [];
  const labels = new Map<string, number>();
  const pending: PendingLine[] = [];
  const ram = Array<number>(RAM_SIZE).fill(0);

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    let text = rawLine.replace(/;.*$/, '').trim();
    if (!text) return;

    const labelMatch = /^([^\s:]+)\s*:(.*)$/.exec(text);
    if (labelMatch) {
      const name = labelMatch[1]!;
      if (!LABEL_RE.test(name)) {
        errors.push({ line, message: `“${name}” is not a valid label name.` });
        return;
      }
      if (labels.has(name)) {
        errors.push({ line, message: `Label “${name}” is defined twice.` });
        return;
      }
      labels.set(name, pending.length);
      text = labelMatch[2]!.trim();
      if (!text) return;
    }

    const [word = '', ...rest] = text.split(/\s+/);

    if (word.toLowerCase() === '.data') {
      const [addrTok, valueTok, extra] = rest;
      const addr = addrTok === undefined ? undefined : parseNumber(addrTok);
      const value = valueTok === undefined ? undefined : parseNumber(valueTok);
      if (extra !== undefined || addr === undefined || value === undefined) {
        errors.push({ line, message: '.data needs exactly two numbers: an address and a value.' });
      } else if (addr > 15 || value > 15) {
        errors.push({ line, message: '.data address and value must each be 0–15 (one nibble).' });
      } else {
        ram[addr] = value;
      }
      return;
    }

    const mnemonic = word.toUpperCase();
    if (!isOpcode(mnemonic)) {
      errors.push({ line, message: `Unknown instruction “${word}”.` });
      return;
    }
    if (rest.length > 1) {
      errors.push({ line, message: `${mnemonic} takes at most one operand.` });
      return;
    }
    pending.push({ line, op: mnemonic, operand: rest[0] });
  });

  if (pending.length > MAX_PROGRAM_LENGTH) {
    errors.push({
      line: pending[MAX_PROGRAM_LENGTH]!.line,
      message: `Program memory holds only ${MAX_PROGRAM_LENGTH} instructions.`,
    });
  }

  const program: Instruction[] = [];
  for (const p of pending) {
    const kind = OPERAND_KIND[p.op];
    if (kind === 'none') {
      if (p.operand !== undefined) errors.push({ line: p.line, message: `${p.op} does not take an operand.` });
      else program.push({ op: p.op, arg: 0 });
      continue;
    }
    if (p.operand === undefined) {
      errors.push({ line: p.line, message: `${p.op} needs an operand.` });
      continue;
    }
    let value = parseNumber(p.operand);
    if (value === undefined && kind === 'target' && LABEL_RE.test(p.operand)) {
      value = labels.get(p.operand);
      if (value === undefined) {
        errors.push({ line: p.line, message: `Unknown label “${p.operand}”.` });
        continue;
      }
    }
    if (value === undefined) {
      errors.push({ line: p.line, message: `“${p.operand}” is not a number${kind === 'target' ? ' or label' : ''}.` });
      continue;
    }
    if (value > 15) {
      errors.push({ line: p.line, message: `Operand ${value} is out of range: it must be 0–15 (4 bits).` });
      continue;
    }
    program.push({ op: p.op, arg: value });
  }

  if (errors.length) return { ok: false, errors: errors.sort((a, b) => a.line - b.line) };
  return { ok: true, program, ram };
}

export function disassemble(program: readonly Instruction[]): string {
  return program.map((ins) => (OPERAND_KIND[ins.op] === 'none' ? ins.op : `${ins.op} ${ins.arg}`)).join('\n');
}

export function formatInstruction(ins: Instruction): string {
  return OPERAND_KIND[ins.op] === 'none' ? ins.op : `${ins.op} ${ins.arg}`;
}
