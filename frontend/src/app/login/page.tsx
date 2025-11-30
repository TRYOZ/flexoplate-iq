'use client';

// frontend/src/app/login/page.tsx
// ================================
// Standalone login - doesn't depend on AuthContext for login action

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Wait for mount before checking localStorage
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if already logged in (only after mount)
  useEffect(() => {
    if (!mounted) return;
    
    const token = localStorage.getItem('flexoplate_token');
    const user = localStorage.getItem('flexoplate_user');
    
    if (token && user) {
      // Already logged in, redirect to dashboard
      window.location.href = '/dashboard';
    }
  }, [mounted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setError('');
    setSubmitting(true);
    
    console.log('Attempting login with:', email); // Debug log
    
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      console.log('Response status:', response.status); // Debug log
      
      const data = await response.json();
      console.log('Response data:', data); // Debug log
      
      if (!response.ok) {
        throw new Error(data.detail || data.message || `Login failed (${response.status})`);
      }
      
      // Check if we got the expected data
      if (!data.access_token) {
        throw new Error('No access token received');
      }
      
      // Save to localStorage
      localStorage.setItem('flexoplate_token', data.access_token);
      localStorage.setItem('flexoplate_user', JSON.stringify(data.user));
      
      console.log('Login successful, redirecting...'); // Debug log
      
      // Use window.location for clean redirect
      window.location.href = '/dashboard';
      
    } catch (err: any) {
      console.error('Login error:', err); // Debug log
      setError(err.message || 'Login failed. Please try again.');
      setSubmitting(false);
    }
  };

  // Don't render until mounted (prevents hydration issues)
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">FP</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">FlexoPlate IQ</h1>
          <h2 className="mt-2 text-xl text-gray-600">Sign in to your account</h2>
        </div>
        
        <form className="mt-8 space-y-6 bg-white p-8 rounded-lg shadow" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="you@example.com"
              disabled={submitting}
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="••••••••"
              disabled={submitting}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </button>

          <div className="text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
              Create one
            </Link>
          </div>
        </form>

        <div className="text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ← Continue as guest
          </Link>
        </div>
        
        {/* Debug info - remove in production */}
        <div className="text-center text-xs text-gray-400">
          API: {API_BASE}
        </div>
      </div>
    </div>
  );
}
