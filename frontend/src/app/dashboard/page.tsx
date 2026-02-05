'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calculator,
  Droplets,
  TrendingUp,
  Scale,
  Search,
  GitCompare,
  Layers,
  Lightbulb,
  Settings,
  ChevronRight,
  Star,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import FlexoBrainChat from '@/components/FlexoBrainChat';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface Equipment {
  id: string;
  nickname?: string;
  model_name?: string;
  supplier_name?: string;
  lamp_age_days?: number;
  lamp_age_months?: number;
}

interface FavoritePlate {
  id: string;
  plate_id?: string;
  display_name?: string;
  supplier_name?: string;
  thickness_mm?: number;
}

interface Recipe {
  id: string;
  name?: string;
  recipe_name?: string;
  plate_name?: string;
  plate_display_name?: string;
  created_at?: string;
}

// Tool definitions organized by workflow
const CALCULATE_TOOLS = [
  {
    name: 'Exposure Calculator',
    description: 'Calculate exposure times',
    href: '/exposure',
    icon: Calculator,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    name: 'Washout Speed',
    description: 'Optimal washout times',
    href: '/tools/washout',
    icon: Droplets,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  {
    name: 'Bump-Up Calculator',
    description: 'TVI compensation curves',
    href: '/tools/bump-up',
    icon: TrendingUp,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  {
    name: 'Unit Converter',
    description: 'Flexo unit conversions',
    href: '/tools/converter',
    icon: Scale,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
];

const FIND_TOOLS = [
  {
    name: 'Plate Equivalency',
    description: 'Find equivalent plates',
    href: '/equivalency',
    icon: Search,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  {
    name: 'Plate Comparison',
    description: 'Compare specifications',
    href: '/tools/comparison',
    icon: GitCompare,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    name: 'Browse Plates',
    description: 'All plate database',
    href: '/plates',
    icon: Layers,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  },
];

const TRACK_TOOLS = [
  {
    name: 'Lamp Tracker',
    description: 'UV lamp degradation',
    href: '/tools/lamp-tracker',
    icon: Lightbulb,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  {
    name: 'My Equipment',
    description: 'Manage equipment',
    href: '/my-equipment',
    icon: Settings,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [favorites, setFavorites] = useState<FavoritePlate[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const storedToken = localStorage.getItem('flexoplate_token');
    const storedUser = localStorage.getItem('flexoplate_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('flexoplate_token');
        localStorage.removeItem('flexoplate_user');
        window.location.href = '/login';
      }
    } else {
      window.location.href = '/login';
    }
  }, [mounted]);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const [eqRes, favRes, recRes] = await Promise.all([
          fetch(`${API_BASE}/api/me/equipment`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_BASE}/api/me/plates`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_BASE}/api/me/recipes`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (eqRes.ok) {
          const data = await eqRes.json();
          setEquipment(Array.isArray(data) ? data : []);
        }
        if (favRes.ok) {
          const data = await favRes.json();
          setFavorites(Array.isArray(data) ? data : []);
        }
        if (recRes.ok) {
          const data = await recRes.json();
          setRecipes(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  // Check for equipment warnings
  const equipmentWithWarnings = equipment.filter(eq => {
    const days = eq.lamp_age_days || (eq.lamp_age_months ? eq.lamp_age_months * 30 : 0);
    return days > 180;
  });

  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{user.first_name ? `, ${user.first_name}` : ''}!
          </h1>
          <p className="text-gray-600 mt-1">Your FlexoPlate IQ Dashboard</p>
        </div>

        {/* Equipment Warning Banner */}
        {equipmentWithWarnings.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-amber-800 font-medium">
                {equipmentWithWarnings.length} equipment item{equipmentWithWarnings.length > 1 ? 's' : ''} may need lamp replacement
              </p>
              <p className="text-amber-600 text-sm">
                Check your equipment for aging UV lamps
              </p>
            </div>
            <Link href="/my-equipment" className="text-amber-700 hover:text-amber-900 text-sm font-medium">
              Review →
            </Link>
          </div>
        )}

        {/* CALCULATE Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <Calculator className="w-4 h-4 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Calculate</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CALCULATE_TOOLS.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>

        {/* FIND & COMPARE Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Search className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Find & Compare</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {FIND_TOOLS.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>

        {/* TRACK & MONITOR Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Track & Monitor</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TRACK_TOOLS.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 my-8"></div>

        {/* Personal Data Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* My Plates */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <h3 className="font-semibold text-gray-900">My Plates</h3>
                {favorites.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {favorites.length}
                  </span>
                )}
              </div>
              <Link href="/my-plates" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : favorites.length > 0 ? (
              <div className="space-y-2">
                {favorites.slice(0, 3).map((plate) => (
                  <Link href="/my-plates" key={plate.id} className="block">
                    <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{plate.display_name || 'Plate'}</p>
                        <p className="text-xs text-gray-500">{plate.supplier_name}</p>
                      </div>
                      {plate.thickness_mm && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex-shrink-0 ml-2">
                          {plate.thickness_mm}mm
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No favorite plates yet</p>
                <Link href="/plates" className="text-sm text-blue-600 hover:text-blue-700 mt-1 inline-block">
                  Browse plates →
                </Link>
              </div>
            )}
          </div>

          {/* Recent Recipes */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900">Recent Recipes</h3>
                {recipes.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {recipes.length}
                  </span>
                )}
              </div>
              <Link href="/my-recipes" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : recipes.length > 0 ? (
              <div className="space-y-2">
                {recipes.slice(0, 3).map((recipe) => (
                  <Link href="/my-recipes" key={recipe.id} className="block">
                    <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {recipe.name || recipe.recipe_name || 'Recipe'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {recipe.plate_name || recipe.plate_display_name || ''}
                        </p>
                      </div>
                      {recipe.created_at && (
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                          {new Date(recipe.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Calculator className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No saved recipes yet</p>
                <Link href="/exposure" className="text-sm text-blue-600 hover:text-blue-700 mt-1 inline-block">
                  Calculate exposure →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FlexoBrain Chat Widget */}
      <FlexoBrainChat context={{ page: 'dashboard' }} />
    </div>
  );
}

interface ToolCardProps {
  tool: {
    name: string;
    description: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  };
}

function ToolCard({ tool }: ToolCardProps) {
  const Icon = tool.icon;

  return (
    <Link href={tool.href}>
      <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group h-full">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 ${tool.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${tool.color}`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors text-sm">
              {tool.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
