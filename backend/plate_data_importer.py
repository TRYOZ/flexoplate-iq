"""
Plate Data Importer - Smart PDF to Plate Database Linker

This module:
1. Downloads PDFs from supplier download pages
2. Uses AI to extract plate specifications from PDF content
3. Matches extracted data to existing plates or creates new ones
4. Links PDF documents to plate records
5. Updates plate specifications and equivalency data
"""

import os
import io
import json
import re
import asyncio
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from urllib.parse import urljoin, urlparse
import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import asyncpg

router = APIRouter(prefix="/api/plates/import", tags=["Plate Data Import"])

# ============================================================================
# CONFIGURATION
# ============================================================================

ZENROWS_API_KEY = os.getenv("ZENROWS_API_KEY")
ZENROWS_BASE_URL = "https://api.zenrows.com/v1/"

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
# OPENAI CLIENT
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

class ExtractedPlateInfo(BaseModel):
    """Plate information extracted from PDF"""
    plate_name: Optional[str] = None
    family_name: Optional[str] = None
    supplier_name: Optional[str] = None
    sku_code: Optional[str] = None
    thickness_mm: Optional[float] = None
    hardness_shore: Optional[float] = None
    process_type: Optional[str] = None  # solvent, thermal, water_wash
    surface_type: Optional[str] = None  # flat_top, round_top, etc.
    imaging_type: Optional[str] = None  # digital, analog
    min_lpi: Optional[int] = None
    max_lpi: Optional[int] = None
    min_dot_percent: Optional[float] = None
    max_dot_percent: Optional[float] = None
    main_exposure_min: Optional[float] = None
    main_exposure_max: Optional[float] = None
    back_exposure_min: Optional[float] = None
    back_exposure_max: Optional[float] = None
    ink_compatibility: Optional[List[str]] = None
    applications: Optional[List[str]] = None
    substrate_categories: Optional[List[str]] = None
    description: Optional[str] = None
    raw_specs: Optional[Dict[str, Any]] = None


class ImportFromPDFRequest(BaseModel):
    url: str
    supplier_name: str
    auto_create_plates: bool = False  # If true, creates new plates; if false, only updates existing


class ImportFromDownloadPageRequest(BaseModel):
    url: str
    supplier_name: str
    auto_create_plates: bool = False
    max_pdfs: int = 20
    filter_flexo_only: bool = True  # Only process flexographic plate PDFs, skip equipment/sleeves/etc.


# ============================================================================
# PDF DOWNLOAD AND EXTRACTION
# ============================================================================

