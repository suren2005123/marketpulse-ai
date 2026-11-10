import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[Vite Proxy] -> OUTGOING ${req.method} ${req.url} at ${Date.now()}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[Vite Proxy] <- INCOMING ${proxyRes.statusCode} ${req.url} at ${Date.now()}`);
          });
          proxy.on('error', (err, req) => {
            console.error(`[Vite Proxy] !! ERROR ${req.url}:`, err.message);
          });
        },
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
      },
    },
  },
});
