import { cursorBeat, cursorNote, cursorTrack, MAX_TRACKS, tempoAt, type Command, type EditorState } from '@fretflow/editor-core';
import { barFill, pitchName, TUNING_PRESETS, type BendAmount, type BendType, type NoteEffects } from '@fretflow/score-model';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
  muted: ReadonlySet<number>;
  onToggleMute: (trackIndex: number) => void;
}

const KEY_NAMES = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];

function Toggle({ label, on, onClick, hint }: { label: string; on: boolean; onClick: () => void; hint: string }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick} title={hint}>
      {label}
    </button>
  );
}

export function Inspector({ editor, dispatch, muted, onToggleMute }: Props) {
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const beat = cursorBeat(score, cursor);
  const note = cursorNote(score, cursor);
  const mb = score.masterBars[cursor.barIndex];
  const fill = barFill(track.bars[cursor.barIndex], mb);
  const fx: NoteEffects = note?.effects ?? {};
  const preset = TUNING_PRESETS.find(p => p.tuning.join() === track.tuning.join());
  const setFx = (key: 'bend' | 'slide' | 'vibrato', value: NoteEffects[typeof key]) =>
    dispatch({ type: 'setEffect', key, value });

  return (
    <aside className="inspector" aria-label="Inspector">
      <section>
        <h3>음</h3>
        {note ? (
          <p className="big">
            {note.fret}프렛 · {pitchName(note.pitch)} <small>({cursor.string}번 현)</small>
          </p>
        ) : (
          <p className="muted">{beat?.rest ? '쉼표' : '빈 칸'} · 숫자로 입력</p>
        )}
        <div className="chips">
          <Toggle label="H/P" hint="H" on={!!fx.hammerPull} onClick={() => dispatch({ type: 'hammer' })} />
          <Toggle label="P.M." hint="M" on={!!fx.palmMute} onClick={() => dispatch({ type: 'palmMute' })} />
          <Toggle label="✕ Dead" hint="X" on={!!fx.dead} onClick={() => dispatch({ type: 'dead' })} />
          <Toggle label="Let ring" hint="L" on={!!fx.letRing} onClick={() => dispatch({ type: 'letRing' })} />
          <Toggle label="Tie" hint="T" on={!!note?.tieFromPrev} onClick={() => dispatch({ type: 'tie' })} />
        </div>
        <label className="field">
          슬라이드
          <select value={fx.slide ?? ''} disabled={!note} onChange={e => setFx('slide', (e.target.value || undefined) as NoteEffects['slide'])}>
            <option value="">없음</option>
            <option value="legato">레가토</option>
            <option value="shift">시프트</option>
            <option value="in">슬라이드 인</option>
            <option value="out">슬라이드 아웃</option>
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            벤드
            <select
              value={fx.bend?.type ?? ''}
              disabled={!note}
              onChange={e => setFx('bend', e.target.value ? { type: e.target.value as BendType, amount: fx.bend?.amount ?? 1 } : undefined)}
            >
              <option value="">없음</option>
              <option value="bend">벤드</option>
              <option value="release">릴리즈</option>
              <option value="bendRelease">벤드·릴리즈</option>
              <option value="prebend">프리벤드</option>
            </select>
          </label>
          <label className="field">
            폭
            <select
              value={fx.bend?.amount ?? 1}
              disabled={!fx.bend}
              onChange={e => fx.bend && setFx('bend', { ...fx.bend, amount: Number(e.target.value) as BendAmount })}
            >
              <option value={0.5}>½</option>
              <option value={1}>Full</option>
              <option value={1.5}>1½</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label className="field">
            비브라토
            <select value={fx.vibrato ?? ''} disabled={!note} onChange={e => setFx('vibrato', (e.target.value || undefined) as NoteEffects['vibrato'])}>
              <option value="">없음</option>
              <option value="slight">약하게</option>
              <option value="wide">넓게</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <h3>
          마디 {cursor.barIndex + 1}
          <span className={`fill fill-${fill.state}`}>{fill.state === 'full' ? '가득' : fill.state === 'under' ? '모자람' : '넘침'}</span>
        </h3>
        <div className="field-row">
          <label className="field">
            박자
            <select
              value={mb.timeSig.join('/')}
              onChange={e => dispatch({ type: 'setMasterBar', prop: 'timeSig', value: e.target.value.split('/').map(Number) })}
            >
              {['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '3/8', '6/8', '7/8', '9/8', '12/8'].map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            조표
            <select value={mb.keySig} onChange={e => dispatch({ type: 'setMasterBar', prop: 'keySig', value: Number(e.target.value) })}>
              {KEY_NAMES.map((k, i) => (
                <option key={k} value={i - 7}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            템포
            <input
              type="number"
              min={20}
              max={400}
              value={mb.tempo ?? ''}
              placeholder={String(tempoAt(score, cursor.barIndex))}
              onChange={e => dispatch({ type: 'setMasterBar', prop: 'tempo', value: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="field">
          구간 이름
          <input
            value={mb.section ?? ''}
            placeholder="예: Verse"
            onChange={e => dispatch({ type: 'setMasterBar', prop: 'section', value: e.target.value || undefined })}
          />
        </label>
        <div className="chips">
          <Toggle label="𝄆 반복 시작" hint="" on={!!mb.repeatStart} onClick={() => dispatch({ type: 'repeatStart' })} />
          <Toggle label={`𝄇 반복 끝${mb.repeatEnd ? ` ×${mb.repeatEnd}` : ''}`} hint="" on={!!mb.repeatEnd} onClick={() => dispatch({ type: 'repeatEnd' })} />
        </div>
        <div className="chips">
          <button type="button" className="chip" onClick={() => dispatch({ type: 'insertBar', after: false })}>앞에 삽입</button>
          <button type="button" className="chip" onClick={() => dispatch({ type: 'insertBar', after: true })}>뒤에 삽입</button>
          <button type="button" className="chip" onClick={() => dispatch({ type: 'duplicateBar' })}>복제</button>
          <button type="button" className="chip danger" disabled={score.masterBars.length <= 1} onClick={() => dispatch({ type: 'deleteBar' })}>삭제</button>
        </div>
      </section>

      <section>
        <h3>트랙</h3>
        <label className="field">
          이름
          <input value={track.name} onChange={e => dispatch({ type: 'renameTrack', name: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            튜닝
            <select
              value={preset?.id ?? 'custom'}
              onChange={e => {
                const p = TUNING_PRESETS.find(x => x.id === e.target.value);
                if (p) {
                  dispatch({ type: 'setTuning', tuning: p.tuning });
                }
              }}
            >
              {TUNING_PRESETS.filter(p => p.tuning.length === track.tuning.length).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {!preset && <option value="custom">사용자 지정</option>}
            </select>
          </label>
          <label className="field">
            카포
            <input type="number" min={0} max={12} value={track.capo} onChange={e => dispatch({ type: 'setCapo', capo: Number(e.target.value) })} />
          </label>
        </div>
        <div className="strings">
          {track.tuning.map((p, i) => (
            <label key={i} className="string-tune" title={`${i + 1}번 현`}>
              <span>{i + 1}</span>
              <select
                value={p}
                onChange={e => dispatch({ type: 'setTuning', tuning: track.tuning.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
              >
                {Array.from({ length: 36 }, (_, k) => p - 12 + k).map(v => (
                  <option key={v} value={v}>
                    {pitchName(v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="muted small">튜닝·카포를 바꾸면 프렛(운지)은 그대로, 음높이가 바뀝니다.</p>
        <div className="chips">
          {score.tracks.map((t, i) => (
            <Toggle key={t.id} label={`${muted.has(i) ? '🔇' : '🔊'} ${t.name}`} hint="재생에서 이 트랙 끄기/켜기" on={muted.has(i)} onClick={() => onToggleMute(i)} />
          ))}
        </div>
        <div className="chips">
          {score.tracks.length < MAX_TRACKS && (
            <>
              <button type="button" className="chip" onClick={() => dispatch({ type: 'addTrack', instrument: 'guitar' })}>+ 기타 트랙</button>
              <button type="button" className="chip" onClick={() => dispatch({ type: 'addTrack', instrument: 'bass' })}>+ 베이스 트랙</button>
            </>
          )}
          {score.tracks.length > 1 && (
            <button type="button" className="chip danger" onClick={() => dispatch({ type: 'removeTrack' })}>트랙 삭제</button>
          )}
        </div>
      </section>
    </aside>
  );
}
