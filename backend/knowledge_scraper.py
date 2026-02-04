"""
FlexoBrain Knowledge Scraper - ZenRows Web Scraping Module

This module handles:
- Web scraping using ZenRows API (handles anti-bot protection)
- Content extraction and cleaning
- Text chunking for RAG
- OpenAI embeddings generation
- Storage in PostgreSQL with pgvector

Usage:
    - Configure ZENROWS_API_KEY in environment
    - Configure OPENAI_API_KEY for embeddings
    - Call scrape endpoints to populate knowledge base
"""

import os
import json
import hashlib
import asyncio
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import asyncpg
import tiktoken

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Base"])

# ============================================================================
# CONFIGURATION
# ============================================================================

ZENROWS_API_KEY = os.getenv("ZENROWS_API_KEY")
ZENROWS_BASE_URL = "https://api.zenrows.com/v1/"

# Chunking configuration
CHUNK_SIZE = 500  # Target tokens per chunk
CHUNK_OVERLAP = 50  # Overlap tokens between chunks
MAX_CHUNK_SIZE = 800  # Maximum tokens per chunk

# Embedding model
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536

# Rate limiting
SCRAPE_DELAY_SECONDS = 2  # Delay between scrapes to be respectful

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

_db_pool = None

async def get_db_pool():
    global _db_pool
    if _db_pool is None:
        database_url = os.getenv("DATABASE_URL")
        if database_url:
            _db_pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
    return _db_pool


# ============================================================================
# OPENAI CLIENT (Lazy loaded)
# ============================================================================

_openai_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import AsyncOpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ScrapeRequest(BaseModel):
    url: str
    category: Optional[str] = "general"
    force_rescrape: bool = False

class BulkScrapeRequest(BaseModel):
    source_id: Optional[str] = None  # Scrape all URLs from a source
    urls: Optional[List[str]] = None  # Or provide specific URLs
    category: Optional[str] = "general"

class AddKnowledgeRequest(BaseModel):
    title: str
    content: str
    category: str
    subcategory: Optional[str] = None
    tags: Optional[List[str]] = None
    source_name: Optional[str] = "manual"

class SearchKnowledgeRequest(BaseModel):
    query: str
    category: Optional[str] = None
    limit: int = 10
    threshold: float = 0.7


# ============================================================================
# ZENROWS SCRAPER
# ============================================================================