async def download_pdf(url: str) -> bytes:
    """Download a PDF file"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/pdf,*/*",
    }

    # Try ZenRows first for protected sites
    if ZENROWS_API_KEY:
        params = {
            "apikey": ZENROWS_API_KEY,
            "url": url,
            "premium_proxy": "true",
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.get(ZENROWS_BASE_URL, params=params)
                if response.status_code == 200:
                    return response.content
            except Exception as e:
                print(f"ZenRows PDF download failed: {e}")

    # Direct download fallback
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            return response.content
        raise HTTPException(status_code=response.status_code, detail=f"Failed to download: {url}")


async def extract_text_from_pdf(pdf_content: bytes) -> str:
    """Extract text from PDF"""
    try:
        import pypdf
        pdf_reader = pypdf.PdfReader(io.BytesIO(pdf_content))
        text_parts = []
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        return '\n\n'.join(text_parts)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(e)}")


def extract_pdf_links(html: str, base_url: str, filter_flexo_plates: bool = True) -> List[Dict[str, str]]:
    """
    Extract PDF links from HTML page

    Args:
        html: HTML content
        base_url: Base URL for resolving relative links
        filter_flexo_plates: If True, only return PDFs likely to be flexo plate data sheets
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, 'html.parser')
    pdf_links = []
    seen_urls = set()

    # Keywords that indicate flexo plates (include)
    FLEXO_PLATE_KEYWORDS = [
        'nyloflex', 'nyloprint', 'rotec',  # XSYS flexo brands
        'cyrel', 'cyrel easy', 'cyrel fast',  # DuPont/Corteva
        'flexcel', 'nxc', 'nxh',  # Miraclon
        'afp', 'atp', 'awp', 'clf', 'asahi',  # Asahi
        'dph', 'dpf', 'digital plate',  # MacDermid
        'flenex', 'fuji',  # Fujifilm
        'flexo', 'photopolymer plate', 'printing plate',
        'plate data', 'data sheet', 'technical data',
        'tds', 'product data',
    ]

    # Keywords that indicate NON-flexo products (exclude)
    EXCLUDE_KEYWORDS = [
        'letterpress', 'letter press',
        'sleeve', 'adapter', 'bridge',
        'tape', 'adhesive', 'mounting',
        'blanket', 'rubber',
        'cleaner', 'solvent', 'washout',
        'processor', 'equipment', 'machine',
        'dryer', 'exposure unit', 'imager',
        'anilox', 'doctor blade',
        'ink', 'coating',
        'safety data', 'sds', 'msds',
        'brochure', 'catalog', 'overview',  # General marketing, not tech specs
    ]

    for a in soup.find_all('a', href=True):
        href = a['href']
        if '.pdf' in href.lower():
            if href.startswith('/'):
                parsed = urlparse(base_url)
                full_url = f"{parsed.scheme}://{parsed.netloc}{href}"
            elif not href.startswith('http'):
                full_url = urljoin(base_url, href)
            else:
                full_url = href

            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)

            title = a.get_text(strip=True)
            if not title or len(title) < 3:
                filename = href.split('/')[-1].replace('.pdf', '').replace('-', ' ').replace('_', ' ')
                title = filename.title()

            # Apply filtering if enabled
            if filter_flexo_plates:
                combined_text = (title + ' ' + href).lower()

                # Check for exclusions first
                is_excluded = any(kw in combined_text for kw in EXCLUDE_KEYWORDS)
                if is_excluded:
                    continue

                # Check for flexo plate keywords
                is_flexo_plate = any(kw in combined_text for kw in FLEXO_PLATE_KEYWORDS)
                if not is_flexo_plate:
                    continue

            pdf_links.append({'url': full_url, 'title': title[:200]})

    return pdf_links


