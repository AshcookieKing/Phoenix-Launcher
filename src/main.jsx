import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/russo-one/400.css';
import '@fontsource/exo-2/400.css';
import '@fontsource/exo-2/500.css';
import '@fontsource/exo-2/600.css';
import '@fontsource/exo-2/700.css';
import App from './App';
import './styles/app.css';

const boot = () =>
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

// В браузере (vite без Electron) — тестовые данные вместо window.phoenix
if (import.meta.env.DEV && !window.phoenix) import('./dev/mockApi.js').then(boot);
else boot();
