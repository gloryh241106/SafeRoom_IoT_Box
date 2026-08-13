import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
import Chatbot from './pages/Chatbot';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';

function ProtectedRoute({ authenticated, children }) {
  return authenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('safebox_token') || null);
  const [authChecking, setAuthChecking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setAuthChecking(false);
      return undefined;
    }

    const controller = new AbortController();
    setAuthChecking(true);

    fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Session validation failed');
        setUser(data.user);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        localStorage.removeItem('safebox_token');
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthChecking(false);
      });

    return () => controller.abort();
  }, [token]);

  const handleLoginSuccess = (newToken, userData) => {
    localStorage.setItem('safebox_token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('safebox_token');
    setToken(null);
    setUser(null);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" aria-label="Checking session">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  const authenticated = Boolean(token && user);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Navbar user={user} onLogout={handleLogout} />

        <div className="flex-1 flex">
          {authenticated && <Sidebar />}

          <main className={authenticated
            ? 'flex-1 w-full p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-8 overflow-y-auto max-w-7xl'
            : 'flex-1 w-full overflow-y-auto'}>
            <Routes>
              <Route path="/" element={<Navigate to={authenticated ? '/overview' : '/login'} replace />} />
              <Route path="/overview" element={
                <ProtectedRoute authenticated={authenticated}><Overview /></ProtectedRoute>
              } />
              <Route path="/dashboard" element={
                <ProtectedRoute authenticated={authenticated}><Dashboard /></ProtectedRoute>
              } />
              <Route path="/chatbot" element={
                <ProtectedRoute authenticated={authenticated}><Chatbot /></ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute authenticated={authenticated}><Settings user={user} /></ProtectedRoute>
              } />
              <Route path="/login" element={authenticated
                ? <Navigate to="/overview" replace />
                : <Login onLoginSuccess={handleLoginSuccess} />} />
              <Route path="/register" element={authenticated
                ? <Navigate to="/overview" replace />
                : <Register onLoginSuccess={handleLoginSuccess} />} />
              <Route path="*" element={<Navigate to={authenticated ? '/overview' : '/login'} replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
