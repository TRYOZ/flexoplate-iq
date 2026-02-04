'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lightbulb, Plus, Trash2, Download, AlertTriangle, CheckCircle, Clock, Info } from 'lucide-react';

interface LampReading {
  id: string;
  date: string;
  intensity: number; // mW/cm²
  hours: number; // lamp hours at reading
}

interface LampData {
  id: string;
  name: string;
  type: 'main' | 'back' | 'bump';
  initialIntensity: number;
  installDate: string;
  readings: LampReading[];
  targetIntensity: number;
  maxHours: number;
}

// Typical lamp degradation follows exponential decay
const predictIntensity = (initialIntensity: number, hours: number, decayRate: number = 0.0001): number => {
  return initialIntensity * Math.exp(-decayRate * hours);
};

const estimateRemainingLife = (
  currentIntensity: number,
  targetIntensity: number,
  decayRate: number,
  currentHours: number
): number => {
  // Solve: target = current * e^(-decay * remainingHours)
  if (currentIntensity <= targetIntensity) return 0;
  const ratio = targetIntensity / currentIntensity;
  const remainingHours = -Math.log(ratio) / decayRate;
  return Math.max(0, Math.round(remainingHours));
};

const LAMP_PRESETS = {
  main: { name: 'Main Exposure', initialIntensity: 20, targetIntensity: 14, maxHours: 2000, decayRate: 0.00012 },
  back: { name: 'Back Exposure', initialIntensity: 18, targetIntensity: 12, maxHours: 2500, decayRate: 0.0001 },
  bump: { name: 'Bump/Post Exposure', initialIntensity: 15, targetIntensity: 10, maxHours: 3000, decayRate: 0.00008 },
};

const DEFAULT_LAMPS: LampData[] = [
  {
    id: 'lamp-1',
    name: 'Main UV-A Lamp',
    type: 'main',
    initialIntensity: 20,
    installDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    readings: [
      { id: 'r1', date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], intensity: 20, hours: 0 },
      { id: 'r2', date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], intensity: 18.5, hours: 300 },
      { id: 'r3', date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], intensity: 17.2, hours: 600 },
    ],
    targetIntensity: 14,
    maxHours: 2000,
  },
];

