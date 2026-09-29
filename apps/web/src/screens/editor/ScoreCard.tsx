import type * as alphaTab from '@coderline/alphatab';
import { cursorBeat, cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import type { Converted } from '@fretflow/render';
import { TUNING_PRESETS } from '@fretflow/score-model';
import type { Audition } from '../../app/store';
import { ScoreView } from '../../score/ScoreView';
import type { ViewMode } from '../../score/useAlphaTab';
import { Popover } from '../../ui/Popover';
import { BarSettings, TrackSettings } from '../../ui/Settings';

interface Props {
  api: alphaTab.AlphaTabApi | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  editor: EditorState;
  audition: Audition | null;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  dispatch: (c: Command) => void;
  onConverted: (c: Converted) => void;
  muted: ReadonlySet<number>;
  onToggleMute: (i: number) => void;
  editable: boolean;
}

/** Score in a card with a track / bar header (design page 1). */
export function ScoreCard(p: Props) {
  const { editor, dispatch } = p;
  const track = cursorTrack(editor.score, editor.cursor);
  const trackIndex = editor.score.tracks.indexOf(track);
  const tuning = TUNING_PRESETS.find(t => t.tuning.join() === track.tuning.join())?.name ?? 'Custom';
  const stringInstrument = track.instrument === 'guitar' || track.instrument === 'bass';
  const mb = editor.score.masterBars[editor.cursor.barIndex];
  const beat = cursorBeat(editor.score, editor.cursor);

  return (
    <section className="score-card card" aria-label="Score">
      <header className="score-head">
        <Popover
          label="Track settings"
          trigger={() => (
            <button type="button" className="head-btn">
              <b>{({ guitar: 'Gtr', bass: 'Bass', piano: 'Piano', drums: 'Drums' })[track.instrument]} {trackIndex + 1}</b>
              <span className="muted">
                {stringInstrument ? `${tuning.replace('Standard', 'E standard')} · capo ${track.capo}` : track.instrument === 'drums' ? 'Percussion staff' : 'Grand staff'}
              </span>
            </button>
          )}
        >
          <TrackSettings editor={editor} dispatch={dispatch} muted={p.muted} onToggleMute={p.onToggleMute} />
        </Popover>
        <Popover
          label="Bar settings"
          trigger={() => (
            <button type="button" className="head-btn muted mono">
              {mb.timeSig.join('/')}
            </button>
          )}
        >
          <BarSettings editor={editor} dispatch={dispatch} />
        </Popover>
        <span className="spacer" />
        {stringInstrument && <div className="segmented small" role="radiogroup" aria-label="Staves">
          <button type="button" role="radio" aria-checked={p.viewMode === 'scoreTab'} onClick={() => p.onViewMode('scoreTab')}>
            Staff + TAB
          </button>
          <button type="button" role="radio" aria-checked={p.viewMode === 'tab'} onClick={() => p.onViewMode('tab')}>
            TAB
          </button>
          <button type="button" role="radio" aria-checked={p.viewMode === 'score'} onClick={() => p.onViewMode('score')}>
            Staff
          </button>
        </div>}
        {stringInstrument && <button
          type="button"
          className="head-btn muted"
          aria-pressed={editor.settings.advanceAfterInput}
          title="Move to the next beat after entering a fret"
          onClick={() => dispatch({ type: 'settings', settings: { advanceAfterInput: !editor.settings.advanceAfterInput } })}
        >
          {editor.settings.advanceAfterInput ? 'Insert mode' : 'Overwrite mode'}
        </button>}
      </header>
      {p.editable && beat && (
        <div className="chord-strip">
          <label htmlFor="score-chord-symbol">Chord</label>
          <input
            id="score-chord-symbol"
            type="text"
            maxLength={32}
            value={beat.chord ?? ''}
            placeholder="e.g. Am7, G/B"
            aria-label="Chord symbol of the selected beat"
            onChange={e => dispatch({ type: 'setChord', beatId: beat.id, chord: e.target.value })}
          />
          <label htmlFor="score-lyric">Lyric</label>
          <input
            id="score-lyric"
            type="text"
            maxLength={160}
            value={beat.lyric ?? ''}
            placeholder="Lyric for the selected beat"
            aria-label="Lyric of the selected beat"
            onChange={e => dispatch({ type: 'setLyric', beatId: beat.id, lyric: e.target.value })}
          />
          <span className="muted small mono">Bar {editor.cursor.barIndex + 1} · beat {editor.cursor.beatIndex + 1}</span>
        </div>
      )}
      <div className="score-scroll" ref={p.scrollRef}>
        <ScoreView
          api={p.api}
          containerRef={p.containerRef}
          editor={editor}
          audition={p.audition}
          viewMode={stringInstrument ? p.viewMode : 'score'}
          dispatch={dispatch}
          onConverted={p.onConverted}
        />
      </div>
    </section>
  );
}
