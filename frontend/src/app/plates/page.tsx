'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, ChevronDown, ChevronUp, ExternalLink, FileText, Zap, Sparkles, Check } from 'lucide-react';
import { api, Plate, Supplier } from '@/lib/api';

function PlateDetailRow({ plate }: { plate: Plate }) {
  const [expanded, setExpanded] = useState(false);
  
  const formatApplication = (app: string) => {
    return app.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };
  
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
          <div className="flex flex-wrap gap-1 mt-1">
            {plate.flat_top_technology && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                {plate.flat_top_technology}
              </span>
            )}
            {plate.led_optimized && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                <Zap className="w-3 h-3 mr-0.5" />
                LED
              </span>
            )}
            {plate.engineered_surface && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                <Sparkles className="w-3 h-3 mr-0.5" />
                Eng. Surface
              </span>
            )}
            {plate.plate_generation === 'new_2024' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                NEW
              </span>
            )}
          </div>
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
            {plate.process_type || plate.imaging_type || 'N/A'}
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Imaging Type</p>
                  <p className="font-medium">{plate.imaging_type || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">LPI Range</p>
                  <p className="font-medium">
                    {plate.min_lpi && plate.max_lpi 
                      ? `${plate.min_lpi} – ${plate.max_lpi}`
                      : plate.recommended_lpi
                      ? `Up to ${plate.recommended_lpi}`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Tonal Range</p>
                  <p className="font-medium">
                    {plate.tonal_range_min_pct != null && plate.tonal_range_max_pct != null
                      ? `${plate.tonal_range_min_pct}% – ${plate.tonal_range_max_pct}%`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Max Imager DPI</p>
                  <p className="font-medium">{plate.max_imager_dpi || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Ink Compatibility</p>
                  <p className="font-medium">
                    {plate.ink_compatibility?.length 
                      ? plate.ink_compatibility.join(', ')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Region</p>
                  <p className="font-medium">
                    {plate.region_availability?.length 
                      ? plate.region_availability.join(', ')
                      : 'Global'}
                  </p>
                </div>
              </div>
              
              {plate.substrate_detail && (
                <div>
                  <p className="text-gray-500 text-sm">Substrate Suitability</p>
                  <p className="text-sm text-gray-700">{plate.substrate_detail}</p>
                </div>
              )}
              
              {plate.key_differentiators && plate.key_differentiators.length > 0 && (
                <div>
                  <p className="text-gray-500 text-sm mb-2">Key Features</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {plate.key_differentiators.map((diff, i) => (
                      <li key={i} className="flex items-start text-sm text-gray-700">
                        <Check className="w-4 h-4 text-green-500 mr-1.5 mt-0.5 flex-shrink-0" />
                        {diff}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {plate.applications && plate.applications.length > 0 && (
                <div>
                  <p className="text-gray-500 text-sm mb-2">Applications</p>
                  <div className="flex flex-wrap gap-1">
                    {plate.applications.map((app, i) => (
                      <span 
                        key={i} 
                        className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                      >
                        {formatApplication(app)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {plate.product_sheet_url && (
                <div className="pt-2 border-t border-gray-200">
                  
                    href={plate.product_sheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    View Product Sheet (PDF)
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedProcess, setSelectedProcess] = useState('');
  const [selectedThickness, setSelectedThickness] = useState('');
  const [selectedSurface, setSelectedSurface] = useState('');
  const [ledOptimizedOnly, setLedOptimizedOnly] = useState(false);
  const [flatTopOnly, setFlatTopOnly] = useState(false);
  const [hasProductSheetOnly, setHasProductSheetOnly] = useState(false);
  
  useEffect(() => {
    async function loadData() {
      try {
        const [platesData, suppliersData] = await Promise.all([
          api.getPlates({ limit: 300 }),
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
  
  const thicknesses = Array.from(new Set(plates.map(p => p.thickness_mm))).sort((a, b) => a - b);
  const surfaceTypes = Array.from(new Set(plates.map(p => p.surface_type).filter(Boolean)));
  
  const filteredPlates = plates.filter(plate => {
    const matchesSearch = !searchTerm || 
      plate.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.family_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.sku_code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSupplier = !selectedSupplier || plate.supplier_name === selectedSupplier;
    const matchesProcess = !selectedProcess || plate.process_type === selectedProcess || plate.imaging_type === selectedProcess;
    const matchesThickness = !selectedThickness || plate.thickness_mm === parseFloat(selectedThickness);
    const matchesSurface = !selectedSurface || plate.surface_type === selectedSurface;
    const matchesLed = !ledOptimizedOnly || plate.led_optimized;
    const matchesFlatTop = !flatTopOnly || plate.flat_top_technology;
    const matchesProductSheet = !hasProductSheetOnly || plate.product_sheet_url;
    
    return matchesSearch && matchesSupplier && matchesProcess && matchesThickness && 
           matchesSurface && matchesLed && matchesFlatTop && matchesProductSheet;
  });
  
  const supplierCounts = plates.reduce((acc, p) => {
    acc[p.supplier_name] = (acc[p.supplier_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const ledCount = plates.filter(p => p.led_optimized).length;
  const flatTopCount = plates.filter(p => p.flat_top_technology).length;
  const productSheetCount = plates.filter(p => p.product_sheet_url).length;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Plate Catalog</h2>
          <p className="text-gray-600 mt-1">
            {plates.length} plates from {Object.keys(supplierCounts).length} suppliers
            {productSheetCount > 0 && (
              <span className="ml-2 text-blue-600">• {productSheetCount} with product sheets</span>
            )}
          </p>
        </div>
        
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
      
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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
          
          <select
            value={selectedProcess}
            onChange={(e) => setSelectedProcess(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Processes</option>
            <option value="solvent">Solvent</option>
            <option value="thermal">Thermal</option>
            <option value="digital">Digital</option>
            <option value="analog">Analog</option>
          </select>
          
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
          
          <select
            value={selectedSurface}
            onChange={(e) => setSelectedSurface(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Surfaces</option>
            {surfaceTypes.map(s => (
              <option key={s} value={s}>{s?.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ledOptimizedOnly}
              onChange={(e) => setLedOptimizedOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              <Zap className="w-3 h-3 inline mr-1 text-green-600" />
              LED Optimized ({ledCount})
            </span>
          </label>
          
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={flatTopOnly}
              onChange={(e) => setFlatTopOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Flat-Top Only ({flatTopCount})
            </span>
          </label>
          
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasProductSheetOnly}
              onChange={(e) => setHasProductSheetOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              <FileText className="w-3 h-3 inline mr-1 text-blue-600" />
              Has Product Sheet ({productSheetCount})
            </span>
          </label>
        </div>
      </div>
      
      <p className="text-sm text-gray-500">
        Showing {filteredPlates.length} of {plates.length} plates
      </p>
      
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
