import { useId, useState } from 'react';
import { LIMITS, parseFieldInput, scaleField, type NumericField } from '../urlConfig';

interface NumberFieldProps {
  field: NumericField;
  /** Visible label, e.g. "Batch size (B, sequences)". */
  label: string;
  /** Plain name for the halve/double buttons, e.g. "batch size". */
  name: string;
  value: number;
  onCommit: (value: number) => void;
}

/**
 * A numeric input that applies every valid keystroke immediately, explains invalid ones without
 * touching the shared state, and offers halve/double buttons for quick exploration by touch or keyboard.
 */
export function NumberField({ field, label, name, value, onCommit }: NumberFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { min, max, integer } = LIMITS[field];

  const change = (raw: string) => {
    setDraft(raw);
    const parsed = parseFieldInput(field, raw);
    if ('value' in parsed) {
      setError(null);
      onCommit(parsed.value);
    } else {
      setError(parsed.error);
    }
  };

  const scale = (factor: number) => {
    setDraft(null);
    setError(null);
    onCommit(scaleField(field, value, factor));
  };

  return (
    <div className={`llm-field${error ? ' llm-field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="llm-field__row">
        <button
          type="button"
          className="btn llm-field__step"
          aria-label={`Halve ${name}`}
          onClick={() => scale(0.5)}
          disabled={value <= min}
        >
          ÷2
        </button>
        <input
          id={id}
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          min={min}
          max={max}
          step={integer ? 1 : 'any'}
          value={draft ?? String(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => change(e.target.value)}
          onBlur={() => {
            setDraft(null);
            setError(null);
          }}
        />
        <button
          type="button"
          className="btn llm-field__step"
          aria-label={`Double ${name}`}
          onClick={() => scale(2)}
          disabled={value >= max}
        >
          ×2
        </button>
      </div>
      {error && (
        <p id={errorId} className="llm-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
