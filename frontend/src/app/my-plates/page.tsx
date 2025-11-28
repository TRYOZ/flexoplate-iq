'use client';

// frontend/src/app/my-plates/page.tsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface Plate {
  id: string;
  display_name: string;
  family_name: string;
  supplier_name: string;
  thickness_mm: number;
  hardness_shore?: number;
  process_type?: string;
  imaging_type?: string;
  surface_type?: string;
}

interface FavoritePlate extends Plate {
  notes?: string;
  primary_application?: string;
}

interface EquivalentPlate {
  id: string;
  display_name: string;
  supplier_name: string;
  thickness_mm: number;
  hardness_shore?: number;
  process_type?: string;
  match_score: number;
}

export default function MyPlatesPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  // Data state
  const [myPlates, setMyPlates] = useState<FavoritePlate[]>([]);
  const [allPlates, setAllPlates] = useState<Plate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Search/filter for add modal
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [suppliers, setSuppliers] = useState<{id: string, name: string}[]>([]);
  
  // Equivalents state
  const [equivalentsMap, setEquivalentsMap] = useState<Record<string, EquivalentPlate[]>>({});
  const [loadingEquivalents, setLoadingEquivalents] = useState<Record<string, boolean>>({});
  const [expandedPlate, setExpandedPlate] = useState<string | null>(null);

  // Check auth on mount
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

  // Fetch data when token is available
  useEffect(() => {
    if (token) {
      fetchMyPlates();
      fetchAllPlates();
      fetchSuppliers();
    }
  }, [token]);

  const fetchMyPlates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me/plates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
        localStorage.removeItem('flexoplate_token');
        localStorage.removeItem('flexoplate_user');
        router.push('/login');
        return;
      }
      
      const data = await res.json();
      setMyPlates(data);
    } catch (err) {
      console.error('Failed to fetch my plates:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllPlates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plates?limit=500`);
      const data = await res.json();
      setAllPlates(data);
    } catch (err) {
      console.error('Failed to fetch plates:', err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/suppliers`);
      const data = await res.json();
      setSuppliers(data);
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  };

  const fetchEquivalents = async (plateId: string) => {
    if (equivalentsMap[plateId]) {
      // Already loaded
      return;
    }
    
    setLoadingEquivalents(prev => ({ ...prev, [plateId]: true }));
    
    try {
      const res = await fetch(`${API_BASE}/api/equivalency/find?plate_id=${plateId}&limit=5`);
      const data = await res.json();
      setEquivalentsMap(prev => ({ ...prev, [plateId]: data.equivalents || [] }));
    } catch (err) {
      console.error('Failed to fetch equivalents:', err);
    } finally {
      setLoadingEquivalents(prev => ({ ...prev, [plateId]: false }));
    }
  };

  const handleAddPlate = async (plateId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/me/plates/${plateId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        fetchMyPlates();
        setShowAddModal(false);
        setSearchTerm('');
      }
    } catch (err) {
      console.error('Failed to add plate:', err);
    }
  };

  const handleRemovePlate = async (plateId: string) => {
    if (!confirm('Remove this plate from your favorites?')) return;
    
    try {
      await fetch(`${API_BASE}/api/me/plates/${plateId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchMyPlates();
    } catch (err) {
      console.error('Failed to remove plate:', err);
    }
  };

  const toggleExpanded = (plateId: string) => {
    if (expandedPlate === plateId) {
      setExpandedPlate(null);
    } else {
      setExpandedPlate(plateId);
      fetchEquivalents(plateId);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 text-green-800';
    if (score >= 75) return 'bg-blue-100 text-blue-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  // Filter plates for add modal (exclude already added)
  const myPlateIds = new Set(myPlates.map(p => p.id));
  const filteredPlates = allPlates.filter(plate => {
    if (myPlateIds.has(plate.id)) return false;
    
    const matchesSearch = !searchTerm || 
      plate.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.family_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSupplier = !supplierFilter || plate.supplier_name === supplierFilter;
    
    return matchesSearch && matchesSupplier;
  });

  // Group my plates by supplier
  const platesBySupplier = myPlates.reduce((acc, plate) => {
    if (!acc[plate.supplier_name]) acc[plate.supplier_name] = [];
    acc[plate.supplier_name].push(plate);
    return acc;
  }, {} as Record<string, FavoritePlate[]>);

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
          <h1 className="text-2xl font-bold">My Plates</h1>
          <p className="text-gray-600">Save your commonly used plates and find equivalents instantly</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <span className="text-xl">+</span> Add Plate
        </button>
      </div>

      {/* My Plates List */}
      {myPlates.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-5xl mb-4">📋</p>
          <h3 className="text-lg font-medium mb-2">No plates saved yet</h3>
          <p className="text-gray-500 mb-6">
            Add the plates you regularly use to quickly find equivalents and calculate exposure times
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg"
          >
            Add Your First Plate
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(platesBySupplier).map(([supplier, plates]) => (
            <div key={supplier}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {supplier} ({plates.length})
              </h2>
              <div className="space-y-3">
                {plates.map(plate => (
                  <div key={plate.id} className="bg-white rounded-lg shadow overflow-hidden">
                    {/* Plate Header */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleExpanded(plate.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{plate.display_name}</h3>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                              {plate.thickness_mm}mm
                            </span>
                            {plate.hardness_shore && (
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                                {plate.hardness_shore} Shore A
                              </span>
                            )}
                            {plate.process_type && (
                              <span className={`text-xs px-2 py-1 rounded ${
                                plate.process_type === 'solvent' ? 'bg-purple-100 text-purple-700' :
                                plate.process_type === 'thermal' ? 'bg-orange-100 text-orange-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {plate.process_type}
                              </span>
                            )}
                            {plate.surface_type && (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                                {plate.surface_type.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePlate(plate.id);
                            }}
                            className="text-gray-400 hover:text-red-500 p-1"
                            title="Remove from favorites"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          <svg 
                            className={`w-5 h-5 text-gray-400 transition-transform ${expandedPlate === plate.id ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded Equivalents Section */}
                    {expandedPlate === plate.id && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Equivalent Plates from Other Suppliers
                        </h4>
                        
                        {loadingEquivalents[plate.id] ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          </div>
                        ) : equivalentsMap[plate.id]?.length === 0 ? (
                          <p className="text-gray-500 text-sm py-2">No equivalents found</p>
                        ) : (
                          <div className="space-y-2">
                            {equivalentsMap[plate.id]?.map(eq => (
                              <div 
                                key={eq.id}
                                className="bg-white rounded-lg p-3 flex justify-between items-center"
                              >
                                <div>
                                  <p className="font-medium text-gray-900">{eq.display_name}</p>
                                  <p className="text-sm text-gray-500">
                                    {eq.supplier_name} • {eq.thickness_mm}mm
                                    {eq.hardness_shore && ` • ${eq.hardness_shore} Shore`}
                                  </p>
                                </div>
                                <span className={`text-xs font-medium px-2 py-1 rounded ${getScoreColor(eq.match_score)}`}>
                                  {eq.match_score}% match
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <Link 
                            href={`/?plate=${plate.id}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            View all equivalents →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {myPlates.length > 0 && (
        <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">Quick Stats</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">{myPlates.length}</p>
              <p className="text-sm text-blue-700">Saved Plates</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{Object.keys(platesBySupplier).length}</p>
              <p className="text-sm text-blue-700">Suppliers</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {new Set(myPlates.map(p => p.thickness_mm)).size}
              </p>
              <p className="text-sm text-blue-700">Thicknesses</p>
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link href="/" className="text-blue-500 hover:underline">
          ← Back to Plate Equivalency
        </Link>
      </div>

      {/* Add Plate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Add Plate to Favorites</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchTerm('');
                  setSupplierFilter('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Search/Filter */}
            <div className="p-4 border-b border-gray-100 space-y-3">
              <input
                type="text"
                placeholder="Search plates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            
            {/* Plate List */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredPlates.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  {searchTerm || supplierFilter ? 'No plates match your search' : 'All plates already added'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredPlates.slice(0, 50).map(plate => (
                    <button
                      key={plate.id}
                      onClick={() => handleAddPlate(plate.id)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{plate.display_name}</p>
                          <p className="text-sm text-gray-500">{plate.supplier_name}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                            {plate.thickness_mm}mm
                          </span>
                          {plate.process_type && (
                            <span className={`text-xs px-2 py-1 rounded ${
                              plate.process_type === 'solvent' ? 'bg-purple-100 text-purple-700' :
                              plate.process_type === 'thermal' ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {plate.process_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredPlates.length > 50 && (
                    <p className="text-center text-gray-500 text-sm py-2">
                      Showing 50 of {filteredPlates.length} plates. Use search to find more.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
