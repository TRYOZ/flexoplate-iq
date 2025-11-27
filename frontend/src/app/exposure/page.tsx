'use client';

import { useState, useEffect } from 'react';
import { Calculator, Clock, Sun, Zap, RefreshCw, AlertTriangle, Printer } from 'lucide-react';
import { api, Plate, ExposureResult } from '@/lib/api';

function ExposureCard({ 
  label, 
  time, 
  range, 
  icon: Icon 
}: { 
  label: string; 
  time: number | null; 
  range?: [number, number] | null;
  icon: React.ElementType;
}) {
  if (time === null) return null;
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <span className="font-medium text-gray-700">{label}</span>
      </div>
      
      <div className="text-3xl font-bold text-gray-900 mb-1">
        {formatTime(time)}
      </div>
      
      {range && (
        <p className="text-sm text-gray-500">
          Range: {formatTime(range[0])} – {formatTime(range[1])}
        </p>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins} min`;
  }
  return `${mins}m ${secs.toFixed(0)}s`;
}

function RecipeCardPrintable({ result }: { result: ExposureResult }) {
  const now = new Date().toLocaleString();
  
  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-6 print:border-black">
      <div className="flex justify-between items-start border-b border-gray-200 pb-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Exposure Recipe Card</h2>
          <p className="text-sm text-gray-500">Generated: {now}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-900">FlexoPlate IQ</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500">Plate</p>
          <p className="font-semibold">{result.plate.name}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Supplier</p>
          <p className="font-semibold">{result.plate.supplier}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Thickness</p>
          <p className="font-semibold">{result.plate.thickness_mm} mm</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Process</p>
          <p className="font-semibold capitalize">{result.plate.process_type}</p>
        </div>
      </div>
      
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-500 mb-2">UV Intensity Used</p>
        <p className="text-2xl font-bold text-blue-600">
          {result.input.intensity_mw_cm2} mW/cm²
        </p>
      </div>
      
      <table className="w-full border-collapse mb-6">
        <thead>
          <tr className="border-b-2 border-gray-300">
            <th className="text-left py-2 font-semibold">Step</th>
            <th className="text-right py-2 font-semibold">Time</th>
            <th className="text-right py-2 font-semibold">Range</th>
          </tr>
        </thead>
        <tbody>
          {result.exposure.back_exposure_time_s && (
            <tr className="border-b border-gray-200">
              <td className="py-2">Back Exposure</td>
              <td className="text-right font-mono font-semibold">
                {formatTime(result.exposure.back_exposure_time_s)}
              </td>
              <td className="text-right text-sm text-gray-500">
                {result.exposure.back_exposure_range_s 
                  ? `${formatTime(result.exposure.back_exposure_range_s[0])} – ${formatTime(result.exposure.back_exposure_range_s[1])}`
                  : '—'}
              </td>
            </tr>
          )}
          {result.exposure.main_exposure_time_s && (
            <tr className="border-b border-gray-200">
              <td className="py-2">Main Exposure</td>
              <td className="text-right font-mono font-semibold">
                {formatTime(result.exposure.main_exposure_time_s)}
              </td>
              <td className="text-right text-sm text-gray-500">
                {result.exposure.main_exposure_range_s 
                  ? `${formatTime(result.exposure.main_exposure_range_s[0])} – ${formatTime(result.exposure.main_exposure_range_s[1])}`
                  : '—'}
              </td>
            </tr>
          )}
          {result.exposure.post_exposure_time_s && (
            <tr className="border-b border-gray-200">
              <td className="py-2">Post Exposure</td>
              <td className="text-right font-mono font-semibold">
                {formatTime(result.exposure.post_exposure_time_s)}
              </td>
              <td className="text-right text-sm text-gray-500">—</td>
            </tr>
          )}
          {result.exposure.detack_time_s && (
            <tr className="border-b border-gray-200">
              <td className="py-2">Detack</td>
              <td className="text-right font-mono font-semibold">
                {formatTime(result.exposure.detack_time_s)}
              </td>
              <td className="text-right text-sm text-gray-500">—</td>
            </tr>
          )}
        </tbody>
      </table>
      
      {result.notes.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Notes</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {result.notes.map((note, i) => (
              <li key={i}>• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ExposurePage() {
  const [plates, setPlates] = useState<Plate[]>([]);
  const [selectedPlateId, setSelectedPlateId] = useState('');
  const [intensity, setIntensity] = useState<string>('18');
  const [targetFloor, setTargetFloor] = useState<string>('');
  const [result, setResult] = useState<ExposureResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load plates
  useEffect(() => {
    async function loadPlates() {
      try {
        const data = await api.getPlates({ limit: 100 });
        setPlates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plates');
      } finally {
        setInitialLoading(false);
      }
    }
    loadPlates();
  }, []);
  
  async function calculate() {
    if (!selectedPlateId || !intensity) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.calculateExposure({
        plate_id: selectedPlateId,
        current_intensity_mw_cm2: parseFloat(intensity),
        target_floor_mm: targetFloor ? parseFloat(targetFloor) : undefined
      });
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }
  
  function handlePrint() {
    window.print();
  }
  
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Exposure Calculator</h2>
        <p className="text-gray-600 mt-1">
          Calculate exposure times based on your current UV lamp intensity
        </p>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            Input Parameters
          </h3>
          
          <div className="space-y-4">
            {/* Plate selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Plate
              </label>
              <select
                value={selectedPlateId}
                onChange={(e) => setSelectedPlateId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Choose a plate...</option>
                {plates.map(plate => (
                  <option key={plate.id} value={plate.id}>
                    {plate.display_name || plate.family_name} ({plate.supplier_name}) - {plate.thickness_mm}mm
                  </option>
                ))}
              </select>
            </div>
            
            {/* UV Intensity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current UV Intensity (mW/cm²)
              </label>
              <div className="relative">
                <Sun className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value)}
                  placeholder="e.g., 18"
                  step="0.1"
                  min="0"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Measure with your radiometer at the plate surface
              </p>
            </div>
            
            {/* Target Floor (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Floor Thickness (mm) <span className="text-gray-400">optional</span>
              </label>
              <input
                type="number"
                value={targetFloor}
                onChange={(e) => setTargetFloor(e.target.value)}
                placeholder="e.g., 0.70"
                step="0.01"
                min="0"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Adjusts back exposure to achieve desired relief depth
              </p>
            </div>
            
            {/* Calculate button */}
            <button
              onClick={calculate}
              disabled={!selectedPlateId || !intensity || loading}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Calculate Exposure
                </>
              )}
            </button>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>
        
        {/* Results panel */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Plate info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-medium text-blue-900">{result.plate.name}</p>
                <p className="text-sm text-blue-700">
                  {result.plate.supplier} • {result.plate.thickness_mm}mm • {result.plate.process_type}
                </p>
              </div>
              
              {/* Exposure times */}
              <div className="grid grid-cols-2 gap-4">
                <ExposureCard
                  label="Back Exposure"
                  time={result.exposure.back_exposure_time_s}
                  range={result.exposure.back_exposure_range_s}
                  icon={Clock}
                />
                <ExposureCard
                  label="Main Exposure"
                  time={result.exposure.main_exposure_time_s}
                  range={result.exposure.main_exposure_range_s}
                  icon={Sun}
                />
                <ExposureCard
                  label="Post Exposure"
                  time={result.exposure.post_exposure_time_s}
                  icon={Zap}
                />
                <ExposureCard
                  label="Detack"
                  time={result.exposure.detack_time_s}
                  icon={Zap}
                />
              </div>
              
              {/* Notes */}
              {result.notes.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Notes</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {result.notes.map((note, i) => (
                      <li key={i}>• {note}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Print button */}
              <button
                onClick={handlePrint}
                className="w-full py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Recipe Card
              </button>
              
              {/* Printable recipe card (hidden on screen, visible in print) */}
              <div className="hidden print:block">
                <RecipeCardPrintable result={result} />
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center justify-center text-gray-400">
              <Calculator className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium text-gray-600">No calculation yet</p>
              <p className="text-sm">Select a plate and enter intensity to calculate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
