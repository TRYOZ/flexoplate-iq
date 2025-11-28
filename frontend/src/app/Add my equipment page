'use client';

// frontend/src/app/my-equipment/page.tsx

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
  location?: string;
  is_primary: boolean;
}

interface EquipmentModel {
  id: string;
  model_name: string;
  supplier_name: string;
  uv_source_type: string;
  nominal_intensity_mw_cm2: number;
}

export default function MyEquipmentPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  
  const [myEquipment, setMyEquipment] = useState<Equipment[]>([]);
  const [availableModels, setAvailableModels] = useState<EquipmentModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Add equipment form
  const [newEquipment, setNewEquipment] = useState({
    equipment_model_id: '',
    nickname: '',
    lamp_install_date: '',
    location: ''
  });

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
      fetchMyEquipment();
      fetchAvailableModels();
    }
  }, [token]);

  const fetchMyEquipment = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
        localStorage.removeItem('flexoplate_token');
        localStorage.removeItem('flexoplate_user');
        router.push('/login');
        return;
      }
      
      const data = await res.json();
      setMyEquipment(data);
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/equipment/models`);
      const data = await res.json();
      setAvailableModels(data);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch(`${API_BASE}/api/me/equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newEquipment)
      });
      
      if (res.ok) {
        setShowAddModal(false);
        setNewEquipment({ equipment_model_id: '', nickname: '', lamp_install_date: '', location: '' });
        fetchMyEquipment();
      }
    } catch (err) {
      console.error('Failed to add equipment:', err);
    }
  };

  const handleRemoveEquipment = async (id: string) => {
    if (!confirm('Remove this equipment from your list?')) return;
    
    try {
      await fetch(`${API_BASE}/api/me/equipment/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchMyEquipment();
    } catch (err) {
      console.error('Failed to remove equipment:', err);
    }
  };

  const handleUpdateLampDate = async (id: string, date: string) => {
    try {
      await fetch(`${API_BASE}/api/me/equipment/${id}/lamp-date?lamp_install_date=${date}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchMyEquipment();
    } catch (err) {
      console.error('Failed to update lamp date:', err);
    }
  };

  const getLampStatus = (ageMonths?: number, uvType?: string) => {
    if (!ageMonths || uvType?.includes('LED')) return null;
    if (ageMonths < 6) return { color: 'bg-green-100 text-green-700', text: 'Good' };
    if (ageMonths < 12) return { color: 'bg-yellow-100 text-yellow-700', text: 'Monitor' };
    if (ageMonths < 18) return { color: 'bg-orange-100 text-orange-700', text: 'Replace Soon' };
    return { color: 'bg-red-100 text-red-700', text: 'Replace Now' };
  };

  const calculateDegradation = (ageMonths: number, nominal: number) => {
    const degradationPerMonth = 0.025; // 2.5% per month for tubes
    const currentIntensity = nominal * (1 - degradationPerMonth * ageMonths);
    return Math.max(currentIntensity, nominal * 0.5); // Min 50%
  };

  // Group available models by supplier
  const modelsBySupplier = availableModels.reduce((acc, model) => {
    if (!acc[model.supplier_name]) acc[model.supplier_name] = [];
    acc[model.supplier_name].push(model);
    return acc;
  }, {} as Record<string, EquipmentModel[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Equipment</h1>
          <p className="text-gray-600">Manage your saved exposure units</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <span className="text-xl">+</span> Add Equipment
        </button>
      </div>

      {/* Equipment List */}
      {myEquipment.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-5xl mb-4">🔧</p>
          <h3 className="text-lg font-medium mb-2">No equipment saved yet</h3>
          <p className="text-gray-500 mb-6">
            Add your exposure units to pre-fill settings in the calculator and track lamp ages
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg"
          >
            Add Your First Equipment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {myEquipment.map(eq => {
            const lampStatus = getLampStatus(eq.lamp_age_months, eq.uv_source_type);
            const isLED = eq.uv_source_type?.includes('LED');
            
            return (
              <div key={eq.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {eq.nickname}
                      {eq.is_primary && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Primary</span>
                      )}
                    </h3>
                    <p className="text-gray-600">
                      {eq.supplier_name} {eq.model_name}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {eq.uv_source_type} • {eq.nominal_intensity_mw_cm2} mW/cm² nominal
                      {eq.location && ` • ${eq.location}`}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handleRemoveEquipment(eq.id)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Remove equipment"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                
                {/* Lamp info section */}
                <div className="mt-4 pt-4 border-t">
                  {isLED ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm">LED units maintain consistent intensity - no lamp tracking needed</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <label className="block text-sm text-gray-500 mb-1">Lamp Install Date</label>
                        <input
                          type="date"
                          value={eq.lamp_install_date || ''}
                          onChange={(e) => handleUpdateLampDate(eq.id, e.target.value)}
                          className="border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      
                      {eq.lamp_age_months !== undefined && eq.lamp_age_months >= 0 && (
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Lamp Age</p>
                          <p className="text-xl font-semibold">{eq.lamp_age_months} months</p>
                          {lampStatus && (
                            <span className={`inline-block text-xs px-2 py-1 rounded-full mt-1 ${lampStatus.color}`}>
                              {lampStatus.text}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {eq.lamp_age_months !== undefined && eq.lamp_age_months > 0 && (
                        <div className="w-full mt-2 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">
                            <strong>Estimated current intensity:</strong>{' '}
                            {calculateDegradation(eq.lamp_age_months, eq.nominal_intensity_mw_cm2).toFixed(1)} mW/cm²
                            <span className="text-gray-400 ml-2">
                              ({Math.round((1 - calculateDegradation(eq.lamp_age_months, eq.nominal_intensity_mw_cm2) / eq.nominal_intensity_mw_cm2) * 100)}% degradation)
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link href="/" className="text-blue-500 hover:underline">
          ← Back to Calculator
        </Link>
      </div>

      {/* Add Equipment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Equipment</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAddEquipment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Model <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={newEquipment.equipment_model_id}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, equipment_model_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Select equipment...</option>
                  {Object.keys(modelsBySupplier).sort().map(supplier => (
                    <optgroup key={supplier} label={supplier}>
                      {modelsBySupplier[supplier].map(model => (
                        <option key={model.id} value={model.id}>
                          {model.model_name} ({model.uv_source_type}, {model.nominal_intensity_mw_cm2} mW/cm²)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nickname <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Exposure Unit 1, Main Cyrel, Plate Room A"
                  value={newEquipment.nickname}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, nickname: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="e.g., Plate Room, Building 2"
                  value={newEquipment.location}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lamp Install Date
                </label>
                <input
                  type="date"
                  value={newEquipment.lamp_install_date}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, lamp_install_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  For UV tube units - helps track lamp age and intensity degradation
                </p>
              </div>
              
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
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg"
                >
                  Add Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
