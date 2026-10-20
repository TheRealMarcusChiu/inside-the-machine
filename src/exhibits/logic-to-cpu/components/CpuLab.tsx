import { useEffect, useId, useMemo, useReducer, useState, type KeyboardEvent } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { useSimulationClient } from '../../../worker/useSimulationClient';
import { createCpuLabState, cpuLabReducer, keyToCpuCommand, RUN_STEP_BUDGET, type CpuCommand } from '../cpuLabState';
import { assemble, formatInstruction, type AssemblyError } from '../sim/assembler';
import { createCpu, encodeInstruction, type StepEvent } from '../sim/cpu';
import { getPreset, PRESET_PROGRAMS } from '../sim/programs';
import { MAX_SOURCE_LENGTH, type ProgramChoice } from '../urlConfig';

export const CPU_FIGURE_ID = 'cpu-lab';

const nibble = (n: number) => n.toString(2).padStart(4, '0');
const MEMORY_OPS = new Set(['LDA', 'STA', 'ADD', 'SUB']);

export function sourceFor(choice: ProgramChoice, customSource: string): string {
  return choice === 'custom' ? customSource : (getPreset(choice)?.source ?? '');
}

interface CpuLabProps {
  choice: ProgramChoice;
  customSource: string;
  onChoose: (choice: ProgramChoice) => void;
  /** Called with source that has already assembled successfully. */
  onAssemble: (source: string) => void;
}

/**
 * The Museum-4 workbench. Mount it with a key derived from the program so that
 * choosing or assembling a program starts a fresh machine and a fresh editor.
 */
