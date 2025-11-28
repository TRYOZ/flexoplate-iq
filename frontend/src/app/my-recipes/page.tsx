'use client';

// frontend/src/app/my-recipes/page.tsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface Recipe {
  id: string;
  name: string;
  customer_name?: string;
  job_number?: string;
  plate_id: string;
  plate_name?: string;
  supplier_name?: string;
  equipment_id?: string;
  equipment_nickname?: string;
  main_exposure_time_s: number;
  back_exposure_time_s: number;
  post_exposure_time_s?: number;
  detack_time_s?: number;
  notes?: string;
  created_at: string;
  last_used_at?: string;
}

interface Plate {
  id: string;
  display_name: string;
  supplier_name: string;
  thickness_mm: number;
}

interface Equipment {
  id: string;
  nickname: string;
  model_name: string;
  supplier_name: string;
}

export default function MyRecipesPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  // Data
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [myPlates, setMyPlates] = useState<Plate[]>([]);
  const [myEquipment, setMyEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Search/filter
  const [searchTerm, setSearchTerm] = useState('');
  
  // New recipe form
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    customer_name: '',
    job_number: '',
    plate_id: '',
    equipment_id: '',
    main_exposure_time_s: 0,
    back_exposure_time_s: 0,
    post_exposure_time_s: 0,
    detack_time_s: 0,
    notes: ''
  });

  // Check auth
  useEffect(() => {
    const storedToken = localStorage.getItem('flexoplate_token');
    const storedUser = localStorage.getItem('flexoplate_user');
    
    if (!storedToken || !storedUser) {
      router.push('/login');
      return;
    }
    
    setToken(storedToken);
    setUser(JSON.parse(storedUser));
  }, [router]);

  // Fetch data
  useEffect(() => {
    if (token) {
      fetchRecipes();
      fetchMyPlates();
      fetchMyEquipment();
    }
  }, [token]);

  const fetchRecipes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me/recipes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const data = await res.json();
      setRecipes(data);
    } catch (err) {
      console.error('Failed to fetch recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyPlates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me/plates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMyPlates(data.map((p: any) => ({
        id: p.plate_id,
        display_name: p.display_name,
        supplier_name: p.supplier_name,
        thickness_mm: p.thickness_mm
      })));
    } catch (err) {
      console.error('Failed to fetch plates:', err);
    }
  };

  const fetchMyEquipment = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMyEquipment(data);
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
    }
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/me/recipes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRecipe.name,
          customer_name: newRecipe.customer_name || null,
          job_number: newRecipe.job_number || null,
          plate_id: newRecipe.plate_id,
          equipment_id: newRecipe.equipment_id || null,
          main_exposure_time_s: newRecipe.main_exposure_time_s,
          back_exposure_time_s: newRecipe.back_exposure_time_s,
          notes: newRecipe.notes || null
        })
      });
      
      if (res.ok) {
        setShowAddModal(false);
        setNewRecipe({
          name: '',
          customer_name: '',
          job_number: '',
          plate_id: '',
          equipment_id: '',
          main_exposure_time_s: 0,
          back_exposure_time_s: 0,
          post_exposure_time_s: 0,
          detack_time_s: 0,
          notes: ''
        });
        fetchRecipes();
      }
    } catch (err) {
      console.error('Failed to save recipe:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!confirm('Delete this recipe?')) return;
    
    try {
      await fetch(`${API_BASE}/api/me/recipes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchRecipes();
      setShowDetailModal(null);
    } catch (err) {
      console.error('Failed to delete recipe:', err);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
  };

  const parseTimeInput = (value: string): number => {
    // Accept formats: "5:30", "5m 30s", "330", "5.5"
    if (value.includes(':')) {
      const [mins, secs] = value.split(':').map(Number);
      return (mins || 0) * 60 + (secs || 0);
    }
    if (value.includes('m')) {
      const mins = parseInt(value) || 0;
      const secsMatch = value.match(/(\d+)s/);
      const secs = secsMatch ? parseInt(secsMatch[1]) : 0;
      return mins * 60 + secs;
    }
    // Assume seconds if just a number
    return Math.round(parseFloat(value) || 0);
  };

  // Filter recipes
  const filteredRecipes = recipes.filter(recipe => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      recipe.name.toLowerCase().includes(search) ||
      recipe.customer_name?.toLowerCase().includes(search) ||
      recipe.job_number?.toLowerCase().includes(search) ||
      recipe.plate_name?.toLowerCase().includes(search)
    );
  });

  // Group by customer
  const recipesByCustomer = filteredRecipes.reduce((acc, recipe) => {
    const customer = recipe.customer_name || 'Other';
    if (!acc[customer]) acc[customer] = [];
    acc[customer].push(recipe);
    return acc;
  }, {} as Record<string, Recipe[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Saved Recipes</h1>
          <p className="text-gray-600">Save exposure settings for jobs and customers</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <span className="text-xl">+</span> New Recipe
        </button>
      </div>

      {/* Search */}
      {recipes.length > 0 && (
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search recipes, customers, job numbers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {/* Recipes List */}
      {recipes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-5xl mb-4">📝</p>
          <h3 className="text-lg font-medium mb-2">No recipes saved yet</h3>
          <p className="text-gray-500 mb-6">
            Save exposure settings for your jobs so you can quickly recall them later
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg"
          >
            Create Your First Recipe
          </button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No recipes match "{searchTerm}"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(recipesByCustomer).map(([customer, customerRecipes]) => (
            <div key={customer}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🏢</span> {customer} ({customerRecipes.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {customerRecipes.map(recipe => (
                  <div
                    key={recipe.id}
                    onClick={() => setShowDetailModal(recipe)}
                    className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{recipe.name}</h3>
                        {recipe.job_number && (
                          <p className="text-xs text-gray-500">Job #{recipe.job_number}</p>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3">
                      {recipe.plate_name || 'Unknown plate'}
                      {recipe.supplier_name && ` • ${recipe.supplier_name}`}
                    </p>
                    
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Back:</span>{' '}
                        <span className="font-medium">{formatTime(recipe.back_exposure_time_s)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Main:</span>{' '}
                        <span className="font-medium">{formatTime(recipe.main_exposure_time_s)}</span>
                      </div>
                    </div>
                    
                    {recipe.notes && (
                      <p className="mt-2 text-xs text-gray-500 truncate">
                        📌 {recipe.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {recipes.length > 0 && (
        <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">{recipes.length}</p>
              <p className="text-sm text-blue-700">Total Recipes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {new Set(recipes.map(r => r.customer_name).filter(Boolean)).size}
              </p>
              <p className="text-sm text-blue-700">Customers</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {new Set(recipes.map(r => r.plate_id)).size}
              </p>
              <p className="text-sm text-blue-700">Plates Used</p>
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link href="/dashboard" className="text-blue-500 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Add Recipe Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold">New Recipe</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveRecipe} className="p-4 space-y-4">
              {/* Recipe Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipe Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Coca-Cola Label Standard"
                  value={newRecipe.name}
                  onChange={(e) => setNewRecipe(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* Customer & Job */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Coca-Cola"
                    value={newRecipe.customer_name}
                    onChange={(e) => setNewRecipe(prev => ({ ...prev, customer_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Job Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., JOB-2024-001"
                    value={newRecipe.job_number}
                    onChange={(e) => setNewRecipe(prev => ({ ...prev, job_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              
              {/* Plate Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plate <span className="text-red-500">*</span>
                </label>
                {myPlates.length === 0 ? (
                  <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
                    No plates saved. <Link href="/my-plates" className="text-blue-600 hover:underline">Add plates first</Link>
                  </div>
                ) : (
                  <select
                    required
                    value={newRecipe.plate_id}
                    onChange={(e) => setNewRecipe(prev => ({ ...prev, plate_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">Select a plate...</option>
                    {myPlates.map(plate => (
                      <option key={plate.id} value={plate.id}>
                        {plate.display_name} ({plate.supplier_name}, {plate.thickness_mm}mm)
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              {/* Equipment Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment (Optional)
                </label>
                <select
                  value={newRecipe.equipment_id}
                  onChange={(e) => setNewRecipe(prev => ({ ...prev, equipment_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">Any equipment</option>
                  {myEquipment.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nickname} ({eq.model_name})
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Exposure Times */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">Exposure Times</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Back Exposure <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="Minutes"
                        value={Math.floor(newRecipe.back_exposure_time_s / 60) || ''}
                        onChange={(e) => {
                          const mins = parseInt(e.target.value) || 0;
                          const secs = newRecipe.back_exposure_time_s % 60;
                          setNewRecipe(prev => ({ ...prev, back_exposure_time_s: mins * 60 + secs }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        min="0"
                        max="59"
                        placeholder="Sec"
                        value={newRecipe.back_exposure_time_s % 60 || ''}
                        onChange={(e) => {
                          const secs = parseInt(e.target.value) || 0;
                          const mins = Math.floor(newRecipe.back_exposure_time_s / 60);
                          setNewRecipe(prev => ({ ...prev, back_exposure_time_s: mins * 60 + secs }));
                        }}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Main Exposure <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="Minutes"
                        value={Math.floor(newRecipe.main_exposure_time_s / 60) || ''}
                        onChange={(e) => {
                          const mins = parseInt(e.target.value) || 0;
                          const secs = newRecipe.main_exposure_time_s % 60;
                          setNewRecipe(prev => ({ ...prev, main_exposure_time_s: mins * 60 + secs }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        min="0"
                        max="59"
                        placeholder="Sec"
                        value={newRecipe.main_exposure_time_s % 60 || ''}
                        onChange={(e) => {
                          const secs = parseInt(e.target.value) || 0;
                          const mins = Math.floor(newRecipe.main_exposure_time_s / 60);
                          setNewRecipe(prev => ({ ...prev, main_exposure_time_s: mins * 60 + secs }));
                        }}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  placeholder="e.g., Customer prefers 2% bump on highlights, runs on Press 3"
                  value={newRecipe.notes}
                  onChange={(e) => setNewRecipe(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                />
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newRecipe.plate_id}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recipe Detail Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">{showDetailModal.name}</h2>
              <button
                onClick={() => setShowDetailModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Customer/Job Info */}
              {(showDetailModal.customer_name || showDetailModal.job_number) && (
                <div className="flex gap-4">
                  {showDetailModal.customer_name && (
                    <div>
                      <p className="text-sm text-gray-500">Customer</p>
                      <p className="font-medium">{showDetailModal.customer_name}</p>
                    </div>
                  )}
                  {showDetailModal.job_number && (
                    <div>
                      <p className="text-sm text-gray-500">Job Number</p>
                      <p className="font-medium">{showDetailModal.job_number}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Plate Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Plate</p>
                <p className="font-medium text-lg">{showDetailModal.plate_name || 'Unknown'}</p>
                {showDetailModal.supplier_name && (
                  <p className="text-sm text-gray-600">{showDetailModal.supplier_name}</p>
                )}
              </div>
              
              {/* Exposure Times */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-600 mb-1">Back Exposure</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {formatTime(showDetailModal.back_exposure_time_s)}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-600 mb-1">Main Exposure</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {formatTime(showDetailModal.main_exposure_time_s)}
                  </p>
                </div>
              </div>
              
              {/* Notes */}
              {showDetailModal.notes && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <span className="font-medium">📌 Notes:</span> {showDetailModal.notes}
                  </p>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleDeleteRecipe(showDetailModal.id)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setShowDetailModal(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <Link
                  href={`/exposure?plate=${showDetailModal.plate_id}`}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                  onClick={() => setShowDetailModal(null)}
                >
                  Open in Calculator
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
