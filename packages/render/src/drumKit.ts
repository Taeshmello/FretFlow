import * as alphaTab from '@coderline/alphatab';
import { DRUM_ORDER, DRUM_PIECES, type DrumHit, type DrumPiece } from '@fretflow/score-model';

const at = alphaTab.model;

const F = at.MusicFontSymbol;
/** Staff line and note heads per piece, as in alphaTab's GP7 default drum kit. */
const DRUM_LOOK: Record<DrumPiece, [name: string, line: number, head: alphaTab.model.MusicFontSymbol, half: alphaTab.model.MusicFontSymbol, whole: alphaTab.model.MusicFontSymbol]> = {
  kick: ['Kick Drum', 7, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  snare: ['Snare', 3, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  hihatClosed: ['Charley', -1, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
  hihatOpen: ['Charley', -1, F.NoteheadCircleX, F.NoteheadCircleX, F.NoteheadCircleX],
  crash: ['Crash High', -2, F.NoteheadHeavyX, F.NoteheadHeavyX, F.NoteheadHeavyX],
  ride: ['Ride', 0, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
  tomHigh: ['Tom High', 2, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  tomMid: ['Tom Medium', 4, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  tomFloor: ['Very Low Floor Tom', 5, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  sideStick: ['Snare', 3, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
  tomLow: ['Tom Low', 5, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  hihatPedal: ['Charley', 9, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
};

/**
 * The track's own articulation list, one entry per kit piece in DRUM_ORDER. A note's
 * percussionArticulation is an index into this list: that is how Guitar Pro files
 * store drums, so export, import, playback and rendering agree.
 */
export function drumArticulations(): alphaTab.model.InstrumentArticulation[] {
  return DRUM_ORDER.map(piece => {
    const [name, line, head, half, whole] = DRUM_LOOK[piece];
    const midi = DRUM_PIECES[piece].midi;
    return new at.InstrumentArticulation(name, line, midi, head, half, whole, F.None, undefined, midi);
  });
}

export function drumNote(piece: DrumPiece, dynamic: DrumHit['dynamic']): alphaTab.model.Note {
  const n = new at.Note();
  n.percussionArticulation = DRUM_ORDER.indexOf(piece);
  if (dynamic === 'accent') {
    n.accentuated = at.AccentuationType.Normal;
  } else if (dynamic === 'ghost') {
    n.isGhost = true;
  }
  return n;
}