export function CpuLab({ choice, customSource, onChoose, onAssemble }: CpuLabProps) {
  const uid = useId();
  const source = sourceFor(choice, customSource);
  const assembled = useMemo(() => assemble(source), [source]);
  const machine = useMemo(() => (assembled.ok ? createCpu(assembled.program, assembled.ram) : createCpu([])), [assembled]);
  const [lab, dispatch] = useReducer(cpuLabReducer, machine, createCpuLabState);
  const [draft, setDraft] = useState(source);
  const [errors, setErrors] = useState<AssemblyError[]>(assembled.ok ? [] : assembled.errors);
  const [speed, setSpeed] = useState(4);
  const [workerNotice, setWorkerNotice] = useState('');
  const client = useSimulationClient();

  const { current, mode } = lab;
  const lastEvent: StepEvent | undefined = lab.log.at(-1);
  const preset = getPreset(choice);

  useEffect(() => {
    if (mode === 'idle') return;
    const id = window.setInterval(() => dispatch({ type: 'tick' }), 1000 / speed);
    return () => window.clearInterval(id);
  }, [mode, speed]);

  const replay = () => {
    if (!client.current) return;
    setWorkerNotice('');
    client.current
      .run('cpu.trace', { program: lab.initial.program, ram: lab.initial.ram, maxSteps: RUN_STEP_BUDGET })
      .then((trace) => dispatch({ type: 'replay', trace }))
      .catch((err: Error) => {
        if (!/disposed/i.test(err.message)) setWorkerNotice(`Replay failed: ${err.message}`);
      });
  };

  const command = (cmd: CpuCommand) => {
    if (cmd === 'step') dispatch({ type: 'step' });
    else if (cmd === 'toggle-run') dispatch({ type: mode === 'idle' ? 'run' : 'pause' });
    else if (cmd === 'reset') dispatch({ type: 'reset' });
    else replay();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cmd = keyToCpuCommand(event, (event.target as HTMLElement).tagName);
    if (!cmd) return;
    event.preventDefault();
    command(cmd);
  };

  const assembleDraft = () => {
    const result = assemble(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    if (choice === 'custom' && draft === customSource) dispatch({ type: 'load', cpu: createCpu(result.program, result.ram) });
    else onAssemble(draft);
  };

  const touchedAddress = lastEvent && MEMORY_OPS.has(lastEvent.instruction.op) ? lastEvent.instruction.arg : undefined;
  const status = current.halted ? 'Halted' : mode === 'running' ? 'Running' : mode === 'replaying' ? 'Replaying' : 'Ready';
  const recent = lab.log.slice(-6).reverse();

  return (
    <ExhibitFigure
      kind="simulation"
      title="Miniature CPU (the Museum-4)"
      id={CPU_FIGURE_ID}
      description="A 4-bit machine whose ADD and SUB run on the adder above. Step it, run it, or write your own program."
      className="cpu-lab"
    >
      <div className="cpu-lab__workbench" onKeyDown={onKeyDown}>
        <div className="cpu-lab__toolbar">
          <div className="field">
            <label htmlFor={`${uid}-program`}>Program</label>
            <select id={`${uid}-program`} value={choice} onChange={(e) => onChoose(e.target.value as ProgramChoice)}>
              {PRESET_PROGRAMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
              <option value="custom">Your own program</option>
            </select>
          </div>
          <div className="cpu-lab__buttons" role="group" aria-label="Machine controls">
            <button type="button" className="btn btn--primary" aria-keyshortcuts="S" onClick={() => command('step')}>
              Step <kbd aria-hidden="true">S</kbd>
            </button>
            <button type="button" className="btn" aria-keyshortcuts="P" onClick={() => command('toggle-run')}>
              {mode === 'idle' ? 'Run' : 'Pause'} <kbd aria-hidden="true">P</kbd>
            </button>
            <button type="button" className="btn" aria-keyshortcuts="R" onClick={() => command('reset')}>
              Reset <kbd aria-hidden="true">R</kbd>
            </button>
            <button type="button" className="btn" aria-keyshortcuts="Shift+R" onClick={() => command('replay')}>
              Replay <kbd aria-hidden="true">⇧R</kbd>
            </button>
          </div>
          <div className="field field--range">
            <label htmlFor={`${uid}-speed`}>Clock</label>
            <input
              id={`${uid}-speed`}
              type="range"
              min={1}
              max={20}
              value={speed}
              aria-valuetext={`${speed} steps per second`}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
            <span className="field__value">{speed}/s</span>
          </div>
        </div>
        <p className="hint">
          {preset ? preset.description : 'Your own program, assembled below.'} Keyboard, while focus is in this lab: S
          step · P run/pause · R reset · Shift+R replay a precomputed trace.
        </p>

        <div className="cpu-lab__panels">
          <table className="program-table">
            <caption>Program memory</caption>
            <thead>
              <tr>
                <th scope="col">Addr</th>
                <th scope="col">Byte</th>
                <th scope="col">Instruction</th>
              </tr>
            </thead>
            <tbody>
              {current.program.map((ins, addr) => {
                const isCurrent = addr === current.pc;
                const byte = encodeInstruction(ins);
                const unused = ins.op === 'NOP' && addr >= (assembled.ok ? assembled.program.length : 0);
                return (
                  <tr
                    key={addr}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`${isCurrent ? 'is-current' : ''}${unused ? ' is-unused' : ''}`}
                  >
                    <td>
                      <span className="pc-marker" aria-hidden="true">
                        {isCurrent ? '▶' : ''}
                      </span>
                      {addr}
                    </td>
                    <td className="mono">
                      {nibble(byte >> 4)} {nibble(byte & 0xf)}
                    </td>
                    <td className="mono">{formatInstruction(ins)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="cpu-lab__state">
            <dl className="registers">
              <div className="register">
                <dt>PC</dt>
                <dd>
                  <span data-testid="reg-pc" className="register__value">{current.pc}</span>
                  <span className="register__bits">{nibble(current.pc)}</span>
                </dd>
              </div>
              <div className="register register--acc">
                <dt>A</dt>
                <dd>
                  <span data-testid="reg-a" className="register__value">{current.a}</span>
                  <span className="register__bits">{nibble(current.a)}</span>
                </dd>
              </div>
              <div className={`register register--flag${current.flags.z ? ' is-on' : ''}`}>
                <dt>Z</dt>
                <dd>
                  <span className="register__value">{current.flags.z ? 1 : 0}</span>
                  <span className="register__bits">zero</span>
                </dd>
              </div>
              <div className={`register register--flag${current.flags.c ? ' is-on' : ''}`}>
                <dt>C</dt>
                <dd>
                  <span className="register__value">{current.flags.c ? 1 : 0}</span>
                  <span className="register__bits">carry</span>
                </dd>
              </div>
            </dl>
            <p className="cpu-lab__status">
              <span className={`status-pill status-pill--${status.toLowerCase()}`}>{status}</span> {current.steps} step
              {current.steps === 1 ? '' : 's'} executed
            </p>

            <div className="out-display">
              <span className="out-display__label">OUT</span>
              <span className="out-display__value">{current.outputs.at(-1) ?? '–'}</span>
              <span className="out-display__history">
                {current.outputs.length ? `history: ${current.outputs.join(', ')}` : 'nothing output yet'}
              </span>
            </div>

            <table className="ram-table">
              <caption>Data memory (RAM)</caption>
              <tbody>
                {[0, 8].map((rowStart) => (
                  <tr key={rowStart}>
                    {current.ram.slice(rowStart, rowStart + 8).map((value, i) => {
                      const addr = rowStart + i;
                      return (
                        <td key={addr} className={addr === touchedAddress ? 'is-touched' : undefined}>
                          <span className="ram-table__addr">{addr}</span>
                          <span className="ram-table__value">{value}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {lastEvent?.adder && (
              <div className="alu-trace">
                <span className="alu-trace__label">Adder used by {lastEvent.instruction.op}</span>
                <span className="mono">
                  {nibble(lastEvent.adder.a)} + {nibble(lastEvent.adder.b)}
                  {lastEvent.adder.cin ? ' + 1' : ''} = {lastEvent.adder.carryOut}·{nibble(lastEvent.adder.sum)}
                </span>
                <span className="hint">carry chain {lastEvent.adder.carries.slice().reverse().join('')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="cpu-lab__log">
          <p className="cpu-lab__narration" aria-live={mode === 'idle' ? 'polite' : 'off'}>
            {lab.notice ?? workerNotice} {lastEvent ? lastEvent.description : 'Press Step to fetch the first instruction.'}
          </p>
          {recent.length > 0 && (
            <ol className="event-log" aria-label="Recent steps, newest first">
              {recent.map((e, i) => (
                <li key={`${lab.log.length - i}`}>
                  <span className="mono">
                    {e.pc}: {formatInstruction(e.instruction)}
                  </span>{' '}
                  {e.description}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="cpu-lab__editor">
          <h4 className="cpu-lab__editor-title">Write your own program</h4>
          <div className="field field--stack">
            <label htmlFor={`${uid}-source`}>Assembly source</label>
            <textarea
              id={`${uid}-source`}
              value={draft}
              rows={12}
              maxLength={MAX_SOURCE_LENGTH}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-describedby={`${uid}-syntax`}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <p className="hint" id={`${uid}-syntax`}>
            One instruction per line: <code>label: OP operand ; comment</code>. Set RAM with <code>.data address value</code>.
            Numbers may be decimal, <code>0x</code> hex or <code>0b</code> binary; all values are 0–15.
            {draft !== source && ' You have unassembled changes.'}
          </p>
          <button type="button" className="btn btn--primary" onClick={assembleDraft}>
            Assemble and load
          </button>
          {errors.length > 0 && (
            <div className="error-box" role="alert">
              <p>The program could not be assembled:</p>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </ExhibitFigure>
  );
}
