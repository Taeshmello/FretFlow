import * as alphaTab from '@coderline/alphatab';

const RIFF_HEADER = `\\title "FretFlow PoC Riff"
\\track { instrument 30 }
\\tuning (E4 B3 G3 D3 A2 E2)
\\tempo 120
\\ts 4 4`;

/**
 * Original riff written for this PoC, so no third-party tab is committed.
 * Every line restates its duration so the bars can be repeated in any order,
 * which is what the 200 bar benchmark score does.
 */
export const RIFF_BARS = [
  ':8 0.6 0.6 3.6 0.6 5.6 0.6 3.6 2.6',
  ':8 0.6 0.6 3.6 0.6 7.6 0.6 5.6 3.6',
  ':8 0.5 0.5 3.5 0.5 5.5 0.5 3.5 2.5',
  ':4 (0.6 0.5 0.4) 3.6 :2 (0.6 0.5)',
];

/** Builds alphaTex for `barCount` bars by cycling through the riff. */
export function buildRiffTex(barCount: number): string {
  const bars = Array.from({ length: barCount }, (_, i) => RIFF_BARS[i % RIFF_BARS.length]);
  return `${RIFF_HEADER}\n${bars.join(' |\n')} |\n`;
}

export const SAMPLE_RIFF_TEX = buildRiffTex(RIFF_BARS.length);

export function loadSampleRiff(): alphaTab.model.Score {
  return alphaTab.importer.ScoreLoader.loadAlphaTex(SAMPLE_RIFF_TEX);
}

export function loadScoreFromBytes(bytes: Uint8Array): alphaTab.model.Score {
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes);
}