async def scrape_url_zenrows(url: str, js_render: bool = True) -> Dict[str, Any]:
    """
    Scrape a URL using ZenRows API

    Args:
        url: The URL to scrape
        js_render: Whether to render JavaScript (needed for dynamic content)

    Returns:
        Dict with 'html', 'status', and 'error' if any
    """
    if not ZENROWS_API_KEY:
        # Fallback to direct fetch if no ZenRows key
        return await scrape_url_direct(url)

    params = {
        "apikey": ZENROWS_API_KEY,
        "url": url,
        "js_render": str(js_render).lower(),
        "premium_proxy": "true",  # Better success rate for protected sites
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.get(ZENROWS_BASE_URL, params=params)

            if response.status_code == 200:
                return {
                    "html": response.text,
                    "status": "success",
                    "source": "zenrows"
                }
            else:
                return {
                    "html": None,
                    "status": "error",
                    "error": f"ZenRows returned {response.status_code}: {response.text[:200]}"
                }
        except Exception as e:
            return {
                "html": None,
                "status": "error",
                "error": str(e)
            }


async def scrape_url_direct(url: str) -> Dict[str, Any]:
    """
    Direct HTTP fetch (fallback when ZenRows not available)
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers)

            if response.status_code == 200:
                return {
                    "html": response.text,
                    "status": "success",
                    "source": "direct"
                }
            else:
                return {
                    "html": None,
                    "status": "error",
                    "error": f"HTTP {response.status_code}"
                }
        except Exception as e:
            return {
                "html": None,
                "status": "error",
                "error": str(e)
            }


# ============================================================================
# CONTENT EXTRACTION
# ============================================================================

def extract_content(html: str, content_selector: str = None, exclude_selectors: List[str] = None) -> Dict[str, Any]:
    """
    Extract clean text content from HTML

    Args:
        html: Raw HTML string
        content_selector: CSS selector for main content (optional)
        exclude_selectors: CSS selectors to exclude (nav, footer, etc.)

    Returns:
        Dict with 'title', 'content', 'links', 'word_count'
    """
    soup = BeautifulSoup(html, 'html.parser')

    # Remove unwanted elements
    default_excludes = [
        'script', 'style', 'nav', 'footer', 'header', 'aside',
        '.cookie-banner', '.popup', '.modal', '.advertisement', '.ads',
        '#cookie-consent', '.navigation', '.menu', '.sidebar'
    ]
    excludes = (exclude_selectors or []) + default_excludes

    for selector in excludes:
        for element in soup.select(selector):
            element.decompose()

    # Get title
    title = ""
    if soup.title:
        title = soup.title.string or ""
    if not title:
        h1 = soup.find('h1')
        if h1:
            title = h1.get_text(strip=True)

    # Get main content
    if content_selector:
        main_content = soup.select_one(content_selector)
        if main_content:
            soup = main_content
    else:
        # Try common content containers
        for selector in ['main', 'article', '.content', '.main-content', '#content', '#main']:
            main = soup.select_one(selector)
            if main:
                soup = main
                break

    # Extract text with structure preservation
    content_parts = []

    for element in soup.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'td', 'th', 'span', 'div']):
        text = element.get_text(separator=' ', strip=True)
        if text and len(text) > 10:  # Filter out very short fragments
            # Add heading markers
            if element.name in ['h1', 'h2', 'h3', 'h4']:
                text = f"\n## {text}\n"
            content_parts.append(text)

    # Join and clean
    content = '\n'.join(content_parts)
    content = re.sub(r'\n{3,}', '\n\n', content)  # Remove excessive newlines
    content = re.sub(r' {2,}', ' ', content)  # Remove excessive spaces

    # Extract links for further crawling
    links = []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('/') or href.startswith('http'):
            links.append(href)

    word_count = len(content.split())

    return {
        "title": title.strip(),
        "content": content.strip(),
        "links": list(set(links)),
        "word_count": word_count
    }


# ============================================================================
# TEXT CHUNKING
# ============================================================================

def get_tokenizer():
    """Get tiktoken tokenizer for chunk size estimation"""
    try:
        return tiktoken.encoding_for_model("gpt-4")
    except:
        return tiktoken.get_encoding("cl100k_base")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[Dict[str, Any]]:
    """
    Split text into chunks for embedding

    Uses sentence-aware splitting to maintain context.

    Args:
        text: The text to chunk
        chunk_size: Target tokens per chunk
        overlap: Overlap tokens between chunks

    Returns:
        List of dicts with 'text', 'tokens', 'index'
    """
    tokenizer = get_tokenizer()

    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)

    chunks = []
    current_chunk = []
    current_tokens = 0

    for sentence in sentences:
        sentence_tokens = len(tokenizer.encode(sentence))

        # If single sentence exceeds max, split it
        if sentence_tokens > MAX_CHUNK_SIZE:
            # Flush current chunk
            if current_chunk:
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "tokens": current_tokens,
                    "index": len(chunks)
                })
                current_chunk = []
                current_tokens = 0

            # Split long sentence by words
            words = sentence.split()
            temp_chunk = []
            temp_tokens = 0

            for word in words:
                word_tokens = len(tokenizer.encode(word))
                if temp_tokens + word_tokens > MAX_CHUNK_SIZE:
                    if temp_chunk:
                        chunks.append({
                            "text": ' '.join(temp_chunk),
                            "tokens": temp_tokens,
                            "index": len(chunks)
                        })
                    temp_chunk = [word]
                    temp_tokens = word_tokens
                else:
                    temp_chunk.append(word)
                    temp_tokens += word_tokens

            if temp_chunk:
                current_chunk = temp_chunk
                current_tokens = temp_tokens
            continue

        # Check if adding sentence exceeds chunk size
        if current_tokens + sentence_tokens > chunk_size:
            # Save current chunk
            if current_chunk:
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "tokens": current_tokens,
                    "index": len(chunks)
                })

            # Start new chunk with overlap
            if overlap > 0 and current_chunk:
                # Take last few sentences for overlap
                overlap_text = []
                overlap_tokens = 0
                for s in reversed(current_chunk):
                    s_tokens = len(tokenizer.encode(s))
                    if overlap_tokens + s_tokens <= overlap:
                        overlap_text.insert(0, s)
                        overlap_tokens += s_tokens
                    else:
                        break
                current_chunk = overlap_text + [sentence]
                current_tokens = overlap_tokens + sentence_tokens
            else:
                current_chunk = [sentence]
                current_tokens = sentence_tokens
        else:
            current_chunk.append(sentence)
            current_tokens += sentence_tokens

    # Don't forget the last chunk
    if current_chunk:
        chunk_text = ' '.join(current_chunk)
        chunks.append({
            "text": chunk_text,
            "tokens": current_tokens,
            "index": len(chunks)
        })

    return chunks


# ============================================================================
# EMBEDDINGS
# ============================================================================

async def generate_embedding(text: str) -> List[float]:
    """Generate embedding for a single text"""
    client = get_openai_client()

    response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
        dimensions=EMBEDDING_DIMENSIONS
    )

    return response.data[0].embedding


async def generate_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for multiple texts (batched)"""
    client = get_openai_client()

    # OpenAI allows up to 2048 texts per batch
    batch_size = 100
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]

        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
            dimensions=EMBEDDING_DIMENSIONS
        )

        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

