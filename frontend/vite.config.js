import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/upload':  { target: 'http://localhost:8000', changeOrigin: true },
      '/train':   { target: 'http://localhost:8000', changeOrigin: true },
      '/predict': { target: 'http://localhost:8000', changeOrigin: true },
      '/chat':    { target: 'http://localhost:8000', changeOrigin: true },
      '/export':  { target: 'http://localhost:8000', changeOrigin: true },
      '/session': { target: 'http://localhost:8000', changeOrigin: true },
      '/health':  { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          markdown: ['react-markdown'],
        },
      },
    },
  },
})
