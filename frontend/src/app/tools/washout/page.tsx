'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Droplets, Calculator, Info, RotateCcw } from 'lucide-react';

interface WashoutResult {
  baseTime: number;
  adjustedTime: number;
  minTime: number;
  maxTime: number;
  factors: {
    name: string;
    adjustment: number;
    reason: string;
  }[];
}

// Common plate types with base washout times (in seconds per 0.001" or mil)
const PLATE_PRESETS = {
  'standard-analog': {
    name: 'Standard Analog Plate',
    baseRate: 8, // seconds per mil
    description: 'Traditional analog plates (Cyrel, nyloflex standard)',
  },
  'digital': {
    name: 'Digital Plate (LAM/LAMS)',
    baseRate: 6,
    description: 'Digital plates with ablative mask layer',
  },
  'hd-flexo': {
    name: 'HD/High Definition Plate',
    baseRate: 5,
    description: 'High definition plates (Kodak Flexcel, Cyrel EASY)',
  },
  'thick-analog': {
    name: 'Thick Analog (>0.112")',
    baseRate: 10,
    description: 'Thick plates for corrugated applications',
  },
  'thin-sleeve': {
    name: 'Thin Sleeve Plate (<0.045")',
    baseRate: 4,
    description: 'Thin plates for sleeve mounting',
  },
  'custom': {
    name: 'Custom Settings',
    baseRate: 7,
    description: 'Enter your own parameters',
  },
};

// Solvent types and their aggressiveness
const SOLVENT_TYPES = {
  'perchloroethylene': { name: 'Perchloroethylene (Perc)', factor: 1.0, eco: false },
  'optisol': { name: 'OptiSol / Low-VOC', factor: 1.15, eco: true },
  'nylosolv': { name: 'Nylosolv', factor: 1.1, eco: false },
  'water-based': { name: 'Water/Detergent', factor: 1.4, eco: true },
  'solvit': { name: 'Solvit', factor: 1.05, eco: false },
};

