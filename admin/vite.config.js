import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A separate app from client/ on purpose — a route inside the public
// bundle would still ship admin logic (API shapes, page structure) to
// every visitor's browser even behind a key gate. This runs on its own
// dev port and deploys to its own Vercel project at admin.scorpio.co.zw,
// so admin code never reaches the public site's bundle at all.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
});