async def fetch_page(url: str) -> str:
    """Fetch a web page with ZenRows support"""
    if ZENROWS_API_KEY:
        params = {
            "apikey": ZENROWS_API_KEY,
            "url": url,
            "js_render": "true",
            "premium_proxy": "true",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(ZENROWS_BASE_URL, params=params)
            if response.status_code == 200:
                return response.text

    # Direct fallback
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            return response.text
        raise HTTPException(status_code=response.status_code, detail=f"Failed to fetch: {url}")


# ============================================================================
# AI-POWERED PLATE INFO EXTRACTION
# ============================================================================

PLATE_EXTRACTION_PROMPT = """You are an expert at extracting FLEXOGRAPHIC PLATE specifications from technical documents.

FIRST: Determine if this document is about FLEXOGRAPHIC PRINTING PLATES (photopolymer plates for flexo printing).

Documents that ARE flexo plates:
- nyloflex, nyloprint (XSYS)
- Cyrel, Cyrel EASY (DuPont)
- FLEXCEL NX (Miraclon)
- AFP, AWP, ATP (Asahi)
- Photopolymer plate data sheets with thickness, hardness, exposure specs

Documents that are NOT flexo plates (return empty array []):
- Letterpress plates
- Sleeves, adapters, bridges
- Equipment (processors, imagers, exposure units)
- Mounting tapes, adhesives
- Inks, coatings, cleaners
- Safety data sheets (SDS/MSDS)
- General product catalogs/brochures without technical specs
- Anilox rolls, doctor blades

If this is NOT a flexographic plate technical data sheet, return: []

If it IS a flexo plate document, extract info for ALL plate variants (different thicknesses):

For each plate variant, extract:
- plate_name: Full product name (e.g., "nyloflex FTF 1.14mm", "Cyrel EASY EFX 1.70")
- family_name: Product family (e.g., "nyloflex FTF", "Cyrel EASY", "FLEXCEL NX")
- sku_code: Any SKU or product code
- thickness_mm: Plate thickness in mm (CRITICAL - look for values like 0.76, 1.14, 1.70, 2.54, 2.84, etc.)
- hardness_shore: Shore A hardness value (typically 55-80)
- process_type: "solvent", "thermal", or "water_wash"
- surface_type: "flat_top", "round_top", "microcell", or "textured"
- imaging_type: "digital" or "analog"
- min_lpi/max_lpi: Screen ruling capability
- min_dot_percent/max_dot_percent: Minimum/maximum dot reproduction
- main_exposure_min/main_exposure_max: Main UV exposure in mJ/cm²
- back_exposure_min/back_exposure_max: Back exposure in mJ/cm²
- ink_compatibility: Array of compatible inks ["solvent", "water", "UV", "EB"]
- applications: Array like ["flexible_packaging", "labels", "corrugated"]
- substrate_categories: Array like ["film", "paper", "foil"]
- description: Brief description of the plate

Return a JSON array of plate objects. If not a flexo plate document, return empty array [].
If a field is not found, omit it or set to null.

TEXT TO ANALYZE:
{text}

Return ONLY valid JSON array, no markdown formatting."""


async def extract_plate_info_from_text(text: str, supplier_name: str) -> List[ExtractedPlateInfo]:
    """Use AI to extract plate specifications from PDF text"""
    client = get_openai_client()

    # Truncate very long texts
    max_chars = 15000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n...[truncated]..."

    try:
        response = await client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at parsing flexographic plate technical data sheets. Extract ALL plate variants with their specifications. Return valid JSON only."
                },
                {
                    "role": "user",
                    "content": PLATE_EXTRACTION_PROMPT.format(text=text)
                }
            ],
            temperature=0.1,
            max_tokens=4000
        )

        content = response.choices[0].message.content.strip()

        # Clean up response - remove markdown if present
        if content.startswith('```'):
            content = re.sub(r'^```json?\s*', '', content)
            content = re.sub(r'\s*```$', '', content)

        # Parse JSON
        parsed = json.loads(content)

        # Ensure it's a list
        if isinstance(parsed, dict):
            parsed = [parsed]

        plates = []
        for item in parsed:
            # Add supplier name
            item['supplier_name'] = supplier_name

            # Clean up thickness - handle various formats
            if item.get('thickness_mm'):
                try:
                    thickness = float(str(item['thickness_mm']).replace('mm', '').strip())
                    item['thickness_mm'] = thickness
                except:
                    pass

            plates.append(ExtractedPlateInfo(**item))

        return plates

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"Content was: {content[:500]}")
        return []
    except Exception as e:
        print(f"AI extraction error: {e}")
        return []


# ============================================================================
# DATABASE OPERATIONS - MATCHING AND UPDATING PLATES
# ============================================================================

async def get_or_create_supplier(conn, supplier_name: str) -> str:
    """Get supplier ID, creating if necessary"""
    row = await conn.fetchrow(
        "SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1)",
        supplier_name
    )
    if row:
        return str(row['id'])

    # Create supplier
    supplier_id = await conn.fetchval("""
        INSERT INTO suppliers (name, is_plate_supplier)
        VALUES ($1, TRUE)
        RETURNING id
    """, supplier_name)
    return str(supplier_id)


async def get_or_create_plate_family(conn, supplier_id: str, family_name: str, process_type: str = None) -> str:
    """Get plate family ID, creating if necessary"""
    row = await conn.fetchrow("""
        SELECT id FROM plate_families
        WHERE supplier_id = $1 AND LOWER(family_name) = LOWER($2)
    """, supplier_id, family_name)

    if row:
        return str(row['id'])

    # Create family
    family_id = await conn.fetchval("""
        INSERT INTO plate_families (supplier_id, family_name, process_type)
        VALUES ($1, $2, $3)
        RETURNING id
    """, supplier_id, family_name, process_type)
    return str(family_id)