def content_hash(content: str) -> str:
    """Generate SHA256 hash of content for deduplication"""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


async def store_document(
    pool: asyncpg.Pool,
    title: str,
    content: str,
    source_url: str = None,
    source_type: str = "web_scrape",
    source_name: str = None,
    category: str = "general",
    subcategory: str = None,
    tags: List[str] = None,
    supplier_id: str = None
) -> Tuple[str, bool]:
    """
    Store a document and its chunks with embeddings

    Returns:
        Tuple of (document_id, is_new)
    """
    hash_val = content_hash(content)

    async with pool.acquire() as conn:
        # Check for duplicate
        existing = await conn.fetchrow(
            "SELECT id FROM knowledge_documents WHERE content_hash = $1",
            hash_val
        )

        if existing:
            # Update last_scraped_at
            await conn.execute(
                "UPDATE knowledge_documents SET last_scraped_at = NOW() WHERE id = $1",
                existing['id']
            )
            return str(existing['id']), False

        # Insert new document
        doc_id = await conn.fetchval("""
            INSERT INTO knowledge_documents
            (source_url, source_type, source_name, title, content, content_hash,
             category, subcategory, tags, supplier_id, word_count, last_scraped_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING id
        """, source_url, source_type, source_name, title, content, hash_val,
            category, subcategory, tags,
            supplier_id if supplier_id else None,
            len(content.split()))

        # Chunk the content
        chunks = chunk_text(content)

        if chunks:
            # Generate embeddings for all chunks
            chunk_texts = [c['text'] for c in chunks]
            embeddings = await generate_embeddings_batch(chunk_texts)

            # Store chunks with embeddings
            for chunk, embedding in zip(chunks, embeddings):
                await conn.execute("""
                    INSERT INTO knowledge_chunks
                    (document_id, chunk_index, chunk_text, chunk_tokens, embedding)
                    VALUES ($1, $2, $3, $4, $5)
                """, doc_id, chunk['index'], chunk['text'], chunk['tokens'],
                    json.dumps(embedding))  # pgvector accepts JSON array

        return str(doc_id), True


