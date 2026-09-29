import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PrintOptions } from '../app/files';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
    }
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''}`} onClose={onClose} onCancel={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="icon" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

interface ExportProps {
  barCount: number;
  selection: [number, number] | null;
  onClose: () => void;
  onPdf: (o: PrintOptions) => void;
  onMidi: () => void;
  onGp: () => void;
  onJson: () => void;
}

export function ExportDialog(p: ExportProps) {
  const [paper, setPaper] = useState<PrintOptions['paper']>('a4');
  const [staves, setStaves] = useState<PrintOptions['staves']>('scoreTab');
  const [useSelection, setUseSelection] = useState(false);
  return (
    <Modal title="내보내기" onClose={p.onClose}>
      <section className="export-block">
        <h3>PDF</h3>
        <div className="field-row">
          <label className="field">
            용지
            <select value={paper} onChange={e => setPaper(e.target.value as PrintOptions['paper'])}>
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </label>
          <label className="field">
            표시
            <select value={staves} onChange={e => setStaves(e.target.value as PrintOptions['staves'])}>
              <option value="scoreTab">오선보 + TAB</option>
              <option value="tab">TAB만</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" disabled={!p.selection} checked={useSelection && !!p.selection} onChange={e => setUseSelection(e.target.checked)} />
          선택한 마디만 {p.selection ? `(${p.selection[0]}–${p.selection[1]})` : '(선택 없음)'}
        </label>
        <p className="muted small">인쇄 창에서 “PDF로 저장”을 고르세요. 하단에 “Made with FretFlow”가 들어갑니다.</p>
        <button
          type="button"
          className="primary"
          onClick={() => p.onPdf({ paper, staves, range: useSelection && p.selection ? p.selection : null })}
        >
          PDF 만들기
        </button>
      </section>
      <section className="export-block">
        <h3>파일</h3>
        <div className="chips">
          <button type="button" className="chip" onClick={p.onMidi}>MIDI (.mid)</button>
          <button type="button" className="chip" onClick={p.onGp}>Guitar Pro (.gp)</button>
          <button type="button" className="chip" onClick={p.onJson}>FretFlow (.json)</button>
        </div>
        <p className="muted small">음원과 비트 맵은 파일에 포함되지 않습니다.</p>
      </section>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['0–9', '프렛 입력 (0.6초 안에 두 번 = 두 자리)'],
  ['↑ ↓', '현 이동'],
  ['← →', '비트 이동 (끝에서 → 는 새 마디)'],
  ['Shift + 방향키', '선택 확장'],
  ['⌘/Ctrl + ← →', '마디 이동'],
  ['+ / -', '음가 짧게 / 길게'],
  ['.', '점 0 → 1 → 2'],
  ['⌘/Ctrl + 3', '셋잇단'],
  ['R', '쉼표'],
  ['Enter', '같은 음가 비트 삽입'],
  ['Delete / Backspace', '음 삭제 / 비트 삭제'],
  ['H · S · B · V', '해머/풀 · 슬라이드 · 벤드 · 비브라토'],
  ['M · X · L · T', '팜뮤트 · 데드노트 · 렛링 · 타이'],
  ['⌘/Ctrl + Z / ⇧Z', '실행 취소 / 다시 실행'],
  ['⌘/Ctrl + C / X / V', '복사 / 잘라내기 / 붙여넣기'],
  ['Space', '재생 / 정지 (커서 위치부터)'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="단축키" onClose={onClose}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

const STEPS = [
  { title: 'TAB에 바로 쓰세요', body: '커서가 있는 칸에서 숫자를 누르면 그 현에 프렛이 들어갑니다. 1 다음 2를 빨리 누르면 12프렛이에요.' },
  { title: '움직이기', body: '↑↓로 현, ←→로 박을 옮깁니다. 마지막 박에서 →를 누르면 마디가 새로 생깁니다. 악보를 클릭해도 됩니다.' },
  { title: '리듬과 기법', body: '+ / - 로 음가, . 로 점, R 로 쉼표. H 해머, S 슬라이드, B 벤드, M 팜뮤트. 오른쪽 패널에서도 고칠 수 있어요.' },
  { title: '듣고, 맞춰 보고', body: 'Space로 커서 위치부터 재생합니다. 아래 “음원” 패널에 내 음원을 올리면 속도를 늦춰 구간 반복하며 연습할 수 있어요.' },
  { title: '자동 저장', body: '편집하면 1초 뒤 이 브라우저에 자동 저장됩니다. ? 키로 언제든 단축키를 볼 수 있어요.' },
];

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  return (
    <Modal title={`시작하기 ${i + 1}/${STEPS.length}`} onClose={onClose}>
      <h3 className="tut-title">{step.title}</h3>
      <p className="tut-body">{step.body}</p>
      <div className="tut-nav">
        <button type="button" className="ghost" onClick={onClose}>
          건너뛰기
        </button>
        <span className="dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </span>
        {i < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={() => setI(i + 1)}>
            다음
          </button>
        ) : (
          <button type="button" className="primary" onClick={onClose}>
            시작
          </button>
        )}
      </div>
    </Modal>
  );
}

export function ImportReport({ items, onClose }: { items: Map<string, number>; onClose: () => void }) {
  return (
    <Modal title="가져오기 결과" onClose={onClose}>
      <p>악보를 가져왔습니다. 아래 요소는 FretFlow에서 아직 지원하지 않아 빠지거나 단순화됐습니다.</p>
      <ul className="report">
        {[...items].map(([what, n]) => (
          <li key={what}>
            <span>{what}</span>
            <b>{n}</b>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onClose}>
        확인
      </button>
    </Modal>
  );
}

export function ConflictDialog({ title, onOverwrite, onTakeServer, onClose }: { title: string; onOverwrite: () => void; onTakeServer: () => void; onClose: () => void }) {
  return (
    <Modal title="다른 기기에서 수정됨" onClose={onClose}>
      <p>
        <b>{title}</b>이(가) 다른 기기에서 먼저 저장됐습니다. 어느 버전을 남길까요? 자동으로 합치지는 않습니다.
      </p>
      <div className="tut-nav">
        <button type="button" className="ghost" onClick={onTakeServer}>
          서버 버전 불러오기
        </button>
        <button type="button" className="primary" onClick={onOverwrite}>
          이 기기 버전으로 덮어쓰기
        </button>
      </div>
    </Modal>
  );
}
