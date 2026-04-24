import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          engine: [
            './src/engine/audio.js',
            './src/engine/renderer.js',
            './src/engine/particles.js',
            './src/engine/weather.js',
            './src/engine/spatial.js',
          ],
          game: [
            './src/game/vehicle.js',
            './src/game/npc.js',
            './src/game/traffic.js',
            './src/game/combat.js',
            './src/game/gangs.js',
          ],
        },
      },
    },
  },
});