async def find_matching_plate(conn, plate_info: ExtractedPlateInfo, supplier_id: str) -> Optional[Dict]:
    """Find an existing plate that matches the extracted info"""

    # First try exact match by name/SKU
    if plate_info.plate_name:
        row = await conn.fetchrow("""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE pf.supplier_id = $1
              AND (LOWER(p.display_name) LIKE LOWER($2) OR LOWER(p.sku_code) LIKE LOWER($2))
        """, supplier_id, f"%{plate_info.plate_name}%")
        if row:
            return dict(row)

    # Try match by family + thickness
    if plate_info.family_name and plate_info.thickness_mm:
        row = await conn.fetchrow("""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE pf.supplier_id = $1
              AND LOWER(pf.family_name) LIKE LOWER($2)
              AND ABS(p.thickness_mm - $3) < 0.05
        """, supplier_id, f"%{plate_info.family_name}%", plate_info.thickness_mm)
        if row:
            return dict(row)

    # Try match by thickness alone (within supplier)
    if plate_info.thickness_mm:
        rows = await conn.fetch("""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE pf.supplier_id = $1
              AND ABS(p.thickness_mm - $2) < 0.02
        """, supplier_id, plate_info.thickness_mm)
        if len(rows) == 1:
            return dict(rows[0])

    return None


async def update_plate_with_extracted_info(conn, plate_id: str, plate_info: ExtractedPlateInfo) -> Dict[str, Any]:
    """Update an existing plate with extracted information"""
    updates = []
    params = [plate_id]
    param_idx = 1

    # Only update fields that are currently null/empty and we have new data
    current = await conn.fetchrow("SELECT * FROM plates WHERE id = $1", plate_id)

    update_fields = {
        'hardness_shore': plate_info.hardness_shore,
        'surface_type': plate_info.surface_type,
        'imaging_type': plate_info.imaging_type,
        'min_lpi': plate_info.min_lpi,
        'max_lpi': plate_info.max_lpi,
        'min_dot_percent': plate_info.min_dot_percent,
        'max_dot_percent': plate_info.max_dot_percent,
        'main_exposure_energy_min_mj_cm2': plate_info.main_exposure_min,
        'main_exposure_energy_max_mj_cm2': plate_info.main_exposure_max,
        'back_exposure_energy_min_mj_cm2': plate_info.back_exposure_min,
        'back_exposure_energy_max_mj_cm2': plate_info.back_exposure_max,
    }

    updated_fields = []
    for field, value in update_fields.items():
        if value is not None and (current[field] is None or current[field] == ''):
            param_idx += 1
            updates.append(f"{field} = ${param_idx}")
            params.append(value)
            updated_fields.append(field)

    # Handle array fields
    array_fields = {
        'ink_compatibility': plate_info.ink_compatibility,
        'applications': plate_info.applications,
        'substrate_categories': plate_info.substrate_categories,
    }

    for field, value in array_fields.items():
        if value and (not current[field] or len(current[field]) == 0):
            param_idx += 1
            updates.append(f"{field} = ${param_idx}")
            params.append(value)
            updated_fields.append(field)

    if updates:
        updates.append("updated_at = NOW()")
        query = f"UPDATE plates SET {', '.join(updates)} WHERE id = $1"
        await conn.execute(query, *params)

    return {
        "plate_id": plate_id,
        "updated_fields": updated_fields,
        "fields_count": len(updated_fields)
    }


