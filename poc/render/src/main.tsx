import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// No StrictMode on purpose: its double-invoked effects would create and destroy
// the AlphaTabApi twice, which muddies the render timings this PoC exists to measure.
const root = document.getElementById('root');
if (!root) {
  throw new Error('#root missing from index.html');
}
createRoot(root).render(<App />);
