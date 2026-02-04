'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Copy, Check } from 'lucide-react';

type ConversionCategory = 'thickness' | 'screen' | 'temperature' | 'pressure' | 'speed' | 'area';

interface Conversion {
  from: string;
  to: string;
  convert: (value: number) => number;
  reverseConvert: (value: number) => number;
}

const conversions: Record<ConversionCategory, Conversion[]> = {
  thickness: [
    {
      from: 'mm',
      to: 'mil (thou)',
      convert: (v) => v * 39.3701,
      reverseConvert: (v) => v / 39.3701,
    },
    {
      from: 'mm',
      to: 'inch',
      convert: (v) => v / 25.4,
      reverseConvert: (v) => v * 25.4,
    },
    {
      from: 'mil (thou)',
      to: 'inch',
      convert: (v) => v / 1000,
      reverseConvert: (v) => v * 1000,
    },
    {
      from: 'micron (µm)',
      to: 'mm',
      convert: (v) => v / 1000,
      reverseConvert: (v) => v * 1000,
    },
    {
      from: 'micron (µm)',
      to: 'mil (thou)',
      convert: (v) => v * 0.0393701,
      reverseConvert: (v) => v / 0.0393701,
    },
  ],
  screen: [
    {
      from: 'LPI (lines/inch)',
      to: 'L/cm',
      convert: (v) => v / 2.54,
      reverseConvert: (v) => v * 2.54,
    },
    {
      from: 'LPI (lines/inch)',
      to: 'DPI (dots/inch)',
      convert: (v) => v, // Same value for most applications
      reverseConvert: (v) => v,
    },
  ],
  temperature: [
    {
      from: '°C (Celsius)',
      to: '°F (Fahrenheit)',
      convert: (v) => (v * 9) / 5 + 32,
      reverseConvert: (v) => ((v - 32) * 5) / 9,
    },
    {
      from: '°C (Celsius)',
      to: 'K (Kelvin)',
      convert: (v) => v + 273.15,
      reverseConvert: (v) => v - 273.15,
    },
  ],
  pressure: [
    {
      from: 'bar',
      to: 'PSI',
      convert: (v) => v * 14.5038,
      reverseConvert: (v) => v / 14.5038,
    },
    {
      from: 'bar',
      to: 'kPa',
      convert: (v) => v * 100,
      reverseConvert: (v) => v / 100,
    },
    {
      from: 'kPa',
      to: 'PSI',
      convert: (v) => v * 0.145038,
      reverseConvert: (v) => v / 0.145038,
    },
  ],
  speed: [
    {
      from: 'm/min',
      to: 'ft/min',
      convert: (v) => v * 3.28084,
      reverseConvert: (v) => v / 3.28084,
    },
    {
      from: 'm/min',
      to: 'm/sec',
      convert: (v) => v / 60,
      reverseConvert: (v) => v * 60,
    },
    {
      from: 'ft/min',
      to: 'ft/sec',
      convert: (v) => v / 60,
      reverseConvert: (v) => v * 60,
    },
  ],
  area: [
    {
      from: 'mm²',
      to: 'inch²',
      convert: (v) => v / 645.16,
      reverseConvert: (v) => v * 645.16,
    },
    {
      from: 'cm²',
      to: 'inch²',
      convert: (v) => v / 6.4516,
      reverseConvert: (v) => v * 6.4516,
    },
    {
      from: 'm²',
      to: 'ft²',
      convert: (v) => v * 10.7639,
      reverseConvert: (v) => v / 10.7639,
    },
  ],
};

const categoryLabels: Record<ConversionCategory, string> = {
  thickness: 'Plate Thickness',
  screen: 'Screen Ruling',
  temperature: 'Temperature',
  pressure: 'Pressure',
  speed: 'Line Speed',
  area: 'Area',
};

const categoryDescriptions: Record<ConversionCategory, string> = {
  thickness: 'Convert between mm, mil, microns, and inches for plate and relief depth',
  screen: 'Convert screen rulings between LPI and lines per cm',
  temperature: 'Convert processing and storage temperatures',
  pressure: 'Convert impression and air pressure units',
  speed: 'Convert press and processor line speeds',
  area: 'Convert plate and print area measurements',
};