export default function WashoutCalculatorPage() {
  const [plateType, setPlateType] = useState<keyof typeof PLATE_PRESETS>('digital');
  const [plateThickness, setPlateThickness] = useState<number>(0.067); // in inches
  const [reliefDepth, setReliefDepth] = useState<number>(0.025); // in inches
  const [solventType, setSolventType] = useState<keyof typeof SOLVENT_TYPES>('optisol');
  const [solventTemp, setSolventTemp] = useState<number>(30); // Celsius
  const [brushSpeed, setBrushSpeed] = useState<number>(50); // percentage
  const [solventAge, setSolventAge] = useState<number>(0); // weeks
  const [customBaseRate, setCustomBaseRate] = useState<number>(7);

  const result = useMemo((): WashoutResult => {
    const factors: WashoutResult['factors'] = [];

    // Get base rate
    const baseRate = plateType === 'custom' ? customBaseRate : PLATE_PRESETS[plateType].baseRate;

    // Calculate base time from relief depth (in mils)
    const reliefMils = reliefDepth * 1000;
    const baseTime = reliefMils * baseRate;

    let adjustedTime = baseTime;

    // Solvent type adjustment
    const solventFactor = SOLVENT_TYPES[solventType].factor;
    if (solventFactor !== 1.0) {
      const adjustment = baseTime * (solventFactor - 1);
      adjustedTime += adjustment;
      factors.push({
        name: 'Solvent Type',
        adjustment: Math.round(adjustment),
        reason: `${SOLVENT_TYPES[solventType].name} requires ${Math.round((solventFactor - 1) * 100)}% more time`,
      });
    }

    // Temperature adjustment (optimal is 30°C, +/- 2% per degree)
    if (solventTemp !== 30) {
      const tempDiff = solventTemp - 30;
      const tempFactor = 1 - (tempDiff * 0.02); // Warmer = faster
      const adjustment = adjustedTime * (tempFactor - 1);
      adjustedTime += adjustment;
      factors.push({
        name: 'Solvent Temperature',
        adjustment: Math.round(adjustment),
        reason: tempDiff > 0
          ? `${tempDiff}°C above optimal - ${Math.abs(Math.round(adjustment))}s faster`
          : `${Math.abs(tempDiff)}°C below optimal - ${Math.abs(Math.round(adjustment))}s slower`,
      });
    }

    // Brush speed adjustment (baseline is 50%)
    if (brushSpeed !== 50) {
      const speedDiff = brushSpeed - 50;
      const speedFactor = 1 - (speedDiff * 0.01); // Faster brush = less time
      const adjustment = adjustedTime * (speedFactor - 1);
      adjustedTime += adjustment;
      factors.push({
        name: 'Brush Speed',
        adjustment: Math.round(adjustment),
        reason: speedDiff > 0
          ? `Higher brush speed (${brushSpeed}%) - ${Math.abs(Math.round(adjustment))}s faster`
          : `Lower brush speed (${brushSpeed}%) - ${Math.abs(Math.round(adjustment))}s slower`,
      });
    }

    // Solvent age adjustment (+5% per week, max 30%)
    if (solventAge > 0) {
      const ageFactor = Math.min(1.3, 1 + (solventAge * 0.05));
      const adjustment = adjustedTime * (ageFactor - 1);
      adjustedTime += adjustment;
      factors.push({
        name: 'Solvent Age',
        adjustment: Math.round(adjustment),
        reason: `${solventAge} week(s) old - add ${Math.round((ageFactor - 1) * 100)}% time`,
      });
    }

    // Calculate range (+/- 10%)
    const minTime = adjustedTime * 0.9;
    const maxTime = adjustedTime * 1.1;

    return {
      baseTime: Math.round(baseTime),
      adjustedTime: Math.round(adjustedTime),
      minTime: Math.round(minTime),
      maxTime: Math.round(maxTime),
      factors,
    };
  }, [plateType, reliefDepth, solventType, solventTemp, brushSpeed, solventAge, customBaseRate]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const handleReset = () => {
    setPlateType('digital');
    setPlateThickness(0.067);
    setReliefDepth(0.025);
    setSolventType('optisol');
    setSolventTemp(30);
    setBrushSpeed(50);
    setSolventAge(0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/tools"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Tools
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Droplets className="w-8 h-8 text-blue-500" />
                Washout Speed Calculator
              </h1>
              <p className="text-gray-600 mt-2">
                Calculate optimal washout times based on plate type, thickness, and processor settings
              </p>
            </div>
            <button
              onClick={handleReset}
              className="inline-flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="space-y-6">
            {/* Plate Type Selection */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Plate Type</h2>
              <div className="space-y-2">
                {Object.entries(PLATE_PRESETS).map(([key, preset]) => (
                  <label
                    key={key}
                    className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                      plateType === key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="plateType"
                      value={key}
                      checked={plateType === key}
                      onChange={() => setPlateType(key as keyof typeof PLATE_PRESETS)}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{preset.name}</p>
                      <p className="text-xs text-gray-500">{preset.description}</p>
                    </div>
                    <span className="text-sm text-blue-600 font-medium">
                      {preset.baseRate}s/mil
                    </span>
                  </label>
                ))}
              </div>

              {plateType === 'custom' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Base Rate (seconds per mil)
                  </label>
                  <input
                    type="number"
                    value={customBaseRate}
                    onChange={(e) => setCustomBaseRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="20"
                    step="0.5"
                  />
                </div>
              )}
            </div>

            {/* Plate Dimensions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Plate Dimensions</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Plate Thickness (inches)
                  </label>
                  <input
                    type="number"
                    value={plateThickness}
                    onChange={(e) => setPlateThickness(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0.020"
                    max="0.250"
                    step="0.001"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Common: 0.045", 0.067", 0.112"
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Relief Depth (inches)
                  </label>
                  <input
                    type="number"
                    value={reliefDepth}
                    onChange={(e) => setReliefDepth(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0.010"
                    max="0.100"
                    step="0.001"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Typical: 0.020" - 0.035" depending on application
                  </p>
                </div>
              </div>
            </div>

            {/* Processor Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Processor Settings</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Solvent Type
                  </label>
                  <select
                    value={solventType}
                    onChange={(e) => setSolventType(e.target.value as keyof typeof SOLVENT_TYPES)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(SOLVENT_TYPES).map(([key, solvent]) => (
                      <option key={key} value={key}>
                        {solvent.name} {solvent.eco ? '🌱' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Solvent Temperature: {solventTemp}°C
                  </label>
                  <input
                    type="range"
                    value={solventTemp}
                    onChange={(e) => setSolventTemp(parseInt(e.target.value))}
                    className="w-full"
                    min="20"
                    max="40"
                    step="1"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>20°C (cold)</span>
                    <span>30°C (optimal)</span>
                    <span>40°C (hot)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Brush Speed: {brushSpeed}%
                  </label>
                  <input
                    type="range"
                    value={brushSpeed}
                    onChange={(e) => setBrushSpeed(parseInt(e.target.value))}
                    className="w-full"
                    min="20"
                    max="100"
                    step="5"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>20% (gentle)</span>
                    <span>50% (normal)</span>
                    <span>100% (aggressive)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Solvent Age: {solventAge} weeks
                  </label>
                  <input
                    type="range"
                    value={solventAge}
                    onChange={(e) => setSolventAge(parseInt(e.target.value))}
                    className="w-full"
                    min="0"
                    max="8"
                    step="1"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Fresh</span>
                    <span>4 weeks</span>
                    <span>8+ weeks</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {/* Main Result */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-blue-500" />
                Recommended Washout Time
              </h2>

              <div className="text-center py-6">
                <div className="text-5xl font-bold text-blue-600 mb-2">
                  {formatTime(result.adjustedTime)}
                </div>
                <p className="text-gray-500">
                  Range: {formatTime(result.minTime)} - {formatTime(result.maxTime)}
                </p>
              </div>

              {/* Visual time bar */}
              <div className="mt-4">
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                    style={{ width: `${Math.min(100, (result.adjustedTime / 600) * 100)}%` }}
                  />
                  {/* Markers */}
                  <div className="absolute inset-0 flex justify-between px-2 text-xs text-gray-400">
                    <span>0</span>
                    <span>2m</span>
                    <span>4m</span>
                    <span>6m</span>
                    <span>8m</span>
                    <span>10m</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Calculation Breakdown */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Calculation Breakdown</h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Base washout time</span>
                  <span className="font-medium">{formatTime(result.baseTime)}</span>
                </div>
                <div className="text-xs text-gray-500 -mt-2 mb-2">
                  {reliefDepth * 1000} mils × {plateType === 'custom' ? customBaseRate : PLATE_PRESETS[plateType].baseRate}s/mil
                </div>

                {result.factors.map((factor, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <div>
                      <span className="text-gray-600">{factor.name}</span>
                      <p className="text-xs text-gray-400">{factor.reason}</p>
                    </div>
                    <span className={`font-medium ${factor.adjustment > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {factor.adjustment > 0 ? '+' : ''}{formatTime(Math.abs(factor.adjustment))}
                    </span>
                  </div>
                ))}

                <div className="flex justify-between items-center py-2 pt-4 border-t-2 border-gray-200">
                  <span className="font-semibold text-gray-900">Total adjusted time</span>
                  <span className="font-bold text-blue-600 text-lg">{formatTime(result.adjustedTime)}</span>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-2">Washout Tips</p>
                  <ul className="space-y-1 list-disc list-inside text-blue-700">
                    <li>Start with the minimum time and increase if needed</li>
                    <li>Check floor relief after washout - should be clean but not over-washed</li>
                    <li>Over-washing causes shoulder erosion and reduced plate life</li>
                    <li>Replace solvent when washout times exceed 130% of fresh solvent times</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Quick Reference */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Reference</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Relief depth (mils)</p>
                  <p className="font-medium">{(reliefDepth * 1000).toFixed(0)} mils</p>
                </div>
                <div>
                  <p className="text-gray-500">Relief depth (mm)</p>
                  <p className="font-medium">{(reliefDepth * 25.4).toFixed(2)} mm</p>
                </div>
                <div>
                  <p className="text-gray-500">Floor thickness</p>
                  <p className="font-medium">{((plateThickness - reliefDepth) * 1000).toFixed(0)} mils</p>
                </div>
                <div>
                  <p className="text-gray-500">Eco-friendly solvent</p>
                  <p className="font-medium">{SOLVENT_TYPES[solventType].eco ? 'Yes 🌱' : 'No'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
