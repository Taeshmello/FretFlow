import type { ChangeEvent } from 'react';

export const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const;

export type TimeSignatureDraft = [string, string];

/** Parse a user-entered time signature without accepting decimals or partial values. */
export function parseTimeSignature([numeratorText, denominatorText]: readonly [string, string]): [number, number] | null {
  if (!/^\d+$/.test(numeratorText) || !/^\d+$/.test(denominatorText)) {
    return null;
  }
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (numerator < 1 || numerator > 32 || !TIME_SIGNATURE_DENOMINATORS.some(value => value === denominator)) {
    return null;
  }
  return [numerator, denominator];
}

interface Props {
  value: TimeSignatureDraft;
  onChange: (value: TimeSignatureDraft) => void;
  idPrefix: string;
  invalid?: boolean;
}

/** Two compact number fields so uncommon meters are not limited to a preset list. */
export function TimeSignatureInput({ value, onChange, idPrefix, invalid = false }: Props) {
  const update = (index: 0 | 1) => (event: ChangeEvent<HTMLInputElement>) => {
    const next: TimeSignatureDraft = [...value];
    next[index] = event.target.value;
    onChange(next);
  };

  return (
    <span className="time-signature-input">
      <input
        id={`${idPrefix}-numerator`}
        aria-label="Time signature numerator"
        aria-invalid={invalid}
        type="number"
        inputMode="numeric"
        min={1}
        max={32}
        step={1}
        required
        value={value[0]}
        onChange={update(0)}
      />
      <span aria-hidden="true">/</span>
      <input
        id={`${idPrefix}-denominator`}
        aria-label="Time signature denominator"
        aria-invalid={invalid}
        type="number"
        inputMode="numeric"
        min={1}
        max={32}
        step={1}
        list={`${idPrefix}-denominators`}
        required
        value={value[1]}
        onChange={update(1)}
      />
      <datalist id={`${idPrefix}-denominators`}>
        {TIME_SIGNATURE_DENOMINATORS.map(value => <option key={value} value={value} />)}
      </datalist>
    </span>
  );
}
