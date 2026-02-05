'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  ExternalLink,
  Calendar,
  Newspaper,
  Filter,
  Star,
  X,
  Sparkles,
  TrendingUp,
  Clock,
  Globe,
  ChevronDown,
  ThumbsDown,
  Settings,
  Layers,
  Droplets,
  Printer,
  Package,
  Leaf,
  Wrench,
  BarChart3,
  CalendarDays,
  User,
  Check,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

// ==================== TYPES ====================

interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  source_url: string | null;
  category: string;
  published_date: string | null;
  image_url: string | null;
  relevance_score: number;
}

interface NewsResponse {
  items: NewsItem[];
  total: number;
  sources_checked: number;
  last_updated: string | null;
}

interface UserPreferences {
  selectedTopics: string[];
  role: string | null;
  dismissedArticles: string[];
  readArticles: string[];
  lastVisitedTools: string[];
}

// ==================== CONSTANTS ====================

// Topic tags with icons and keywords for matching
const TOPIC_TAGS = [
  {
    id: 'plates',
    label: 'Plates & Imaging',
    icon: Layers,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    activeColor: 'bg-blue-600 text-white border-blue-600',
    keywords: ['plate', 'photopolymer', 'exposure', 'imaging', 'prepress', 'ctp', 'digital plate', 'flat top dot', 'screen', 'halftone', 'washout'],
  },
  {
    id: 'inks',
    label: 'Inks & Coatings',
    icon: Droplets,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    activeColor: 'bg-purple-600 text-white border-purple-600',
    keywords: ['ink', 'coating', 'varnish', 'uv', 'water-based', 'solvent', 'color', 'pigment', 'anilox', 'viscosity'],
  },
  {
    id: 'press',
    label: 'Press Technology',
    icon: Printer,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    activeColor: 'bg-orange-600 text-white border-orange-600',
    keywords: ['press', 'printing machine', 'flexo press', 'ci press', 'stack press', 'inline', 'servo', 'automation', 'register'],
  },
  {
    id: 'substrates',
    label: 'Substrates & Materials',
    icon: Package,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    activeColor: 'bg-amber-600 text-white border-amber-600',
    keywords: ['substrate', 'film', 'foil', 'paper', 'corrugated', 'cardboard', 'flexible', 'rigid', 'material', 'laminate'],
  },
  {
    id: 'sustainability',
    label: 'Sustainability',
    icon: Leaf,
    color: 'bg-green-100 text-green-700 border-green-200',
    activeColor: 'bg-green-600 text-white border-green-600',
    keywords: ['sustainable', 'eco', 'recyclable', 'biodegradable', 'carbon', 'green', 'environmental', 'circular', 'compostable'],
  },
  {
    id: 'equipment',
    label: 'Equipment & Machinery',
    icon: Wrench,
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    activeColor: 'bg-slate-600 text-white border-slate-600',
    keywords: ['equipment', 'machine', 'dryer', 'unwinder', 'rewinder', 'slitter', 'die cutter', 'laminator', 'exposure unit'],
  },
  {
    id: 'business',
    label: 'Business & Market',
    icon: BarChart3,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    activeColor: 'bg-indigo-600 text-white border-indigo-600',
    keywords: ['market', 'growth', 'acquisition', 'investment', 'revenue', 'profit', 'merger', 'expansion', 'forecast', 'trend'],
  },
  {
    id: 'events',
    label: 'Events & Trade Shows',
    icon: CalendarDays,
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    activeColor: 'bg-pink-600 text-white border-pink-600',
    keywords: ['labelexpo', 'drupa', 'fta', 'trade show', 'exhibition', 'conference', 'award', 'summit', 'forum', 'event'],
  },
];

// User roles for personalization
const USER_ROLES = [
  { id: 'prepress', label: 'Prepress Technician', topics: ['plates', 'inks', 'equipment'] },
  { id: 'operator', label: 'Press Operator', topics: ['press', 'inks', 'substrates'] },
  { id: 'manager', label: 'Print Manager', topics: ['business', 'sustainability', 'equipment'] },
  { id: 'converter', label: 'Converter', topics: ['substrates', 'equipment', 'sustainability'] },
];

// Time filters
const TIME_FILTERS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

// Tool to topic mapping (for "For You" recommendations)
const TOOL_TOPIC_MAP: Record<string, string[]> = {
  '/tools/bump-up': ['plates', 'inks'],
  '/exposure': ['plates', 'equipment'],
  '/tools/washout': ['plates', 'equipment'],
  '/tools/lamp-tracker': ['equipment', 'plates'],
  '/equivalency': ['plates', 'substrates'],
  '/tools/comparison': ['plates'],
  '/tools/converter': ['plates', 'inks'],
};

