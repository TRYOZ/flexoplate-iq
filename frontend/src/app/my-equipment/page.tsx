'use client';

// frontend/src/app/my-equipment/page.tsx
// =======================================
// Standalone - no AuthContext dependency

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface Equipment {
  id: string;
  nickname: string;
  model_name: string;
  supplier_name: string;
  uv_source_type: string;
  lamp_install_date: string;
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
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  
  const [myEquipment, setMyEquipment] = useState<Equipment[]>([]);
  const [availableModels, setAvailableModels] = useState<EquipmentModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [newEquipment, setNewEquipment] = useState({
    equipment_model_id: '',
    nickname: '',
    lamp_install_date: '',
    location: ''
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auth check
  useEffect(() => {
    if (!mounted) return;

    const storedToken = localStorage.getItem('flexoplate_token');
    
    if (!storedToken) {
      window.location.href = '/login';
      return;
    }
    
    setToken(storedToken);
  }, [mounted]);

  // Fetch data
  useEffect(() => {
    if (!token) return;
    
    fetchMyEquipment();
    fetchAvailableModels();
  }, [token]);

  const fetchMyEquipment = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
        localStorage.removeItem('flexoplate_token');
        localStorage.removeItem('flexoplate_user');
        window.location.href = '/login';
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        setMyEquipment(Array.isArray(data) ? data : data.equipment || []);
      }
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/equipment/models`);
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(Array.isArray(data) ? data : []);
      }
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
    if (ageMonths < 6) return { color: 'bg-green-100 text-green-800', text: 'Good' };
    if (ageMonths < 12) return { color: 'bg-yellow-100 text-yellow-800', text: 'Monitor' };
    if (ageMonths < 18) return { color: 'bg-orange-100 text-orange-800', text: 'Replace Soon' };
    return { color: 'bg-red-100 text-red-800', text: 'Replace Now' };
  };

  if (!mounted || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Equipment</h1>
          <p className="text-gray-600">Manage your saved exposure units</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <span>+</span> Add Equipment
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : myEquipment.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-400 text-5xl mb-4">🔧</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No equipment saved yet</h3>
          <p className="text-gray-500 mb-4">Add your exposure units to track lamp age and get personalized calculations</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Add Your First Equipment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {myEquipment.map((eq) => {
            const lampStatus = getLampStatus(eq.lamp_age_months, eq.uv_source_type);
            return (
              <div key={eq.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{eq.nickname}</h3>
                    <p className="text-gray-600">{eq.supplier_name} {eq.model_name}</p>
                    <p className="text-sm text-gray-500">{eq.uv_source_type}</p>
                    {eq.location && <p className="text-sm text-gray-500">📍 {eq.location}</p>}
                  </div>
                  <div className="text-right">
                    {lampStatus && (
                      <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${lampStatus.color}`}>
                        {lampStatus.text}
                      </span>
                    )}
                    {eq.lamp_age_months !== undefined && (
                      <p className="text-sm text-gray-500 mt-1">{eq.lamp_age_months} months old</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Lamp installed:</label>
                    <input
                      type="date"
                      value={eq.lamp_install_date?.split('T')[0] || ''}
                      onChange={(e) => handleUpdateLampDate(eq.id, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveEquipment(eq.id)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Add Equipment</h2>
            <form onSubmit={handleAddEquipment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Model</label>
                <select
                  value={newEquipment.equipment_model_id}
                  onChange={(e) => setNewEquipment({...newEquipment, equipment_model_id: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.supplier_name} - {model.model_name} ({model.uv_source_type})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nickname</label>
                <input
                  type="text"
                  value={newEquipment.nickname}
                  onChange={(e) => setNewEquipment({...newEquipment, nickname: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Main Floor Unit 1"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lamp Install Date</label>
                <input
                  type="date"
                  value={newEquipment.lamp_install_date}
                  onChange={(e) => setNewEquipment({...newEquipment, lamp_install_date: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location (optional)</label>
                <input
                  type="text"
                  value={newEquipment.location}
                  onChange={(e) => setNewEquipment({...newEquipment, location: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Building A, Floor 2"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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
