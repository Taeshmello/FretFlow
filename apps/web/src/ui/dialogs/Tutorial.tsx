import { useState } from 'react';
import { Modal } from '../Modal';

const STEPS = [
  { title: 'Type straight into the tab', body: 'Press a number to put that fret on the cursor string. Press 1 then 2 quickly for fret 12.' },
  { title: 'Move around', body: '↑↓ change string, ←→ change beat. → on the last beat fills the bar with beats of the same length, then adds a bar. You can also click the score.' },
  { title: 'Rhythm and technique', body: '+ / − change duration, . adds a dot, R makes a rest. H hammer-on, S slide, B bend, M palm mute — or use the panel on the right.' },
  { title: 'Listen and practise', body: 'Space plays from the cursor. Add your own recording to slow it down and loop a passage.' },
  { title: 'Saved as you go', body: 'Your score saves in this browser a second after each edit. Press ? any time for shortcuts. Piano and drums: letters A–G or number keys.' },
];

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  return (
    <Modal title={`Getting started ${i + 1}/${STEPS.length}`} onClose={onClose}>
      <h3 className="tut-title">{step.title}</h3>
      <p className="tut-body">{step.body}</p>
      <div className="tut-nav">
        <button type="button" className="ghost" onClick={onClose}>
          Skip
        </button>
        <span className="dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </span>
        {i < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" onClick={onClose}>
            Start
          </button>
        )}
      </div>
    </Modal>
  );
}
