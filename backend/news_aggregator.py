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
RSS_FEEDS = [
    {
        "name": "Flexo Magazine",
        "url": "https://www.flexography.org/feed/",
        "category": "industry",
        "logo": None
    },
    {
        "name": "Print Week",
        "url": "https://www.printweek.com/rss",
        "category": "industry",
        "logo": None
    },
    {
        "name": "Packaging Digest",
        "url": "https://www.packagingdigest.com/rss.xml",
        "category": "packaging",
        "logo": None
    },
    {
        "name": "Labels & Labeling",
        "url": "https://www.labelsandlabeling.com/rss.xml",
        "category": "labels",
        "logo": None
    },
    {
        "name": "Converting Quarterly",
        "url": "https://www.convertingquarterly.com/feed/",
        "category": "converting",
        "logo": None
    },
    {
        "name": "Package Printing",
        "url": "https://www.packageprinting.com/feed/",
        "category": "packaging",
        "logo": None
    },
    {
        "name": "Printing Impressions",
        "url": "https://www.piworld.com/rss.xml",
        "category": "industry",
        "logo": None
    },
    {
        "name": "WhatTheyThink",
        "url": "https://whattheythink.com/feed/",
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
        response = await client.get(feed["url"], timeout=10.0)
        if response.status_code != 200:
            return items

        content = response.text
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

                # Try to get image
                image_url = None
                media_content = item.find('media:content', namespaces)
                if media_content is not None:
                    image_url = media_content.get('url')

                # Also check enclosure
                enclosure = item.find('enclosure')
                if enclosure is not None and not image_url:
                    enc_type = enclosure.get('type', '')
                    if 'image' in enc_type:
                        image_url = enclosure.get('url')

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

                if title and link:
                    items.append({
                        "title": clean_html(title),
                        "description": clean_html(summary),
                        "url": link,
                        "source": feed["name"],
                        "source_url": feed["url"].split('/feed')[0],
                        "category": feed["category"],
                        "published_date": updated,
                        "image_url": None
                    })

    except Exception as e:
        print(f"Error fetching {feed['name']}: {e}")

    return items


async def fetch_all_feeds() -> List[NewsItem]:
    """Fetch news from all configured RSS feeds"""
    all_items = []

    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [fetch_feed(client, feed) for feed in RSS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_items.extend(result)

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

        # Only include items with some relevance to flexo/printing
        if relevance >= 0.05:
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
