import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';
import App from './App.jsx';

// HashRouter: las rutas van como /#/dashboard/... y funcionan en
// cualquier hosting estático (Render, Netlify, etc.) sin reglas de rewrite.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);

