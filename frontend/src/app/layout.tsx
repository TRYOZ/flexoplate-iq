'use client';

// frontend/src/app/layout.tsx

import './globals.css';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Header() {
  const [user, setUser] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const storedUser = localStorage.getItem('flexoplate_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('flexoplate_user');
        localStorage.removeItem('flexoplate_token');
      }
    }
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('flexoplate_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('flexoplate_token');
    localStorage.removeItem('flexoplate_user');
    setUser(null);
    setMenuOpen(false);
    window.location.href = '/';
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">FP</span>
            </div>
            <span className="font-semibold text-gray-900">FlexoPlate IQ</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/" 
              className={`text-sm ${pathname === '/' ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Plate Equivalency
            </Link>
            <Link 
              href="/exposure" 
              className={`text-sm ${pathname === '/exposure' ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Exposure Calculator
            </Link>
            <Link 
              href="/plates" 
              className={`text-sm ${pathname === '/plates' ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Plate Catalog
            </Link>

            {user ? (
              <>
                {/* User dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 text-xs font-medium">
                        {user.first_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <span className="hidden lg:inline">{user.first_name || 'Account'}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {menuOpen && (
                    <>
                      {/* Backdrop */}
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setMenuOpen(false)}
                      />
                      {/* Dropdown */}
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-sm font-medium text-gray-900">
                            {user.first_name ? `${user.first_name} ${user.last_name || ''}` : 'User'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        
                        <div className="py-1">
                          <p className="px-4 py-1 text-xs font-medium text-gray-400 uppercase">My Workspace</p>
                          <Link 
                            href="/my-plates"
                            className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 ${
                              pathname === '/my-plates' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                            }`}
                            onClick={() => setMenuOpen(false)}
                          >
                            <span>📋</span> My Plates
                          </Link>
                          <Link 
                            href="/my-equipment"
                            className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 ${
                              pathname === '/my-equipment' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                            }`}
                            onClick={() => setMenuOpen(false)}
                          >
                            <span>🔧</span> My Equipment
                          </Link>
                          <Link 
                            href="/my-recipes"
                            className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 ${
                              pathname === '/my-recipes' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                            }`}
                            onClick={() => setMenuOpen(false)}
                          >
                            <span>📝</span> Saved Recipes
                            <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>
                          </Link>
                        </div>
                        
                        <div className="border-t border-gray-100 py-1">
                          <button
                            onClick={handleLogout}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                          >
                            Logout
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <Link 
                href="/login" 
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg"
              >
                Login
              </Link>
            )}
          </nav>

          {/* Mobile menu button */}
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

        {/* Mobile Navigation */}
        {menuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-100">
            <div className="flex flex-col gap-1">
              <Link href="/" className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg" onClick={() => setMenuOpen(false)}>
                Plate Equivalency
              </Link>
              <Link href="/exposure" className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg" onClick={() => setMenuOpen(false)}>
                Exposure Calculator
              </Link>
              <Link href="/plates" className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg" onClick={() => setMenuOpen(false)}>
                Plate Catalog
              </Link>
              
              {user ? (
                <>
                  <hr className="my-2" />
                  <p className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">My Workspace</p>
                  <Link href="/my-plates" className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2" onClick={() => setMenuOpen(false)}>
                    <span>📋</span> My Plates
                  </Link>
                  <Link href="/my-equipment" className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2" onClick={() => setMenuOpen(false)}>
                    <span>🔧</span> My Equipment
                  </Link>
                  <hr className="my-2" />
                  <div className="px-3 py-2 text-sm text-gray-500">
                    Signed in as {user.email}
                  </div>
                  <button onClick={handleLogout} className="px-3 py-2 text-left text-red-600 hover:bg-gray-50 rounded-lg">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <hr className="my-2" />
                  <Link href="/login" className="px-3 py-2 text-blue-600 hover:bg-gray-50 rounded-lg" onClick={() => setMenuOpen(false)}>
                    Login
                  </Link>
                  <Link href="/register" className="px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg" onClick={() => setMenuOpen(false)}>
                    Create Account
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
        <title>FlexoPlate IQ</title>
        <meta name="description" content="Flexographic plate equivalency and exposure calculator" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <Header />
        <main className="max-w-6xl mx-auto p-4">
          {children}
        </main>
        <footer className="border-t border-gray-200 mt-12 py-6 text-center text-sm text-gray-500">
          <p>FlexoPlate IQ © 2024 • Plate Room Intelligence</p>
        </footer>
      </body>
    </html>
  );
}
