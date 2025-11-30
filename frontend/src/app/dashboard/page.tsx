'use client';

// frontend/src/app/dashboard/page.tsx
// =====================================
// FIXED v2: Proper hydration handling to prevent redirect loops

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

interface Equipment {
  id: string;
  name: string;
  model: string;
  lamp_install_date: string;
  lamp_age_days: number;
}

interface FavoritePlate {
  id: string;
  plate_id: string;
  plate_name: string;
  supplier: string;
}

interface Recipe {
  id: string;
  name: string;
  plate_name: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  
  // Auth state
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  
  // Data state
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [favorites, setFavorites] = useState<FavoritePlate[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Step 1: Wait for component to mount (hydration complete)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Step 2: Check auth ONLY after mounted
  useEffect(() => {
    if (!mounted) return;

    const storedToken = localStorage.getItem('flexoplate_token');
    const storedUser = localStorage.getItem('flexoplate_user');
    
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
      } catch {
        // Invalid data - clear and redirect
        localStorage.removeItem('flexoplate_token');
        localStorage.removeItem('flexoplate_user');
        window.location.href = '/login';
      }
    } else {
      // Not logged in - redirect using window.location to avoid Next.js router issues
      window.location.href = '/login';
    }
  }, [mounted]);

  // Step 3: Fetch dashboard data once we have auth
  useEffect(() => {
    if (!token || !user) return;

    const fetchDashboardData = async () => {
      try {
        // Fetch user's equipment
        const equipmentRes = await fetch(`${API_BASE}/api/me/equipment`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (equipmentRes.ok) {
          const data = await equipmentRes.json();
          setEquipment(data.equipment || []);
        }

        // Fetch favorite plates
        const favoritesRes = await fetch(`${API_BASE}/api/me/plates`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (favoritesRes.ok) {
          const data = await favoritesRes.json();
          setFavorites(data.plates || []);
        }

        // Fetch saved recipes
        const recipesRes = await fetch(`${API_BASE}/api/me/recipes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (recipesRes.ok) {
          const data = await recipesRes.json();
          setRecipes(data.recipes || []);
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setDataLoaded(true);
      }
    };

    fetchDashboardData();
  }, [token, user]);

  // Show loading until mounted AND we have user data
  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{user.first_name ? `, ${user.first_name}` : ''}!
          </h1>
          <p className="text-gray-600 mt-1">
            {user.company_name || 'Your FlexoPlate IQ Dashboard'}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link 
            href="/"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Plate Equivalency</h3>
                <p className="text-sm text-gray-500">Find equivalent plates</p>
              </div>
            </div>
          </Link>

          <Link 
            href="/exposure"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Exposure Calculator</h3>
                <p className="text-sm text-gray-500">Calculate exposure times</p>
              </div>
            </div>
          </Link>

          <Link 
            href="/my-equipment"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">My Equipment</h3>
                <p className="text-sm text-gray-500">Manage your equipment</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Dashboard Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* My Equipment */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">My Equipment</h2>
              <Link href="/my-equipment" className="text-sm text-blue-600 hover:text-blue-700">
                Manage →
              </Link>
            </div>
            {!dataLoaded ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : equipment.length > 0 ? (
              <div className="space-y-3">
                {equipment.slice(0, 3).map((eq) => (
                  <div key={eq.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{eq.name}</p>
                      <p className="text-sm text-gray-500">{eq.model}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${eq.lamp_age_days > 1000 ? 'text-red-600' : eq.lamp_age_days > 500 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {eq.lamp_age_days} days
                      </p>
                      <p className="text-xs text-gray-500">lamp age</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No equipment saved yet</p>
                <Link href="/my-equipment" className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block">
                  Add your first equipment →
                </Link>
              </div>
            )}
          </div>

          {/* Favorite Plates */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Favorite Plates</h2>
              <Link href="/my-plates" className="text-sm text-blue-600 hover:text-blue-700">
                View all →
              </Link>
            </div>
            {!dataLoaded ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : favorites.length > 0 ? (
              <div className="space-y-3">
                {favorites.slice(0, 4).map((fav) => (
                  <div key={fav.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{fav.plate_name}</p>
                      <p className="text-sm text-gray-500">{fav.supplier}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No favorite plates yet</p>
                <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block">
                  Browse plates and add favorites →
                </Link>
              </div>
            )}
          </div>

          {/* Saved Recipes */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Saved Recipes</h2>
              <Link href="/recipes" className="text-sm text-blue-600 hover:text-blue-700">
                View all →
              </Link>
            </div>
            {!dataLoaded ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : recipes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.slice(0, 6).map((recipe) => (
                  <div key={recipe.id} className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{recipe.name}</p>
                    <p className="text-sm text-gray-500">{recipe.plate_name}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(recipe.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No saved recipes yet</p>
                <Link href="/exposure" className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block">
                  Calculate exposure and save a recipe →
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
