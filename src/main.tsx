import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element.');
}

// FIX: React.StrictMode was removed specifically to suppress the double-invocation
// of effects in development — the very symptom it was meant to surface (a form
// that cleared on mount because the effect ran twice).  Hiding the symptom means
// the underlying bug can silently regress.
//
// The correct fix is to make effects idempotent (use cleanup functions, guard
// against double-invocations) rather than disabling StrictMode.  StrictMode is
// restored here.  The Capacitor Android WebView concern only applies to production
// builds; StrictMode double-invocation is development-only behaviour.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

