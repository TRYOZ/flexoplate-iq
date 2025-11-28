'use client';

// frontend/src/app/dashboard/page.tsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface Equipment {
  id: string;
  nickname: string;
  model_name: string;
  supplier_name: string;
  uv_source_type: string;
  nominal_intensity_mw_cm2: number;
  lamp_install_date?: string;
  lamp_age_months?: number;
  is_primary: boolean;
}

interface FavoritePlate {
  id: string;
  plate_id: string;
  display_name: string;
  supplier_name: string;
  thickness_mm: number;
  process_type?: string;
}

interface EquivalentPlate {
  id: string;
  display_name: string;
  supplier_name: string;
  match_score: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Data
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [plates, setPlates] = useState<FavoritePlate[]>([]);
  const [equivalentsMap, setEquivalentsMap] = useState<Record<string, EquivalentPlate[]>>({});
  
  // Quick calculator state
  const [selectedPlate, setSelectedPlate] = useState<string>('');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('');
  const [exposureResult, setExposureResult] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);

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

  // Fetch all data
  useEffect(() => {
    if (token) {
      fetchAllData();
    }
  }, [token]);

  const fetchAllData = async () => {
    try {
      const [equipmentRes, platesRes] = await Promise.all([
        fetch(`${API_BASE}/api/me/equipment`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/me/plates`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      
      if (equipmentRes.status === 401 || platesRes.status === 401) {
        router.push('/login');
        return;
      }
      
      const equipmentData = await equipmentRes.json();
      const platesData = await platesRes.json();
      
      setEquipment(equipmentData);
      setPlates(platesData);
      
      // Set defaults for quick calculator
      if (equipmentData.length > 0) {
        const primary = equipmentData.find((e: Equipment) => e.is_primary) || equipmentData[0];
        setSelectedEquipment(primary.id);
      }
      if (platesData.length > 0) {
        setSelectedPlate(platesData[0].plate_id);
      }
      
      // Fetch equivalents for each plate
      for (const plate of platesData.slice(0, 5)) {
        fetchEquivalents(plate.plate_id);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEquivalents = async (plateId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/equivalency/find?plate_id=${plateId}&limit=3`);
      const data = await res.json();
      setEquivalentsMap(prev => ({ ...prev, [plateId]: data.equivalents || [] }));
    } catch (err) {
      console.error('Failed to fetch equivalents:', err);
    }
  };

  const calculateExposure = async () => {
    if (!selectedPlate || !selectedEquipment) return;
    
    setCalculating(true);
    setExposureResult(null);
    
    try {
      const eq = equipment.find(e => e.id === selectedEquipment);
      if (!eq) return;
      
      // Calculate current intensity based on lamp age
      let intensity = eq.nominal_intensity_mw_cm2;
      if (eq.lamp_age_months && !eq.uv_source_type?.includes('LED')) {
        intensity = intensity * (1 - 0.025 * eq.lamp_age_months);
        intensity = Math.max(intensity, eq.nominal_intensity_mw_cm2 * 0.5);
      }
      
      const res = await fetch(`${API_BASE}/api/exposure/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate_id: selectedPlate,
          current_intensity_mw_cm2: intensity
        })
      });
      
      const data = await res.json();
      setExposureResult(data);
    } catch (err) {
      console.error('Failed to calculate:', err);
    } finally {
      setCalculating(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getLampStatus = (ageMonths?: number, uvType?: string) => {
    if (!ageMonths || uvType?.includes('LED')) return null;
    if (ageMonths < 6) return { color: 'bg-green-500', text: 'Good', urgent: false };
    if (ageMonths < 12) return { color: 'bg-yellow-500', text: 'Monitor', urgent: false };
    if (ageMonths < 18) return { color: 'bg-orange-500', text: 'Replace Soon', urgent: true };
    return { color: 'bg-red-500', text: 'Replace Now', urgent: true };
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  // Find equipment needing attention
  const urgentEquipment = equipment.filter(eq => {
    const status = getLampStatus(eq.lamp_age_months, eq.uv_source_type);
    return status?.urgent;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{user?.first_name ? `, ${user.first_name}` : ''}! 👋
        </h1>
        <p className="text-gray-600">Here's your plate room at a glance</p>
      </div>

      {/* Alerts */}
      {urgentEquipment.length > 0 && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-medium text-orange-800">Equipment Attention Needed</h3>
              <p className="text-sm text-orange-700 mt-1">
                {urgentEquipment.map(eq => eq.nickname).join(', ')} - lamps may need replacement
              </p>
              <Link href="/my-equipment" className="text-sm text-orange-600 hover:underline mt-2 inline-block">
                View equipment →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-3xl font-bold text-blue-600">{plates.length}</p>
          <p className="text-sm text-gray-600">Saved Plates</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-3xl font-bold text-green-600">{equipment.length}</p>
          <p className="text-sm text-gray-600">Equipment Units</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-3xl font-bold text-purple-600">
            {new Set(plates.map(p => p.supplier_name)).size}
          </p>
          <p className="text-sm text-gray-600">Plate Suppliers</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-3xl font-bold text-orange-600">
            {Object.values(equivalentsMap).flat().length}
          </p>
          <p className="text-sm text-gray-600">Equivalents Found</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick Exposure Calculator */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            ⚡ Quick Exposure Calculator
          </h2>
          
          {plates.length === 0 || equipment.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-4">Add plates and equipment to use quick calculator</p>
              <div className="flex gap-2 justify-center">
                <Link href="/my-plates" className="text-blue-600 hover:underline">Add plates</Link>
                <span>•</span>
                <Link href="/my-equipment" className="text-blue-600 hover:underline">Add equipment</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plate</label>
                  <select
                    value={selectedPlate}
                    onChange={(e) => {
                      setSelectedPlate(e.target.value);
                      setExposureResult(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    {plates.map(p => (
                      <option key={p.plate_id} value={p.plate_id}>
                        {p.display_name} ({p.supplier_name})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Equipment</label>
                  <select
                    value={selectedEquipment}
                    onChange={(e) => {
                      setSelectedEquipment(e.target.value);
                      setExposureResult(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    {equipment.map(eq => (
                      <option key={eq.id} value={eq.id}>
                        {eq.nickname} ({eq.uv_source_type})
                        {eq.lamp_age_months ? ` - ${eq.lamp_age_months}mo old` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button
                  onClick={calculateExposure}
                  disabled={calculating}
                  className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg"
                >
                  {calculating ? 'Calculating...' : 'Calculate Exposure'}
                </button>
              </div>
              
              {exposureResult && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-medium text-blue-900 mb-3">Recommended Times</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-blue-700">Back Exposure</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatTime(exposureResult.exposure?.back_exposure_time_s || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Main Exposure</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatTime(exposureResult.exposure?.main_exposure_time_s || 0)}
                      </p>
                    </div>
                  </div>
                  <Link 
                    href="/exposure" 
                    className="text-sm text-blue-600 hover:underline mt-3 inline-block"
                  >
                    Open full calculator →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Equipment Overview */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              🔧 My Equipment
            </h2>
            <Link href="/my-equipment" className="text-sm text-blue-600 hover:underline">
              Manage →
            </Link>
          </div>
          
          {equipment.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-4">No equipment saved yet</p>
              <Link href="/my-equipment" className="text-blue-600 hover:underline">
                Add your first equipment
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {equipment.slice(0, 3).map(eq => {
                const lampStatus = getLampStatus(eq.lamp_age_months, eq.uv_source_type);
                const isLED = eq.uv_source_type?.includes('LED');
                
                return (
                  <div key={eq.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">{eq.nickname}</p>
                        <p className="text-sm text-gray-500">{eq.model_name}</p>
                      </div>
                      {lampStatus && (
                        <span className={`text-xs px-2 py-1 rounded-full text-white ${lampStatus.color}`}>
                          {lampStatus.text}
                        </span>
                      )}
                      {isLED && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                          LED ✓
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      {eq.nominal_intensity_mw_cm2} mW/cm²
                      {eq.lamp_age_months ? ` • ${eq.lamp_age_months} months old` : ''}
                    </div>
                  </div>
                );
              })}
              {equipment.length > 3 && (
                <p className="text-sm text-gray-500 text-center">
                  +{equipment.length - 3} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* My Plates with Equivalents */}
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            📋 My Plates & Equivalents
          </h2>
          <Link href="/my-plates" className="text-sm text-blue-600 hover:underline">
            Manage →
          </Link>
        </div>
        
        {plates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-4">No plates saved yet</p>
            <Link href="/my-plates" className="text-blue-600 hover:underline">
              Add your commonly used plates
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Your Plate</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Supplier</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Thickness</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Top Equivalents</th>
                </tr>
              </thead>
              <tbody>
                {plates.slice(0, 5).map(plate => (
                  <tr key={plate.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <p className="font-medium text-gray-900">{plate.display_name}</p>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{plate.supplier_name}</td>
                    <td className="py-3 px-2 text-gray-600">{plate.thickness_mm}mm</td>
                    <td className="py-3 px-2">
                      {equivalentsMap[plate.plate_id]?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {equivalentsMap[plate.plate_id].slice(0, 2).map(eq => (
                            <span 
                              key={eq.id}
                              className="inline-flex items-center gap-1 text-sm bg-gray-100 px-2 py-1 rounded"
                            >
                              <span className="font-medium">{eq.display_name}</span>
                              <span className={`text-xs ${getScoreColor(eq.match_score)}`}>
                                {eq.match_score}%
                              </span>
                            </span>
                          ))}
                          {equivalentsMap[plate.plate_id].length > 2 && (
                            <span className="text-xs text-gray-500">
                              +{equivalentsMap[plate.plate_id].length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Loading...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plates.length > 5 && (
              <p className="text-sm text-gray-500 text-center mt-4">
                Showing 5 of {plates.length} plates • <Link href="/my-plates" className="text-blue-600 hover:underline">View all</Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link 
          href="/"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-2xl">🔄</span>
          <p className="mt-2 font-medium text-gray-900">Find Equivalent</p>
          <p className="text-xs text-gray-500">Search all plates</p>
        </Link>
        <Link 
          href="/exposure"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-2xl">⏱️</span>
          <p className="mt-2 font-medium text-gray-900">Exposure Calc</p>
          <p className="text-xs text-gray-500">Full calculator</p>
        </Link>
        <Link 
          href="/my-plates"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-2xl">➕</span>
          <p className="mt-2 font-medium text-gray-900">Add Plate</p>
          <p className="text-xs text-gray-500">Save favorites</p>
        </Link>
        <Link 
          href="/plates"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-2xl">📚</span>
          <p className="mt-2 font-medium text-gray-900">Plate Catalog</p>
          <p className="text-xs text-gray-500">Browse all plates</p>
        </Link>
      </div>
    </div>
  );
}