// ==================== HELPERS ====================

const getDefaultPreferences = (): UserPreferences => ({
  selectedTopics: [],
  role: null,
  dismissedArticles: [],
  readArticles: [],
  lastVisitedTools: [],
});

const loadPreferences = (): UserPreferences => {
  if (typeof window === 'undefined') return getDefaultPreferences();
  try {
    const saved = localStorage.getItem('flexoiq_news_prefs');
    if (saved) {
      return { ...getDefaultPreferences(), ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading preferences:', e);
  }
  return getDefaultPreferences();
};

const savePreferences = (prefs: UserPreferences) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('flexoiq_news_prefs', JSON.stringify(prefs));
  } catch (e) {
    console.error('Error saving preferences:', e);
  }
};

// Track tool visits for "For You" recommendations
const trackToolVisit = () => {
  if (typeof window === 'undefined') return;
  try {
    const path = window.location.pathname;
    const prefs = loadPreferences();

    // Keep last 20 tool visits
    const visits = [path, ...prefs.lastVisitedTools.filter(t => t !== path)].slice(0, 20);
    prefs.lastVisitedTools = visits;
    savePreferences(prefs);
  } catch (e) {
    console.error('Error tracking tool visit:', e);
  }
};

// Calculate topic relevance score for an article
const calculateTopicRelevance = (item: NewsItem, topics: string[]): { score: number; matchedTopics: string[] } => {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const matchedTopics: string[] = [];
  let score = 0;

  for (const topic of TOPIC_TAGS) {
    if (topics.length > 0 && !topics.includes(topic.id)) continue;

    const matches = topic.keywords.filter(kw => text.includes(kw.toLowerCase()));
    if (matches.length > 0) {
      matchedTopics.push(topic.id);
      score += matches.length * 0.1;
    }
  }

  return { score: Math.min(score, 1), matchedTopics };
};

// Get recommended topics based on tool usage
const getRecommendedTopics = (prefs: UserPreferences): string[] => {
  const topicCounts: Record<string, number> = {};

  for (const tool of prefs.lastVisitedTools) {
    const topics = TOOL_TOPIC_MAP[tool] || [];
    for (const topic of topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }

  // Sort by count and return top topics
  return Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);
};

// Filter by time
const filterByTime = (item: NewsItem, timeFilter: string): boolean => {
  if (timeFilter === 'all' || !item.published_date) return true;

  const itemDate = new Date(item.published_date);
  const now = new Date();
  const diffMs = now.getTime() - itemDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (timeFilter) {
    case 'today': return diffDays < 1;
    case 'week': return diffDays < 7;
    case 'month': return diffDays < 30;
    default: return true;
  }
};

