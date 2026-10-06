import { Modal } from '../Modal';

export function ConflictDialog({ title, onOverwrite, onTakeServer, onClose }: { title: string; onOverwrite: () => void; onTakeServer: () => void; onClose: () => void }) {
  return (
    <Modal title="Changed on another device" onClose={onClose}>
      <p>
        <b>{title}</b> was saved on another device first. Which version do you want to keep? Nothing is merged automatically.
      </p>
      <div className="tut-nav">
        <button type="button" className="ghost" onClick={onTakeServer}>
          Load the server version
        </button>
        <button type="button" className="primary" onClick={onOverwrite}>
          Keep this device’s version
        </button>
      </div>
    </Modal>
  );
}
