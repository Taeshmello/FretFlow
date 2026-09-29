import { alphaTab } from '@coderline/alphatab-vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The alphaTab plugin copies the Bravura font and the soundfont into the public
// dir and wires up the worker / audio worklet alphaTab needs.
export default defineConfig({
  plugins: [react(), alphaTab()],
  server: { port: 5180 },
});
