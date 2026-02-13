# News Aggregator for FlexoPlate IQ - Zenrows Edition
# ====================================================
# Uses Zenrows API for reliable OpenGraph image extraction

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta
import httpx
import asyncio
import hashlib
import re
import os

router = APIRouter(prefix="/api/news", tags=["news"])

# Zenrows configuration
ZENROWS_API_KEY = os.getenv("ZENROWS_API_KEY", "")
ZENROWS_BASE_URL = "https://api.zenrows.com/v1/"

# Database pool will be set from main.py
_pool = None

def set_pool(pool):
    global _pool
    _pool = pool

async def get_pool():
    global _pool
    if _pool is None:
        raise HTTPException(status_code=500, detail="Database pool not initialized")
    return _pool

# =============================================================================
# RSS Feed Sources - For URL Discovery Only
# =============================================================================
RSS_FEEDS = [
    # North America
    {"name": "Packaging World", "url": "https://www.packworld.com/rss.xml", "category": "Packaging", "region": "North America"},
    {"name": "Packaging Digest", "url": "https://www.packagingdigest.com/rss.xml", "category": "Packaging", "region": "North America"},
    {"name": "Flexible Packaging", "url": "https://www.flexpackmag.com/rss", "category": "Flexo", "region": "North America"},
    {"name": "PFFC", "url": "https://www.pffc-online.com/rss.xml", "category": "Converting", "region": "North America"},
    {"name": "Converting Quarterly", "url": "https://www.convertingquarterly.com/feed/", "category": "Converting", "region": "North America"},
    {"name": "Ink World", "url": "https://www.inkworldmagazine.com/rss.xml", "category": "Inks", "region": "North America"},
    {"name": "Label & Narrow Web", "url": "https://www.labelandnarrowweb.com/rss.xml", "category": "Labels", "region": "North America"},
    {"name": "Printing Impressions", "url": "https://www.piworld.com/feed/", "category": "Print", "region": "North America"},

    # EMEA - UK
    {"name": "PrintWeek UK", "url": "https://www.printweek.com/rss", "category": "Print", "region": "EMEA"},
    {"name": "FlexoTech", "url": "https://www.flexotechmag.com/feed/", "category": "Flexo", "region": "EMEA"},
    {"name": "Packaging Europe", "url": "https://packagingeurope.com/feed/", "category": "Packaging", "region": "EMEA"},
    {"name": "Labels & Labeling", "url": "https://www.labelsandlabeling.com/rss.xml", "category": "Labels", "region": "EMEA"},

    # EMEA - Germany
    {"name": "Flexo+Tief-Druck", "url": "https://www.flexotiefdruck.de/feed/", "category": "Flexo", "region": "EMEA"},
    {"name": "Verpackungs-Rundschau", "url": "https://www.verpackungsrundschau.de/feed/", "category": "Packaging", "region": "EMEA"},

    # EMEA - France
    {"name": "Emballages Magazine", "url": "https://www.emballagesmagazine.com/rss.xml", "category": "Packaging", "region": "EMEA"},

    # EMEA - Italy
    {"name": "ItaliaImballaggio", "url": "https://www.italiaimballaggio.it/feed/", "category": "Packaging", "region": "EMEA"},
    {"name": "Converter Flessibili", "url": "https://www.converter.it/feed/", "category": "Flexo", "region": "EMEA"},

    # EMEA - Spain
    {"name": "Infopack", "url": "https://www.infopack.es/feed/", "category": "Packaging", "region": "EMEA"},

    # LATAM
    {"name": "El Empaque", "url": "https://www.elempaque.com/feed/", "category": "Packaging", "region": "LATAM"},

    # APAC
    {"name": "Packaging South Asia", "url": "https://www.packagingsouthasia.com/feed/", "category": "Packaging", "region": "APAC"},
    {"name": "PKN Packaging News", "url": "https://www.packagingnews.com.au/feed/", "category": "Packaging", "region": "APAC"},

    # Google News (Fallback for broader coverage)
    {"name": "Flexo News", "url": "https://news.google.com/rss/search?q=flexographic+printing&hl=en-US&gl=US&ceid=US:en", "category": "Flexo", "region": "Global"},
    {"name": "Packaging News", "url": "https://news.google.com/rss/search?q=packaging+industry&hl=en-US&gl=US&ceid=US:en", "category": "Packaging", "region": "Global"},
]

