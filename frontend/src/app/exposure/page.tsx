'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface Plate {
  id: string;
  display_name: string;
  family_name: string;
  supplier_name: string;
  thickness_mm: number;
  process_type: string;
  main_exposure_energy_min_mj_cm2?: number;
  main_exposure_energy_max_mj_cm2?: number;
  back_exposure_energy_min_mj_cm2?: number;
  back_exposure_energy_max_mj_cm2?: number;
}

interface Equipment {
  id: string;
  model_name: string;
  supplier_name: string;
  uv_source_type: string;
  nominal_intensity_mw_cm2: number;
  notes?: string;
}

interface ExposureResult {
  plate: {
    name: string;
    thickness_mm: number;
    supplier: string;
    process_type: string;
  };
  exposure: {
    main_exposure_time_s?: number;
    main_exposure_range_s?: [number, number];
    back_exposure_time_s?: number;
    back_exposure_range_s?: [number, number];
    post_exposure_time_s?: number;
    detack_time_s?: number;
  };
  notes: string[];
  method?: string;
  reference?: {
    plate: string;
    main_time: string;
    back_time: string;
  };
  equipment?: Equipment;
  effective_intensity?: number;
  lamp_age_months?: number;
}

export default function ExposurePage() {
  // State
  const [plates, setPlates] = useState<Plate[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedPlate, setSelectedPlate] = useState('');
  const [calculationMethod, setCalculationMethod] = useState<'equipment' | 'reference' | 'intensity'>('equipment');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [lampAgeMonths, setLampAgeMonths] = useState(0);
  const [manualIntensity, setManualIntensity] = useState('');
  const [targetFloor, setTargetFloor] = useState('');
  
  // Reference time method
  const [referencePlate, setReferencePlate] = useState('');
  const [referenceMainTime, setReferenceMainTime] = useState('');
  const [referenceBackTime, setReferenceBackTime] = useState('');
  
  // Results
  const [result, setResult] = useState<ExposureResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load plates and equipment on mount
  useEffect(() => {
    fetchPlates();
    fetchEquipment();
  }, []);

  const fetchPlates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plates?limit=200`);
      const data = await res.json();
      setPlates(data);
    } catch (err) {
      console.error('Failed to fetch plates:', err);
    }
  };

  const fetchEquipment = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/equipment/models`);
      const data = await res.json();
      setEquipment(data);
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
    }
  };

  // Get selected equipment details
  const selectedEquipmentDetails = equipment.find(e => e.id === selectedEquipment);

  // Calculate effective intensity based on equipment and lamp age
  const getEffectiveIntensity = (): number => {
    if (calculationMethod === 'intensity' && manualIntensity) {
      return parseFloat(manualIntensity);
    }
    
    if (calculationMethod === 'equipment' && selectedEquipmentDetails) {
      const nominalIntensity = selectedEquipmentDetails.nominal_intensity_mw_cm2 || 18;
      // LED degrades ~5% per year, tubes ~30% per year
      const isLED = selectedEquipmentDetails.uv_source_type?.includes('LED');
      const degradationRate = isLED ? 0.05 : 0.30;
      const degradation = 1 - (degradationRate * (lampAgeMonths / 12));
      return nominalIntensity * Math.max(0.5, degradation);
    }
    
    return 18; // Default fallback
  };

  // Calculate using reference time method
  const calculateFromReference = (): ExposureResult | null => {
    if (!referencePlate || !selectedPlate || !referenceMainTime) {
      setError('Please fill in reference plate, target plate, and reference main time');
      return null;
    }
    
    const refPlate = plates.find(p => p.id === referencePlate);
    const targetPlate = plates.find(p => p.id === selectedPlate);
    
    if (!refPlate || !targetPlate) return null;
    
    // Get energy requirements for both plates
    const refMainEnergy = ((refPlate.main_exposure_energy_min_mj_cm2 || 0) + 
                          (refPlate.main_exposure_energy_max_mj_cm2 || 0)) / 2 || 1000;
    const refBackEnergy = ((refPlate.back_exposure_energy_min_mj_cm2 || 0) + 
                          (refPlate.back_exposure_energy_max_mj_cm2 || 0)) / 2 || 500;
    
    const targetMainEnergy = ((targetPlate.main_exposure_energy_min_mj_cm2 || 0) + 
                              (targetPlate.main_exposure_energy_max_mj_cm2 || 0)) / 2 || 1000;
    const targetBackEnergy = ((targetPlate.back_exposure_energy_min_mj_cm2 || 0) + 
                              (targetPlate.back_exposure_energy_max_mj_cm2 || 0)) / 2 || 500;
    
    // Calculate scaled times
    const mainRatio = targetMainEnergy / refMainEnergy;
    const backRatio = targetBackEnergy / refBackEnergy;
    
    const scaledMainTime = parseFloat(referenceMainTime) * mainRatio;
    const scaledBackTime = referenceBackTime ? parseFloat(referenceBackTime) * backRatio : null;
    
    return {
      plate: {
        name: targetPlate.display_name || targetPlate.family_name,
        thickness_mm: targetPlate.thickness_mm,
        supplier: targetPlate.supplier_name,
        process_type: targetPlate.process_type
      },
      exposure: {
        main_exposure_time_s: Math.round(scaledMainTime),
        back_exposure_time_s: scaledBackTime ? Math.round(scaledBackTime) : undefined,
        main_exposure_range_s: [Math.round(scaledMainTime * 0.9), Math.round(scaledMainTime * 1.1)],
        back_exposure_range_s: scaledBackTime ? [Math.round(scaledBackTime * 0.9), Math.round(scaledBackTime * 1.1)] : undefined
      },
      notes: [
        `Scaled from ${refPlate.display_name || refPlate.family_name} reference times`,
        `Energy ratio (main): ${mainRatio.toFixed(2)}x`,
        scaledBackTime ? `Energy ratio (back): ${backRatio.toFixed(2)}x` : '',
        'Fine-tune based on actual results'
      ].filter(Boolean),
      method: 'reference',
      reference: {
        plate: refPlate.display_name || refPlate.family_name,
        main_time: referenceMainTime,
        back_time: referenceBackTime
      }
    };
  };

  // Main calculation handler
  const handleCalculate = async () => {
    setError('');
    setLoading(true);
    
    try {
      if (calculationMethod === 'reference') {
        const refResult = calculateFromReference();
        if (refResult) {
          setResult(refResult);
        }
        setLoading(false);
        return;
      }
      
      // Equipment or intensity method - use API
      const intensity = getEffectiveIntensity();
      
      if (!selectedPlate) {
        setError('Please select a plate');
        setLoading(false);
        return;
      }
      
      const res = await fetch(`${API_BASE}/api/exposure/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate_id: selectedPlate,
          current_intensity_mw_cm2: intensity,
          target_floor_mm: targetFloor ? parseFloat(targetFloor) : null
        })
      });
      
      const data = await res.json();
      
      // Add equipment info to result
      if (calculationMethod === 'equipment' && selectedEquipmentDetails) {
        data.equipment = selectedEquipmentDetails;
        data.effective_intensity = intensity;
        data.lamp_age_months = lampAgeMonths;
      }
      
      setResult(data);
    } catch (err) {
      setError('Calculation failed. Please try again.');
      console.error(err);
    }
    
    setLoading(false);
  };

  // Format time display (seconds to min:sec)
  const formatTime = (seconds: number | undefined): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs} sec`;
    return `${mins}:${secs.toString().padStart(2, '0')} min`;
  };

  // Group equipment by supplier
  const equipmentBySupplier = equipment.reduce((acc, eq) => {
    const supplier = eq.supplier_name;
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(eq);
    return acc;
  }, {} as Record<string, Equipment[]>);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Exposure Calculator</h1>
      <p className="text-gray-600 mb-6">Calculate exposure times based on your equipment or reference settings</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="text-blue-500">📋</span> Input Parameters
          </h2>
          
          {/* Calculation Method Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Calculation Method
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  value="equipment"
                  checked={calculationMethod === 'equipment'}
                  onChange={(e) => setCalculationMethod(e.target.value as 'equipment')}
                  className="text-blue-500"
                />
                <span>Select my equipment</span>
                <span className="text-xs text-gray-500">(recommended)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  value="reference"
                  checked={calculationMethod === 'reference'}
                  onChange={(e) => setCalculationMethod(e.target.value as 'reference')}
                  className="text-blue-500"
                />
                <span>I have a working reference time</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  value="intensity"
                  checked={calculationMethod === 'intensity'}
                  onChange={(e) => setCalculationMethod(e.target.value as 'intensity')}
                  className="text-blue-500"
                />
                <span>I know my UV intensity</span>
                <span className="text-xs text-gray-500">(radiometer)</span>
              </label>
            </div>
          </div>
          
          {/* Equipment Method */}
          {calculationMethod === 'equipment' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exposure Equipment
                </label>
                <select
                  value={selectedEquipment}
                  onChange={(e) => setSelectedEquipment(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select equipment...</option>
                  {Object.keys(equipmentBySupplier).sort().map(supplier => (
                    <optgroup key={supplier} label={supplier}>
                      {equipmentBySupplier[supplier].map(eq => (
                        <option key={eq.id} value={eq.id}>
                          {eq.model_name} ({eq.uv_source_type}, {eq.nominal_intensity_mw_cm2} mW/cm²)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              
              {selectedEquipmentDetails?.uv_source_type?.includes('Tube') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lamp Age (months)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={lampAgeMonths}
                    onChange={(e) => setLampAgeMonths(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>New</span>
                    <span className="font-medium">{lampAgeMonths} months</span>
                    <span>24 mo</span>
                  </div>
                  {lampAgeMonths > 0 && (
                    <p className="text-xs text-orange-600 mt-1">
                      ⚠️ Estimated intensity: {getEffectiveIntensity().toFixed(1)} mW/cm² 
                      ({Math.round((1 - getEffectiveIntensity() / selectedEquipmentDetails.nominal_intensity_mw_cm2) * 100)}% degradation)
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Reference Time Method */}
          {calculationMethod === 'reference' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Plate (your known working plate)
                </label>
                <select
                  value={referencePlate}
                  onChange={(e) => setReferencePlate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select reference plate...</option>
                  {plates.map(plate => (
                    <option key={plate.id} value={plate.id}>
                      {plate.display_name || plate.family_name} ({plate.supplier_name}) - {plate.thickness_mm}mm
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Main Exposure (sec)
                  </label>
                  <input
                    type="number"
                    value={referenceMainTime}
                    onChange={(e) => setReferenceMainTime(e.target.value)}
                    placeholder="e.g., 720"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Back Exposure (sec)
                  </label>
                  <input
                    type="number"
                    value={referenceBackTime}
                    onChange={(e) => setReferenceBackTime(e.target.value)}
                    placeholder="e.g., 90"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Manual Intensity Method */}
          {calculationMethod === 'intensity' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current UV Intensity (mW/cm²)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">☀️</span>
                <input
                  type="number"
                  value={manualIntensity}
                  onChange={(e) => setManualIntensity(e.target.value)}
                  placeholder="e.g., 18"
                  className="w-full border rounded-lg pl-10 pr-3 py-2"
                  step="0.1"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Measure with your radiometer at the plate surface
              </p>
            </div>
          )}
          
          {/* Target Plate (always shown) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {calculationMethod === 'reference' ? 'Target Plate (calculate time for)' : 'Select Plate'}
            </label>
            <select
              value={selectedPlate}
              onChange={(e) => setSelectedPlate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Select plate...</option>
              {plates.map(plate => (
                <option key={plate.id} value={plate.id}>
                  {plate.display_name || plate.family_name} ({plate.supplier_name}) - {plate.thickness_mm}mm
                </option>
              ))}
            </select>
          </div>
          
          {/* Target Floor (optional) */}
          {calculationMethod !== 'reference' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Floor Thickness (mm) <span className="text-gray-400">optional</span>
              </label>
              <input
                type="number"
                value={targetFloor}
                onChange={(e) => setTargetFloor(e.target.value)}
                placeholder="e.g., 0.7"
                className="w-full border rounded-lg px-3 py-2"
                step="0.05"
              />
              <p className="text-xs text-gray-500 mt-1">
                Adjusts back exposure to achieve desired relief depth
              </p>
            </div>
          )}
          
          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={loading || !selectedPlate}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span> Calculating...
              </>
            ) : (
              <>
                <span>⚡</span> Calculate Exposure
              </>
            )}
          </button>
          
          {error && (
            <p className="text-red-500 text-sm mt-2">{error}</p>
          )}
        </div>
        
        {/* Results Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          {result ? (
            <>
              {/* Plate Info Header */}
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-blue-800">{result.plate?.name}</h3>
                <p className="text-sm text-blue-600">
                  {result.plate?.supplier} • {result.plate?.thickness_mm}mm • {result.plate?.process_type}
                </p>
              </div>
              
              {/* Exposure Times */}
              <div className="space-y-4 mb-6">
                {/* Back Exposure */}
                {result.exposure?.back_exposure_time_s && (
                  <div className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">Back Exposure</p>
                        <p className="text-2xl font-bold">{formatTime(result.exposure.back_exposure_time_s)}</p>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        {result.exposure.back_exposure_range_s && (
                          <p>Range: {formatTime(result.exposure.back_exposure_range_s[0])} - {formatTime(result.exposure.back_exposure_range_s[1])}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Main Exposure */}
                {result.exposure?.main_exposure_time_s && (
                  <div className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">Main Exposure</p>
                        <p className="text-2xl font-bold">{formatTime(result.exposure.main_exposure_time_s)}</p>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        {result.exposure.main_exposure_range_s && (
                          <p>Range: {formatTime(result.exposure.main_exposure_range_s[0])} - {formatTime(result.exposure.main_exposure_range_s[1])}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Post Exposure */}
                {result.exposure?.post_exposure_time_s && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">Post Exposure</p>
                        <p className="text-xl font-semibold">{formatTime(result.exposure.post_exposure_time_s)}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Detack */}
                {result.exposure?.detack_time_s && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">Light Finishing / Detack</p>
                        <p className="text-xl font-semibold">{formatTime(result.exposure.detack_time_s)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Notes */}
              {result.notes && result.notes.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Notes</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {result.notes.map((note, i) => (
                      <li key={i}>• {note}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Method Info */}
              {result.method === 'reference' && result.reference && (
                <div className="text-xs text-gray-500 border-t pt-4">
                  <p>Calculated from reference: {result.reference.plate}</p>
                  <p>Reference times: Main {result.reference.main_time}s, Back {result.reference.back_time || '-'}s</p>
                </div>
              )}
              
              {result.equipment && (
                <div className="text-xs text-gray-500 border-t pt-4">
                  <p>Equipment: {result.equipment.model_name}</p>
                  <p>Effective intensity: {result.effective_intensity?.toFixed(1)} mW/cm²</p>
                  {result.lamp_age_months && result.lamp_age_months > 0 && (
                    <p>Lamp age adjustment: {result.lamp_age_months} months</p>
                  )}
                </div>
              )}
              
              {/* Print Button */}
              <button
                onClick={() => window.print()}
                className="w-full mt-4 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2"
              >
                <span>🖨️</span> Print Recipe Card
              </button>
            </>
          ) : (
            <div className="text-center text-gray-400 py-12">
              <p className="text-4xl mb-4">📊</p>
              <p>Select your parameters and click Calculate</p>
              <p className="text-sm mt-2">Results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
