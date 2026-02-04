'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, X, Search, Check, Minus, RefreshCw } from 'lucide-react';
import { api, Plate } from '@/lib/api';

const MAX_PLATES = 4;

export default function PlateComparisonPage() {
  const [allPlates, setAllPlates] = useState<Plate[]>([]);
  const [selectedPlates, setSelectedPlates] = useState<Plate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlates() {
      try {
        const plates = await api.getPlates({ limit: 500 });
        setAllPlates(plates);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plates');
      } finally {
        setLoading(false);
      }
    }
    loadPlates();
  }, []);

  const filteredPlates = allPlates.filter((plate) => {
    const term = searchTerm.toLowerCase();
    const alreadySelected = selectedPlates.some((p) => p.id === plate.id);
    if (alreadySelected) return false;
    return (
      plate.display_name?.toLowerCase().includes(term) ||
      plate.family_name?.toLowerCase().includes(term) ||
      plate.supplier_name?.toLowerCase().includes(term)
    );
  });

  const addPlate = (plate: Plate) => {
    if (selectedPlates.length < MAX_PLATES) {
      setSelectedPlates([...selectedPlates, plate]);
      setShowSearch(false);
      setSearchTerm('');
    }
  };

  const removePlate = (plateId: string) => {
    setSelectedPlates(selectedPlates.filter((p) => p.id !== plateId));
  };

  const clearAll = () => {
    setSelectedPlates([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/tools"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Tools
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Plate Comparison</h1>
          <p className="text-gray-600 mt-2">
            Compare technical specifications between different flexo plates side by side
          </p>
        </div>

        {/* Plate Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Selected Plates ({selectedPlates.length}/{MAX_PLATES})
            </h2>
            <div className="flex gap-2">
              {selectedPlates.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear all
                </button>
              )}
              {selectedPlates.length < MAX_PLATES && (
                <button
                  onClick={() => setShowSearch(true)}
                  className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Plate
                </button>
              )}
            </div>
          </div>

          {/* Selected Plates Pills */}
          <div className="flex flex-wrap gap-2">
            {selectedPlates.map((plate) => (
              <div
                key={plate.id}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {plate.display_name || plate.family_name}
                  </p>
                  <p className="text-xs text-blue-600">{plate.supplier_name}</p>
                </div>
                <button
                  onClick={() => removePlate(plate.id)}
                  className="p-1 hover:bg-blue-100 rounded"
                >
                  <X className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            ))}
            {selectedPlates.length === 0 && (
              <p className="text-gray-500 text-sm py-2">
                No plates selected. Click &quot;Add Plate&quot; to start comparing.
              </p>
            )}
          </div>

          {/* Search Modal */}
          {showSearch && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Add Plate to Compare</h3>
                    <button
                      onClick={() => {
                        setShowSearch(false);
                        setSearchTerm('');
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search plates by name, family, or supplier..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {filteredPlates.slice(0, 50).map((plate) => (
                    <button
                      key={plate.id}
                      onClick={() => addPlate(plate)}
                      className="w-full text-left p-3 hover:bg-gray-50 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {plate.display_name || plate.family_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {plate.supplier_name} | {plate.thickness_mm}mm |{' '}
                          {plate.process_type || 'N/A'}
                        </p>
                      </div>
                      <Plus className="w-5 h-5 text-blue-500" />
                    </button>
                  ))}
                  {filteredPlates.length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      No plates found matching your search
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Comparison Table */}
        {selectedPlates.length >= 2 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-48 sticky left-0 bg-gray-50">
                      Specification
                    </th>
                    {selectedPlates.map((plate) => (
                      <th
                        key={plate.id}
                        className="text-left py-3 px-4 text-sm font-semibold text-gray-900 min-w-[200px]"
                      >
                        <div>
                          {plate.display_name || plate.family_name}
                          <p className="font-normal text-gray-500">{plate.supplier_name}</p>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    label="Thickness"
                    plates={selectedPlates}
                    getValue={(p) => `${p.thickness_mm} mm`}
                  />
                  <ComparisonRow
                    label="Hardness"
                    plates={selectedPlates}
                    getValue={(p) => p.hardness_shore ? `${p.hardness_shore} Shore A` : null}
                  />
                  <ComparisonRow
                    label="Process Type"
                    plates={selectedPlates}
                    getValue={(p) => p.process_type}
                    highlight
                  />
                  <ComparisonRow
                    label="Imaging Type"
                    plates={selectedPlates}
                    getValue={(p) => p.imaging_type}
                  />
                  <ComparisonRow
                    label="Surface Type"
                    plates={selectedPlates}
                    getValue={(p) => p.surface_type?.replace('_', ' ')}
                  />
                  <ComparisonRow
                    label="LPI Range"
                    plates={selectedPlates}
                    getValue={(p) =>
                      p.min_lpi && p.max_lpi ? `${p.min_lpi} - ${p.max_lpi}` : null
                    }
                  />
                  <ComparisonRow
                    label="Recommended LPI"
                    plates={selectedPlates}
                    getValue={(p) => p.recommended_lpi?.toString()}
                  />
                  <ComparisonRow
                    label="Tonal Range"
                    plates={selectedPlates}
                    getValue={(p) =>
                      p.tonal_range_min_pct != null && p.tonal_range_max_pct != null
                        ? `${p.tonal_range_min_pct}% - ${p.tonal_range_max_pct}%`
                        : null
                    }
                  />
                  <ComparisonRow
                    label="Max Imager DPI"
                    plates={selectedPlates}
                    getValue={(p) => p.max_imager_dpi?.toString()}
                  />
                  <ComparisonRow
                    label="Flat Top Tech"
                    plates={selectedPlates}
                    getValue={(p) => p.flat_top_technology}
                    renderValue={(v) => v ? (
                      <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {v}
                      </span>
                    ) : null}
                  />
                  <ComparisonRow
                    label="LED Optimized"
                    plates={selectedPlates}
                    getValue={(p) => p.led_optimized}
                    renderValue={(v) => (
                      <span className={`inline-flex items-center ${v ? 'text-green-600' : 'text-gray-400'}`}>
                        {v ? <Check className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                      </span>
                    )}
                  />
                  <ComparisonRow
                    label="Engineered Surface"
                    plates={selectedPlates}
                    getValue={(p) => p.engineered_surface}
                    renderValue={(v) => (
                      <span className={`inline-flex items-center ${v ? 'text-green-600' : 'text-gray-400'}`}>
                        {v ? <Check className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                      </span>
                    )}
                  />
                  <ComparisonRow
                    label="Ink Compatibility"
                    plates={selectedPlates}
                    getValue={(p) => p.ink_compatibility}
                    renderValue={(v) =>
                      v && v.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {v.map((ink: string, i: number) => (
                            <span
                              key={i}
                              className="inline-flex px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                            >
                              {ink}
                            </span>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  <ComparisonRow
                    label="Applications"
                    plates={selectedPlates}
                    getValue={(p) => p.applications}
                    renderValue={(v) =>
                      v && v.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {v.map((app: string, i: number) => (
                            <span
                              key={i}
                              className="inline-flex px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                            >
                              {app.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  <ComparisonRow
                    label="Region Availability"
                    plates={selectedPlates}
                    getValue={(p) => p.region_availability?.join(', ')}
                  />
                  <ComparisonRow
                    label="Generation"
                    plates={selectedPlates}
                    getValue={(p) => p.plate_generation}
                    renderValue={(v) => v === 'new_2024' ? (
                      <span className="inline-flex px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                        NEW 2024
                      </span>
                    ) : v ? <span className="text-gray-600">{v}</span> : null}
                  />
                  <ComparisonRow
                    label="Product Sheet"
                    plates={selectedPlates}
                    getValue={(p) => p.product_sheet_url}
                    renderValue={(v) =>
                      v ? (
                        <a
                          href={v}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm underline"
                        >
                          View PDF
                        </a>
                      ) : null
                    }
                  />
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select plates to compare</h3>
            <p className="text-gray-500 mb-4">
              Add at least 2 plates to see a side-by-side comparison of their specifications.
            </p>
            <button
              onClick={() => setShowSearch(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Plate
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Key Differentiators Section */}
        {selectedPlates.length >= 2 && selectedPlates.some((p) => p.key_differentiators?.length) && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Differentiators</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {selectedPlates.map((plate) => (
                <div key={plate.id} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">
                    {plate.display_name || plate.family_name}
                  </h3>
                  {plate.key_differentiators && plate.key_differentiators.length > 0 ? (
                    <ul className="space-y-1">
                      {plate.key_differentiators.map((diff, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start">
                          <Check className="w-4 h-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" />
                          {diff}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">No differentiators listed</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ComparisonRowProps<T> {
  label: string;
  plates: Plate[];
  getValue: (plate: Plate) => T;
  renderValue?: (value: T) => React.ReactNode;
  highlight?: boolean;
}

function ComparisonRow<T>({
  label,
  plates,
  getValue,
  renderValue,
  highlight = false,
}: ComparisonRowProps<T>) {
  const values = plates.map((p) => getValue(p));
  const hasValues = values.some((v) => v != null && v !== '' && (!Array.isArray(v) || v.length > 0));

  if (!hasValues) return null;

  return (
    <tr className={`border-b border-gray-100 ${highlight ? 'bg-blue-50/30' : ''}`}>
      <td className="py-3 px-4 text-sm font-medium text-gray-700 sticky left-0 bg-white">
        {label}
      </td>
      {plates.map((plate, idx) => {
        const value = values[idx];
        return (
          <td key={plate.id} className="py-3 px-4 text-sm text-gray-900">
            {renderValue
              ? renderValue(value)
              : value != null && value !== ''
              ? String(value)
              : <span className="text-gray-400">-</span>}
          </td>
        );
      })}
    </tr>
  );
}
