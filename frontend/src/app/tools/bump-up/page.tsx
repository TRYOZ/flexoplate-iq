'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Download, Copy, Check, Info } from 'lucide-react';

interface BumpPoint {
  input: number;
  tvi: number;
  output: number;
  bump: number;
}

// Common TVI profiles for different press/plate combinations
const TVI_PRESETS = {
  'low': { name: 'Low Gain (HD Flexo)', values: { 10: 3, 20: 5, 30: 7, 40: 9, 50: 10, 60: 9, 70: 7, 80: 5, 90: 3 } },
  'medium': { name: 'Medium Gain (Standard)', values: { 10: 5, 20: 10, 30: 14, 40: 16, 50: 17, 60: 15, 70: 12, 80: 8, 90: 4 } },
  'high': { name: 'High Gain (Corrugated)', values: { 10: 8, 20: 15, 30: 20, 40: 23, 50: 24, 60: 22, 70: 18, 80: 12, 90: 6 } },
  'custom': { name: 'Custom Values', values: {} },
};

export default function BumpUpCalculatorPage() {
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof TVI_PRESETS>('medium');
  const [customTvi, setCustomTvi] = useState<Record<number, number>>({
    10: 5, 20: 10, 30: 14, 40: 16, 50: 17, 60: 15, 70: 12, 80: 8, 90: 4
  });
  const [targetHighlight, setTargetHighlight] = useState<number>(50);
  const [targetShadow, setTargetShadow] = useState<number>(95);
  const [copied, setCopied] = useState(false);

  const tviValues: Record<number, number> = selectedPreset === 'custom' ? customTvi : TVI_PRESETS[selectedPreset].values;

  // Calculate bump curve
  const bumpCurve = useMemo(() => {
    const points: BumpPoint[] = [];

    for (let input = 0; input <= 100; input += 5) {
      let tvi = 0;

      if (input === 0 || input === 100) {
        tvi = 0;
      } else {
        // Interpolate TVI from the defined points
        const keys = Object.keys(tviValues).map(Number).sort((a, b) => a - b);

        if (keys.length === 0) {
          tvi = 0;
        } else if (input <= keys[0]) {
          tvi = (tviValues[keys[0]] ?? 0) * (input / keys[0]);
        } else if (input >= keys[keys.length - 1]) {
          const lastKey = keys[keys.length - 1];
          tvi = (tviValues[lastKey] ?? 0) * ((100 - input) / (100 - lastKey));
        } else {
          // Find surrounding points
          for (let i = 0; i < keys.length - 1; i++) {
            if (input >= keys[i] && input <= keys[i + 1]) {
              const ratio = (input - keys[i]) / (keys[i + 1] - keys[i]);
              tvi = (tviValues[keys[i]] ?? 0) + ratio * ((tviValues[keys[i + 1]] ?? 0) - (tviValues[keys[i]] ?? 0));
              break;
            }
          }
        }
      }

      const output = Math.min(100, input + tvi);
      const bump = output - input; // How much it grows

      points.push({ input, tvi: Math.round(tvi * 10) / 10, output: Math.round(output * 10) / 10, bump: Math.round(bump * 10) / 10 });
    }

    return points;
  }, [tviValues]);

  // Calculate compensated input for a target output
  const calculateCompensatedInput = (targetOutput: number): number => {
    // Binary search to find the input that gives the target output
    for (const point of bumpCurve) {
      if (Math.abs(point.output - targetOutput) < 2.5) {
        return point.input;
      }
    }
    // Linear interpolation
    for (let i = 0; i < bumpCurve.length - 1; i++) {
      if (bumpCurve[i].output <= targetOutput && bumpCurve[i + 1].output >= targetOutput) {
        const ratio = (targetOutput - bumpCurve[i].output) / (bumpCurve[i + 1].output - bumpCurve[i].output);
        return Math.round((bumpCurve[i].input + ratio * 5) * 10) / 10;
      }
    }
    return targetOutput;
  };

  const compensatedHighlight = calculateCompensatedInput(targetHighlight);
  const compensatedShadow = calculateCompensatedInput(targetShadow);

  const handleCopyTable = async () => {
    const tableData = bumpCurve
      .map(p => `${p.input}\t${p.tvi}\t${p.output}\t${p.bump}`)
      .join('\n');
    const header = 'Input %\tTVI %\tOutput %\tBump %\n';
    await navigator.clipboard.writeText(header + tableData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-orange-500" />
            Bump-Up Calculator
          </h1>
          <p className="text-gray-600 mt-2">
            Calculate compensation curves to counteract dot gain (TVI) in flexographic printing
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* TVI Profile Selection */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">TVI Profile</h2>

              <div className="space-y-3">
                {Object.entries(TVI_PRESETS).map(([key, preset]) => (
                  <label
                    key={key}
                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPreset === key
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preset"
                      value={key}
                      checked={selectedPreset === key}
                      onChange={() => setSelectedPreset(key as keyof typeof TVI_PRESETS)}
                      className="sr-only"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{preset.name}</p>
                      {key !== 'custom' && (
                        <p className="text-xs text-gray-500">
                          50% TVI: {(preset.values as Record<number, number>)[50]}%
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {/* Custom TVI Input */}
              {selectedPreset === 'custom' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">Enter TVI values at each point:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((point) => (
                      <div key={point} className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 w-6">{point}%</span>
                        <input
                          type="number"
                          value={customTvi[point] || 0}
                          onChange={(e) => setCustomTvi({ ...customTvi, [point]: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-orange-500"
                          min="0"
                          max="50"
                          step="0.5"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Target Values */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Target Values</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Highlight (output)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={targetHighlight}
                      onChange={(e) => setTargetHighlight(parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                      min="1"
                      max="50"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <p className="text-sm text-orange-600 mt-1">
                    Input needed: <strong>{compensatedHighlight}%</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Shadow (output)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={targetShadow}
                      onChange={(e) => setTargetShadow(parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                      min="50"
                      max="100"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <p className="text-sm text-orange-600 mt-1">
                    Input needed: <strong>{compensatedShadow}%</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium mb-1">How to use</p>
                  <p>
                    Select a TVI profile that matches your press fingerprint, or enter custom values.
                    The calculator shows what input % you need to achieve your desired output %.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visual Curve */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Bump Curve Visualization</h2>
              </div>

              <div className="h-64 relative bg-gray-50 rounded-lg p-4">
                {/* Grid lines */}
                <div className="absolute inset-4 grid grid-cols-10 grid-rows-5">
                  {[...Array(50)].map((_, i) => (
                    <div key={i} className="border-l border-t border-gray-200" />
                  ))}
                </div>

                {/* Diagonal reference line (no gain) */}
                <svg className="absolute inset-4" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line x1="0" y1="100" x2="100" y2="0" stroke="#ddd" strokeWidth="0.5" strokeDasharray="2,2" />

                  {/* Output curve (with TVI) */}
                  <polyline
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="1.5"
                    points={bumpCurve.map(p => `${p.input},${100 - p.output}`).join(' ')}
                  />

                  {/* Data points */}
                  {bumpCurve.filter((_, i) => i % 2 === 0).map((point, i) => (
                    <circle
                      key={i}
                      cx={point.input}
                      cy={100 - point.output}
                      r="1.5"
                      fill="#f97316"
                    />
                  ))}
                </svg>

                {/* Axis labels */}
                <div className="absolute bottom-0 left-4 right-4 flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
                <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between text-xs text-gray-500">
                  <span>100%</span>
                  <span>50%</span>
                  <span>0%</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-orange-500" />
                  <span className="text-gray-600">Output with TVI</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-gray-300 border-dashed" style={{ borderTopWidth: 1 }} />
                  <span className="text-gray-600">Linear (no gain)</span>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Bump Curve Data</h2>
                <button
                  onClick={handleCopyTable}
                  className="inline-flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy Table
                    </>
                  )}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Input %</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">TVI %</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Output %</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Dot Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bumpCurve.map((point, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${point.input === 50 ? 'bg-orange-50' : ''}`}>
                        <td className="py-2 px-3 text-gray-900">{point.input}%</td>
                        <td className="py-2 px-3 text-gray-600">{point.tvi}%</td>
                        <td className="py-2 px-3 text-orange-600 font-medium">{point.output}%</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 bg-orange-400 rounded"
                              style={{ width: `${point.bump * 3}px` }}
                            />
                            <span className="text-gray-500">{point.bump > 0 ? '+' : ''}{point.bump}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
