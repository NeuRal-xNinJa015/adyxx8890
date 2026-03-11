import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ADYX Web Client — Vite Configuration
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: {
      // WebSocket relay → Backend server
      '/ws': {
        target: 'ws://localhost:8443',
        ws: true,
      },
      // REST API → Backend server
      '/api': {
        target: 'http://localhost:8443',
      },
      // Health check → Backend server
      '/health': {
        target: 'http://localhost:8443',
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
  },
})