export default function LampTrackerPage() {
  const [lamps, setLamps] = useState<LampData[]>([]);
  const [selectedLamp, setSelectedLamp] = useState<string | null>(null);
  const [showAddLamp, setShowAddLamp] = useState(false);
  const [showAddReading, setShowAddReading] = useState(false);

  // New lamp form
  const [newLampName, setNewLampName] = useState('');
  const [newLampType, setNewLampType] = useState<'main' | 'back' | 'bump'>('main');
  const [newLampIntensity, setNewLampIntensity] = useState(20);
  const [newLampDate, setNewLampDate] = useState(new Date().toISOString().split('T')[0]);

  // New reading form
  const [newReadingIntensity, setNewReadingIntensity] = useState(0);
  const [newReadingHours, setNewReadingHours] = useState(0);
  const [newReadingDate, setNewReadingDate] = useState(new Date().toISOString().split('T')[0]);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('flexoplate-lamp-tracker');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLamps(parsed);
        if (parsed.length > 0) {
          setSelectedLamp(parsed[0].id);
        }
      } catch {
        setLamps(DEFAULT_LAMPS);
        setSelectedLamp(DEFAULT_LAMPS[0].id);
      }
    } else {
      setLamps(DEFAULT_LAMPS);
      setSelectedLamp(DEFAULT_LAMPS[0].id);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (lamps.length > 0) {
      localStorage.setItem('flexoplate-lamp-tracker', JSON.stringify(lamps));
    }
  }, [lamps]);

  const currentLamp = useMemo(() => {
    return lamps.find(l => l.id === selectedLamp) || null;
  }, [lamps, selectedLamp]);

  const lampAnalysis = useMemo(() => {
    if (!currentLamp || currentLamp.readings.length < 2) return null;

    const readings = [...currentLamp.readings].sort((a, b) => a.hours - b.hours);
    const firstReading = readings[0];
    const lastReading = readings[readings.length - 1];

    // Calculate decay rate from actual readings
    const hoursDiff = lastReading.hours - firstReading.hours;
    const intensityRatio = lastReading.intensity / firstReading.intensity;
    const calculatedDecayRate = hoursDiff > 0 ? -Math.log(intensityRatio) / hoursDiff : 0.0001;

    // Predict current and future
    const predictedCurrent = predictIntensity(firstReading.intensity, lastReading.hours, calculatedDecayRate);
    const remainingLife = estimateRemainingLife(
      lastReading.intensity,
      currentLamp.targetIntensity,
      calculatedDecayRate,
      lastReading.hours
    );

    const healthPercent = Math.round((lastReading.intensity / firstReading.intensity) * 100);
    const hoursUsed = lastReading.hours;

    // Generate prediction curve
    const predictions: { hours: number; intensity: number }[] = [];
    for (let h = 0; h <= currentLamp.maxHours; h += 100) {
      predictions.push({
        hours: h,
        intensity: Math.round(predictIntensity(firstReading.intensity, h, calculatedDecayRate) * 10) / 10,
      });
    }

    return {
      currentIntensity: lastReading.intensity,
      healthPercent,
      hoursUsed,
      remainingLife,
      decayRate: calculatedDecayRate,
      predictions,
      needsReplacement: lastReading.intensity <= currentLamp.targetIntensity,
      warningZone: lastReading.intensity <= currentLamp.targetIntensity * 1.15,
    };
  }, [currentLamp]);

  const handleAddLamp = () => {
    const preset = LAMP_PRESETS[newLampType];
    const newLamp: LampData = {
      id: `lamp-${Date.now()}`,
      name: newLampName || `${preset.name} Lamp`,
      type: newLampType,
      initialIntensity: newLampIntensity,
      installDate: newLampDate,
      readings: [
        {
          id: `r-${Date.now()}`,
          date: newLampDate,
          intensity: newLampIntensity,
          hours: 0,
        },
      ],
      targetIntensity: preset.targetIntensity,
      maxHours: preset.maxHours,
    };

    setLamps([...lamps, newLamp]);
    setSelectedLamp(newLamp.id);
    setShowAddLamp(false);
    setNewLampName('');
    setNewLampIntensity(20);
  };

  const handleAddReading = () => {
    if (!currentLamp) return;

    const newReading: LampReading = {
      id: `r-${Date.now()}`,
      date: newReadingDate,
      intensity: newReadingIntensity,
      hours: newReadingHours,
    };

    setLamps(lamps.map(l =>
      l.id === currentLamp.id
        ? { ...l, readings: [...l.readings, newReading] }
        : l
    ));
    setShowAddReading(false);
    setNewReadingIntensity(0);
    setNewReadingHours(0);
  };

  const handleDeleteLamp = (lampId: string) => {
    setLamps(lamps.filter(l => l.id !== lampId));
    if (selectedLamp === lampId) {
      setSelectedLamp(lamps[0]?.id || null);
    }
  };

  const handleExportData = () => {
    const data = JSON.stringify(lamps, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lamp-tracker-data.json';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
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
                <Lightbulb className="w-8 h-8 text-yellow-500" />
                Lamp Intensity Tracker
              </h1>
              <p className="text-gray-600 mt-2">
                Track UV lamp degradation and predict replacement timing
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportData}
                className="inline-flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-1" />
                Export
              </button>
              <button
                onClick={() => setShowAddLamp(true)}
                className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Lamp
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lamp List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Lamps</h2>

              {lamps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Lightbulb className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>No lamps tracked yet</p>
                  <button
                    onClick={() => setShowAddLamp(true)}
                    className="mt-2 text-yellow-600 hover:text-yellow-700"
                  >
                    Add your first lamp
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {lamps.map((lamp) => {
                    const lastReading = lamp.readings[lamp.readings.length - 1];
                    const healthPercent = Math.round((lastReading?.intensity / lamp.initialIntensity) * 100);
                    const isWarning = lastReading?.intensity <= lamp.targetIntensity * 1.15;
                    const needsReplacement = lastReading?.intensity <= lamp.targetIntensity;

                    return (
                      <button
                        key={lamp.id}
                        onClick={() => setSelectedLamp(lamp.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedLamp === lamp.id
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{lamp.name}</span>
                          {needsReplacement ? (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          ) : isWarning ? (
                            <Clock className="w-4 h-4 text-yellow-500" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-sm">
                          <span className="text-gray-500">{lastReading?.intensity} mW/cm²</span>
                          <span className={`${
                            needsReplacement ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            {healthPercent}% health
                          </span>
                        </div>
                        {/* Mini health bar */}
                        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              needsReplacement ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${healthPercent}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Lamp Details */}
          <div className="lg:col-span-2 space-y-6">
            {currentLamp && lampAnalysis ? (
              <>
                {/* Status Overview */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">{currentLamp.name}</h2>
                    <button
                      onClick={() => handleDeleteLamp(currentLamp.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete lamp"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">{lampAnalysis.currentIntensity}</p>
                      <p className="text-sm text-gray-500">mW/cm² current</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className={`text-2xl font-bold ${
                        lampAnalysis.needsReplacement ? 'text-red-600' : lampAnalysis.warningZone ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {lampAnalysis.healthPercent}%
                      </p>
                      <p className="text-sm text-gray-500">lamp health</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">{lampAnalysis.hoursUsed}</p>
                      <p className="text-sm text-gray-500">hours used</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className={`text-2xl font-bold ${lampAnalysis.remainingLife < 200 ? 'text-red-600' : 'text-gray-900'}`}>
                        {lampAnalysis.remainingLife}
                      </p>
                      <p className="text-sm text-gray-500">hours remaining</p>
                    </div>
                  </div>

                  {/* Warning banner */}
                  {lampAnalysis.needsReplacement && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <div>
                        <p className="font-medium text-red-800">Lamp replacement needed</p>
                        <p className="text-sm text-red-600">
                          Intensity has dropped below the target threshold of {currentLamp.targetIntensity} mW/cm²
                        </p>
                      </div>
                    </div>
                  )}
                  {!lampAnalysis.needsReplacement && lampAnalysis.warningZone && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
                      <Clock className="w-5 h-5 text-yellow-500" />
                      <div>
                        <p className="font-medium text-yellow-800">Plan replacement soon</p>
                        <p className="text-sm text-yellow-600">
                          Approximately {lampAnalysis.remainingLife} hours until target intensity is reached
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Degradation Curve */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Degradation Curve</h2>

                  {/* Chart Container */}
                  <div className="flex">
                    {/* Y-Axis Label */}
                    <div className="flex items-center mr-2">
                      <span className="text-xs text-gray-500 -rotate-90 whitespace-nowrap">
                        Intensity (mW/cm²)
                      </span>
                    </div>

                    {/* Y-Axis Values */}
                    <div className="flex flex-col justify-between text-xs text-gray-500 pr-2 py-2" style={{ height: '220px' }}>
                      <span>{currentLamp.initialIntensity}</span>
                      <span>{Math.round(currentLamp.initialIntensity * 0.75)}</span>
                      <span>{Math.round(currentLamp.initialIntensity * 0.5)}</span>
                      <span>{Math.round(currentLamp.initialIntensity * 0.25)}</span>
                      <span>0</span>
                    </div>

                    {/* Chart Area */}
                    <div className="flex-1">
                      <div
                        className="relative bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200"
                        style={{ height: '220px' }}
                      >
                        {/* Horizontal Grid Lines */}
                        {[0, 25, 50, 75, 100].map((percent) => (
                          <div
                            key={percent}
                            className="absolute left-0 right-0 border-t border-gray-100"
                            style={{ top: `${percent}%` }}
                          />
                        ))}

                        {/* Vertical Grid Lines */}
                        {[0, 25, 50, 75, 100].map((percent) => (
                          <div
                            key={percent}
                            className="absolute top-0 bottom-0 border-l border-gray-100"
                            style={{ left: `${percent}%` }}
                          />
                        ))}

                        {/* SVG Chart */}
                        <svg
                          className="absolute inset-0 w-full h-full"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                        >
                          <defs>
                            <clipPath id="chartClipPath">
                              <rect x="0" y="0" width="100" height="100" />
                            </clipPath>
                            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#eab308" />
                              <stop offset="100%" stopColor="#f59e0b" />
                            </linearGradient>
                          </defs>

                          <g clipPath="url(#chartClipPath)">
                            {/* Target intensity line */}
                            <line
                              x1="0"
                              y1={100 - (currentLamp.targetIntensity / currentLamp.initialIntensity) * 100}
                              x2="100"
                              y2={100 - (currentLamp.targetIntensity / currentLamp.initialIntensity) * 100}
                              stroke="#ef4444"
                              strokeWidth="0.8"
                              strokeDasharray="3,3"
                              opacity="0.7"
                            />

                            {/* Predicted curve with gradient */}
                            <polyline
                              fill="none"
                              stroke="url(#curveGradient)"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={lampAnalysis.predictions
                                .filter(p => {
                                  const y = 100 - (p.intensity / currentLamp.initialIntensity) * 100;
                                  return y <= 100;
                                })
                                .map(p => {
                                  const x = (p.hours / currentLamp.maxHours) * 100;
                                  const y = Math.min(100, 100 - (p.intensity / currentLamp.initialIntensity) * 100);
                                  return `${x},${y}`;
                                })
                                .join(' ')}
                            />

                            {/* Actual readings as dots with white border */}
                            {currentLamp.readings.map((reading, i) => {
                              const x = (reading.hours / currentLamp.maxHours) * 100;
                              const y = Math.min(100, 100 - (reading.intensity / currentLamp.initialIntensity) * 100);
                              return (
                                <g key={i}>
                                  <circle cx={x} cy={y} r="3.5" fill="white" />
                                  <circle cx={x} cy={y} r="2.5" fill="#3b82f6" />
                                </g>
                              );
                            })}
                          </g>
                        </svg>

                        {/* Target label */}
                        <div
                          className="absolute right-2 text-xs text-red-500 bg-white px-1 rounded"
                          style={{ top: `${100 - (currentLamp.targetIntensity / currentLamp.initialIntensity) * 100}%`, transform: 'translateY(-50%)' }}
                        >
                          Target: {currentLamp.targetIntensity}
                        </div>
                      </div>

                      {/* X-Axis Values */}
                      <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
                        <span>0</span>
                        <span>{Math.round(currentLamp.maxHours * 0.25)}</span>
                        <span>{Math.round(currentLamp.maxHours * 0.5)}</span>
                        <span>{Math.round(currentLamp.maxHours * 0.75)}</span>
                        <span>{currentLamp.maxHours}</span>
                      </div>

                      {/* X-Axis Label */}
                      <div className="text-center mt-1">
                        <span className="text-xs text-gray-500">Lamp Hours</span>
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-8 mt-6 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-white shadow-sm" />
                      <span className="text-sm text-gray-600">Actual readings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full" />
                      <span className="text-sm text-gray-600">Predicted curve</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0 border-t-2 border-dashed border-red-400" />
                      <span className="text-sm text-gray-600">Target minimum</span>
                    </div>
                  </div>
                </div>

                {/* Readings Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Intensity Readings</h2>
                    <button
                      type="button"
                      onClick={() => {
                        const lastReading = currentLamp.readings[currentLamp.readings.length - 1];
                        setNewReadingIntensity(lastReading?.intensity ? lastReading.intensity - 1 : currentLamp.initialIntensity * 0.95);
                        setNewReadingHours(lastReading ? lastReading.hours + 100 : 100);
                        setNewReadingDate(new Date().toISOString().split('T')[0]);
                        setShowAddReading(true);
                      }}
                      className="inline-flex items-center px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Reading
                    </button>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Date</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Hours</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Intensity</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">% of Original</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentLamp.readings
                        .sort((a, b) => a.hours - b.hours)
                        .map((reading) => {
                          const percent = Math.round((reading.intensity / currentLamp.initialIntensity) * 100);
                          return (
                            <tr key={reading.id} className="border-b border-gray-100">
                              <td className="py-2 px-3 text-gray-600">{reading.date}</td>
                              <td className="py-2 px-3 text-gray-900">{reading.hours}h</td>
                              <td className="py-2 px-3 text-gray-900 font-medium">{reading.intensity} mW/cm²</td>
                              <td className="py-2 px-3">
                                <span className={`${
                                  percent <= 70 ? 'text-red-600' : percent <= 85 ? 'text-yellow-600' : 'text-green-600'
                                }`}>
                                  {percent}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : currentLamp ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Info className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Add more readings</h3>
                <p className="text-gray-500 mb-4">
                  At least 2 readings are needed to calculate degradation rate and predictions.
                </p>
                <button
                  onClick={() => {
                    setNewReadingIntensity(currentLamp.initialIntensity * 0.95);
                    setNewReadingHours(100);
                    setShowAddReading(true);
                  }}
                  className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Reading
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No lamp selected</h3>
                <p className="text-gray-500">
                  Select a lamp from the list or add a new one to get started.
                </p>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">About Lamp Tracking</p>
                  <p>
                    UV lamps degrade over time following an exponential decay curve. Regular intensity
                    measurements help predict when replacement is needed. Most plate manufacturers
                    recommend replacing lamps when intensity drops below 70% of original output.
                  </p>
                  <p className="mt-2 text-yellow-700">
                    Tip: Measure lamp intensity weekly using a calibrated UV radiometer for best results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Lamp Modal */}
        {showAddLamp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Lamp</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lamp Name</label>
                  <input
                    type="text"
                    value={newLampName}
                    onChange={(e) => setNewLampName(e.target.value)}
                    placeholder="e.g., Main UV-A Lamp"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lamp Type</label>
                  <select
                    value={newLampType}
                    onChange={(e) => {
                      const type = e.target.value as 'main' | 'back' | 'bump';
                      setNewLampType(type);
                      setNewLampIntensity(LAMP_PRESETS[type].initialIntensity);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  >
                    <option value="main">Main Exposure</option>
                    <option value="back">Back Exposure</option>
                    <option value="bump">Bump/Post Exposure</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Initial Intensity (mW/cm²)
                  </label>
                  <input
                    type="number"
                    value={newLampIntensity}
                    onChange={(e) => setNewLampIntensity(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    min="1"
                    max="50"
                    step="0.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Install Date</label>
                  <input
                    type="date"
                    value={newLampDate}
                    onChange={(e) => setNewLampDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAddLamp(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLamp}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                >
                  Add Lamp
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Reading Modal */}
        {showAddReading && currentLamp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Intensity Reading</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={newReadingDate}
                    onChange={(e) => setNewReadingDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lamp Hours
                  </label>
                  <input
                    type="number"
                    value={newReadingHours}
                    onChange={(e) => setNewReadingHours(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    min="0"
                    step="10"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Measured Intensity (mW/cm²)
                  </label>
                  <input
                    type="number"
                    value={newReadingIntensity}
                    onChange={(e) => setNewReadingIntensity(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    min="0"
                    max="50"
                    step="0.1"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddReading(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddReading}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                >
                  Add Reading
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
