import * as alphaTab from '@coderline/alphatab';
import { exportGp7, exportMidi, importFile, type ImportResult } from '@fretflow/render';
import { cloneWithNewIds, migrateScore, validateScore, type Score } from '@fretflow/score-model';

export function download(bytes: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(score: Score): string {
  return (score.meta.title || 'score').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
}

export const exportAsJson = (score: Score) => download(JSON.stringify(score, null, 2), `${safeName(score)}.fretflow.json`, 'application/json');
export const exportAsMidi = (score: Score) => download(exportMidi(score), `${safeName(score)}.mid`, 'audio/midi');
export const exportAsGp = (score: Score) => download(exportGp7(score), `${safeName(score)}.gp`, 'application/octet-stream');

export interface PrintOptions {
  paper: 'a4' | 'letter';
  staves: 'scoreTab' | 'tab' | 'score';
  /** 1-based inclusive bar range; null = whole score. */
  range: [number, number] | null;
}

/**
 * PDF export = alphaTab's print layout in a new window → the browser's
 * "Save as PDF" (SPEC §9). alphaTab renders that window asynchronously from the
 * same score object, so the free-tier footer (copyright line, hidden on screen)
 * is left in place; the next edit builds a fresh model anyway.
 */
export function printScore(api: alphaTab.AlphaTabApi, opts: PrintOptions): void {
  const score = api.score;
  if (!score) {
    return;
  }
  score.copyright = 'Made with FretFlow';
  api.print(opts.paper === 'a4' ? '210mm' : '8.5in', {
    display: {
      staveProfile: opts.staves === 'tab' ? alphaTab.StaveProfile.Tab : opts.staves === 'score' ? alphaTab.StaveProfile.Score : alphaTab.StaveProfile.ScoreTab,
      ...(opts.range ? { startBar: opts.range[0], barCount: opts.range[1] - opts.range[0] + 1 } : {}),
    },
    notation: {
      elements: new Map([
        [alphaTab.NotationElement.ScoreCopyright, true],
        [alphaTab.NotationElement.ScoreTitle, true],
        [alphaTab.NotationElement.ScoreArtist, true],
        [alphaTab.NotationElement.GuitarTuning, true],
        [alphaTab.NotationElement.EffectDynamics, false],
      ]),
    },
  });
}

export interface OpenedFile {
  score: Score;
  unsupported: Map<string, number>;
  source: 'gp' | 'json';
}

/** Opens .gp/.gp3–5/.gpx or our own JSON. Imported scores always get fresh ids. */
export async function openFile(file: File): Promise<OpenedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.json$/i.test(file.name)) {
    const score = migrateScore(JSON.parse(new TextDecoder().decode(bytes)));
    const issues = validateScore(score);
    if (issues.length) {
      throw new Error(`The file is not a valid FretFlow score: ${issues[0].message}`);
    }
    return { score: cloneWithNewIds(score), unsupported: new Map(), source: 'json' };
  }
  let result: ImportResult;
  try {
    result = importFile(bytes);
  } catch (err) {
    throw new Error(`Could not read this file (${err instanceof Error ? err.message : String(err)}). Supported: Guitar Pro 3–7, FretFlow JSON.`);
  }
  return { ...result, source: 'gp' };
}
