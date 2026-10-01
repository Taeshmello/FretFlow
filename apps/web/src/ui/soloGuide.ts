import type { Cursor } from '@fretflow/editor-core';
import type { Score, Track } from '@fretflow/score-model';

export type GuideKind = 'chord' | 'passing' | 'tension';
export interface GuideNote { string: number; fret: number; pitch: number; kind: GuideKind; reason: string }
export interface SoloGuide { chord: string | null; notes: GuideNote[]; message: string }

const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pc = (pitch: number) => ((pitch % 12) + 12) % 12;

export function chordShape(symbol: string): { root: number; rootName: string; quality: string; chord: Set<number>; scale: Set<number> } | null {
  const match = /^([A-G])([#b]?)([^/]*)/.exec(symbol.trim());
  if (!match) return null;
  const root = pc(ROOTS[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0));
  const quality = match[3].trim();
  if (!/^(?:|m|minor|min|maj|M|major|7|m7|min7|maj7|M7|mmaj7|dim|dim7|aug|sus2|sus4|5)$/.test(quality)) return null;
  const minor = /^(m(?!aj)|min|minor)/.test(quality);
  const third = quality.startsWith('sus2') ? 2 : quality.startsWith('sus4') ? 5 : minor || quality.startsWith('dim') ? 3 : 4;
  const fifth = quality.startsWith('dim') ? 6 : quality.startsWith('aug') ? 8 : 7;
  const intervals = quality === '5' ? [0, 7] : [0, third, fifth];
  if (quality.includes('7')) intervals.push(quality.startsWith('maj') || quality.startsWith('M') || quality === 'mmaj7' ? 11 : quality === 'dim7' ? 9 : 10);
  const scaleIntervals = minor || quality.startsWith('dim') ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return { root, rootName: `${match[1]}${match[2]}`, quality, chord: new Set(intervals.map(n => pc(root + n))), scale: new Set(scaleIntervals.map(n => pc(root + n))) };
}

function context(cursor: Cursor, track: Track): { chord: string | null; anchor: { pitch: number; fret: number; string: number } | null } {
  let chord: string | null = null;
  let anchor: { pitch: number; fret: number; string: number } | null = null;
  for (let b = 0; b <= cursor.barIndex; b++) {
    const beats = track.bars[b]?.beats ?? [];
    for (let i = 0; i < beats.length && (b < cursor.barIndex || i <= cursor.beatIndex); i++) {
      if (beats[i].chord) chord = beats[i].chord ?? null;
      const note = beats[i].notes[0];
      if (note) anchor = { pitch: note.pitch, fret: note.fret, string: note.string };
    }
  }
  return { chord, anchor };
}

/** Deterministic chord/scale hints. This is deliberately not an AI model. */
export function suggestNextNotes(score: Score, cursor: Cursor, maxFret = 15): SoloGuide {
  const track = score.tracks.find(t => t.id === cursor.trackId) ?? score.tracks[0];
  if (!track || !track.tuning.length) return { chord: null, notes: [], message: 'Available on guitar and bass tracks.' };
  const { chord, anchor } = context(cursor, track);
  if (!chord) return { chord: null, notes: [], message: 'Enter a chord for the selected beat to see candidate notes.' };
  const shape = chordShape(chord);
  if (!shape) return { chord, notes: [], message: `“${chord}” can’t be analysed yet.` };
  const candidates: (GuideNote & { rank: number })[] = [];
  for (let string = 1; string <= track.tuning.length; string++) {
    for (let fret = 0; fret <= Math.min(maxFret, track.maxFret); fret++) {
      const pitch = track.tuning[string - 1] + track.capo + fret;
      if (anchor && pitch === anchor.pitch && string === anchor.string && fret === anchor.fret) continue;
      const kind: GuideKind = shape.chord.has(pc(pitch)) ? 'chord' : shape.scale.has(pc(pitch)) ? 'passing' : 'tension';
      const distance = anchor ? Math.abs(pitch - anchor.pitch) : Math.abs(fret - 5);
      const fretDistance = anchor ? Math.abs(fret - anchor.fret) : Math.abs(fret - 5);
      const rank = distance * 2 + fretDistance + (anchor ? Math.abs(string - anchor.string) : 0) + (fret === 0 ? 1 : 0);
      const reason = kind === 'chord' ? 'Chord tone · stable' : kind === 'passing' ? 'Scale tone · connecting' : 'Tension · adventurous';
      candidates.push({ string, fret, pitch, kind, reason, rank });
    }
  }
  const selected: GuideNote[] = [];
  for (const [kind, count] of [['chord', 4], ['passing', 2], ['tension', 2]] as const) {
    selected.push(...candidates.filter(c => c.kind === kind).sort((a, b) => a.rank - b.rank || a.string - b.string || a.fret - b.fret).slice(0, count).map(({ rank: _rank, ...note }) => note));
  }
  return { chord, notes: selected, message: `Over ${chord}: blue = chord tones, gold = passing tones, red = tensions (not wrong notes).` };
}