async def search_knowledge_db(
    pool: asyncpg.Pool,
    query_embedding: List[float],
    category: str = None,
    limit: int = 10,
    threshold: float = 0.7
) -> List[Dict[str, Any]]:
    """
    Search knowledge base using vector similarity
    """
    async with pool.acquire() as conn:
        # Build query
        if category:
            results = await conn.fetch("""
                SELECT
                    kc.id as chunk_id,
                    kd.id as document_id,
                    kc.chunk_text,
                    kd.title,
                    kd.category,
                    kd.source_url,
                    1 - (kc.embedding <=> $1::vector) as similarity
                FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kc.document_id = kd.id
                WHERE kd.is_active = TRUE
                  AND kd.category = $2
                  AND 1 - (kc.embedding <=> $1::vector) > $3
                ORDER BY kc.embedding <=> $1::vector
                LIMIT $4
            """, json.dumps(query_embedding), category, threshold, limit)
        else:
            results = await conn.fetch("""
                SELECT
                    kc.id as chunk_id,
                    kd.id as document_id,
                    kc.chunk_text,
                    kd.title,
                    kd.category,
                    kd.source_url,
                    1 - (kc.embedding <=> $1::vector) as similarity
                FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kc.document_id = kd.id
                WHERE kd.is_active = TRUE
                  AND 1 - (kc.embedding <=> $1::vector) > $2
                ORDER BY kc.embedding <=> $1::vector
                LIMIT $3
            """, json.dumps(query_embedding), threshold, limit)

        return [dict(r) for r in results]


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/scrape")
async def scrape_single_url(request: ScrapeRequest, background_tasks: BackgroundTasks):
    """
    Scrape a single URL and add to knowledge base
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    # Check if already scraped recently
    if not request.force_rescrape:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("""
                SELECT id, title, last_scraped_at
                FROM knowledge_documents
                WHERE source_url = $1
                  AND last_scraped_at > NOW() - INTERVAL '24 hours'
            """, request.url)

            if existing:
                return {
                    "status": "already_scraped",
                    "document_id": str(existing['id']),
                    "title": existing['title'],
                    "last_scraped": str(existing['last_scraped_at'])
                }

    # Scrape the URL
    result = await scrape_url_zenrows(request.url)

    if result['status'] != 'success':
        raise HTTPException(status_code=400, detail=f"Scrape failed: {result.get('error')}")

    # Extract content
    extracted = extract_content(result['html'])

    if extracted['word_count'] < 50:
        raise HTTPException(status_code=400, detail="Page has insufficient content")

    # Store document
    doc_id, is_new = await store_document(
        pool=pool,
        title=extracted['title'],
        content=extracted['content'],
        source_url=request.url,
        source_type="web_scrape",
        source_name=urlparse(request.url).netloc,
        category=request.category
    )

    return {
        "status": "success",
        "document_id": doc_id,
        "is_new": is_new,
        "title": extracted['title'],
        "word_count": extracted['word_count'],
        "chunks_created": len(chunk_text(extracted['content'])),
        "links_found": len(extracted['links'])
    }


@router.post("/scrape/bulk")
async def scrape_bulk(request: BulkScrapeRequest, background_tasks: BackgroundTasks):
    """
    Scrape multiple URLs (runs in background)
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    urls_to_scrape = []

    if request.source_id:
        # Get URLs from scrape source configuration
        async with pool.acquire() as conn:
            source = await conn.fetchrow(
                "SELECT * FROM scrape_sources WHERE id = $1 AND is_active = TRUE",
                request.source_id
            )
            if source:
                # For now, just use base URL - in production would crawl
                urls_to_scrape.append(source['base_url'])

    if request.urls:
        urls_to_scrape.extend(request.urls)

    if not urls_to_scrape:
        raise HTTPException(status_code=400, detail="No URLs to scrape")

    # Start background task
    async def scrape_all():
        results = []
        for url in urls_to_scrape:
            try:
                result = await scrape_url_zenrows(url)
                if result['status'] == 'success':
                    extracted = extract_content(result['html'])
                    if extracted['word_count'] >= 50:
                        doc_id, is_new = await store_document(
                            pool=pool,
                            title=extracted['title'],
                            content=extracted['content'],
                            source_url=url,
                            category=request.category
                        )
                        results.append({"url": url, "status": "success", "doc_id": doc_id})
                    else:
                        results.append({"url": url, "status": "skipped", "reason": "insufficient_content"})
                else:
                    results.append({"url": url, "status": "error", "error": result.get('error')})
            except Exception as e:
                results.append({"url": url, "status": "error", "error": str(e)})

            await asyncio.sleep(SCRAPE_DELAY_SECONDS)

        return results

    background_tasks.add_task(scrape_all)

    return {
        "status": "started",
        "urls_queued": len(urls_to_scrape),
        "message": "Scraping started in background"
    }


