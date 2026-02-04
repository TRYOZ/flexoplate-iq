'use client';

import { useState, useEffect, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://vibrant-curiosity-production-ade4.up.railway.app';

interface KnowledgeStats {
  total_documents: number;
  total_chunks: number;
  total_words: number;
  categories: number;
  sources: {
    web_scraped: number;
    manual: number;
  };
  by_category: Array<{ category: string; count: number }>;
}

interface ScrapeSource {
  id: string;
  name: string;
  base_url: string;
  default_category: string;
  is_active: boolean;
  last_scraped_at: string | null;
  pages_scraped: number;
}

export default function KnowledgeAdminPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'upload' | 'manual' | 'scrape' | 'seed'>('overview');

  // Stats
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual entry state
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualCategory, setManualCategory] = useState('plates');
  const [manualTags, setManualTags] = useState('');
  const [manualSupplier, setManualSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Scrape state
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeCategory, setScrapeCategory] = useState('general');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);

  // Seed state
  const [seedOptions, setSeedOptions] = useState({
    include_core_knowledge: true,
    include_supplier_info: true,
    include_troubleshooting: true,
    include_best_practices: true
  });
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<any>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      loadStats();
      loadSources();
    }
  }, [mounted]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/stats`);
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/sources`);
      if (res.ok) {
        setSources(await res.json());
      }
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('category', uploadCategory);
    if (uploadTags) formData.append('tags', uploadTags);

    try {
      const endpoint = uploadFile.name.endsWith('.csv')
        ? `${API_BASE}/api/knowledge/load/csv`
        : `${API_BASE}/api/knowledge/load/file`;

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      setUploadResult(result);

      if (res.ok) {
        loadStats();
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      setUploadResult({ error: 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualTitle || !manualContent) return;

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/knowledge/load/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manualTitle,
          content: manualContent,
          category: manualCategory,
          tags: manualTags ? manualTags.split(',').map(t => t.trim()) : null,
          supplier_name: manualSupplier || null
        })
      });

      const result = await res.json();

      if (res.ok) {
        setManualTitle('');
        setManualContent('');
        setManualTags('');
        setManualSupplier('');
        loadStats();
        alert('Knowledge added successfully!');
      } else {
        alert('Error: ' + (result.detail || 'Failed to add'));
      }
    } catch (err) {
      alert('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl) return;

    setScraping(true);
    setScrapeResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/knowledge/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: scrapeUrl,
          category: scrapeCategory
        })
      });

      const result = await res.json();
      setScrapeResult(result);

      if (res.ok) {
        loadStats();
        setScrapeUrl('');
      }
    } catch (err) {
      setScrapeResult({ error: 'Scrape failed' });
    } finally {
      setScraping(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/knowledge/load/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seedOptions)
      });

      const result = await res.json();
      setSeedResult(result);

      setTimeout(() => loadStats(), 5000);
    } catch (err) {
      setSeedResult({ error: 'Seed failed' });
    } finally {
      setSeeding(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;

    setSearching(true);

    try {
      const res = await fetch(`${API_BASE}/api/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          limit: 10
        })
      });

      if (res.ok) {
        const result = await res.json();
        setSearchResults(result.results || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  if (!mounted) return null;

  const categories = ['plates', 'processing', 'equipment', 'troubleshooting', 'best_practices', 'general'];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-cyan-400">FlexoBrain Knowledge Admin</h1>
          <p className="text-gray-400 mt-2">Manage and train the FlexoBrain AI agent</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['overview', 'upload', 'manual', 'scrape', 'seed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === tab
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            {loading ? (
              <div className="text-gray-400">Loading stats...</div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-3xl font-bold text-cyan-400">{stats.total_documents}</div>
                  <div className="text-gray-400 text-sm">Documents</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-3xl font-bold text-green-400">{stats.total_chunks}</div>
                  <div className="text-gray-400 text-sm">Chunks</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-3xl font-bold text-purple-400">{stats.total_words?.toLocaleString() || 0}</div>
                  <div className="text-gray-400 text-sm">Words</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-3xl font-bold text-orange-400">{stats.categories}</div>
                  <div className="text-gray-400 text-sm">Categories</div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 text-yellow-300">
                Knowledge base not initialized. Run the database migration first, then seed the knowledge.
              </div>
            )}

            {/* Category Breakdown */}
            {stats?.by_category && stats.by_category.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">By Category</h3>
                <div className="space-y-2">
                  {stats.by_category.map(cat => (
                    <div key={cat.category} className="flex justify-between items-center">
                      <span className="text-gray-300 capitalize">{cat.category?.replace('_', ' ') || 'Unknown'}</span>
                      <span className="text-cyan-400 font-mono">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Search */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Test Knowledge Search</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search knowledge base..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:opacity-50"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {searchResults.map((result, i) => (
                    <div key={i} className="bg-gray-700 rounded p-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-cyan-400">{result.title}</span>
                        <span className="text-gray-500">{(result.relevance * 100).toFixed(0)}% match</span>
                      </div>
                      <p className="text-gray-300 text-sm line-clamp-2">{result.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Upload Documents</h2>
            <p className="text-gray-400 mb-6">Upload PDF, TXT, MD, or CSV files to add to the knowledge base.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.csv,.xlsx"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700"
                />
                {uploadFile && (
                  <p className="text-sm text-gray-400 mt-1">{uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={e => setUploadTags(e.target.value)}
                  placeholder="e.g., plates, digital, solvent"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>

              <button
                onClick={handleFileUpload}
                disabled={!uploadFile || uploading}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload & Process'}
              </button>

              {uploadResult && (
                <div className={`p-4 rounded-lg ${uploadResult.error ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                  {uploadResult.error ? (
                    <p>Error: {uploadResult.error}</p>
                  ) : (
                    <div>
                      <p>Successfully processed!</p>
                      <p className="text-sm mt-1">Document ID: {uploadResult.document_id}</p>
                      <p className="text-sm">Chunks created: {uploadResult.chunks_created}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual Entry Tab */}
        {activeTab === 'manual' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Add Manual Knowledge</h2>
            <p className="text-gray-400 mb-6">Manually add knowledge articles to train FlexoBrain.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  placeholder="e.g., How to troubleshoot dot gain issues"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <select
                    value={manualCategory}
                    onChange={e => setManualCategory(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Supplier (optional)</label>
                  <input
                    type="text"
                    value={manualSupplier}
                    onChange={e => setManualSupplier(e.target.value)}
                    placeholder="e.g., XSYS, DuPont"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={manualTags}
                  onChange={e => setManualTags(e.target.value)}
                  placeholder="e.g., dot gain, troubleshooting, quality"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Content</label>
                <textarea
                  value={manualContent}
                  onChange={e => setManualContent(e.target.value)}
                  placeholder="Enter the knowledge content here. Be detailed and specific..."
                  rows={10}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white resize-none"
                />
                <p className="text-sm text-gray-500 mt-1">{manualContent.split(/\s+/).filter(Boolean).length} words</p>
              </div>

              <button
                onClick={handleManualSubmit}
                disabled={!manualTitle || !manualContent || submitting}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Knowledge'}
              </button>
            </div>
          </div>
        )}

        {/* Scrape Tab */}
        {activeTab === 'scrape' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Scrape Web Content</h2>
              <p className="text-gray-400 mb-6">Scrape content from supplier websites and technical resources.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">URL</label>
                  <input
                    type="url"
                    value={scrapeUrl}
                    onChange={e => setScrapeUrl(e.target.value)}
                    placeholder="https://www.xsys.com/products/nyloflex"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <select
                    value={scrapeCategory}
                    onChange={e => setScrapeCategory(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleScrape}
                  disabled={!scrapeUrl || scraping}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium disabled:opacity-50"
                >
                  {scraping ? 'Scraping...' : 'Scrape URL'}
                </button>

                {scrapeResult && (
                  <div className={`p-4 rounded-lg ${scrapeResult.error ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                    {scrapeResult.error ? (
                      <p>Error: {scrapeResult.error || scrapeResult.detail}</p>
                    ) : (
                      <div>
                        <p>Successfully scraped!</p>
                        <p className="text-sm mt-1">Title: {scrapeResult.title}</p>
                        <p className="text-sm">Words: {scrapeResult.word_count}</p>
                        <p className="text-sm">Chunks: {scrapeResult.chunks_created}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Configured Sources */}
            {sources.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Configured Sources</h3>
                <div className="space-y-2">
                  {sources.map(source => (
                    <div key={source.id} className="flex justify-between items-center bg-gray-700 rounded p-3">
                      <div>
                        <div className="font-medium">{source.name}</div>
                        <div className="text-sm text-gray-400">{source.base_url}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm ${source.is_active ? 'text-green-400' : 'text-gray-500'}`}>
                          {source.is_active ? 'Active' : 'Inactive'}
                        </div>
                        <div className="text-sm text-gray-500">{source.pages_scraped} pages</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Seed Tab */}
        {activeTab === 'seed' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Seed Industry Knowledge</h2>
            <p className="text-gray-400 mb-6">
              Populate the knowledge base with pre-built flexographic printing expertise.
              This provides a foundation of 15+ detailed articles covering all aspects of flexo.
            </p>

            <div className="space-y-4">
              <div className="space-y-3">
                {[
                  { key: 'include_core_knowledge', label: 'Core Flexo Knowledge', desc: 'Fundamentals, plate technology, UV exposure, anilox, thickness guides' },
                  { key: 'include_supplier_info', label: 'Supplier Information', desc: 'XSYS, DuPont, Miraclon, Asahi product details' },
                  { key: 'include_troubleshooting', label: 'Troubleshooting Guides', desc: 'Dot gain, dirty printing, plate wear, exposure problems' },
                  { key: 'include_best_practices', label: 'Best Practices', desc: 'Mounting, ink management, QC, press setup' }
                ].map(item => (
                  <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={seedOptions[item.key as keyof typeof seedOptions]}
                      onChange={e => setSeedOptions({...seedOptions, [item.key]: e.target.checked})}
                      className="mt-1 w-5 h-5 rounded bg-gray-700 border-gray-600 text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-sm text-gray-400">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <button
                onClick={handleSeed}
                disabled={seeding || !Object.values(seedOptions).some(Boolean)}
                className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50"
              >
                {seeding ? 'Seeding Knowledge Base...' : 'Seed Knowledge Base'}
              </button>

              {seedResult && (
                <div className={`p-4 rounded-lg ${seedResult.error ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                  {seedResult.error ? (
                    <p>Error: {seedResult.error}</p>
                  ) : (
                    <div>
                      <p>{seedResult.message || 'Seeding started!'}</p>
                      <p className="text-sm mt-1">Entries queued: {seedResult.entries_queued}</p>
                      <p className="text-sm text-gray-400 mt-2">Stats will update in a few seconds...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Back to Dashboard Link */}
        <div className="mt-8">
          <a href="/dashboard" className="text-cyan-400 hover:text-cyan-300">
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
