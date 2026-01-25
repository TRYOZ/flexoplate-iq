-- ============================================================================
-- FlexoBrain Knowledge Base Schema
-- Vector storage for semantic search using pgvector
-- ============================================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- KNOWLEDGE DOCUMENTS
-- Stores scraped/uploaded content with embeddings
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source information
    source_url TEXT,
    source_type VARCHAR(50) NOT NULL,  -- 'web_scrape', 'pdf', 'manual', 'datasheet'
    source_name VARCHAR(255),           -- Human-readable source name

    -- Content
    title VARCHAR(500),
    content TEXT NOT NULL,
    content_hash VARCHAR(64),           -- SHA256 hash for deduplication

    -- Categorization
    category VARCHAR(100),              -- 'plates', 'processing', 'equipment', 'troubleshooting', 'best_practices'
    subcategory VARCHAR(100),
    tags TEXT[],

    -- Related entities
    supplier_id UUID REFERENCES suppliers(id),
    plate_family_id UUID REFERENCES plate_families(id),

    -- Metadata
    language VARCHAR(10) DEFAULT 'en',
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_scraped_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    quality_score FLOAT,                -- 0-1 score for content quality

    CONSTRAINT unique_content_hash UNIQUE (content_hash)
);

-- ============================================================================
-- KNOWLEDGE CHUNKS
-- Chunked content with embeddings for semantic search
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,

    -- Chunk content
    chunk_index INTEGER NOT NULL,       -- Order within document
    chunk_text TEXT NOT NULL,
    chunk_tokens INTEGER,               -- Token count for this chunk

    -- Vector embedding (OpenAI text-embedding-3-small = 1536 dimensions)
    embedding vector(1536),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_chunk_per_doc UNIQUE (document_id, chunk_index)
);

-- ============================================================================
-- SCRAPE SOURCES
-- Configuration for web scraping sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS scrape_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source configuration
    name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    url_patterns TEXT[],                -- Regex patterns for URLs to scrape

    -- Scraping settings
    scrape_frequency_hours INTEGER DEFAULT 168,  -- Weekly by default
    max_depth INTEGER DEFAULT 3,
    respect_robots_txt BOOLEAN DEFAULT TRUE,

    -- Content extraction
    content_selector VARCHAR(255),      -- CSS selector for main content
    exclude_selectors TEXT[],           -- CSS selectors to exclude

    -- Categorization
    default_category VARCHAR(100),
    supplier_id UUID REFERENCES suppliers(id),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_scraped_at TIMESTAMPTZ,
    last_error TEXT,
    pages_scraped INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CONVERSATION HISTORY
-- Store chat conversations for analytics and improvement
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(100),

    -- Conversation context
    page_context VARCHAR(100),          -- Which page the chat started from
    initial_query TEXT,

    -- Metadata
    message_count INTEGER DEFAULT 0,
    tool_calls_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,

    -- Feedback
    user_rating INTEGER,                -- 1-5 rating
    user_feedback TEXT
);

CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,

    -- Message content
    role VARCHAR(20) NOT NULL,          -- 'user', 'assistant', 'tool'
    content TEXT,

    -- Tool calls (for assistant messages)
    tool_calls JSONB,
    tool_results JSONB,

    -- Metadata
    tokens_used INTEGER,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Vector similarity search index (IVFFlat for performance)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Document indexes
CREATE INDEX IF NOT EXISTS idx_docs_category ON knowledge_documents(category);
CREATE INDEX IF NOT EXISTS idx_docs_source_type ON knowledge_documents(source_type);
CREATE INDEX IF NOT EXISTS idx_docs_supplier ON knowledge_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_docs_active ON knowledge_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_docs_content_hash ON knowledge_documents(content_hash);

-- Chunk indexes
CREATE INDEX IF NOT EXISTS idx_chunks_document ON knowledge_chunks(document_id);