// ==================== MAIN COMPONENT ====================

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sourcesChecked, setSourcesChecked] = useState(0);

  // Filter state
  const [preferences, setPreferences] = useState<UserPreferences>(getDefaultPreferences());
  const [timeFilter, setTimeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [activeView, setActiveView] = useState<'foryou' | 'all' | 'trending'>('foryou');

  // Load preferences on mount
  useEffect(() => {
    const prefs = loadPreferences();
    setPreferences(prefs);

    // Show role selector if no role set and no topics selected
    if (!prefs.role && prefs.selectedTopics.length === 0) {
      setShowRoleSelector(true);
    }
  }, []);

  const fetchNews = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
        await fetch(`${API_BASE}/api/news/refresh`, { method: 'POST' });
      }

      const params = new URLSearchParams();
      params.set('limit', '100');

      const response = await fetch(`${API_BASE}/api/news?${params}`);
      if (!response.ok) throw new Error('Failed to fetch news');

      const data: NewsResponse = await response.json();
      setNews(data.items);
      setLastUpdated(data.last_updated);
      setSourcesChecked(data.sources_checked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  // Update preferences helper
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const newPrefs = { ...prev, ...updates };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, []);

  // Toggle topic selection
  const toggleTopic = (topicId: string) => {
    const newTopics = preferences.selectedTopics.includes(topicId)
      ? preferences.selectedTopics.filter(t => t !== topicId)
      : [...preferences.selectedTopics, topicId];
    updatePreferences({ selectedTopics: newTopics });
  };

  // Select role
  const selectRole = (roleId: string) => {
    const role = USER_ROLES.find(r => r.id === roleId);
    if (role) {
      updatePreferences({
        role: roleId,
        selectedTopics: role.topics
      });
    }
    setShowRoleSelector(false);
  };

  // Dismiss article
  const dismissArticle = (articleId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updatePreferences({
      dismissedArticles: [...preferences.dismissedArticles, articleId],
    });
  };

  // Track article click
  const trackArticleClick = (articleId: string) => {
    if (!preferences.readArticles.includes(articleId)) {
      updatePreferences({
        readArticles: [...preferences.readArticles.slice(-50), articleId],
      });
    }
  };

  // Get filtered and scored news
  const getFilteredNews = useCallback(() => {
    let filtered = news.filter(item => {
      // Remove dismissed articles
      if (preferences.dismissedArticles.includes(item.id)) return false;
      // Time filter
      if (!filterByTime(item, timeFilter)) return false;
      return true;
    });

    // Calculate relevance for each article
    const recommendedTopics = getRecommendedTopics(preferences);
    const activeTopics = preferences.selectedTopics.length > 0
      ? preferences.selectedTopics
      : recommendedTopics;

    const scored = filtered.map(item => {
      const { score, matchedTopics } = calculateTopicRelevance(item, activeTopics);
      const baseRelevance = item.relevance_score || 0;
      const topicBoost = score * 0.5;
      const readPenalty = preferences.readArticles.includes(item.id) ? -0.1 : 0;

      return {
        ...item,
        personalScore: Math.min(baseRelevance + topicBoost + readPenalty, 1),
        matchedTopics,
        isRead: preferences.readArticles.includes(item.id),
      };
    });

    // Sort based on view
    if (activeView === 'foryou') {
      // For You: prioritize by personal relevance score
      scored.sort((a, b) => b.personalScore - a.personalScore);
    } else if (activeView === 'trending') {
      // Trending: prioritize recent + high base relevance
      scored.sort((a, b) => {
        const aDate = a.published_date ? new Date(a.published_date).getTime() : 0;
        const bDate = b.published_date ? new Date(b.published_date).getTime() : 0;
        const recencyScore = (bDate - aDate) / (1000 * 60 * 60 * 24 * 7); // Favor last 7 days
        return (b.relevance_score + recencyScore * 0.1) - (a.relevance_score + recencyScore * 0.1);
      });
    }
    // 'all' view: keep original order (by date/relevance from API)

    // Filter by selected topics if in topic filter mode
    if (preferences.selectedTopics.length > 0 && activeView !== 'all') {
      return scored.filter(item => item.matchedTopics.length > 0 || item.personalScore > 0.3);
    }

    return scored;
  }, [news, preferences, timeFilter, activeView]);

  const filteredNews = getFilteredNews();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown date';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return 'Unknown date';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading industry news...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Role Selection Modal */}
      {showRoleSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Personalize Your News</h2>
              <p className="text-gray-600 mt-2">Select your role to see the most relevant industry news</p>
            </div>

            <div className="space-y-3">
              {USER_ROLES.map(role => (
                <button
                  key={role.id}
                  onClick={() => selectRole(role.id)}
                  className="w-full p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                >
                  <div className="font-semibold text-gray-900 group-hover:text-blue-600">
                    {role.label}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Focus: {role.topics.map(t => TOPIC_TAGS.find(tag => tag.id === t)?.label).join(', ')}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowRoleSelector(false)}
              className="w-full mt-4 text-gray-500 hover:text-gray-700 text-sm"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Newspaper className="w-8 h-8 text-blue-600" />
                Industry News
              </h1>
              <p className="text-gray-600 mt-1">
                Personalized news from the flexographic and printing industry
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRoleSelector(true)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Change role"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={() => fetchNews(true)}
                disabled={refreshing}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            {lastUpdated && (
              <span>Updated: {new Date(lastUpdated).toLocaleString()}</span>
            )}
            <span>{sourcesChecked} sources</span>
            {preferences.role && (
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {USER_ROLES.find(r => r.id === preferences.role)?.label}
              </span>
            )}
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm border border-gray-200 w-fit">
          <button
            onClick={() => setActiveView('foryou')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'foryou'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            For You
          </button>
          <button
            onClick={() => setActiveView('trending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'trending'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Trending
          </button>
          <button
            onClick={() => setActiveView('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            All News
          </button>
        </div>

        {/* Filters Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
          {/* Filter Header */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-700">Filters & Topics</span>
              {(preferences.selectedTopics.length > 0 || timeFilter !== 'all') && (
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {preferences.selectedTopics.length + (timeFilter !== 'all' ? 1 : 0)} active
                </span>
              )}
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="p-4 pt-0 border-t border-gray-100">
              {/* Topic Tags */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-600 mb-2 block">Topics</label>
                <div className="flex flex-wrap gap-2">
                  {TOPIC_TAGS.map(topic => {
                    const Icon = topic.icon;
                    const isActive = preferences.selectedTopics.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        onClick={() => toggleTopic(topic.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                          isActive ? topic.activeColor : topic.color
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {topic.label}
                        {isActive && <Check className="w-3 h-3 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Filter */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">Time:</span>
                </div>
                <div className="flex gap-2">
                  {TIME_FILTERS.map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setTimeFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        timeFilter === filter.id
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              {(preferences.selectedTopics.length > 0 || timeFilter !== 'all') && (
                <button
                  onClick={() => {
                    updatePreferences({ selectedTopics: [] });
                    setTimeFilter('all');
                  }}
                  className="mt-4 text-sm text-red-600 hover:text-red-700"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* News Grid */}
        {filteredNews.length > 0 ? (
          <>
            {/* Results count */}
            <div className="text-sm text-gray-500 mb-4">
              Showing {filteredNews.length} article{filteredNews.length !== 1 ? 's' : ''}
              {activeView === 'foryou' && ' personalized for you'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredNews.map((item) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  formatDate={formatDate}
                  onDismiss={dismissArticle}
                  onClick={() => trackArticleClick(item.id)}
                  matchedTopics={item.matchedTopics}
                  personalScore={item.personalScore}
                  isRead={item.isRead}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No news found</h3>
            <p className="text-gray-500 mb-4">
              {preferences.selectedTopics.length > 0
                ? 'No articles match your selected topics. Try removing some filters.'
                : 'Unable to fetch news at this time. Try refreshing.'}
            </p>
            {preferences.selectedTopics.length > 0 && (
              <button
                onClick={() => updatePreferences({ selectedTopics: [] })}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear topic filters
              </button>
            )}
          </div>
        )}

        {/* Sources info */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">About Your News Feed</h2>
          <p className="text-gray-600 text-sm mb-3">
            Your news feed is personalized based on your role, selected topics, and the tools you use in FlexoPlate IQ.
            The more you use the app, the better your recommendations become.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              <Sparkles className="w-3 h-3 inline mr-1" />
              AI-ranked relevance
            </span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              <User className="w-3 h-3 inline mr-1" />
              Role-based filtering
            </span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              Usage-based learning
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== NEWS CARD COMPONENT ====================

interface ExtendedNewsItem extends NewsItem {
  personalScore?: number;
  matchedTopics?: string[];
  isRead?: boolean;
}

function NewsCard({
  item,
  formatDate,
  onDismiss,
  onClick,
  matchedTopics = [],
  personalScore = 0,
  isRead = false,
}: {
  item: ExtendedNewsItem;
  formatDate: (date: string | null) => string;
  onDismiss: (id: string, e: React.MouseEvent) => void;
  onClick: () => void;
  matchedTopics?: string[];
  personalScore?: number;
  isRead?: boolean;
}) {
  const matchPercent = Math.round(personalScore * 100);
  const topicBadges = matchedTopics.slice(0, 2).map(t => TOPIC_TAGS.find(tag => tag.id === t)).filter(Boolean);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all group flex flex-col relative ${
        isRead ? 'border-gray-100 opacity-75' : 'border-gray-200 hover:border-blue-200'
      }`}
    >
      {/* Dismiss button */}
      <button
        onClick={(e) => onDismiss(item.id, e)}
        className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title="Not interested"
      >
        <ThumbsDown className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
      </button>

      {/* Match score indicator */}
      {matchPercent > 50 && (
        <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          {matchPercent}% match
        </div>
      )}

      {/* Color bar based on top matched topic */}
      <div className={`h-1.5 ${
        topicBadges[0]
          ? topicBadges[0].color.split(' ')[0]
          : 'bg-gray-200'
      }`} />

      <div className="p-4 flex-1 flex flex-col">
        {/* Topic badges and source */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {topicBadges.map(topic => {
              if (!topic) return null;
              const Icon = topic.icon;
              return (
                <span
                  key={topic.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${topic.color}`}
                >
                  <Icon className="w-3 h-3" />
                  {topic.label}
                </span>
              );
            })}
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap">{item.source}</span>
        </div>

        {/* Title */}
        <h3 className={`font-semibold mb-2 group-hover:text-blue-600 transition-colors line-clamp-2 ${
          isRead ? 'text-gray-600' : 'text-gray-900'
        }`}>
          {item.title}
          {isRead && <span className="text-xs text-gray-400 ml-2">(read)</span>}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-3 line-clamp-3 flex-1">{item.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center text-xs text-gray-500">
            <Calendar className="w-3 h-3 mr-1" />
            {formatDate(item.published_date)}
          </div>
          <div className="flex items-center gap-2">
            {/* Relevance stars */}
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${
                    i < Math.ceil(personalScore * 5)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-200'
                  }`}
                />
              ))}
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500" />
          </div>
        </div>
      </div>
    </a>
  );
}