# =============================================================================
# Models
# =============================================================================
class NewsArticle(BaseModel):
    id: str
    title: str
    summary: Optional[str]
    url: str
    image_url: Optional[str]
    source_name: str
    category: str
    region: str
    published_at: Optional[datetime]

class NewsResponse(BaseModel):
    articles: List[NewsArticle]
    total: int
    has_more: bool

# =============================================================================
# Database Initialization
# =============================================================================
async def init_news_table(conn):
    """Create news_articles table if it doesn't exist"""
    await conn.execute("""
        -- News articles table with OpenGraph data
        CREATE TABLE IF NOT EXISTS news_articles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            external_id VARCHAR(64) UNIQUE NOT NULL,
            title VARCHAR(500) NOT NULL,
            summary TEXT,
            url VARCHAR(1000) NOT NULL,
            image_url VARCHAR(1000),
            source_name VARCHAR(100) NOT NULL,
            source_url VARCHAR(500),
            category VARCHAR(50) NOT NULL,
            region VARCHAR(50) DEFAULT 'Global',
            language VARCHAR(10) DEFAULT 'en',
            published_at TIMESTAMP WITH TIME ZONE,
            fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            og_title VARCHAR(500),
            og_description TEXT,
            og_image VARCHAR(1000),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)

    # Create indexes
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles(category);
        CREATE INDEX IF NOT EXISTS idx_news_articles_region ON news_articles(region);
        CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source_name);
        CREATE INDEX IF NOT EXISTS idx_news_articles_created ON news_articles(created_at DESC);
    """)

    print("[News] Database table initialized")

# =============================================================================
# Zenrows Scraping Functions
# =============================================================================
async def fetch_with_zenrows(url: str) -> Optional[str]:
    """Fetch a URL using Zenrows API."""
    if not ZENROWS_API_KEY:
        print("[News] Warning: ZENROWS_API_KEY not set, skipping OG fetch")
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                ZENROWS_BASE_URL,
                params={
                    "apikey": ZENROWS_API_KEY,
                    "url": url,
                    "js_render": "false",
                    "premium_proxy": "true",
                }
            )

            if response.status_code == 200:
                return response.text
            else:
                print(f"[News] Zenrows error for {url[:50]}: HTTP {response.status_code}")
                return None
    except Exception as e:
        print(f"[News] Zenrows fetch error for {url[:50]}: {e}")
        return None

