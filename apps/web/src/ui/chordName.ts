const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Interval sets above the root (pitch classes) → suffix. Checked in this order. */
const SHAPES: [intervals: number[], suffix: string][] = [
  [[0, 4, 7, 11], 'maj7'],
  [[0, 4, 7, 10], '7'],
  [[0, 3, 7, 10], 'm7'],
  [[0, 3, 6, 10], 'm7b5'],
  [[0, 3, 6, 9], 'dim7'],
  [[0, 4, 7, 9], '6'],
  [[0, 3, 7, 9], 'm6'],
  [[0, 2, 4, 7], 'add9'],
  [[0, 4, 7], ''],
  [[0, 3, 7], 'm'],
  [[0, 3, 6], 'dim'],
  [[0, 4, 8], 'aug'],
  [[0, 5, 7], 'sus4'],
  [[0, 2, 7], 'sus2'],
  [[0, 7], '5'],
];

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Names the chord a set of pitches spells, e.g. [52, 60, 67] → "C/E". Rule-based and
 * deliberately small: common triads, sevenths, sixths, add9, sus and power chords.
 * Returns null when the notes do not match one of them.
 */
export function nameChord(pitches: readonly number[]): string | null {
  if (pitches.length < 2) {
    return null;
  }
  const classes = [...new Set(pitches.map(p => ((p % 12) + 12) % 12))];
  if (classes.length < 2) {
    return null;
  }
  const bass = ((Math.min(...pitches) % 12) + 12) % 12;
  // Prefer the bass note as the root so root-position names win over re-spellings.
  const roots = [bass, ...classes.filter(c => c !== bass)];
  for (const root of roots) {
    for (const [intervals, suffix] of SHAPES) {
      const rel = classes.map(c => (c - root + 12) % 12).sort((a, b) => a - b);
      if (sameSet(rel, intervals)) {
        return `${NAMES[root]}${suffix}${root === bass ? '' : `/${NAMES[bass]}`}`;
      }
    }
  }
  return null;
}
