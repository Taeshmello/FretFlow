import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { importFile } from './fromAlphaTab';

/**
 * SPEC §1 completion criterion: ≥ 95% of the GP sample set imports into a valid
 * score. Drop .gp/.gp3/.gp4/.gp5/.gpx files into fixtures/gp/ (not committed if
 * they are copyrighted) and this runs automatically; with no files it is skipped.
 */
const DIR = join(import.meta.dirname, '../../../fixtures/gp');
let files: string[] = [];
try {
  files = readdirSync(DIR).filter(f => /\.(gp|gp3|gp4|gp5|gpx)$/i.test(f));
} catch {
  files = [];
}

describe.skipIf(files.length === 0)(`GP import regression (${files.length} files in fixtures/gp)`, () => {
  it('imports at least 95% of the sample files into valid scores', () => {
    const failures: string[] = [];
    const dropped = new Map<string, number>();
    for (const f of files) {
      try {
        const { score, unsupported } = importFile(new Uint8Array(readFileSync(join(DIR, f))));
        const issues = validateScore(score);
        if (issues.length) {
          failures.push(`${f}: ${issues[0].code} ${issues[0].message}`);
        }
        unsupported.forEach((n, what) => dropped.set(what, (dropped.get(what) ?? 0) + n));
      } catch (err) {
        failures.push(`${f}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const rate = (files.length - failures.length) / files.length;
    // Printed so a failing run shows what to fix first.
    console.info(`GP import: ${((rate * 100) | 0)}% of ${files.length}`, { failures, dropped: Object.fromEntries(dropped) });
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });
});
