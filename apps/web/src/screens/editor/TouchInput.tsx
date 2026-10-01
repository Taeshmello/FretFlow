import { cursorBeat, cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import { isFretted, pitchName, type BendAmount, type DurationBase, type HarmonicKind } from '@fretflow/score-model';
import { DrumPad } from '../../ui/DrumPad';
import { PianoKeyboard } from '../../ui/PianoKeyboard';
import { useMemo, useState } from 'react';
import { previewPitch } from '../../audio/preview';
import { recommendScales, scaleToneKind } from '../../ui/scaleGuide';
import { suggestNextNotes } from '../../ui/soloGuide';

interface Props {
  editor: EditorState;
  dispatch: (command: Command) => void;
  octave: number;
  onOctave: (octave: number) => void;
}

const DURATIONS: { value: DurationBase; label: string }[] = [
  { value: 1, label: '1' }, { value: 2, label: '½' }, { value: 4, label: '¼' },
  { value: 8, label: '⅛' }, { value: 16, label: '1/16' }, { value: 32, label: '1/32' },
];

const BEND_AMOUNTS: [BendAmount, string][] = [[0.5, '½'], [1, 'full'], [1.5, '1½'], [2, '2']];
const HARMONIC_KINDS: [HarmonicKind, string][] = [['natural', 'N.H.'], ['artificial', 'A.H.'], ['pinch', 'P.H.'], ['tap', 'T.H.'], ['semi', 'S.H.'], ['feedback', 'Fdbk']];

const TECHNIQUES: { label: string; command: Command }[] = [
  { label: 'h/p', command: { type: 'hammer' } },
  { label: 'slide', command: { type: 'slide' } },
  { label: 'bend', command: { type: 'bend' } },
  { label: 'vib', command: { type: 'vibrato' } },
  { label: 'PM', command: { type: 'palmMute' } },
  { label: 'x', command: { type: 'dead' } },
  { label: 'tap', command: { type: 'tap' } },
  { label: 'harm', command: { type: 'harmonic' } },
  { label: 'tie', command: { type: 'tie' } },
];

/** Touch controls for the score cursor at tablet and phone widths. */
export function TouchInput({ editor, dispatch, octave, onOctave }: Props) {
  const [highFrets, setHighFrets] = useState(false);
  const [guideOn, setGuideOn] = useState(false);
  const [guideView, setGuideView] = useState<'scale' | 'next'>('scale');
  const [selectedScaleId, setSelectedScaleId] = useState('');
  const guide = useMemo(() => (guideOn ? suggestNextNotes(editor.score, editor.cursor, 15) : null), [guideOn, editor.score, editor.cursor]);
  const scales = useMemo(() => recommendScales(guide?.chord ?? null), [guide?.chord]);
  const selectedScale = scales.find(s => s.id === selectedScaleId) ?? scales[0];
  const track = cursorTrack(editor.score, editor.cursor);
  const beat = cursorBeat(editor.score, editor.cursor);
  const note = beat?.notes.find(item => item.string === editor.cursor.string);
  const fretted = isFretted(track.instrument);
  const frets = highFrets ? Array.from({ length: 12 }, (_, i) => i + 13) : Array.from({ length: 13 }, (_, i) => i);

  return (
    <section className="touch-input" aria-label="Touch input">
      <div className="touch-context">
        <button type="button" onClick={() => dispatch({ type: 'moveBeat', delta: -1 })} aria-label="Previous beat">‹</button>
        <span>Bar {editor.cursor.barIndex + 1}{fretted ? <> · {note ? `${pitchName(note.pitch)} · ` : ''}string {editor.cursor.string}{note ? ` · fret ${note.fret}` : ''}</> : <> · beat {editor.cursor.beatIndex + 1}</>}</span>
        <button type="button" onClick={() => dispatch({ type: 'moveBeat', delta: 1 })} aria-label="Next beat">›</button>
        {fretted && <button type="button" className="touch-guide-toggle" aria-pressed={guideOn} onClick={() => setGuideOn(v => !v)}>Guide</button>}
      </div>
      {fretted && guide && (
        <div className="touch-guide" role="group" aria-label="Solo note guide">
          <div className="touch-guide-modes" role="group" aria-label="Solo guide view">
            <button type="button" aria-pressed={guideView === 'scale'} onClick={() => setGuideView('scale')}>Scale map</button>
            <button type="button" aria-pressed={guideView === 'next'} onClick={() => setGuideView('next')}>Next notes</button>
          </div>
          {guideView === 'scale' && selectedScale && <select aria-label="Suggested scale" value={selectedScale.id} onChange={e => setSelectedScaleId(e.target.value)}>
            {scales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>}
          <p className="muted small">Theory-based, not generative AI · {guideView === 'scale' && selectedScale ? `${selectedScale.reason} String ${editor.cursor.string}: gold = root, blue = chord, cyan = scale.` : guide.message}</p>
          <div className="touch-guide-notes">
            {(guideView === 'next' ? guide.notes : selectedScale ? frets.flatMap(fret => {
              const string = editor.cursor.string;
              const pitch = track.tuning[string - 1] + track.capo + fret;
              const kind = scaleToneKind(selectedScale, pitch);
              return kind ? [{ string, fret, pitch, kind, reason: `${selectedScale.name} · ${kind} tone` }] : [];
            }) : []).map(n => (
              <span key={`${n.string}:${n.fret}`} className={`guide-chip guide-${n.kind}`}>
                <button type="button" title={n.reason} onClick={() => dispatch({ type: 'placeFret', string: n.string, fret: n.fret })}>
                  str {n.string} · {n.fret} <small>{pitchName(n.pitch)}</small>
                </button>
                <button type="button" className="guide-listen" aria-label={`Listen to string ${n.string}, fret ${n.fret}`} onClick={() => previewPitch(n.pitch, track.instrument === 'bass' ? 'bass' : 'guitar')}>♪</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="touch-strip" role="group" aria-label="Duration">
        {DURATIONS.map(d => <button key={d.value} type="button" aria-pressed={beat?.duration.base === d.value} onClick={() => dispatch({ type: 'setDuration', base: d.value })}>{d.label}</button>)}
      </div>
      {!fretted && (
        <div className="touch-strip" role="group" aria-label="Beat">
          <button type="button" aria-pressed={!!beat?.rest} onClick={() => dispatch({ type: 'rest' })}>Rest</button>
          {track.instrument === 'piano' && <button type="button" onClick={() => dispatch({ type: 'tie' })}>Tie</button>}
          {track.instrument === 'piano' && <button type="button" aria-pressed={beat?.pedal !== undefined} onClick={() => dispatch({ type: 'pedal' })}>{beat?.pedal === 'up' ? 'Ped. up' : 'Ped.'}</button>}
          <button type="button" onClick={() => dispatch({ type: 'insertBeat' })}>+ Beat</button>
          <button type="button" onClick={() => dispatch({ type: 'deleteNote' })}>Clear</button>
        </div>
      )}
      {track.instrument === 'piano' && <PianoKeyboard editor={editor} dispatch={dispatch} octave={octave} onOctave={onOctave} span={2} />}
      {track.instrument === 'drums' && <DrumPad editor={editor} dispatch={dispatch} />}
      {fretted && <>
      <div className="touch-strip" role="group" aria-label="Technique">
        {TECHNIQUES.map(t => <button key={t.label} type="button" onClick={() => dispatch(t.command)}>{t.label}</button>)}
        <button type="button" aria-pressed={!!beat?.tremolo} disabled={!beat || beat.rest} onClick={() => dispatch({ type: 'tremolo' })}>{beat?.tremolo ? `trem 1/${beat.tremolo}` : 'trem'}</button>
        <button type="button" aria-pressed={!!beat?.rest} onClick={() => dispatch({ type: 'rest' })}>Rest</button>
      </div>
      {note?.effects.bend && (
        <div className="touch-strip" role="group" aria-label="Bend amount">
          {BEND_AMOUNTS.map(([amount, label]) => (
            <button key={amount} type="button" aria-pressed={note.effects.bend?.amount === amount} onClick={() => dispatch({ type: 'setEffect', key: 'bend', value: { type: note.effects.bend?.type ?? 'bend', amount } })}>
              bend {label}
            </button>
          ))}
        </div>
      )}
      {note?.effects.harmonic && (
        <div className="touch-strip" role="group" aria-label="Harmonic">
          {HARMONIC_KINDS.map(([kind, label]) => (
            <button key={kind} type="button" aria-pressed={note.effects.harmonic === kind} onClick={() => dispatch({ type: 'setEffect', key: 'harmonic', value: kind })}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="touch-strings" role="group" aria-label="String">
        {track.tuning.map((pitch, i) => <button key={i} type="button" aria-pressed={editor.cursor.string === i + 1} onClick={() => dispatch({ type: 'setCursor', cursor: { ...editor.cursor, string: i + 1 } })}>{i + 1} {pitchName(pitch + track.capo).replace(/-?\d+$/, '')}</button>)}
      </div>
      <div className="touch-frets" role="group" aria-label="Fret">
        {frets.map(fret => <button key={fret} type="button" aria-pressed={note?.fret === fret} onClick={() => dispatch({ type: 'placeFret', string: editor.cursor.string, fret })}>{fret}</button>)}
        <button type="button" className="touch-more" aria-pressed={highFrets} onClick={() => setHighFrets(v => !v)}>{highFrets ? '0–12' : '13–24'}</button>
        <button type="button" className="touch-delete" onClick={() => dispatch({ type: 'deleteNote' })}>Delete</button>
      </div>
      </>}
    </section>
  );
}
