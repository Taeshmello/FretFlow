import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children, wide, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''} ${className}`} onClose={onClose} onCancel={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="icon" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
