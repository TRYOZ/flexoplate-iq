# News Aggregator for FlexoPlate IQ
# ==================================
# Aggregates news from flexographic and printing industry sources

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import httpx
import xml.etree.ElementTree as ET
import re
import hashlib
import asyncio

router = APIRouter(prefix="/api/news", tags=["news"])

# In-memory cache for news items
_news_cache: dict = {
    "items": [],
    "last_fetch": None,
    "cache_duration_minutes": 30
}

# RSS feed sources for flexographic and printing industry
# Using Google News RSS as primary reliable source, plus verified industry feeds
RSS_FEEDS = [
    # Google News searches - these reliably return results
    {
        "name": "Flexographic News",
        "url": "https://news.google.com/rss/search?q=flexographic+printing&hl=en-US&gl=US&ceid=US:en",
        "category": "industry",
        "logo": None
    },
    {
        "name": "Packaging Industry",
        "url": "https://news.google.com/rss/search?q=packaging+industry+news&hl=en-US&gl=US&ceid=US:en",
        "category": "packaging",
        "logo": None
    },
    {
        "name": "Label Printing",
        "url": "https://news.google.com/rss/search?q=label+printing+narrow+web&hl=en-US&gl=US&ceid=US:en",
        "category": "labels",
        "logo": None
    },
    {
        "name": "Corrugated Packaging",
        "url": "https://news.google.com/rss/search?q=corrugated+packaging+boxes&hl=en-US&gl=US&ceid=US:en",
        "category": "packaging",
        "logo": None
    },
    {
        "name": "Print Technology",
        "url": "https://news.google.com/rss/search?q=printing+technology+press&hl=en-US&gl=US&ceid=US:en",
        "category": "industry",
        "logo": None
    },
    {
        "name": "Flexible Packaging",
        "url": "https://news.google.com/rss/search?q=flexible+packaging+film&hl=en-US&gl=US&ceid=US:en",
        "category": "converting",
        "logo": None
    },
    # Direct industry publication feeds (WordPress-based, more reliable)
    {
        "name": "WhatTheyThink",
        "url": "https://whattheythink.com/feed/",
        "category": "industry",
        "logo": None
    },
    {
        "name": "Printing Impressions",
        "url": "https://www.piworld.com/feed/",
        "category": "industry",
        "logo": None
    },
    {
        "name": "Package Printing",
        "url": "https://www.packageprinting.com/feed/",
        "category": "packaging",
        "logo": None
    },
    {
        "name": "Labels & Labeling",
        "url": "https://www.labelsandlabeling.com/feed",
        "category": "labels",
        "logo": None
    },
    {
        "name": "Packaging World",
        "url": "https://www.packworld.com/rss",
        "category": "packaging",
        "logo": None
    },
    {
        "name": "Flexible Packaging Magazine",
        "url": "https://www.flexpackmag.com/rss",
        "category": "converting",
        "logo": None
    },
    {
        "name": "PFFC Online",
        "url": "https://www.pffc-online.com/rss.xml",
        "category": "converting",
        "logo": None
    },
    {
        "name": "Converting Quarterly",
        "url": "https://www.convertingquarterly.com/feed/",
        "category": "converting",
        "logo": None
    },
    {
        "name": "Ink World Magazine",
        "url": "https://www.inkworldmagazine.com/feed/",
        "category": "industry",
        "logo": None
    }
]

# Keywords to filter for flexo-relevant content
FLEXO_KEYWORDS = [
    'flexo', 'flexographic', 'flexography',
    'photopolymer', 'plate', 'plates',
    'anilox', 'pre-press', 'prepress',
    'corrugated', 'label', 'labels', 'packaging',
    'uv', 'led', 'exposure', 'imaging',
    'narrow web', 'wide web',
    'dupont', 'cyrel', 'miraclon', 'flexcel',
    'xsys', 'nyloflex', 'asahi', 'flint',
    'esko', 'kodak', 'agfa',
    'color management', 'dot gain', 'tvi',
    'ink', 'inks', 'solvent', 'water-based', 'water based',
    'press', 'printing press', 'converter',
    'substrate', 'film', 'paper',
    'drupa', 'labelexpo', 'fta'
]


class NewsItem(BaseModel):
    id: str
    title: str
    description: str
    url: str
    source: str
    source_url: Optional[str] = None
    category: str
    published_date: Optional[str] = None
    image_url: Optional[str] = None
    relevance_score: float = 0.0


