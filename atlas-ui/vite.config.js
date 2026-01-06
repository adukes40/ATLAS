import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // allowedHosts can be configured via VITE_ALLOWED_HOST env var
    // or set to 'all' during development
    allowedHosts: process.env.VITE_ALLOWED_HOST
      ? [process.env.VITE_ALLOWED_HOST]
      : 'all',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
        secure: false,
      },
      '/auth': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
        secure: false,
      }
    }
  }
})
