import { cursorBeat, cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import { pitchName, type DurationBase } from '@fretflow/score-model';
import { useMemo, useState } from 'react';
import { previewPitch } from '../../audio/preview';
import { suggestNextNotes } from '../../ui/soloGuide';

interface Props {
  editor: EditorState;
  dispatch: (command: Command) => void;
}

const DURATIONS: { value: DurationBase; label: string }[] = [
  { value: 1, label: '1' }, { value: 2, label: '½' }, { value: 4, label: '¼' },
  { value: 8, label: '⅛' }, { value: 16, label: '1/16' }, { value: 32, label: '1/32' },
];

const TECHNIQUES: { label: string; command: Command }[] = [
  { label: 'h/p', command: { type: 'hammer' } },
  { label: 'slide', command: { type: 'slide' } },
  { label: 'bend', command: { type: 'bend' } },
  { label: 'vib', command: { type: 'vibrato' } },
  { label: 'PM', command: { type: 'palmMute' } },
  { label: 'x', command: { type: 'dead' } },
  { label: 'tie', command: { type: 'tie' } },
];

/** Touch controls for the score cursor at tablet and phone widths. */
export function TouchInput({ editor, dispatch }: Props) {
  const [highFrets, setHighFrets] = useState(false);
  const [guideOn, setGuideOn] = useState(false);
  const guide = useMemo(() => (guideOn ? suggestNextNotes(editor.score, editor.cursor, 15) : null), [guideOn, editor.score, editor.cursor]);
  const track = cursorTrack(editor.score, editor.cursor);
  const beat = cursorBeat(editor.score, editor.cursor);
  const note = beat?.notes.find(item => item.string === editor.cursor.string);
  const frets = highFrets ? Array.from({ length: 12 }, (_, i) => i + 13) : Array.from({ length: 13 }, (_, i) => i);

  return (
    <section className="touch-input" aria-label="터치 입력 패널">
      <div className="touch-context">
        <button type="button" onClick={() => dispatch({ type: 'moveBeat', delta: -1 })} aria-label="이전 박">‹</button>
        <span>마디 {editor.cursor.barIndex + 1} · {note ? `${pitchName(note.pitch)} · ` : ''}{editor.cursor.string}번 현{note ? ` · ${note.fret}프렛` : ''}</span>
        <button type="button" onClick={() => dispatch({ type: 'moveBeat', delta: 1 })} aria-label="다음 박">›</button>
        <button type="button" className="touch-guide-toggle" aria-pressed={guideOn} onClick={() => setGuideOn(v => !v)}>가이드</button>
      </div>
      {guide && (
        <div className="touch-guide" role="group" aria-label="솔로 음 가이드">
          <p className="muted small">규칙 기반 · 생성형 AI 아님 · {guide.message}</p>
          <div className="touch-guide-notes">
            {guide.notes.map(n => (
              <span key={`${n.string}:${n.fret}`} className={`guide-chip guide-${n.kind}`}>
                <button type="button" title={n.reason} onClick={() => dispatch({ type: 'placeFret', string: n.string, fret: n.fret })}>
                  {n.string}번 · {n.fret} <small>{pitchName(n.pitch)}</small>
                </button>
                <button type="button" className="guide-listen" aria-label={`${n.string}번 현 ${n.fret}프렛 미리 듣기`} onClick={() => previewPitch(n.pitch)}>♪</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="touch-strip" role="group" aria-label="음가">
        {DURATIONS.map(d => <button key={d.value} type="button" aria-pressed={beat?.duration.base === d.value} onClick={() => dispatch({ type: 'setDuration', base: d.value })}>{d.label}</button>)}
      </div>
      <div className="touch-strip" role="group" aria-label="기법">
        {TECHNIQUES.map(t => <button key={t.label} type="button" onClick={() => dispatch(t.command)}>{t.label}</button>)}
        <button type="button" aria-pressed={!!beat?.rest} onClick={() => dispatch({ type: 'rest' })}>쉼표</button>
      </div>
      <div className="touch-strings" role="group" aria-label="현 선택">
        {track.tuning.map((pitch, i) => <button key={i} type="button" aria-pressed={editor.cursor.string === i + 1} onClick={() => dispatch({ type: 'setCursor', cursor: { ...editor.cursor, string: i + 1 } })}>{i + 1} {pitchName(pitch + track.capo).replace(/-?\d+$/, '')}</button>)}
      </div>
      <div className="touch-frets" role="group" aria-label="프렛 선택">
        {frets.map(fret => <button key={fret} type="button" aria-pressed={note?.fret === fret} onClick={() => dispatch({ type: 'placeFret', string: editor.cursor.string, fret })}>{fret}</button>)}
        <button type="button" className="touch-more" aria-pressed={highFrets} onClick={() => setHighFrets(v => !v)}>{highFrets ? '0–12' : '13–24'}</button>
        <button type="button" className="touch-delete" onClick={() => dispatch({ type: 'deleteNote' })}>삭제</button>
      </div>
    </section>
  );
}
