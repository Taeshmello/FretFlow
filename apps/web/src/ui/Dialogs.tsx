import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PrintOptions } from '../app/files';

export function Modal({ title, onClose, children, wide, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
    }
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''} ${className}`} onClose={onClose} onCancel={onClose} aria-label={title}>
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
  const [format, setFormat] = useState<'pdf' | 'midi' | 'gp' | 'json'>('pdf');
  const selections = [
    { id: 'pdf', title: 'PDF', detail: '인쇄하거나 어디서든 읽기' },
    { id: 'midi', title: 'MIDI', detail: '음악 제작 프로그램에서 열기' },
    { id: 'gp', title: 'Guitar Pro', detail: '다른 편집기에서 이어 쓰기' },
    { id: 'json', title: 'FretFlow 파일', detail: '악보 전체 백업' },
  ] as const;
  const exportFile = () => {
    if (format === 'pdf') {
      p.onPdf({ paper, staves, range: useSelection && p.selection ? p.selection : null });
    } else if (format === 'midi') {
      p.onMidi();
    } else if (format === 'gp') {
      p.onGp();
    } else {
      p.onJson();
    }
  };
  return (
    <Modal title="내보내기" onClose={p.onClose} wide className="export-modal">
      <div className="export-layout">
        <div className="export-options">
          <div className="export-formats" role="radiogroup" aria-label="파일 형식">
            {selections.map(item => (
              <button key={item.id} type="button" className="export-format" role="radio" aria-checked={format === item.id} onClick={() => setFormat(item.id)}>
                <b>{item.title}</b><small>{item.detail}</small>
              </button>
            ))}
          </div>
          {format === 'pdf' && (
            <div className="export-pdf-options">
              <fieldset className="form-group">
                <legend>표시</legend>
                <div className="segmented"><button type="button" aria-pressed={staves === 'scoreTab'} onClick={() => setStaves('scoreTab')}>오선보 + TAB</button><button type="button" aria-pressed={staves === 'tab'} onClick={() => setStaves('tab')}>TAB만</button><button type="button" aria-pressed={staves === 'score'} onClick={() => setStaves('score')}>오선보만</button></div>
              </fieldset>
              <fieldset className="form-group">
                <legend>마디</legend>
                <div className="segmented"><button type="button" aria-pressed={!useSelection} onClick={() => setUseSelection(false)}>전체 (1–{p.barCount})</button><button type="button" aria-pressed={useSelection} disabled={!p.selection} onClick={() => setUseSelection(true)}>선택 {p.selection ? `${p.selection[0]}–${p.selection[1]}` : '없음'}</button></div>
              </fieldset>
              <fieldset className="form-group">
                <legend>용지</legend>
                <div className="segmented"><button type="button" aria-pressed={paper === 'letter'} onClick={() => setPaper('letter')}>Letter</button><button type="button" aria-pressed={paper === 'a4'} onClick={() => setPaper('a4')}>A4</button></div>
              </fieldset>
            </div>
          )}
          <p className="muted small export-help">{format === 'pdf' ? '브라우저 인쇄 창에서 PDF로 저장할 수 있습니다. 하단에 Made with FretFlow가 표시됩니다.' : '음원과 비트 맵은 내보내는 악보 파일에 포함되지 않습니다.'}</p>
        </div>
        <div className="export-preview" aria-label="용지 배치 예시">
          <div className={`preview-page ${paper}`}>
            <div className="preview-title">악보 내보내기</div>
            <div className="preview-caption">{staves === 'scoreTab' ? '오선보 + TAB' : staves === 'score' ? '오선보' : 'TAB'} · {paper.toUpperCase()}</div>
            <div className="preview-system" /><div className="preview-system" /><div className="preview-system" />
            <div className="preview-footer">Made with FretFlow</div>
          </div>
          <span className="muted small">배치 예시 · 실제 악보는 인쇄 창에서 확인</span>
        </div>
      </div>
      <footer className="export-actions"><button type="button" className="btn" onClick={p.onClose}>취소</button><button type="button" className="btn primary" onClick={exportFile}>{format === 'pdf' ? '인쇄 / PDF로 저장' : '파일 다운로드'}</button></footer>
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
