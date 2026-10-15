import { describe, expect, it } from 'vitest';
import { parseTimeSignature } from './TimeSignatureInput';

describe('parseTimeSignature', () => {
  it('accepts cut time and uncommon standard meters', () => {
    expect(parseTimeSignature(['2', '2'])).toEqual([2, 2]);
    expect(parseTimeSignature(['11', '8'])).toEqual([11, 8]);
    expect(parseTimeSignature(['32', '16'])).toEqual([32, 16]);
  });

  it('rejects partial, fractional and unsupported values', () => {
    expect(parseTimeSignature(['', '4'])).toBeNull();
    expect(parseTimeSignature(['4.5', '4'])).toBeNull();
    expect(parseTimeSignature(['0', '4'])).toBeNull();
    expect(parseTimeSignature(['33', '4'])).toBeNull();
    expect(parseTimeSignature(['4', '3'])).toBeNull();
  });
});
