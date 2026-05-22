import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  base: './',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,ts}'],
  },
  plugins: [
    react(),
    visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
  optimizeDeps: {
    include: ['leaflet.heat'],
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api':         { target: 'http://localhost:5000', changeOrigin: true },
      '/query':       { target: 'http://localhost:5000', changeOrigin: true },
      '/atendimento': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // Requisição de navegação do browser (Accept: text/html) → devolve o SPA.
        // Chamada de API do fetch (Accept: application/json ou */*) → proxy normal.
        bypass: (req) => req.headers.accept?.includes('text/html') ? '/index.html' : null,
      },
      '/juniper': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        bypass: (req) => req.headers.accept?.includes('text/html') ? '/index.html' : null,
      },
      '/notify':      { target: 'http://localhost:5000', changeOrigin: true },
      '/detalhes':    { target: 'http://localhost:5000', changeOrigin: true },
      '/health':      { target: 'http://localhost:5000', changeOrigin: true },
      '/ai':          { target: 'http://localhost:5000', changeOrigin: true },
      // Grafana proxy only works in production (servidor.js handles it).
      // In dev, requests fail gracefully (useGrafanaOS/useGrafanaMonitor show error states).
      '/grafana':     { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]',
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
        manualChunks: (id) => {
          if (id.includes('react-dom') || id.includes('react/'))  return 'vendor'
          if (id.includes('react-router'))                         return 'router'
          if (id.includes('@tanstack'))                            return 'query'
          if (id.includes('zustand'))                              return 'zustand'
        },
      },
    },
  },
})
