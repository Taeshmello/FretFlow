import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** The trigger; receives whether the popover is open. */
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  label: string;
}

/** Click-to-open panel anchored under its trigger. Closes on outside click or Escape. */
export function Popover({ trigger, children, align = 'left', label }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="popover-anchor" ref={ref}>
      <div className="popover-trigger" onClick={() => setOpen(o => !o)}>
        {trigger(open)}
      </div>
      {open && (
        <div className={`popover popover-${align}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
