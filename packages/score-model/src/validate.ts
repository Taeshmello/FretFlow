import { DURATION_BASES } from './time';
import type { Score } from './types';

export interface ValidationIssue {
  code:
    | 'schemaVersion'
    | 'duplicateId'
    | 'barCount'
    | 'masterBarLink'
    | 'duplicateString'
    | 'stringRange'
    | 'fretRange'
    | 'pitchMismatch'
    | 'restWithNotes'
    | 'duration'
    | 'timeSig'
    | 'keySig'
    | 'tuning';
  message: string;
  id?: string;
}

/** Structural checks shared by the client and the server. Empty list = valid. */
export function validateScore(score: Score): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const unique = (id: string) => {
    if (seen.has(id)) {
      issues.push({ code: 'duplicateId', message: `id ${id} is used more than once`, id });
    }
    seen.add(id);
  };

  if (score.schemaVersion !== 1) {
    issues.push({ code: 'schemaVersion', message: `unsupported schemaVersion ${String(score.schemaVersion)}` });
  }
  unique(score.id);

  for (const mb of score.masterBars) {
    unique(mb.id);
    const [num, den] = mb.timeSig;
    if (!Number.isInteger(num) || num < 1 || num > 32 || !DURATION_BASES.includes(den as never)) {
      issues.push({ code: 'timeSig', message: `bad time signature ${num}/${den}`, id: mb.id });
    }
    if (!Number.isInteger(mb.keySig) || mb.keySig < -7 || mb.keySig > 7) {
      issues.push({ code: 'keySig', message: `key signature ${mb.keySig} out of -7..7`, id: mb.id });
    }
  }

  for (const track of score.tracks) {
    unique(track.id);
    if (track.tuning.length < 1 || track.tuning.some(p => !Number.isInteger(p) || p < 0 || p > 127)) {
      issues.push({ code: 'tuning', message: 'tuning must be MIDI pitches', id: track.id });
    }
    if (track.bars.length !== score.masterBars.length) {
      issues.push({
        code: 'barCount',
        message: `track has ${track.bars.length} bars, score has ${score.masterBars.length}`,
        id: track.id,
      });
    }
    track.bars.forEach((bar, i) => {
      unique(bar.id);
      if (score.masterBars[i] && bar.masterBarId !== score.masterBars[i].id) {
        issues.push({ code: 'masterBarLink', message: `bar ${i + 1} points at the wrong master bar`, id: bar.id });
      }
      for (const beat of bar.beats) {
        unique(beat.id);
        const d = beat.duration;
        if (!DURATION_BASES.includes(d.base) || ![0, 1, 2].includes(d.dots)) {
          issues.push({ code: 'duration', message: 'bad duration', id: beat.id });
        }
        if (beat.rest && beat.notes.length > 0) {
          issues.push({ code: 'restWithNotes', message: 'rest beat has notes', id: beat.id });
        }
        const strings = new Set<number>();
        for (const note of beat.notes) {
          unique(note.id);
          if (strings.has(note.string)) {
            issues.push({ code: 'duplicateString', message: `two notes on string ${note.string}`, id: note.id });
          }
          strings.add(note.string);
          if (!Number.isInteger(note.string) || note.string < 1 || note.string > track.tuning.length) {
            issues.push({ code: 'stringRange', message: `string ${note.string} does not exist`, id: note.id });
            continue;
          }
          if (!Number.isInteger(note.fret) || note.fret < 0 || note.fret > track.maxFret) {
            issues.push({ code: 'fretRange', message: `fret ${note.fret} out of 0..${track.maxFret}`, id: note.id });
          }
          const expected = track.tuning[note.string - 1] + track.capo + note.fret;
          if (note.pitch !== expected) {
            issues.push({ code: 'pitchMismatch', message: `pitch ${note.pitch} != ${expected}`, id: note.id });
          }
        }
      }
    });
  }
  return issues;
}
