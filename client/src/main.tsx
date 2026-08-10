import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Keep the `dark` class on <html> in sync with the system color scheme.
const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

const applySystemTheme = () => {
  document.documentElement.classList.toggle('dark', darkModeQuery.matches);
};

applySystemTheme();
darkModeQuery.addEventListener('change', applySystemTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
