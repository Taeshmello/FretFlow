import { describe, expect, it } from 'vitest';
import { recommendScales, scaleToneKind } from './scaleGuide';

describe('scale guide', () => {
  it('offers multiple explainable scales for a minor seventh chord', () => {
    const scales = recommendScales('Am7');
    expect(scales.map(s => s.name)).toEqual(['A Minor pentatonic', 'A Natural minor', 'A Dorian']);
    expect(scaleToneKind(scales[0], 69)).toBe('root');
    expect(scaleToneKind(scales[0], 72)).toBe('chord');
    expect(scaleToneKind(scales[1], 71)).toBe('scale');
    expect(scaleToneKind(scales[0], 71)).toBeNull();
  });

  it('uses a dominant scale for G7 and recognises flat roots', () => {
    expect(recommendScales('G7')[0].name).toBe('G Mixolydian');
    expect(scaleToneKind(recommendScales('G7')[0], 65)).toBe('chord'); // F = flat seventh
    expect(recommendScales('Bbmaj7')[0].root).toBe(10);
  });

  it('does not guess a scale when chord context is absent or unsupported', () => {
    expect(recommendScales(null)).toEqual([]);
    expect(recommendScales('Cadd#11')).toEqual([]);
  });
});
