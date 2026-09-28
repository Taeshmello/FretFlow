import { alphaTab } from '@coderline/alphatab-vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The alphaTab plugin copies the Bravura font and soundfont assets and wires up
// the web worker / audio worklet handling that alphaTab needs.
export default defineConfig({
  plugins: [react(), alphaTab()],
});
