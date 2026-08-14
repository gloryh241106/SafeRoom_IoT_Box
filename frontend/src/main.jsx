/** Browser entry point. Routing, authentication, and page layout live in App. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// StrictMode intentionally double-invokes eligible effects in development so
// missing cleanup (especially polling intervals) is caught before production.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
