'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { api, Plate, Supplier } from '@/lib/api';

function PlateDetailRow({ plate }: { plate: Plate }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <>
      <tr 
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4">
          <div className="font-medium text-gray-900">
            {plate.display_name || plate.family_name}
          </div>
          {plate.sku_code && (
            <div className="text-xs text-gray-500">{plate.sku_code}</div>
          )}
        </td>
        <td className="py-3 px-4 text-gray-600">{plate.supplier_name}</td>
        <td className="py-3 px-4 text-gray-600">{plate.thickness_mm} mm</td>
        <td className="py-3 px-4 text-gray-600">{plate.hardness_shore || '—'}</td>
        <td className="py-3 px-4">
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            plate.process_type === 'solvent' 
              ? 'bg-purple-100 text-purple-700'
              : plate.process_type === 'thermal'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {plate.process_type || 'N/A'}
          </span>
        </td>
        <td className="py-3 px-4">
          <span className="text-xs text-gray-500">
            {plate.surface_type?.replace('_', ' ') || '—'}
          </span>
        </td>
        <td className="py-3 px-4 text-center">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 inline" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 inline" />
          )}
        </td>
      </tr>
      
      {expanded && (
        <tr className="bg-gray-50 border-b border-gray-200">
          <td colSpan={7} className="py-4 px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Imaging Type</p>
                <p className="font-medium">{plate.imaging_type || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">LPI Range</p>
                <p className="font-medium">
                  {plate.min_lpi && plate.max_lpi 
                    ? `${plate.min_lpi} – ${plate.max_lpi}`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Ink Compatibility</p>
                <p className="font-medium">
                  {plate.ink_compatibility?.join(', ') || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Substrates</p>
                <p className="font-medium">
                  {plate.substrate_categories?.join(', ') || 'N/A'}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-gray-500">Applications</p>
                <p className="font-medium">
                  {plate.applications?.map(a => a.replace(/_/g, ' ')).join(', ') || 'N/A'}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PlatesPage() {
  const [plates, setPlates] = useState<Plate[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedProcess, setSelectedProcess] = useState('');
  const [selectedThickness, setSelectedThickness] = useState('');
  
  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const [platesData, suppliersData] = await Promise.all([
          api.getPlates({ limit: 200 }),
          api.getSuppliers(true)
        ]);
        setPlates(platesData);
        setSuppliers(suppliersData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plates');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);
  
  // Get unique thicknesses
const thicknesses = Array.from(new Set(plates.map(p => p.thickness_mm))).sort((a, b) => a - b);
  
  // Filter plates
  const filteredPlates = plates.filter(plate => {
    const matchesSearch = !searchTerm || 
      plate.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.sku_code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSupplier = !selectedSupplier || plate.supplier_name === selectedSupplier;
    const matchesProcess = !selectedProcess || plate.process_type === selectedProcess;
    const matchesThickness = !selectedThickness || plate.thickness_mm === parseFloat(selectedThickness);
    
    return matchesSearch && matchesSupplier && matchesProcess && matchesThickness;
  });
  
  // Group by supplier for summary
  const supplierCounts = plates.reduce((acc, p) => {
    acc[p.supplier_name] = (acc[p.supplier_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Plate Catalog</h2>
          <p className="text-gray-600 mt-1">
            {plates.length} plates from {Object.keys(supplierCounts).length} suppliers
          </p>
        </div>
        
        {/* Supplier summary chips */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(supplierCounts).map(([supplier, count]) => (
            <span 
              key={supplier}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
            >
              {supplier}: {count}
            </span>
          ))}
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search plates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* Supplier filter */}
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Suppliers</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          
          {/* Process filter */}
          <select
            value={selectedProcess}
            onChange={(e) => setSelectedProcess(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Processes</option>
            <option value="solvent">Solvent</option>
            <option value="thermal">Thermal</option>
            <option value="water_wash">Water Wash</option>
          </select>
          
          {/* Thickness filter */}
          <select
            value={selectedThickness}
            onChange={(e) => setSelectedThickness(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Thicknesses</option>
            {thicknesses.map(t => (
              <option key={t} value={t}>{t} mm</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Results count */}
      <p className="text-sm text-gray-500">
        Showing {filteredPlates.length} of {plates.length} plates
      </p>
      
      {/* Plates table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Plate</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Supplier</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Thickness</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Hardness</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Process</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Surface</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPlates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No plates match your filters
                  </td>
                </tr>
              ) : (
                filteredPlates.map(plate => (
                  <PlateDetailRow key={plate.id} plate={plate} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
