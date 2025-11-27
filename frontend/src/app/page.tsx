'use client';

import { useState, useEffect } from 'react';
import { Search, ArrowRight, Check, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { api, Plate, PlateEquivalent, Supplier } from '@/lib/api';

function ScoreBadge({ score }: { score: number }) {
  let colorClass = 'bg-gray-100 text-gray-800';
  let label = 'Low';
  
  if (score >= 90) {
    colorClass = 'bg-green-100 text-green-800';
    label = 'Excellent';
  } else if (score >= 75) {
    colorClass = 'bg-blue-100 text-blue-800';
    label = 'Good';
  } else if (score >= 60) {
    colorClass = 'bg-yellow-100 text-yellow-800';
    label = 'Fair';
  } else if (score >= 40) {
    colorClass = 'bg-orange-100 text-orange-800';
    label = 'Limited';
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {score}% {label}
    </span>
  );
}

function PlateCard({ plate, onClick, selected }: { plate: Plate; onClick: () => void; selected?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
        selected 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-gray-900">
            {plate.display_name || plate.family_name}
          </p>
          <p className="text-sm text-gray-500">{plate.supplier_name}</p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
          {plate.thickness_mm}mm
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {plate.process_type && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
            {plate.process_type}
          </span>
        )}
        {plate.surface_type && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
            {plate.surface_type.replace('_', ' ')}
          </span>
        )}
        {plate.imaging_type && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
            {plate.imaging_type}
          </span>
        )}
      </div>
    </button>
  );
}

function EquivalentCard({ plate }: { plate: PlateEquivalent }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="font-medium text-gray-900">
            {plate.display_name || plate.family_name}
          </p>
          <p className="text-sm text-gray-500">{plate.supplier_name}</p>
        </div>
        <ScoreBadge score={plate.similarity_score} />
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <span className="text-gray-500">Thickness:</span>{' '}
          <span className="font-medium">{plate.thickness_mm}mm</span>
        </div>
        <div>
          <span className="text-gray-500">Hardness:</span>{' '}
          <span className="font-medium">{plate.hardness_shore || 'N/A'} Shore</span>
        </div>
        <div>
          <span className="text-gray-500">Process:</span>{' '}
          <span className="font-medium">{plate.process_type || 'N/A'}</span>
        </div>
        <div>
          <span className="text-gray-500">Surface:</span>{' '}
          <span className="font-medium">{plate.surface_type?.replace('_', ' ') || 'N/A'}</span>
        </div>
      </div>
      
      {plate.match_notes && plate.match_notes.length > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-3">
          <p className="text-xs text-gray-500 mb-1">Notes:</p>
          <ul className="space-y-1">
            {plate.match_notes.map((note, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                {note.startsWith('✓') ? (
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                )}
                <span>{note.replace('✓ ', '')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [plates, setPlates] = useState<Plate[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedPlate, setSelectedPlate] = useState<Plate | null>(null);
  const [equivalents, setEquivalents] = useState<PlateEquivalent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [targetSupplier, setTargetSupplier] = useState('');
  
  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [platesData, suppliersData] = await Promise.all([
          api.getPlates({ limit: 100 }),
          api.getSuppliers(true)
        ]);
        setPlates(platesData);
        setSuppliers(suppliersData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);
  
  // Filter plates
  const filteredPlates = plates.filter(plate => {
    const matchesSearch = !searchTerm || 
      plate.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.sku_code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSupplier = !selectedSupplier || 
      plate.supplier_name === selectedSupplier;
    
    return matchesSearch && matchesSupplier;
  });
  
  // Find equivalents when plate is selected
  async function findEquivalents(plate: Plate) {
    setSelectedPlate(plate);
    setEquivalents([]);
    setSearchLoading(true);
    setError(null);
    
    try {
      const result = await api.findEquivalents({
        source_plate_id: plate.id,
        target_supplier: targetSupplier || undefined
      });
      setEquivalents(result.equivalents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find equivalents');
    } finally {
      setSearchLoading(false);
    }
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }
  
  if (error && !plates.length) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-medium text-red-900 mb-2">Connection Error</h2>
        <p className="text-red-700">{error}</p>
        <p className="text-sm text-red-600 mt-2">
          Make sure the backend API is running and accessible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Plate Equivalency Finder</h2>
        <p className="text-gray-600 mt-1">
          Select a plate to find equivalent alternatives from other suppliers
        </p>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left panel - Source plate selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-4">1. Select Source Plate</h3>
          
          {/* Search and filter */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search plates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          
          {/* Plate list */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredPlates.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No plates found</p>
            ) : (
              filteredPlates.map(plate => (
                <PlateCard
                  key={plate.id}
                  plate={plate}
                  selected={selectedPlate?.id === plate.id}
                  onClick={() => findEquivalents(plate)}
                />
              ))
            )}
          </div>
        </div>
        
        {/* Right panel - Equivalents */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">2. Equivalent Plates</h3>
            
            {/* Target supplier filter */}
            <select
              value={targetSupplier}
              onChange={(e) => {
                setTargetSupplier(e.target.value);
                if (selectedPlate) findEquivalents(selectedPlate);
              }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any Supplier</option>
              {suppliers.filter(s => s.name !== selectedPlate?.supplier_name).map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          
          {!selectedPlate ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ArrowRight className="w-12 h-12 mb-3" />
              <p>Select a source plate to find equivalents</p>
            </div>
          ) : searchLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : equivalents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <AlertTriangle className="w-12 h-12 mb-3" />
              <p className="text-center">No equivalents found</p>
              <p className="text-sm text-center mt-1">
                Try selecting a different target supplier or plate
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {/* Source plate summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Source:</span>{' '}
                  {selectedPlate.display_name || selectedPlate.family_name}{' '}
                  ({selectedPlate.supplier_name}) • {selectedPlate.thickness_mm}mm
                </p>
              </div>
              
              {/* Results count */}
              <p className="text-sm text-gray-500">
                Found {equivalents.length} equivalent{equivalents.length !== 1 ? 's' : ''}
              </p>
              
              {/* Equivalent plates */}
              {equivalents.map(plate => (
                <EquivalentCard key={plate.id} plate={plate} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
