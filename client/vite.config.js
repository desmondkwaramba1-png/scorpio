import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lets the Cloudflare quick tunnel (a random *.trycloudflare.com host
    // each time it starts) reach the dev server — Vite blocks unrecognized
    // Host headers by default. Needed only for testing the Dischub
    // redirect_url/webhook flow, which Dischub refuses to send to
    // localhost.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000'
    }
  }
});
