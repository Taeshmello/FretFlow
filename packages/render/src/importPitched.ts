import * as alphaTab from '@coderline/alphatab';
import { createBar, DRUM_ORDER, drumPieceForMidi, newId, PIANO_HIGH, PIANO_LOW, type Bar, type DrumPiece, type MasterBar } from '@fretflow/score-model';
import { bareBeat, liveBeats, sameRhythm, type Report } from './importCommon';
import { importPedals } from './pedal';

const at = alphaTab.model;

/** Piano: keys from every staff of a bar when their rhythm lines up; otherwise the top staff only. */
export function pianoBar(t: alphaTab.model.Track, i: number, mb: MasterBar, report: Report): Bar {
  const top = liveBeats(t.staves[0]?.bars[i]);
  if (!top.length) {
    return createBar(mb);
  }
  const others = t.staves.slice(1).map(st => liveBeats(st.bars[i]));
  const merged = others.filter(o => o.length && sameRhythm(top, o));
  if (others.some(o => o.length && !sameRhythm(top, o))) {
    report.add('piano staves with a different rhythm (top staff kept)');
  }
  const beats = top.map((b, bi) => {
    const out = bareBeat(b, report);
    const pitches = new Set<number>();
    for (const n of [...b.notes, ...merged.flatMap(o => o[bi].notes)]) {
      const pitch = n.realValue;
      if (pitch < PIANO_LOW || pitch > PIANO_HIGH || pitches.has(pitch)) {
        continue;
      }
      pitches.add(pitch);
      out.keys ??= [];
      out.keys.push({ id: newId(), pitch, source: 'import', ...(n.isTieDestination ? { tieFromPrev: true } : {}) });
    }
    out.keys?.sort((a, c) => a.pitch - c.pitch);
    out.rest = !out.keys?.length;
    return out;
  });
  importPedals(t, i, top, beats);
  return { id: newId(), masterBarId: mb.id, beats };
}

/** Drums: GM percussion numbers (or the track's own articulation list) → kit pieces. */
export function drumBar(t: alphaTab.model.Track, i: number, mb: MasterBar, report: Report): Bar {
  const beats = liveBeats(t.staves[0]?.bars[i]).map(b => {
    const out = bareBeat(b, report);
    const seen = new Set<DrumPiece>();
    for (const n of b.notes) {
      const listed = t.percussionArticulations[n.percussionArticulation];
      const midi = listed ? listed.outputMidiNumber : n.percussionArticulation;
      const piece = drumPieceForMidi(midi);
      if (!piece) {
        report.add('drum sounds without a FretFlow kit piece');
        continue;
      }
      if (!seen.has(piece)) {
        seen.add(piece);
        out.hits ??= [];
        const dynamic = n.isGhost ? 'ghost' : n.accentuated !== at.AccentuationType.None ? 'accent' : undefined;
        out.hits.push({ id: newId(), piece, source: 'import', ...(dynamic ? { dynamic } : {}) });
      }
    }
    out.hits?.sort((a, c) => DRUM_ORDER.indexOf(a.piece) - DRUM_ORDER.indexOf(c.piece));
    out.rest = !out.hits?.length;
    return out;
  });
  return beats.length ? { id: newId(), masterBarId: mb.id, beats } : createBar(mb);
}
