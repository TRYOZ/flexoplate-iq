'use client';

// frontend/src/app/layout.tsx
// ============================
// Equivalency stays at root /, Dashboard for logged-in users

import './globals.css';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Header() {
  const [user, setUser] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const storedUser = localStorage.getItem('flexoplate_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('flexoplate_user');
        localStorage.removeItem('flexoplate_token');
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [mounted, pathname]);

  const handleLogout = () => {
    localStorage.removeItem('flexoplate_token');
    localStorage.removeItem('flexoplate_user');
    setUser(null);
    setMenuOpen(false);
    window.location.href = '/';
  };

  const isAuthenticated = !!user;

  if (!mounted) {
    return (
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">FP</span>
              </div>
              <span className="font-semibold text-gray-900">FlexoPlate IQ</span>
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo - goes to dashboard if logged in, otherwise home */}
          <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">FP</span>
            </div>
            <span className="font-semibold text-gray-900">FlexoPlate IQ</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {isAuthenticated && (
              <Link 
                href="/dashboard" 
                className={`px-3 py-2 rounded-lg text-sm ${pathname === '/dashboard' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Dashboard
              </Link>
            )}
            <Link 
              href="/equivalency" 
              className={`px-3 py-2 rounded-lg text-sm ${pathname === '/equivalency' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Equivalency
            </Link>
            <Link 
              href="/exposure" 
              className={`px-3 py-2 rounded-lg text-sm ${pathname === '/exposure' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Exposure
            </Link>
            <Link 
              href="/plates" 
              className={`px-3 py-2 rounded-lg text-sm ${pathname === '/plates' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Plates
            </Link>
          </nav>

          {/* Auth Section - Desktop */}
          <div className="hidden md:block">
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-medium text-sm">
                      {user.first_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{user.first_name || 'User'}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <Link 
                      href="/dashboard" 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link 
                      href="/my-equipment" 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      My Equipment
                    </Link>
                    <Link 
                      href="/my-plates" 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      My Plates
                    </Link>
                    <Link 
                      href="/my-recipes" 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      My Recipes
                    </Link>
                    <hr className="my-2" />
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                  Login
                </Link>
                <Link href="/register" className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-200">
            <div className="flex flex-col gap-2">
              {isAuthenticated && (
                <Link 
                  href="/dashboard" 
                  className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                  onClick={() => setMenuOpen(false)}
                >
                  Dashboard
                </Link>
              )}
              <Link 
                href="/equivalency" 
                className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                Equivalency
              </Link>
              <Link 
                href="/exposure" 
                className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                Exposure
              </Link>
              <Link 
                href="/plates" 
                className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                Plates
              </Link>
              <hr className="my-2" />
              {isAuthenticated && user ? (
                <>
                  <Link 
                    href="/my-equipment" 
                    className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Equipment
                  </Link>
                  <Link 
                    href="/my-plates" 
                    className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Plates
                  </Link>
                  <Link 
                    href="/my-recipes" 
                    className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Recipes
                  </Link>
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {user.email}
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="px-3 py-2 text-left text-red-600 hover:bg-gray-50 rounded-lg"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    href="/login" 
                    className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    onClick={() => setMenuOpen(false)}
                  >
                    Login
                  </Link>
                  <Link 
                    href="/register" 
                    className="px-3 py-2 text-blue-600 font-medium hover:bg-gray-50 rounded-lg"
                    onClick={() => setMenuOpen(false)}
                  >
                    Sign Up Free
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>FlexoPlate IQ - Plate Room Intelligence</title>
        <meta name="description" content="Flexographic plate equivalency finder and exposure calculator" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <Header />
        <main>
          {children}
        </main>
        <footer className="border-t border-gray-200 mt-12 py-6 text-center text-sm text-gray-500">
          <p>FlexoPlate IQ © 2024 • Plate Room Intelligence</p>
        </footer>
      </body>
    </html>
  );
}
