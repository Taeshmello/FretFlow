import { useState } from 'react';
import { Modal } from './Modal';

interface ButtonProps {
  label?: string;
  className?: string;
}

/** An honest upgrade preview until checkout and server billing are connected. */
export function ProUpgradeButton({ label = 'Explore Pro', className = 'btn primary' }: ButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <ProUpgradeDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function ProUpgradeDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="FretFlow Pro" onClose={onClose}>
      <p>Unlock the complete practice workspace.</p>
      <ul className="pro-benefits">
        <li>Loop passages, use the metronome and count-in, and practise at 25–150% speed.</li>
        <li>Practise with your recording, build tempo automatically, and save routines.</li>
        <li>Export clean PDFs without the FretFlow footer.</li>
      </ul>
      <p className="muted small">Pro checkout is not available yet. No payment will be taken.</p>
      <button type="button" className="btn primary" onClick={onClose}>Got it</button>
    </Modal>
  );
}

export function ProFeaturePreview({ title, description, preview }: { title: string; description: string; preview: string }) {
  return (
    <section className="pro-preview" aria-label={`${title}, Pro feature`}>
      <div className="pro-preview-copy">
        <div className="trainer-head"><h4>{title}</h4><span className="plan-badge pro">Pro</span></div>
        <p className="muted small">{description}</p>
        <div className="pro-preview-example" aria-hidden="true">{preview}</div>
      </div>
      <ProUpgradeButton className="btn primary pro-preview-action" />
    </section>
  );
}
