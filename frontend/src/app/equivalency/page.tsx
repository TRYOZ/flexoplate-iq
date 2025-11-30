'use client';

// frontend/src/app/equivalency/page.tsx
// ======================================
// Plate Equivalency Finder Tool

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface Plate {
  id: string;
  name: string;
  supplier: string;
  family: string;
  thickness_mm: number;
  hardness_shore_a: number;
  polymer_type: string;
  imaging_type: string;
  surface_treatment: string;
  application: string;
}

interface EquivalentPlate extends Plate {
  similarity_score: number;
  notes: string[];
}

export default function EquivalencyPage() {
  const [plates, setPlates] = useState<Plate[]>([]);
  const [selectedPlate, setSelectedPlate] = useState<Plate | null>(null);
  const [equivalents, setEquivalents] = useState<EquivalentPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [targetSupplier, setTargetSupplier] = useState('');

  // Fetch all plates on mount
  useEffect(() => {
    fetchPlates();
  }, []);

  const fetchPlates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plates?limit=500`);
      if (res.ok) {
        const data = await res.json();
        setPlates(Array.isArray(data) ? data : data.plates || []);
      }
    } catch (err) {
      console.error('Failed to fetch plates:', err);
    } finally {
      setLoading(false);
    }
  };

  const findEquivalents = async (plate: Plate) => {
    setSelectedPlate(plate);
    setSearchLoading(true);
    setEquivalents([]);

    try {
      let url = `${API_BASE}/api/equivalency/find?plate_id=${plate.id}`;
      if (targetSupplier) {
        url += `&target_supplier=${encodeURIComponent(targetSupplier)}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEquivalents(Array.isArray(data) ? data : data.equivalents || []);
      }
    } catch (err) {
      console.error('Failed to find equivalents:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Get unique suppliers for filter - TypeScript compatible
  const suppliers = Array.from(new Set(plates.map(p => p.supplier))).sort();

  // Filter plates by search term
  const filteredPlates = plates.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.family?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group plates by supplier
  const platesBySupplier = filteredPlates.reduce((acc, plate) => {
    if (!acc[plate.supplier]) acc[plate.supplier] = [];
    acc[plate.supplier].push(plate);
    return acc;
  }, {} as Record<string, Plate[]>);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Plate Equivalency Finder</h1>
        <p className="text-gray-600">Select a plate to find equivalent alternatives from other suppliers</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Plate Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">1. Select Source Plate</h2>
          
          {/* Search */}
          <input
            type="text"
            placeholder="Search plates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />

          {/* Plate List */}
          <div className="max-h-96 overflow-y-auto space-y-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : Object.keys(platesBySupplier).length === 0 ? (
              <p className="text-gray-500 text-center py-8">No plates found</p>
            ) : (
              Object.entries(platesBySupplier).map(([supplier, supplierPlates]) => (
                <div key={supplier}>
                  <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">{supplier}</h3>
                  <div className="space-y-2">
                    {supplierPlates.map(plate => (
                      <button
                        key={plate.id}
                        onClick={() => findEquivalents(plate)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedPlate?.id === plate.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <p className="font-medium text-gray-900">{plate.name}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {plate.thickness_mm}mm
                          </span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {plate.hardness_shore_a} Shore A
                          </span>
                          {plate.imaging_type && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                              {plate.imaging_type}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Equivalent Plates */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">2. Equivalent Plates</h2>
            
            {/* Supplier Filter */}
            <select
              value={targetSupplier}
              onChange={(e) => {
                setTargetSupplier(e.target.value);
                if (selectedPlate) findEquivalents(selectedPlate);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {!selectedPlate ? (
            <div className="text-center py-12 text-gray-500">
              <p>Select a source plate to find equivalents</p>
            </div>
          ) : searchLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : equivalents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No equivalent plates found</p>
              <p className="text-sm mt-2">Try selecting a different supplier filter</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {equivalents.map(eq => (
                <div key={eq.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{eq.name}</p>
                      <p className="text-sm text-gray-500">{eq.supplier}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                        eq.similarity_score >= 90 ? 'bg-green-100 text-green-700' :
                        eq.similarity_score >= 70 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {eq.similarity_score}% match
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {eq.thickness_mm}mm
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {eq.hardness_shore_a} Shore A
                    </span>
                  </div>
                  {eq.notes && eq.notes.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      {eq.notes.join(' • ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
