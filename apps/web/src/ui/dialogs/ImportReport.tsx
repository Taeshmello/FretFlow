import { Modal } from '../Modal';

export function ImportReport({ items, onClose }: { items: Map<string, number>; onClose: () => void }) {
  return (
    <Modal title="Import result" onClose={onClose}>
      <p>The score was imported. These elements aren’t supported in FretFlow yet, so they were dropped or simplified.</p>
      <ul className="report">
        {[...items].map(([what, n]) => (
          <li key={what}>
            <span>{what}</span>
            <b>{n}</b>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onClose}>
        OK
      </button>
    </Modal>
  );
}