async def create_new_plate(conn, plate_info: ExtractedPlateInfo, supplier_id: str) -> Optional[str]:
    """Create a new plate from extracted info"""
    if not plate_info.thickness_mm:
        return None  # Can't create without thickness

    # Get or create family
    family_name = plate_info.family_name or f"{plate_info.supplier_name} Plate"
    family_id = await get_or_create_plate_family(
        conn, supplier_id, family_name, plate_info.process_type
    )

    # Create plate
    plate_id = await conn.fetchval("""
        INSERT INTO plates (
            plate_family_id, display_name, sku_code, thickness_mm,
            hardness_shore, surface_type, imaging_type,
            min_lpi, max_lpi, min_dot_percent, max_dot_percent,
            main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2,
            back_exposure_energy_min_mj_cm2, back_exposure_energy_max_mj_cm2,
            ink_compatibility, applications, substrate_categories
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        RETURNING id
    """,
        family_id,
        plate_info.plate_name or f"{family_name} {plate_info.thickness_mm}mm",
        plate_info.sku_code,
        plate_info.thickness_mm,
        plate_info.hardness_shore,
        plate_info.surface_type,
        plate_info.imaging_type,
        plate_info.min_lpi,
        plate_info.max_lpi,
        plate_info.min_dot_percent,
        plate_info.max_dot_percent,
        plate_info.main_exposure_min,
        plate_info.main_exposure_max,
        plate_info.back_exposure_min,
        plate_info.back_exposure_max,
        plate_info.ink_compatibility,
        plate_info.applications,
        plate_info.substrate_categories
    )

    return str(plate_id)


