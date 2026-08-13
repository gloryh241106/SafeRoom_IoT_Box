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

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('safebox_token') || null);

  useEffect(() => {
    if (token) {
      fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setUser(data.user);
          } else {
            handleLogout();
          }
        })
        .catch(() => handleLogout());
    }
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

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Navbar user={user} onLogout={handleLogout} />

        <div className="flex-1 flex">
          <Sidebar />

          <main className="flex-1 w-full p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-8 overflow-y-auto max-w-7xl">
            <Routes>
              <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
              <Route path="/register" element={<Register onLoginSuccess={handleLoginSuccess} />} />
              {token ? (
                <>
                  <Route path="/" element={<Navigate to="/overview" replace />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/chatbot" element={<Chatbot />} />
                  <Route path="/settings" element={<Settings user={user} />} />
                  <Route path="*" element={<Navigate to="/overview" replace />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/login" replace />} />
              )}
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
