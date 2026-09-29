import type { Command, EditorState } from '@fretflow/editor-core';
import { cursorBeat, cursorTrack } from '@fretflow/editor-core';
import { pitchName } from '@fretflow/score-model';
import { useMemo, useState } from 'react';
import { previewPitch } from '../audio/preview';
import { suggestNextNotes } from './soloGuide';

const FRETS = 15;
const INLAYS = new Set([3, 5, 7, 9, 15]);

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

/**
 * Virtual fretboard: click puts that fret on the cursor beat. The cursor note is a
 * filled marker with its pitch letter; the same pitch elsewhere is a dashed ring.
 */
export function Fretboard({ editor, dispatch }: Props) {
  const [guideOn, setGuideOn] = useState(false);
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const beat = cursorBeat(score, cursor);
  const current = beat?.notes.find(n => n.string === cursor.string);
  const played = new Map(beat?.notes.map(n => [`${n.string}:${n.fret}`, n]) ?? []);
  const rows = track.tuning.length;
  const guide = useMemo(() => suggestNextNotes(score, cursor, FRETS), [score, cursor]);
  const suggestions = new Map(guideOn ? guide.notes.map(n => [`${n.string}:${n.fret}`, n]) : []);

  return (
    <div className="fretboard card" role="group" aria-label="Fretboard">
      <div className="fb-guide-head">
        <button type="button" className="chip" aria-pressed={guideOn} onClick={() => setGuideOn(on => !on)}>Solo guide {guideOn ? 'off' : 'on'}</button>
        <span className="muted small">Rule-based, not generative AI</span>
        {guideOn && <span className="muted small">{guide.message} ⌥/Alt+click to listen.</span>}
      </div>
      <div className="fb-names">
        {track.tuning.map((open, i) => (
          <span key={i} className={i + 1 === cursor.string ? 'is-cursor' : ''}>
            {pitchName(open + track.capo).replace(/-?\d+$/, '')}
          </span>
        ))}
      </div>
      <div className="fb-body">
        <div className="fb-wood" style={{ gridTemplateColumns: `repeat(${FRETS + 1}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: FRETS + 1 }, (_, fret) => (
            <span key={`i${fret}`} className="fb-inlay" style={{ gridColumn: fret + 1, gridRow: `1 / ${rows + 1}` }}>
              {fret === 12 ? (
                <>
                  <i />
                  <i />
                </>
              ) : INLAYS.has(fret) ? (
                <i />
              ) : null}
            </span>
          ))}
          {track.tuning.map((open, i) => {
            const string = i + 1;
            return Array.from({ length: FRETS + 1 }, (_, fret) => {
              const pitch = open + track.capo + fret;
              const note = played.get(`${string}:${fret}`);
              const isCursorNote = note && current && note.id === current.id;
              const same = current && !note && pitch === current.pitch;
              const hint = suggestions.get(`${string}:${fret}`);
              return (
                <button
                  key={`${string}:${fret}`}
                  type="button"
                  className={`fb-cell${fret === 0 ? ' is-nut' : ''}`}
                  style={{ gridColumn: fret + 1, gridRow: string }}
                  title={`String ${string}, fret ${fret} · ${pitchName(pitch)}${hint ? ` · ${hint.reason}` : ''} · ⌥/Alt+click to listen`}
                  onClick={e => (e.altKey ? previewPitch(pitch) : dispatch({ type: 'placeFret', string, fret }))}
                >
                  {note && <span className={`fb-dot${isCursorNote ? ' is-cursor' : ''}`}>{pitchName(pitch).replace(/-?\d+$/, '')}</span>}
                  {same && <span className="fb-ring" />}
                  {hint && !note && <span className={`fb-hint fb-hint-${hint.kind}`} aria-hidden="true" />}
                </button>
              );
            });
          })}
        </div>
        <div className="fb-numbers" style={{ gridTemplateColumns: `repeat(${FRETS + 1}, 1fr)` }}>
          {Array.from({ length: FRETS + 1 }, (_, f) => (
            <span key={f}>{f === 0 ? '' : f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Keyboard cheat sheet next to the fretboard (design page 1). */
export function KeyboardHints({ onAll }: { onAll: () => void }) {
  return (
    <div className="kb-hints">
      <h3>Keyboard</h3>
      <p>
        <b>0–9</b> fret · <b>↑ ↓</b> string · <b>← →</b> beat
      </p>
      <p>
        <b>+ −</b> duration · <b>.</b> dotted · <b>R</b> rest
      </p>
      <p>
        <b>H P S B V M X L</b> techniques
      </p>
      <p>
        <button type="button" className="link" onClick={onAll}>
          <b>⌘K</b> all commands
        </button>
      </p>
    </div>
  );
}