async def store_plate_document(conn, plate_id: str, pdf_url: str, title: str, content: str) -> str:
    """Store a PDF document linked to a plate"""
    # First ensure the table exists
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS plate_documents (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            plate_id UUID REFERENCES plates(id) ON DELETE CASCADE,
            document_type TEXT DEFAULT 'data_sheet',
            title TEXT,
            source_url TEXT,
            content TEXT,
            extracted_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # Check if already exists
    existing = await conn.fetchrow(
        "SELECT id FROM plate_documents WHERE plate_id = $1 AND source_url = $2",
        plate_id, pdf_url
    )
    if existing:
        return str(existing['id'])

    doc_id = await conn.fetchval("""
        INSERT INTO plate_documents (plate_id, title, source_url, content)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    """, plate_id, title, pdf_url, content[:50000])  # Limit content size

    # Also update data_source_url on the plate
    await conn.execute(
        "UPDATE plates SET data_source_url = $1 WHERE id = $2 AND data_source_url IS NULL",
        pdf_url, plate_id
    )

    return str(doc_id)


# ============================================================================
# EQUIVALENCY SUGGESTIONS
# ============================================================================

async def suggest_equivalencies(conn, plate_id: str) -> List[Dict[str, Any]]:
    """Find potential equivalent plates based on specifications"""
    plate = await conn.fetchrow("""
        SELECT p.*, pf.process_type, pf.family_name, s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.id = $1
    """, plate_id)

    if not plate:
        return []

    # Find similar plates from OTHER suppliers
    candidates = await conn.fetch("""
        SELECT p.*, pf.process_type, pf.family_name, s.name as supplier_name,
            ABS(p.thickness_mm - $1) as thickness_diff,
            ABS(COALESCE(p.hardness_shore, 0) - COALESCE($2, 0)) as hardness_diff
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.id != $3
          AND s.id != (SELECT supplier_id FROM plate_families WHERE id = $4)
          AND ABS(p.thickness_mm - $1) < 0.15
          AND p.is_active = TRUE
        ORDER BY ABS(p.thickness_mm - $1), ABS(COALESCE(p.hardness_shore, 0) - COALESCE($2, 0))
        LIMIT 10
    """, plate['thickness_mm'], plate['hardness_shore'], plate_id, plate['plate_family_id'])

    equivalencies = []
    for row in candidates:
        # Calculate similarity score
        thickness_score = max(0, 40 - (float(row['thickness_diff']) * 300))
        hardness_score = max(0, 25 - (row['hardness_diff'] * 2)) if row['hardness_diff'] else 15
        process_score = 20 if row['process_type'] == plate['process_type'] else 0
        surface_score = 10 if row['surface_type'] == plate['surface_type'] else 0

        score = min(100, thickness_score + hardness_score + process_score + surface_score + 5)

        equivalencies.append({
            "plate_id": str(row['id']),
            "display_name": row['display_name'],
            "supplier": row['supplier_name'],
            "family": row['family_name'],
            "thickness_mm": float(row['thickness_mm']),
            "hardness_shore": row['hardness_shore'],
            "process_type": row['process_type'],
            "similarity_score": round(score),
            "confidence": "high" if score >= 85 else "medium" if score >= 70 else "low"
        })

    return sorted(equivalencies, key=lambda x: x['similarity_score'], reverse=True)


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/from-pdf")
async def import_from_pdf(request: ImportFromPDFRequest):
    """
    Import plate data from a single PDF.

    Downloads the PDF, extracts plate specifications using AI,
    matches to existing plates or creates new ones.
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key required for AI extraction")

    # Download PDF
    pdf_content = await download_pdf(request.url)

    # Extract text
    text = await extract_text_from_pdf(pdf_content)

    if len(text.split()) < 50:
        raise HTTPException(status_code=400, detail="PDF has insufficient text content")

    # Extract plate info using AI
    extracted_plates = await extract_plate_info_from_text(text, request.supplier_name)

    if not extracted_plates:
        return {
            "status": "no_plates_found",
            "message": "Could not extract plate information from this PDF",
            "text_preview": text[:500]
        }

    results = []

    async with pool.acquire() as conn:
        supplier_id = await get_or_create_supplier(conn, request.supplier_name)

        for plate_info in extracted_plates:
            result = {
                "extracted": {
                    "name": plate_info.plate_name,
                    "family": plate_info.family_name,
                    "thickness": plate_info.thickness_mm,
                    "hardness": plate_info.hardness_shore
                }
            }

            # Try to find matching plate
            existing_plate = await find_matching_plate(conn, plate_info, supplier_id)

            if existing_plate:
                # Update existing plate
                update_result = await update_plate_with_extracted_info(
                    conn, str(existing_plate['id']), plate_info
                )

                # Store document link
                doc_id = await store_plate_document(
                    conn, str(existing_plate['id']), request.url,
                    plate_info.plate_name or "Data Sheet", text
                )

                # Get equivalency suggestions
                equivalencies = await suggest_equivalencies(conn, str(existing_plate['id']))

                result.update({
                    "status": "updated",
                    "plate_id": str(existing_plate['id']),
                    "plate_name": existing_plate['display_name'],
                    "updated_fields": update_result['updated_fields'],
                    "document_id": doc_id,
                    "equivalency_suggestions": equivalencies[:5]
                })
            elif request.auto_create_plates:
                # Create new plate
                new_plate_id = await create_new_plate(conn, plate_info, supplier_id)

                if new_plate_id:
                    # Store document link
                    doc_id = await store_plate_document(
                        conn, new_plate_id, request.url,
                        plate_info.plate_name or "Data Sheet", text
                    )

                    # Get equivalency suggestions
                    equivalencies = await suggest_equivalencies(conn, new_plate_id)

                    result.update({
                        "status": "created",
                        "plate_id": new_plate_id,
                        "plate_name": plate_info.plate_name,
                        "document_id": doc_id,
                        "equivalency_suggestions": equivalencies[:5]
                    })
                else:
                    result.update({
                        "status": "skipped",
                        "reason": "Missing required info (thickness)"
                    })
            else:
                result.update({
                    "status": "no_match",
                    "message": "No matching plate found. Set auto_create_plates=true to create new."
                })

            results.append(result)

    return {
        "status": "success",
        "pdf_url": request.url,
        "plates_extracted": len(extracted_plates),
        "results": results
    }


@router.post("/from-download-page")
async def import_from_download_page(request: ImportFromDownloadPageRequest, background_tasks: BackgroundTasks):
    """
    Import plate data from a supplier's download/resources page.

    Fetches the page, finds all PDF links, downloads each,
    extracts plate specs, and updates the database.
    """
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key required")

    # Fetch the download page
    html = await fetch_page(request.url)

    # Extract PDF links (filtered to flexo plates only by default)
    pdf_links = extract_pdf_links(html, request.url, filter_flexo_plates=request.filter_flexo_only)

    if not pdf_links:
        return {
            "status": "no_pdfs_found",
            "message": "No flexographic plate PDFs found on this page" if request.filter_flexo_only else "No PDF links found on this page",
            "hint": "The page may contain equipment, sleeves, or other non-plate PDFs which are filtered out by default."
        }

    # Limit PDFs
    pdf_links = pdf_links[:request.max_pdfs]

    # Process in background
    async def process_all_pdfs():
        results = []
        async with pool.acquire() as conn:
            supplier_id = await get_or_create_supplier(conn, request.supplier_name)

        for pdf_info in pdf_links:
            try:
                # Download and extract
                pdf_content = await download_pdf(pdf_info['url'])
                text = await extract_text_from_pdf(pdf_content)

                if len(text.split()) < 50:
                    results.append({
                        "url": pdf_info['url'],
                        "title": pdf_info['title'],
                        "status": "skipped",
                        "reason": "insufficient_content"
                    })
                    continue

                # Extract plate info
                extracted_plates = await extract_plate_info_from_text(text, request.supplier_name)

                if not extracted_plates:
                    results.append({
                        "url": pdf_info['url'],
                        "title": pdf_info['title'],
                        "status": "no_plates_found"
                    })
                    continue

                # Process each extracted plate
                async with pool.acquire() as conn:
                    for plate_info in extracted_plates:
                        existing = await find_matching_plate(conn, plate_info, supplier_id)

                        if existing:
                            await update_plate_with_extracted_info(conn, str(existing['id']), plate_info)
                            await store_plate_document(conn, str(existing['id']), pdf_info['url'], pdf_info['title'], text)
                            results.append({
                                "url": pdf_info['url'],
                                "plate": plate_info.plate_name,
                                "status": "updated",
                                "plate_id": str(existing['id'])
                            })
                        elif request.auto_create_plates:
                            new_id = await create_new_plate(conn, plate_info, supplier_id)
                            if new_id:
                                await store_plate_document(conn, new_id, pdf_info['url'], pdf_info['title'], text)
                                results.append({
                                    "url": pdf_info['url'],
                                    "plate": plate_info.plate_name,
                                    "status": "created",
                                    "plate_id": new_id
                                })
                        else:
                            results.append({
                                "url": pdf_info['url'],
                                "plate": plate_info.plate_name,
                                "status": "no_match"
                            })

            except Exception as e:
                results.append({
                    "url": pdf_info['url'],
                    "status": "error",
                    "error": str(e)
                })

            await asyncio.sleep(2)  # Rate limiting

        print(f"PDF Import complete: {len(results)} processed")
        return results

    background_tasks.add_task(process_all_pdfs)

    return {
        "status": "started",
        "page_url": request.url,
        "supplier": request.supplier_name,
        "pdfs_found": len(pdf_links),
        "pdfs_to_process": len(pdf_links),
        "pdf_links": pdf_links,
        "message": f"Processing {len(pdf_links)} PDFs in background..."
    }


@router.get("/plates/{supplier_name}")
async def get_supplier_plates(supplier_name: str):
    """Get all plates for a supplier"""
    pool = await get_db_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database not available")

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE LOWER(s.name) LIKE LOWER($1)
              AND p.is_active = TRUE
            ORDER BY pf.family_name, p.thickness_mm
        """, f"%{supplier_name}%")

        return [dict(row) for row in rows]


@router.get("/health")
async def health_check():
    pool = await get_db_pool()
    return {
        "status": "healthy",
        "database_connected": pool is not None,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "zenrows_configured": bool(ZENROWS_API_KEY)
    }