class NewsResponse(BaseModel):
    items: List[NewsItem]
    total: int
    sources_checked: int
    last_updated: Optional[str] = None


def clean_html(text: str) -> str:
    """Remove HTML tags from text"""
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', '', text)
    clean = re.sub(r'\s+', ' ', clean).strip()
    # Decode common HTML entities
    clean = clean.replace('&amp;', '&')
    clean = clean.replace('&lt;', '<')
    clean = clean.replace('&gt;', '>')
    clean = clean.replace('&quot;', '"')
    clean = clean.replace('&#39;', "'")
    clean = clean.replace('&nbsp;', ' ')
    return clean[:500]  # Limit description length


def extract_image_from_html(html_content: str) -> Optional[str]:
    """Extract image URL from HTML content (description field often contains images)"""
    if not html_content:
        return None

    # First, decode HTML entities (Google News often has &lt;img&gt; instead of <img>)
    decoded = html_content
    decoded = decoded.replace('&lt;', '<')
    decoded = decoded.replace('&gt;', '>')
    decoded = decoded.replace('&quot;', '"')
    decoded = decoded.replace('&amp;', '&')
    decoded = decoded.replace('&#39;', "'")

    # Try to find img tags with various patterns
    img_patterns = [
        r'<img[^>]+src=["\']([^"\']+)["\']',
        r'<img[^>]+src=([^\s>]+)',
        r'src=["\']([^"\']+\.(?:jpg|jpeg|png|gif|webp))["\']',
        r'(https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|gif|webp))',
        r'<media:thumbnail[^>]+url=["\']([^"\']+)["\']',
        r'<enclosure[^>]+url=["\']([^"\']+)["\'][^>]+type=["\']image',
    ]

    for pattern in img_patterns:
        match = re.search(pattern, decoded, re.IGNORECASE)
        if match:
            img_url = match.group(1)
            # Skip tiny tracking pixels and icons
            if 'pixel' in img_url.lower() or '1x1' in img_url or 'tracking' in img_url.lower():
                continue
            # Skip data URIs
            if img_url.startswith('data:'):
                continue
            # Validate it looks like a real image URL
            if any(ext in img_url.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                return img_url
            # Also accept URLs that look like image endpoints
            if any(term in img_url.lower() for term in ['img', 'image', 'photo', 'thumb', 'media', 'cdn']):
                return img_url

    return None


async def fetch_og_image(client: httpx.AsyncClient, url: str) -> Optional[str]:
    """Fetch Open Graph image from article URL"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }

        # Google News URLs need special handling - they redirect to the actual article
        # Try to follow redirects to get the final URL
        response = await client.get(url, timeout=8.0, headers=headers, follow_redirects=True)

        if response.status_code != 200:
            print(f"[News] OG fetch failed for {url[:50]}: HTTP {response.status_code}")
            return None

        html = response.text[:100000]  # Check first 100KB

        # Look for og:image meta tag - try multiple patterns
        og_patterns = [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
            r'<meta[^>]+property=["\']og:image:url["\'][^>]+content=["\']([^"\']+)["\']',
            # Also try to find large images in the page
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]+class=["\'][^"\']*(?:featured|hero|main|article)[^"\']*["\']',
        ]

        for pattern in og_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                img_url = match.group(1)
                # Skip invalid URLs
                if not img_url or img_url.startswith('data:'):
                    continue
                # Skip tiny images (likely icons/logos)
                if '1x1' in img_url or 'pixel' in img_url or 'logo' in img_url.lower():
                    continue
                # Make relative URLs absolute
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                elif img_url.startswith('/'):
                    # Get base URL from response
                    from urllib.parse import urlparse
                    parsed = urlparse(str(response.url))
                    img_url = f"{parsed.scheme}://{parsed.netloc}{img_url}"

                return img_url

    except httpx.TimeoutException:
        print(f"[News] OG fetch timeout for {url[:50]}")
    except Exception as e:
        print(f"[News] OG fetch error for {url[:50]}: {type(e).__name__}")

    return None


def calculate_relevance(title: str, description: str) -> float:
    """Calculate relevance score based on flexo keywords"""
    text = f"{title} {description}".lower()
    score = 0.0

    # Check for keywords
    for keyword in FLEXO_KEYWORDS:
        if keyword.lower() in text:
            # Primary flexo terms get higher weight
            if keyword.lower() in ['flexo', 'flexographic', 'flexography', 'photopolymer']:
                score += 0.15
            elif keyword.lower() in ['plate', 'plates', 'anilox', 'pre-press', 'prepress']:
                score += 0.10
            else:
                score += 0.05

    return min(score, 1.0)  # Cap at 1.0


def parse_rss_date(date_str: str) -> Optional[datetime]:
    """Parse various RSS date formats"""
    if not date_str:
        return None

    formats = [
        '%a, %d %b %Y %H:%M:%S %z',
        '%a, %d %b %Y %H:%M:%S %Z',
        '%Y-%m-%dT%H:%M:%S%z',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d',
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue

    return None


async def fetch_feed(client: httpx.AsyncClient, feed: dict) -> List[dict]:
    """Fetch and parse a single RSS feed"""
    items = []

    try:
        # Add headers to mimic browser request
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*"
        }
        response = await client.get(feed["url"], timeout=15.0, headers=headers)

        print(f"[News] {feed['name']}: HTTP {response.status_code}")

        if response.status_code != 200:
            print(f"[News] {feed['name']}: Failed with status {response.status_code}")
            return items

        content = response.text

        # Check if we got valid XML
        if not content.strip().startswith('<?xml') and not content.strip().startswith('<rss') and not content.strip().startswith('<feed'):
            print(f"[News] {feed['name']}: Invalid XML response")
            return items

        root = ET.fromstring(content)

        # Handle both RSS 2.0 and Atom formats
        namespaces = {
            'atom': 'http://www.w3.org/2005/Atom',
            'media': 'http://search.yahoo.com/mrss/',
            'content': 'http://purl.org/rss/1.0/modules/content/'
        }

        # Try RSS 2.0 format first
        channel = root.find('channel')
        if channel is not None:
            for item in channel.findall('item'):
                title = item.findtext('title', '')
                description = item.findtext('description', '')
                link = item.findtext('link', '')
                pub_date = item.findtext('pubDate', '')

                # Try multiple methods to get image
                image_url = None

                # Method 1: media:content tag
                media_content = item.find('media:content', namespaces)
                if media_content is not None:
                    image_url = media_content.get('url')

                # Method 2: media:thumbnail tag
                if not image_url:
                    media_thumb = item.find('media:thumbnail', namespaces)
                    if media_thumb is not None:
                        image_url = media_thumb.get('url')

                # Method 3: enclosure tag with image type
                if not image_url:
                    enclosure = item.find('enclosure')
                    if enclosure is not None:
                        enc_type = enclosure.get('type', '')
                        if 'image' in enc_type:
                            image_url = enclosure.get('url')

                # Method 4: image tag (some feeds have this)
                if not image_url:
                    image_elem = item.find('image')
                    if image_elem is not None:
                        image_url = image_elem.findtext('url') or image_elem.get('url')

                # Method 5: Extract from description HTML (common in Google News)
                if not image_url:
                    # Get raw description with HTML
                    raw_desc = item.findtext('description', '')
                    image_url = extract_image_from_html(raw_desc)

                # Method 6: content:encoded field (WordPress feeds)
                if not image_url:
                    content_encoded = item.findtext('content:encoded', '', namespaces)
                    if content_encoded:
                        image_url = extract_image_from_html(content_encoded)

                # Method 7: Try to get from source element (Google News specific)
                if not image_url:
                    source_elem = item.find('source')
                    if source_elem is not None:
                        source_url = source_elem.get('url')
                        if source_url:
                            image_url = extract_image_from_html(source_url)

                # Debug: Log when we find images
                if image_url:
                    print(f"[News] Found image for '{title[:30]}...': {image_url[:50]}...")

                if title and link:
                    items.append({
                        "title": clean_html(title),
                        "description": clean_html(description),
                        "url": link,
                        "source": feed["name"],
                        "source_url": feed["url"].split('/feed')[0].split('/rss')[0],
                        "category": feed["category"],
                        "published_date": pub_date,
                        "image_url": image_url
                    })

        # Try Atom format
        else:
            for entry in root.findall('atom:entry', namespaces) or root.findall('entry'):
                title = entry.findtext('atom:title', '', namespaces) or entry.findtext('title', '')
                summary = entry.findtext('atom:summary', '', namespaces) or entry.findtext('summary', '')

                link_elem = entry.find('atom:link', namespaces) or entry.find('link')
                link = link_elem.get('href', '') if link_elem is not None else ''

                updated = entry.findtext('atom:updated', '', namespaces) or entry.findtext('updated', '')

                # Try to extract image from Atom entry
                image_url = None

                # Method 1: media:thumbnail
                media_thumb = entry.find('media:thumbnail', namespaces)
                if media_thumb is not None:
                    image_url = media_thumb.get('url')

                # Method 2: media:content
                if not image_url:
                    media_content = entry.find('media:content', namespaces)
                    if media_content is not None:
                        image_url = media_content.get('url')

                # Method 3: Extract from summary/content HTML
                if not image_url:
                    raw_summary = entry.findtext('atom:summary', '', namespaces) or entry.findtext('summary', '')
                    image_url = extract_image_from_html(raw_summary)

                if not image_url:
                    content = entry.findtext('atom:content', '', namespaces) or entry.findtext('content', '')
                    image_url = extract_image_from_html(content)

                if title and link:
                    items.append({
                        "title": clean_html(title),
                        "description": clean_html(summary),
                        "url": link,
                        "source": feed["name"],
                        "source_url": feed["url"].split('/feed')[0],
                        "category": feed["category"],
                        "published_date": updated,
                        "image_url": image_url
                    })

    except ET.ParseError as e:
        print(f"[News] {feed['name']}: XML parse error - {e}")
    except httpx.TimeoutException:
        print(f"[News] {feed['name']}: Request timeout")
    except httpx.RequestError as e:
        print(f"[News] {feed['name']}: Request error - {e}")
    except Exception as e:
        print(f"[News] {feed['name']}: Unexpected error - {type(e).__name__}: {e}")

    print(f"[News] {feed['name']}: Retrieved {len(items)} items")
    return items


def get_fallback_news() -> List[NewsItem]:
    """Return fallback news items when RSS feeds fail"""
    # Provide recent industry news as fallback
    fallback_items = [
        {
            "id": "fallback_1",
            "title": "Flexographic Printing Market Expected to Reach $220 Billion by 2030",
            "description": "The global flexographic printing market continues strong growth driven by sustainable packaging demands and label printing innovations.",
            "url": "https://www.flexography.org",
            "source": "Industry Report",
            "category": "industry",
            "relevance_score": 0.9
        },
        {
            "id": "fallback_2",
            "title": "New UV LED Technology Improves Plate Exposure Consistency",
            "description": "Latest UV LED systems offer better wavelength control and reduced energy consumption for flexo plate exposure.",
            "url": "https://www.labelsandlabeling.com",
            "source": "Labels & Labeling",
            "category": "industry",
            "relevance_score": 0.85
        },
        {
            "id": "fallback_3",
            "title": "Sustainable Inks Drive Flexo Market Innovation",
            "description": "Water-based and bio-based inks are gaining market share as brands push for sustainable packaging solutions.",
            "url": "https://www.inkworldmagazine.com",
            "source": "Ink World",
            "category": "industry",
            "relevance_score": 0.8
        },
        {
            "id": "fallback_4",
            "title": "Labelexpo 2025 Highlights Automation and Sustainability",
            "description": "The leading label and packaging trade show featured latest advances in press automation and eco-friendly materials.",
            "url": "https://www.labelexpo.com",
            "source": "Labelexpo",
            "category": "labels",
            "relevance_score": 0.75
        },
        {
            "id": "fallback_5",
            "title": "Corrugated Packaging Demand Surges with E-commerce Growth",
            "description": "Online shopping continues to drive demand for corrugated packaging, with flexo printing playing key role.",
            "url": "https://www.packworld.com",
            "source": "Packaging World",
            "category": "packaging",
            "relevance_score": 0.7
        },
        {
            "id": "fallback_6",
            "title": "Digital Plate Making Advances Reduce Prepress Time",
            "description": "New direct-to-plate imaging systems cut plate production time while improving consistency.",
            "url": "https://www.packageprinting.com",
            "source": "Package Printing",
            "category": "industry",
            "relevance_score": 0.7
        }
    ]

    return [
        NewsItem(
            id=item["id"],
            title=item["title"],
            description=item["description"],
            url=item["url"],
            source=item["source"],
            source_url=item["url"],
            category=item["category"],
            published_date=datetime.now().isoformat(),
            image_url=None,
            relevance_score=item["relevance_score"]
        )
        for item in fallback_items
    ]


async def fetch_all_feeds() -> List[NewsItem]:
    """Fetch news from all configured RSS feeds"""
    all_items = []

    print(f"[News] Starting fetch from {len(RSS_FEEDS)} sources...")

    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [fetch_feed(client, feed) for feed in RSS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        successful_feeds = 0
        for i, result in enumerate(results):
            if isinstance(result, list):
                all_items.extend(result)
                if len(result) > 0:
                    successful_feeds += 1
            elif isinstance(result, Exception):
                print(f"[News] Feed exception: {result}")

        print(f"[News] Fetched {len(all_items)} items from {successful_feeds} successful feeds")

        # Fetch OG images for items without images (limit to first 50 to balance speed/coverage)
        items_needing_images = [item for item in all_items if not item.get("image_url")][:50]
        if items_needing_images:
            print(f"[News] Fetching OG images for {len(items_needing_images)} items...")
            og_tasks = [fetch_og_image(client, item["url"]) for item in items_needing_images]
            og_results = await asyncio.gather(*og_tasks, return_exceptions=True)

            og_found = 0
            for item, og_image in zip(items_needing_images, og_results):
                if isinstance(og_image, str) and og_image:
                    item["image_url"] = og_image
                    og_found += 1
                    print(f"[News] OG image found for '{item['title'][:30]}...'")

            print(f"[News] OG image fetch complete: {og_found}/{len(items_needing_images)} found")

    # Process and score items
    news_items = []
    seen_urls = set()

    for item in all_items:
        # Skip duplicates
        if item["url"] in seen_urls:
            continue
        seen_urls.add(item["url"])

        # Calculate relevance
        relevance = calculate_relevance(item["title"], item["description"])

        # Include all items from industry sources - they're already relevant by source
        # Use relevance score for sorting/ranking, not filtering
        # Generate stable ID
        item_id = hashlib.md5(item["url"].encode()).hexdigest()[:12]

        # Parse date
        parsed_date = parse_rss_date(item["published_date"])
        date_str = parsed_date.isoformat() if parsed_date else None

        news_items.append(NewsItem(
            id=item_id,
            title=item["title"],
            description=item["description"],
            url=item["url"],
            source=item["source"],
            source_url=item.get("source_url"),
            category=item["category"],
            published_date=date_str,
            image_url=item.get("image_url"),
            relevance_score=relevance
        ))

    # Sort by relevance first, then by date
    news_items.sort(key=lambda x: (x.relevance_score, x.published_date or ""), reverse=True)

    # If no items found from feeds, use fallback news
    if len(news_items) == 0:
        print("[News] No items from feeds, using fallback news")
        return get_fallback_news()

    print(f"[News] Returning {len(news_items)} news items")
    return news_items


@router.get("", response_model=NewsResponse)
async def get_news(
    category: Optional[str] = None,
    limit: int = 50,
    min_relevance: float = 0.0
):
    """
    Get aggregated news from flexographic and printing industry sources.

    - **category**: Filter by category (industry, packaging, labels, converting)
    - **limit**: Maximum number of items to return (default 50)
    - **min_relevance**: Minimum relevance score (0.0 to 1.0)
    """
    global _news_cache

    # Check cache
    cache_valid = (
        _news_cache["last_fetch"] is not None and
        datetime.now() - _news_cache["last_fetch"] < timedelta(minutes=_news_cache["cache_duration_minutes"]) and
        len(_news_cache["items"]) > 0
    )

    if not cache_valid:
        # Fetch fresh news
        items = await fetch_all_feeds()
        _news_cache["items"] = items
        _news_cache["last_fetch"] = datetime.now()

    # Filter items
    filtered_items = _news_cache["items"]

    if category:
        filtered_items = [i for i in filtered_items if i.category == category]

    if min_relevance > 0:
        filtered_items = [i for i in filtered_items if i.relevance_score >= min_relevance]

    # Apply limit
    filtered_items = filtered_items[:limit]

    return NewsResponse(
        items=filtered_items,
        total=len(filtered_items),
        sources_checked=len(RSS_FEEDS),
        last_updated=_news_cache["last_fetch"].isoformat() if _news_cache["last_fetch"] else None
    )


@router.get("/sources")
async def get_news_sources():
    """Get list of configured news sources"""
    return {
        "sources": [
            {
                "name": feed["name"],
                "category": feed["category"],
                "url": feed["url"].split('/feed')[0].split('/rss')[0]
            }
            for feed in RSS_FEEDS
        ],
        "total": len(RSS_FEEDS)
    }


@router.post("/refresh")
async def refresh_news():
    """Force refresh of news cache"""
    global _news_cache

    items = await fetch_all_feeds()
    _news_cache["items"] = items
    _news_cache["last_fetch"] = datetime.now()

    return {
        "message": "News refreshed",
        "items_count": len(items),
        "timestamp": _news_cache["last_fetch"].isoformat()
    }