def extract_opengraph(html: str, fallback_title: str = "", fallback_summary: str = "") -> dict:
    """Extract OpenGraph meta tags from HTML."""
    og_data = {
        "title": fallback_title,
        "description": fallback_summary,
        "image": None
    }

    # Try OpenGraph tags with regex (no BeautifulSoup dependency)
    og_patterns = {
        "title": [
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
        ],
        "description": [
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:description["\']',
        ],
        "image": [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
        ]
    }

    for field, patterns in og_patterns.items():
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                value = match.group(1)
                if value and not value.startswith('data:'):
                    if field == "description":
                        og_data[field] = value[:500]
                    else:
                        og_data[field] = value
                    break

    # If no image found, try to find first large image
    if not og_data["image"]:
        img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
        for match in re.finditer(img_pattern, html, re.IGNORECASE):
            src = match.group(1)
            if src and not any(x in src.lower() for x in ["logo", "icon", "avatar", "button", "ad", "pixel", "1x1"]):
                if any(ext in src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']):
                    og_data["image"] = src
                    break

    return og_data

def clean_html(text: str) -> str:
    """Remove HTML tags from text"""
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', '', text)
    clean = re.sub(r'\s+', ' ', clean).strip()
    clean = clean.replace('&amp;', '&')
    clean = clean.replace('&lt;', '<')
    clean = clean.replace('&gt;', '>')
    clean = clean.replace('&quot;', '"')
    clean = clean.replace('&#39;', "'")
    clean = clean.replace('&nbsp;', ' ')
    return clean[:500]

async def parse_rss_feed(feed_info: dict) -> List[dict]:
    """Parse RSS feed to get article URLs and basic info."""
    import xml.etree.ElementTree as ET

    articles = []
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*"
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(feed_info["url"], headers=headers)

            if response.status_code != 200:
                print(f"[News] {feed_info['name']}: HTTP {response.status_code}")
                return articles

            content = response.text

            # Check for valid XML
            if not content.strip().startswith('<?xml') and not content.strip().startswith('<rss') and not content.strip().startswith('<feed'):
                print(f"[News] {feed_info['name']}: Invalid XML")
                return articles

            root = ET.fromstring(content)

            # RSS 2.0 format
            channel = root.find('channel')
            if channel is not None:
                for item in channel.findall('item')[:15]:  # Limit per source
                    title = item.findtext('title', '')
                    link = item.findtext('link', '')
                    description = item.findtext('description', '')
                    pub_date = item.findtext('pubDate', '')

                    if not title or not link:
                        continue

                    # Generate unique ID
                    external_id = hashlib.md5(link.encode()).hexdigest()

                    # Parse date
                    published = None
                    if pub_date:
                        for fmt in ['%a, %d %b %Y %H:%M:%S %z', '%a, %d %b %Y %H:%M:%S %Z', '%Y-%m-%dT%H:%M:%S%z']:
                            try:
                                published = datetime.strptime(pub_date.strip(), fmt)
                                break
                            except:
                                pass

                    articles.append({
                        "external_id": external_id,
                        "url": link,
                        "title": clean_html(title),
                        "summary": clean_html(description),
                        "source_name": feed_info["name"],
                        "source_url": feed_info["url"],
                        "category": feed_info["category"],
                        "region": feed_info.get("region", "Global"),
                        "published_at": published
                    })

            # Atom format
            else:
                namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
                for entry in (root.findall('atom:entry', namespaces) or root.findall('entry'))[:15]:
                    title = entry.findtext('atom:title', '', namespaces) or entry.findtext('title', '')
                    link_elem = entry.find('atom:link', namespaces) or entry.find('link')
                    link = link_elem.get('href', '') if link_elem is not None else ''
                    summary = entry.findtext('atom:summary', '', namespaces) or entry.findtext('summary', '')
                    updated = entry.findtext('atom:updated', '', namespaces) or entry.findtext('updated', '')

                    if not title or not link:
                        continue

                    external_id = hashlib.md5(link.encode()).hexdigest()

                    published = None
                    if updated:
                        try:
                            published = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                        except:
                            pass

                    articles.append({
                        "external_id": external_id,
                        "url": link,
                        "title": clean_html(title),
                        "summary": clean_html(summary),
                        "source_name": feed_info["name"],
                        "source_url": feed_info["url"],
                        "category": feed_info["category"],
                        "region": feed_info.get("region", "Global"),
                        "published_at": published
                    })

        print(f"[News] {feed_info['name']}: Retrieved {len(articles)} items")

    except ET.ParseError as e:
        print(f"[News] {feed_info['name']}: XML parse error - {e}")
    except Exception as e:
        print(f"[News] {feed_info['name']}: Error - {type(e).__name__}: {e}")

    return articles

# =============================================================================
# Background Job: Fetch and Store News
# =============================================================================
async def fetch_and_store_news():
    """Background job to fetch news from all sources."""
    pool = await get_pool()

    print(f"[News] Starting fetch at {datetime.now()}")

    # Step 1: Get all article URLs from RSS feeds
    all_articles = []
    tasks = [parse_rss_feed(feed) for feed in RSS_FEEDS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, list):
            all_articles.extend(result)

    print(f"[News] Found {len(all_articles)} articles from {len(RSS_FEEDS)} feeds")

    # Step 2: Check which articles are new
    async with pool.acquire() as conn:
        existing_ids = await conn.fetch(
            "SELECT external_id FROM news_articles WHERE created_at > NOW() - INTERVAL '7 days'"
        )
        existing_set = {row['external_id'] for row in existing_ids}

    new_articles = [a for a in all_articles if a['external_id'] not in existing_set]
    print(f"[News] Found {len(new_articles)} new articles")

    # Step 3: Fetch OpenGraph data for new articles
    fetched_count = 0
    max_fetch = 30  # Limit per run

    for article in new_articles[:max_fetch]:
        html = await fetch_with_zenrows(article['url'])

        if html:
            og_data = extract_opengraph(html, article['title'], article.get('summary', ''))

            # Update article with OG data
            if og_data['title'] and len(og_data['title']) > len(article.get('title', '')):
                article['title'] = og_data['title']
            if og_data['description'] and len(og_data['description']) > len(article.get('summary', '')):
                article['summary'] = og_data['description']
            article['image_url'] = og_data['image']
            article['og_title'] = og_data['title']
            article['og_description'] = og_data['description']
            article['og_image'] = og_data['image']

        # Store in database (even without image)
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO news_articles
                    (external_id, title, summary, url, image_url, source_name, source_url,
                     category, region, published_at, og_title, og_description, og_image)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (external_id) DO UPDATE SET
                        image_url = COALESCE(EXCLUDED.image_url, news_articles.image_url),
                        fetched_at = NOW()
                """,
                    article['external_id'],
                    article['title'][:500] if article.get('title') else 'Untitled',
                    article.get('summary', '')[:2000] if article.get('summary') else '',
                    article['url'],
                    article.get('image_url'),
                    article['source_name'],
                    article.get('source_url'),
                    article['category'],
                    article['region'],
                    article.get('published_at'),
                    article.get('og_title'),
                    article.get('og_description'),
                    article.get('og_image')
                )

            fetched_count += 1
            img_status = '✓' if article.get('image_url') else '✗'
            print(f"[News] Stored: {article['title'][:40]}... (img: {img_status})")

        except Exception as e:
            print(f"[News] DB error for {article['title'][:30]}: {e}")

        # Small delay between Zenrows requests
        await asyncio.sleep(0.3)

    # Cleanup old articles (keep 30 days)
    try:
        async with pool.acquire() as conn:
            deleted = await conn.execute(
                "DELETE FROM news_articles WHERE created_at < NOW() - INTERVAL '30 days'"
            )
            print(f"[News] Cleaned up old articles")
    except:
        pass

    print(f"[News] Fetch complete: {fetched_count} articles stored")
    return fetched_count

# =============================================================================
# API Endpoints
# =============================================================================
@router.get("", response_model=NewsResponse)
async def get_news(
    category: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """Get news articles from database."""
    pool = await get_pool()

    # Build query
    conditions = ["1=1"]
    params = []
    param_idx = 1

    if category and category.lower() != 'all':
        conditions.append(f"LOWER(category) = LOWER(${param_idx})")
        params.append(category)
        param_idx += 1

    if region and region.lower() != 'all':
        conditions.append(f"LOWER(region) = LOWER(${param_idx})")
        params.append(region)
        param_idx += 1

    where_clause = " AND ".join(conditions)

    async with pool.acquire() as conn:
        # Get total count
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM news_articles WHERE {where_clause}",
            *params
        )

        # Get articles
        rows = await conn.fetch(f"""
            SELECT id, title, summary, url, image_url, source_name, category, region, published_at
            FROM news_articles
            WHERE {where_clause}
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """, *params, limit, offset)

    articles = [
        NewsArticle(
            id=str(row['id']),
            title=row['title'],
            summary=row['summary'],
            url=row['url'],
            image_url=row['image_url'],
            source_name=row['source_name'],
            category=row['category'],
            region=row['region'],
            published_at=row['published_at']
        )
        for row in rows
    ]

    return NewsResponse(
        articles=articles,
        total=total or 0,
        has_more=(offset + limit) < (total or 0)
    )

@router.get("/sources")
async def get_sources():
    """List all configured news sources."""
    return {
        "sources": [{"name": f["name"], "category": f["category"], "region": f["region"]} for f in RSS_FEEDS],
        "total": len(RSS_FEEDS),
        "categories": list(set(f["category"] for f in RSS_FEEDS)),
        "regions": list(set(f["region"] for f in RSS_FEEDS))
    }

@router.post("/refresh")
async def refresh_news(background_tasks: BackgroundTasks):
    """Trigger a news refresh (runs in background)."""
    background_tasks.add_task(fetch_and_store_news)
    return {"message": "News refresh started", "status": "processing"}

@router.get("/stats")
async def get_stats():
    """Get news database statistics."""
    pool = await get_pool()

    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM news_articles") or 0
        with_images = await conn.fetchval("SELECT COUNT(*) FROM news_articles WHERE image_url IS NOT NULL") or 0
        latest = await conn.fetchval("SELECT MAX(fetched_at) FROM news_articles")

        by_source = await conn.fetch("""
            SELECT source_name, COUNT(*) as count
            FROM news_articles
            GROUP BY source_name
            ORDER BY count DESC
            LIMIT 20
        """)

        by_category = await conn.fetch("""
            SELECT category, COUNT(*) as count
            FROM news_articles
            GROUP BY category
            ORDER BY count DESC
        """)

    return {
        "total_articles": total,
        "with_images": with_images,
        "image_percentage": round(with_images / total * 100, 1) if total > 0 else 0,
        "last_fetch": latest.isoformat() if latest else None,
        "by_source": [{"source": r["source_name"], "count": r["count"]} for r in by_source],
        "by_category": [{"category": r["category"], "count": r["count"]} for r in by_category]
    }
