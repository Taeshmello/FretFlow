import { chordShape } from './soloGuide';

export interface ScaleSuggestion {
  id: string;
  name: string;
  reason: string;
  root: number;
  /** Pitch classes; one octave of the suggested scale. */
  tones: ReadonlySet<number>;
  chordTones: ReadonlySet<number>;
}

export type ScaleToneKind = 'root' | 'chord' | 'scale';
const pc = (pitch: number) => ((pitch % 12) + 12) % 12;

/** Explainable suggestions from a chord symbol, not a generative-AI claim. */
export function recommendScales(chord: string | null): ScaleSuggestion[] {
  if (!chord) return [];
  const shape = chordShape(chord);
  if (!shape) return [];
  const { root, rootName, quality, chord: chordTones } = shape;
  const suggestions: [string, string, number[]][] = [];
  if (quality === 'dim7') {
    suggestions.push(['Diminished (whole–half)', 'Contains the diminished seventh chord tones.', [0, 2, 3, 5, 6, 8, 9, 11]]);
  } else if (quality === 'dim') {
    suggestions.push(['Locrian', 'Includes the diminished fifth.', [0, 1, 3, 5, 6, 8, 10]]);
  } else if (quality === 'aug') {
    suggestions.push(['Whole tone', 'Includes the augmented fifth.', [0, 2, 4, 6, 8, 10]]);
  } else if (quality === 'mmaj7') {
    suggestions.push(['Harmonic minor', 'Includes the minor third and major seventh.', [0, 2, 3, 5, 7, 8, 11]]);
    suggestions.push(['Melodic minor', 'A brighter minor sound with the major seventh.', [0, 2, 3, 5, 7, 9, 11]]);
  } else if (/^(m(?!aj)|min|minor)/.test(quality)) {
    suggestions.push(['Minor pentatonic', 'A simple, reliable starting point for a minor solo.', [0, 3, 5, 7, 10]]);
    suggestions.push(['Natural minor', 'Adds connecting notes for fuller melodies.', [0, 2, 3, 5, 7, 8, 10]]);
    if (quality.includes('7')) suggestions.push(['Dorian', 'Brighter minor colour with a natural sixth.', [0, 2, 3, 5, 7, 9, 10]]);
  } else if (quality === '7') {
    suggestions.push(['Mixolydian', 'Contains the dominant seventh.', [0, 2, 4, 5, 7, 9, 10]]);
    suggestions.push(['Dominant pentatonic', 'A smaller set centred on the dominant chord.', [0, 2, 4, 7, 10]]);
  } else if (quality === '5') {
    suggestions.push(['Major pentatonic', 'Power chords omit the third; try a major colour.', [0, 2, 4, 7, 9]]);
    suggestions.push(['Minor pentatonic', 'Power chords omit the third; try a minor colour.', [0, 3, 5, 7, 10]]);
  } else if (quality.startsWith('sus')) {
    suggestions.push(['Mixolydian', 'Keeps the suspended second or fourth available.', [0, 2, 4, 5, 7, 9, 10]]);
    suggestions.push(['Major', 'A brighter alternative; resolve suspended notes by ear.', [0, 2, 4, 5, 7, 9, 11]]);
  } else {
    suggestions.push(['Major pentatonic', 'A compact starting point for a major solo.', [0, 2, 4, 7, 9]]);
    suggestions.push(['Major', 'Adds the fourth and seventh for longer melodic lines.', [0, 2, 4, 5, 7, 9, 11]]);
    if (quality === 'maj7' || quality === 'M7') suggestions.push(['Lydian', 'A floating major-seventh colour with a raised fourth.', [0, 2, 4, 6, 7, 9, 11]]);
  }
  return suggestions.map(([id, reason, intervals]) => ({
    id,
    name: `${rootName} ${id}`,
    reason,
    root,
    chordTones,
    tones: new Set(intervals.map(interval => pc(root + interval))),
  }));
}

export function scaleToneKind(scale: ScaleSuggestion, pitch: number): ScaleToneKind | null {
  const tone = pc(pitch);
  if (!scale.tones.has(tone)) return null;
  if (tone === scale.root) return 'root';
  return scale.chordTones.has(tone) ? 'chord' : 'scale';
}
