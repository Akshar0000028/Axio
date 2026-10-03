import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const apiTarget = loadEnv(mode, '.', '').VITE_DEV_API_TARGET || 'http://127.0.0.1:8001'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/auth':    { target: apiTarget, changeOrigin: true },
        '/agent-run': { target: apiTarget, changeOrigin: true },
        '/api':     { target: apiTarget, changeOrigin: true },
        '/upload':  { target: apiTarget, changeOrigin: true },
        '/train':   { target: apiTarget, changeOrigin: true },
        '/predict': { target: apiTarget, changeOrigin: true },
        '/chat':    { target: apiTarget, changeOrigin: true },
        '/export':  { target: apiTarget, changeOrigin: true },
        '/session': { target: apiTarget, changeOrigin: true },
        '/health':  { target: apiTarget, changeOrigin: true },
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
  }
})
