import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { bootstrapFromHash } from './data/bootstrap';
import { applyTheme } from './lib/theme';
import './styles/index.css';

bootstrapFromHash();
applyTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Shell precache and network-first API caching; no Web Push in v1.
registerSW({ immediate: false });