export default function UnitConverterPage() {
  const [selectedCategory, setSelectedCategory] = useState<ConversionCategory>('thickness');
  const [selectedConversion, setSelectedConversion] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [isReversed, setIsReversed] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const currentConversions = conversions[selectedCategory];
  const currentConversion = currentConversions[selectedConversion];

  const calculateResult = (value: string, conversion: Conversion, reversed: boolean): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    const result = reversed ? conversion.reverseConvert(num) : conversion.convert(num);
    // Format to reasonable precision
    if (Math.abs(result) >= 1000) {
      return result.toFixed(1);
    } else if (Math.abs(result) >= 1) {
      return result.toFixed(3);
    } else {
      return result.toFixed(6).replace(/\.?0+$/, '');
    }
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const fromUnit = isReversed ? currentConversion.to : currentConversion.from;
  const toUnit = isReversed ? currentConversion.from : currentConversion.to;
  const result = calculateResult(inputValue, currentConversion, isReversed);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/tools"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Tools
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Unit Converter</h1>
          <p className="text-gray-600 mt-2">
            Convert between metric and imperial units used in flexographic printing
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(conversions) as ConversionCategory[]).map((category) => (
            <button
              key={category}
              onClick={() => {
                setSelectedCategory(category);
                setSelectedConversion(0);
                setInputValue('');
                setIsReversed(false);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {categoryLabels[category]}
            </button>
          ))}
        </div>

        {/* Main Converter Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4">
            <p className="text-sm text-gray-500">{categoryDescriptions[selectedCategory]}</p>
          </div>

          {/* Conversion Type Selector */}
          {currentConversions.length > 1 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conversion Type
              </label>
              <div className="flex flex-wrap gap-2">
                {currentConversions.map((conv, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedConversion(index);
                      setIsReversed(false);
                    }}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      selectedConversion === index
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {conv.from} → {conv.to}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Converter Interface */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
            {/* From Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {fromUnit}
              </label>
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter value"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Swap Button */}
            <div className="flex justify-center pb-3">
              <button
                onClick={() => {
                  setIsReversed(!isReversed);
                  if (result) {
                    setInputValue(result);
                  }
                }}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                title="Swap units"
              >
                <ArrowLeftRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* To Result */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {toUnit}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={result}
                  readOnly
                  placeholder="Result"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-lg bg-gray-50"
                />
                {result && (
                  <button
                    onClick={() => handleCopy(result, -1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 rounded"
                    title="Copy result"
                  >
                    {copiedIndex === -1 ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Reference Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Reference: {categoryLabels[selectedCategory]}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-700">
                    {currentConversion.from}
                  </th>
                  <th className="text-left py-2 font-medium text-gray-700">
                    {currentConversion.to}
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {getQuickReferenceValues(selectedCategory).map((value, index) => {
                  const converted = calculateResult(
                    value.toString(),
                    currentConversion,
                    false
                  );
                  return (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-900">{value}</td>
                      <td className="py-2 text-gray-900">{converted}</td>
                      <td className="py-2">
                        <button
                          onClick={() => handleCopy(converted, index)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          {copiedIndex === index ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Common Plate Thicknesses Reference */}
        {selectedCategory === 'thickness' && (
          <div className="mt-6 bg-blue-50 rounded-lg border border-blue-200 p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">
              Common Flexo Plate Thicknesses
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-blue-800">Thin:</span>
                <p className="text-blue-700">0.76mm / 30 mil</p>
              </div>
              <div>
                <span className="font-medium text-blue-800">Standard:</span>
                <p className="text-blue-700">1.14mm / 45 mil</p>
              </div>
              <div>
                <span className="font-medium text-blue-800">Medium:</span>
                <p className="text-blue-700">1.70mm / 67 mil</p>
              </div>
              <div>
                <span className="font-medium text-blue-800">Thick:</span>
                <p className="text-blue-700">2.84mm / 112 mil</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getQuickReferenceValues(category: ConversionCategory): number[] {
  switch (category) {
    case 'thickness':
      return [0.76, 1.14, 1.70, 2.28, 2.54, 2.84, 3.18, 3.94, 4.70, 6.35];
    case 'screen':
      return [65, 100, 120, 133, 150, 175, 200, 225, 250, 300];
    case 'temperature':
      return [0, 10, 20, 25, 30, 40, 50, 60, 80, 100];
    case 'pressure':
      return [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10];
    case 'speed':
      return [50, 100, 150, 200, 250, 300, 400, 500, 600, 800];
    case 'area':
      return [100, 500, 1000, 5000, 10000, 50000, 100000];
    default:
      return [1, 2, 5, 10, 20, 50, 100];
  }
}
