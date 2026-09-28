import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSampleRiff, loadScoreFromBytes } from './sampleRiff';

const GP_DIR = join(import.meta.dirname, '../../../../fixtures/gp');
const gpFiles = readdirSync(GP_DIR).filter(f => /\.gp[3-7x]?$/i.test(f));

describe('sample riff', () => {
  it('loads the sample riff into a score with 4 master bars', () => {
    expect(loadSampleRiff().masterBars).toHaveLength(4);
  });

  it('gives the sample riff one 6-string guitar track in standard tuning', () => {
    const score = loadSampleRiff();
    expect(score.tracks).toHaveLength(1);
    // MIDI numbers for E4 B3 G3 D3 A2 E2, string 1 (highest) first.
    expect(score.tracks[0].staves[0].tuning).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('puts at least one note on every bar of the sample riff', () => {
    const staff = loadSampleRiff().tracks[0].staves[0];
    expect(staff.bars).toHaveLength(4);
    for (const bar of staff.bars) {
      const notes = bar.voices.flatMap(v => v.beats).flatMap(b => b.notes);
      expect(notes.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(gpFiles.length === 0)('guitar pro import', () => {
  it('parses a .gp file from bytes into a score with at least one track', () => {
    const bytes = new Uint8Array(readFileSync(join(GP_DIR, gpFiles[0])));
    expect(loadScoreFromBytes(bytes).tracks.length).toBeGreaterThan(0);
  });
});
