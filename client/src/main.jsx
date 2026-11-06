import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import App from './App.jsx';
import './index.css';

// registerType:'autoUpdate' (vite.config.js) only does its job through
// this call, it's what actually tells a newly-installed worker to
// skipWaiting and reloads once it takes over, silently, no "update
// available" prompt, matching the no-prompt reasoning already in
// vite.config.js's manifest comment. Without this the app shipped
// updates that a tab already open would never see until fully closed.
// immediate:true registers right away instead of waiting on window
// 'load'. Check once as soon as registration is ready, then every five
// minutes while a tab is open; the browser's built-in update schedule can
// otherwise leave a long-running tab on an older deployment.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      check();
      setInterval(check, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
