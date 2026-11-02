import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { activeSession } from './state/store';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const worker = navigator.serviceWorker;
  const updating = !!worker.controller;
  // A new version took over: show it, unless a session is running.
  worker.addEventListener('controllerchange', () => {
    if (updating && !activeSession()) location.reload();
  });
  void worker
    .register('./sw.js')
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}
