import { cursorBeat, cursorNote, cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import { DRUM_PIECES, fretFor, isFretted, pitchName } from '@fretflow/score-model';
import { Lock, LockOpen } from 'lucide-react';
import { nameChord } from '../chordName';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

/** What is under the cursor: the note on a string, a piano chord or the drum hits of the beat. */
export function SelectionSection({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const beat = cursorBeat(score, cursor);
  const note = cursorNote(score, cursor);
  const fretted = isFretted(track.instrument);
  const sounding = fretted ? (beat?.notes ?? []).map(n => n.pitch) : (beat?.keys ?? []).map(k => k.pitch);
  const detected = nameChord(sounding);
  const chordRow = detected && beat && (
    <div className="chord-detect">
      <span>
        Chord <b>{detected}</b>
      </span>
      {beat.chord !== detected && (
        <button type="button" className="link" onClick={() => dispatch({ type: 'setChord', beatId: beat.id, chord: detected })}>
          Use as chord symbol
        </button>
      )}
    </div>
  );
  const elsewhere = note
    ? track.tuning
        .map((_, i) => i + 1)
        .filter(s => s !== note.string)
        .map(s => ({ string: s, fret: fretFor(track, s, note.pitch) }))
        .filter((x): x is { string: number; fret: number } => x.fret !== null)
    : [];

  return fretted ? (
    <section>
      <h3>Selected note</h3>
      {note ? (
        <>
          <p className="note-name">
            <b>{pitchName(note.pitch)}</b>
            <span className="mono">
              string {note.string} · fret {note.fret}
            </span>
          </p>
          <div className="lock-row">
            {note.fingeringLocked ? <Lock size={16} /> : <LockOpen size={16} />}
            <span>{note.fingeringLocked ? 'Fingering locked' : 'Fingering unlocked'}</span>
            <button type="button" className="link" onClick={() => dispatch({ type: 'toggleFingeringLock' })}>
              {note.fingeringLocked ? 'Unlock' : 'Lock'}
            </button>
          </div>
          {elsewhere.length > 0 && (
            <>
              <p className="muted small">Same pitch elsewhere</p>
              <div className="chips">
                {elsewhere.map(x => (
                  <button key={x.string} type="button" className="chip mono" onClick={() => dispatch({ type: 'placeFret', string: x.string, fret: x.fret })}>
                    str {x.string} · fret {x.fret}
                  </button>
                ))}
              </div>
            </>
          )}
          {chordRow}
        </>
      ) : (
        <p className="note-name empty">
          <b>{beat?.rest ? 'Rest' : 'Empty'}</b>
          <span className="mono">string {cursor.string}</span>
        </p>
      )}
    </section>
  ) : (
    <section>
      <h3>{track.instrument === 'piano' ? 'Selected chord' : 'Selected beat'}</h3>
      {track.instrument === 'piano' ? (
        beat?.keys?.length ? (
          <>
            <p className="note-name">
              <b>{beat.keys.map(k => pitchName(k.pitch)).join(' ')}</b>
              <span className="mono">{beat.keys.length === 1 ? '1 key' : `${beat.keys.length} keys`}</span>
            </p>
            {chordRow}
          </>
        ) : (
          <p className="note-name empty">
            <b>{beat?.rest ? 'Rest' : 'Empty'}</b>
            <span className="mono">press A–G or a key below</span>
          </p>
        )
      ) : beat?.hits?.length ? (
        <>
          <div className="chips">
            {beat.hits.map(h => (
              <button
                key={h.id}
                type="button"
                className="chip"
                aria-pressed={h.dynamic !== undefined}
                title="Click for accent, again for ghost note, again for normal"
                onClick={() => dispatch({ type: 'cycleHitDynamic', piece: h.piece })}
              >
                {h.dynamic === 'ghost' ? `(${DRUM_PIECES[h.piece].label})` : DRUM_PIECES[h.piece].label}
                {h.dynamic === 'accent' ? ' >' : ''}
              </button>
            ))}
          </div>
          <p className="muted small">Click a piece for accent → ghost → normal.</p>
        </>
      ) : (
        <p className="note-name empty">
          <b>{beat?.rest ? 'Rest' : 'Empty'}</b>
          <span className="mono">press 1–9, 0 or a pad</span>
        </p>
      )}
    </section>
  );
}