@router.post("/add")
async def add_manual_knowledge(request: AddKnowledgeRequest):
    """
    Manually add knowledge to the database
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    if len(request.content) < 100:
        raise HTTPException(status_code=400, detail="Content too short (min 100 characters)")

    doc_id, is_new = await store_document(
        pool=pool,
        title=request.title,
        content=request.content,
        source_type="manual",
        source_name=request.source_name,
        category=request.category,
        subcategory=request.subcategory,
        tags=request.tags
    )

    return {
        "status": "success",
        "document_id": doc_id,
        "is_new": is_new,
        "chunks_created": len(chunk_text(request.content))
    }


@router.post("/search")
async def search_knowledge(request: SearchKnowledgeRequest):
    """
    Search the knowledge base using semantic similarity
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    # Generate embedding for query
    query_embedding = await generate_embedding(request.query)

    # Search
    results = await search_knowledge_db(
        pool=pool,
        query_embedding=query_embedding,
        category=request.category,
        limit=request.limit,
        threshold=request.threshold
    )

    return {
        "query": request.query,
        "results": results,
        "count": len(results)
    }


@router.get("/sources")
async def get_scrape_sources():
    """
    Get configured scrape sources
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, base_url, default_category, is_active,
                   last_scraped_at, pages_scraped, last_error
            FROM scrape_sources
            ORDER BY name
        """)

        return [dict(r) for r in rows]


@router.get("/stats")
async def get_knowledge_stats():
    """
    Get knowledge base statistics
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    async with pool.acquire() as conn:
        stats = await conn.fetchrow("""
            SELECT
                (SELECT COUNT(*) FROM knowledge_documents WHERE is_active = TRUE) as total_documents,
                (SELECT COUNT(*) FROM knowledge_chunks) as total_chunks,
                (SELECT SUM(word_count) FROM knowledge_documents WHERE is_active = TRUE) as total_words,
                (SELECT COUNT(DISTINCT category) FROM knowledge_documents) as categories,
                (SELECT COUNT(*) FROM knowledge_documents WHERE source_type = 'web_scrape') as web_scraped,
                (SELECT COUNT(*) FROM knowledge_documents WHERE source_type = 'manual') as manual_entries
        """)

        category_breakdown = await conn.fetch("""
            SELECT category, COUNT(*) as count
            FROM knowledge_documents
            WHERE is_active = TRUE
            GROUP BY category
            ORDER BY count DESC
        """)

        return {
            "total_documents": stats['total_documents'],
            "total_chunks": stats['total_chunks'],
            "total_words": stats['total_words'],
            "categories": stats['categories'],
            "sources": {
                "web_scraped": stats['web_scraped'],
                "manual": stats['manual_entries']
            },
            "by_category": [dict(r) for r in category_breakdown]
        }


@router.get("/health")
async def health_check():
    """Health check for knowledge scraper"""
    pool = await get_db_pool()

    return {
        "status": "healthy",
        "zenrows_configured": bool(ZENROWS_API_KEY),
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "database_connected": pool is not None
    }
