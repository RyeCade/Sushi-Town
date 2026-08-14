import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    wasm()
  ],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d']
  }
});