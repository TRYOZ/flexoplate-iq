'use client';

import Link from 'next/link';
import {
  Calculator,
  GitCompare,
  LineChart,
  TrendingUp,
  Droplets,
  Lightbulb,
  ArrowRight
} from 'lucide-react';

interface Tool {
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  bgColor: string;
  available: boolean;
}

const tools: Tool[] = [
  {
    name: 'Unit Converter',
    description: 'Convert between metric and imperial units commonly used in flexography',
    icon: <Calculator className="w-8 h-8" />,
    href: '/tools/converter',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    available: true,
  },
  {
    name: 'Plate Comparison',
    description: 'Compare technical specifications between different flexo plates side by side',
    icon: <GitCompare className="w-8 h-8" />,
    href: '/tools/comparison',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    available: true,
  },
  {
    name: 'TVI / Fingerprint',
    description: 'Visualize tone value increase curves and fingerprint data for your plates',
    icon: <LineChart className="w-8 h-8" />,
    href: '/tools/fingerprint',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    available: true,
  },
  {
    name: 'Bump-Up Calculator',
    description: 'Calculate bump curve values for optimal dot reproduction',
    icon: <TrendingUp className="w-8 h-8" />,
    href: '/tools/bump-up',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    available: true,
  },
  {
    name: 'Washout Speed Calculator',
    description: 'Calculate optimal washout times based on plate thickness and processor settings',
    icon: <Droplets className="w-8 h-8" />,
    href: '/tools/washout',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    available: true,
  },
  {
    name: 'Lamp Intensity Tracker',
    description: 'Track and predict UV lamp degradation over time for accurate exposure compensation',
    icon: <Lightbulb className="w-8 h-8" />,
    href: '/tools/lamp-tracker',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    available: true,
  },
];

export default function ToolsHubPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Flexo Tools</h1>
          <p className="text-gray-600 mt-2">
            Professional tools for flexographic plate management and optimization
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">About Flexo Tools</h2>
          <p className="text-gray-600">
            These tools are designed to help flexographic professionals optimize their plate
            processing workflows. From unit conversions to TVI visualization, each tool
            addresses specific challenges in modern flexo printing.
          </p>
          <p className="text-gray-600 mt-3">
            More tools are being developed based on industry feedback. Have a suggestion?
            Let us know what tools would help your workflow.
          </p>
        </div>
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  if (!tool.available) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 opacity-60">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 ${tool.bgColor} rounded-xl flex items-center justify-center ${tool.color}`}>
            {tool.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{tool.name}</h3>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{tool.description}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={tool.href}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 ${tool.bgColor} rounded-xl flex items-center justify-center ${tool.color}`}>
          {tool.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{tool.name}</h3>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-sm text-gray-500 mt-1">{tool.description}</p>
        </div>
      </div>
    </Link>
  );
}