-- Conversation indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON agent_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON agent_messages(conversation_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to search knowledge base by semantic similarity
CREATE OR REPLACE FUNCTION search_knowledge(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_category VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    chunk_text TEXT,
    title VARCHAR,
    category VARCHAR,
    source_url TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id AS chunk_id,
        kd.id AS document_id,
        kc.chunk_text,
        kd.title,
        kd.category,
        kd.source_url,
        1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE kd.is_active = TRUE
      AND (filter_category IS NULL OR kd.category = filter_category)
      AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED SCRAPE SOURCES
-- ============================================================================

INSERT INTO scrape_sources (name, base_url, url_patterns, default_category, scrape_frequency_hours) VALUES
    ('XSYS Website', 'https://www.xsys.com', ARRAY['/products/', '/solutions/', '/knowledge/'], 'plates', 168),
    ('DuPont Cyrel', 'https://www.dupont.com/brands/cyrel.html', ARRAY['/products/', '/resources/'], 'plates', 168),
    ('Miraclon', 'https://www.miraclon.com', ARRAY['/products/', '/resources/', '/news/'], 'plates', 168),
    ('Flexography.org', 'https://www.flexography.org', ARRAY['/resources/', '/technical/'], 'best_practices', 336),
    ('FTA Technical', 'https://www.flexography.org/fta-first', ARRAY['/first/', '/specs/'], 'best_practices', 720)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INITIAL KNOWLEDGE SEED
-- Core flexographic knowledge to bootstrap the agent
-- ============================================================================

INSERT INTO knowledge_documents (source_type, source_name, title, content, category, tags) VALUES
(
    'manual',
    'FlexoBrain Core Knowledge',
    'Introduction to Flexographic Printing',
    'Flexographic printing (flexo) is a rotary relief printing process using flexible photopolymer plates. It is widely used for packaging (flexible packaging, labels, corrugated boxes, folding cartons) due to its versatility, speed, and ability to print on various substrates. The process uses fluid inks that dry rapidly through evaporation or UV curing. Key components include: the plate cylinder (carries the printing plate), anilox roller (meters ink to the plate), impression cylinder (provides pressure), and doctor blade system (removes excess ink from anilox).',
    'best_practices',
    ARRAY['introduction', 'basics', 'overview']
),
(
    'manual',
    'FlexoBrain Core Knowledge',
    'Flexographic Plate Technology Overview',
    'Modern flexographic plates are made from photopolymer materials that harden when exposed to UV light. Digital plates use a laser-ablatable mask layer - a laser removes the mask in image areas, then UV exposure cures the exposed polymer. Analog plates use photographic film negatives. Key plate properties: thickness (0.76mm to 6.35mm), hardness (Shore A durometer, typically 55-80), surface type (flat-top vs round-top dots). Flat-top dot technology (FTF, EASY, NX) provides flatter dot surfaces for more consistent ink transfer and better print quality.',
    'plates',
    ARRAY['photopolymer', 'digital', 'technology']
),
(
    'manual',
    'FlexoBrain Core Knowledge',
    'Plate Processing Methods',
    'Three main processing methods exist for flexographic plates: 1) Solvent washout - traditional method using solvents (perchloroethylene, hydrocarbon-based) to remove uncured polymer. Processing time 45-90 minutes. Requires solvent recovery. 2) Thermal processing (FAST) - uses heat and absorbent media instead of solvents. Faster (15-25 min), more environmentally friendly. Examples: DuPont Cyrel FAST, XSYS nyloflex ACE. 3) Water-wash - uses water-based chemistry. Most eco-friendly but requires water treatment. Examples: Asahi AWP, DuPont Cyrel NOW. Each method has compatible plate types - not all plates work with all processes.',
    'processing',
    ARRAY['solvent', 'thermal', 'water-wash', 'FAST']
),
(
    'manual',
    'FlexoBrain Core Knowledge',
    'UV Exposure Fundamentals',
    'UV exposure is critical for proper plate making. Main exposure (front) polymerizes the image areas - energy typically 800-1800 mJ/cm² depending on plate type. Back exposure creates the relief floor - energy typically 150-400 mJ/cm². UV sources: traditional fluorescent UVA tubes (15-20 mW/cm², degrade over time) or LED UVA (30-50 mW/cm², more consistent, longer life). Exposure time = Energy ÷ Intensity. Always run step tests (UGRA/FOGRA wedge) when: changing plate types, after lamp replacement, periodically for QC. Under-exposure causes soft dots and poor durability. Over-exposure causes dot gain and loss of fine detail.',
    'processing',
    ARRAY['UV', 'exposure', 'energy', 'LED']
),
(
    'manual',
    'FlexoBrain Core Knowledge',
    'Anilox Roller Selection',
    'The anilox roller is critical for ink metering in flexo. Key specifications: Line screen (cells per inch/cm) - higher = finer detail but less ink. Cell volume (BCM or cm³/m²) - determines ink laydown. Typical relationship: anilox line screen should be 4-6x the plate LPI. Common setups: process work 800-1200 LPI anilox, 2-4 BCM; solids/heavy coverage 200-400 LPI anilox, 6-12 BCM. Ceramic anilox (chrome oxide or laser-engraved ceramic) offers best durability. Regular cleaning essential - plugged cells reduce effective volume. Inspect under microscope periodically.',
    'equipment',
    ARRAY['anilox', 'ink', 'metering']
)
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Knowledge base schema created successfully';
