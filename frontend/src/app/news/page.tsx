'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, ExternalLink, Calendar, Newspaper, Filter, Star } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

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

const categoryColors: Record<string, string> = {
  industry: 'bg-blue-100 text-blue-700',
  packaging: 'bg-green-100 text-green-700',
  labels: 'bg-purple-100 text-purple-700',
  converting: 'bg-orange-100 text-orange-700',
};

const categoryLabels: Record<string, string> = {
  industry: 'Industry',
  packaging: 'Packaging',
  labels: 'Labels & Labeling',
  converting: 'Converting',
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sourcesChecked, setSourcesChecked] = useState(0);

  const fetchNews = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
        await fetch(`${API_BASE}/api/news/refresh`, { method: 'POST' });
      }

      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
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
  }, [selectedCategory]);

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

  const categories = ['', 'industry', 'packaging', 'labels', 'converting'];

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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Newspaper className="w-8 h-8 text-blue-600" />
                Industry News
              </h1>
              <p className="text-gray-600 mt-2">
                Latest news from the flexographic and printing industry
              </p>
            </div>
            <button
              onClick={() => fetchNews(true)}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Meta info */}
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-2">
              Last updated: {new Date(lastUpdated).toLocaleString()} | {sourcesChecked} sources
            </p>
          )}
        </div>

        {/* Category Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter by Category</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat || 'all'}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat ? categoryLabels[cat] : 'All Categories'}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* News Grid */}
        {news.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((item) => (
              <NewsCard key={item.id} item={item} formatDate={formatDate} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No news found</h3>
            <p className="text-gray-500">
              {selectedCategory
                ? `No news articles found in the "${categoryLabels[selectedCategory]}" category.`
                : 'Unable to fetch news at this time. Try refreshing.'}
            </p>
          </div>
        )}

        {/* Sources info */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">About Industry News</h2>
          <p className="text-gray-600 text-sm">
            This news feed aggregates articles from leading flexographic and printing industry
            publications. Articles are filtered and ranked by relevance to flexographic printing,
            plate technology, and related topics.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Sources include: Flexo Magazine, Print Week, Packaging Digest, Labels & Labeling,
            and other industry publications.
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsCard({
  item,
  formatDate,
}: {
  item: NewsItem;
  formatDate: (date: string | null) => string;
}) {
  const relevanceStars = Math.ceil(item.relevance_score * 5);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all group flex flex-col"
    >
      {/* Image placeholder or category banner */}
      <div className={`h-2 ${categoryColors[item.category]?.replace('text-', 'bg-').split(' ')[0] || 'bg-gray-200'}`} />

      <div className="p-4 flex-1 flex flex-col">
        {/* Category and source */}
        <div className="flex items-center justify-between mb-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              categoryColors[item.category] || 'bg-gray-100 text-gray-700'
            }`}
          >
            {categoryLabels[item.category] || item.category}
          </span>
          <span className="text-xs text-gray-500">{item.source}</span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
          {item.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-3 line-clamp-3 flex-1">{item.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center text-xs text-gray-500">
            <Calendar className="w-3 h-3 mr-1" />
            {formatDate(item.published_date)}
          </div>
          <div className="flex items-center gap-1">
            {/* Relevance indicator */}
            {[...Array(relevanceStars)].map((_, i) => (
              <Star
                key={i}
                className="w-3 h-3 text-yellow-400 fill-yellow-400"
              />
            ))}
            <ExternalLink className="w-3 h-3 text-gray-400 ml-2 group-hover:text-blue-500" />
          </div>
        </div>
      </div>
    </a>
  );
}
