'use client';

// frontend/src/context/AuthContext.tsx
// =====================================
// Central auth state management - prevents race conditions

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Mark as mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load auth from localStorage ONLY after mount
  useEffect(() => {
    if (!mounted) return;

    const loadAuth = () => {
      try {
        const storedToken = localStorage.getItem('flexoplate_token');
        const storedUser = localStorage.getItem('flexoplate_user');
        
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (e) {
        // Clear invalid data
        localStorage.removeItem('flexoplate_token');
        localStorage.removeItem('flexoplate_user');
      } finally {
        setIsLoading(false);
      }
    };

    loadAuth();
  }, [mounted]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Login failed');
    }
    
    const data = await res.json();
    
    // Save to localStorage
    localStorage.setItem('flexoplate_token', data.access_token);
    localStorage.setItem('flexoplate_user', JSON.stringify(data.user));
    
    // Update state
    setToken(data.access_token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('flexoplate_token');
    localStorage.removeItem('flexoplate_user');
    setToken(null);
    setUser(null);
  };

  const refreshAuth = () => {
    try {
      const storedToken = localStorage.getItem('flexoplate_token');
      const storedUser = localStorage.getItem('flexoplate_user');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        setToken(null);
        setUser(null);
      }
    } catch {
      setToken(null);
      setUser(null);
    }
  };

  // Don't render children until we've checked auth
  if (!mounted) {
    return null;
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      login,
      logout,
      refreshAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
