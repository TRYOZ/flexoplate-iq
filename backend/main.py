"""
FlexoPlate IQ - Backend API
Plate Equivalency & Exposure Calculator
"""

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import asyncpg
from contextlib import asynccontextmanager

# Database connection pool
db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage database connection pool lifecycle"""
    global db_pool
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        # Railway uses postgres:// but asyncpg needs postgresql://
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        db_pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
    yield
    if db_pool:
        await db_pool.close()

app = FastAPI(
    title="FlexoPlate IQ API",
    description="Plate Equivalency & Exposure Calculator for Flexographic Printing",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# MODELS
# ============================================================================

class PlateBase(BaseModel):
    id: str
    sku_code: Optional[str]
    display_name: Optional[str]
    thickness_mm: float
    hardness_shore: Optional[float]
    imaging_type: Optional[str]
    surface_type: Optional[str]
    min_lpi: Optional[int]
    max_lpi: Optional[int]
    ink_compatibility: Optional[List[str]]
    substrate_categories: Optional[List[str]]
    applications: Optional[List[str]]
    family_name: str
    process_type: Optional[str]
    supplier_name: str

class PlateEquivalent(PlateBase):
    similarity_score: int
    match_notes: List[str]

class EquivalencyRequest(BaseModel):
    source_plate_id: str
    target_supplier: Optional[str] = None  # None = search all suppliers
    substrate: Optional[str] = None
    ink_system: Optional[str] = None
    application: Optional[str] = None

class EquivalencyWeights(BaseModel):
    thickness: int = 40
    process_type: int = 20
    hardness: int = 15
    surface_type: int = 10
    lpi_range: int = 5
    application: int = 5
    ink_compat: int = 5
    hardness_tolerance: float = 2.0
    thickness_tolerance_mm: float = 0.05

class ExposureCalculation(BaseModel):
    plate_id: str
    equipment_instance_id: Optional[str] = None
    current_intensity_mw_cm2: float
    target_floor_mm: Optional[float] = None

class ExposureResult(BaseModel):
    back_exposure_time_s: Optional[float]
    back_exposure_range: Optional[tuple]
    main_exposure_time_s: Optional[float]
    main_exposure_range: Optional[tuple]
    post_exposure_time_s: Optional[float]
    detack_time_s: Optional[float]
    notes: List[str]

class RecipeCard(BaseModel):
    plate_name: str
    plate_thickness_mm: float
    supplier_name: str
    equipment_name: Optional[str]
    back_exposure_s: float
    main_exposure_s: float
    post_exposure_s: Optional[float]
    detack_s: Optional[float]
    target_floor_mm: Optional[float]
    notes: str

# ============================================================================
# DATABASE HELPERS
# ============================================================================

async def get_db():
    """Get database connection from pool"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not connected")
    async with db_pool.acquire() as conn:
        yield conn

# ============================================================================
# PLATE MATCHING ALGORITHM
# ============================================================================

def calculate_range_overlap(min1: int, max1: int, min2: int, max2: int) -> float:
    """Calculate overlap ratio between two ranges (0.0 to 1.0)"""
    if min1 is None or max1 is None or min2 is None or max2 is None:
        return 0.5  # Neutral if data missing
    
    overlap_start = max(min1, min2)
    overlap_end = min(max1, max2)
    
    if overlap_start >= overlap_end:
        return 0.0
    
    overlap = overlap_end - overlap_start
    total_range = max(max1, max2) - min(min1, min2)
    
    return overlap / total_range if total_range > 0 else 0.0

def calculate_array_overlap(arr1: List[str], arr2: List[str]) -> float:
    """Calculate overlap ratio between two arrays (0.0 to 1.0)"""
    if not arr1 or not arr2:
        return 0.5  # Neutral if data missing
    
    set1, set2 = set(arr1), set(arr2)
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    return intersection / union if union > 0 else 0.0

def calculate_plate_similarity(
    source: dict, 
    target: dict, 
    weights: EquivalencyWeights,
    context: dict = None
) -> tuple[int, List[str]]:
    """
    Calculate similarity score between two plates.
    Returns (score 0-100, list of notes)
    """
    notes = []
    score = 0.0
    
    # DISQUALIFIERS - must match or very close
    
    # 1. Process type MUST match
    if source.get('process_type') != target.get('process_type'):
        return 0, ["Process type mismatch - not compatible"]
    
    # 2. Thickness must be within tolerance
    thickness_diff = abs((source.get('thickness_mm') or 0) - (target.get('thickness_mm') or 0))
    if thickness_diff > weights.thickness_tolerance_mm:
        return 0, [f"Thickness difference ({thickness_diff:.2f}mm) exceeds tolerance"]
    
    # SCORED ATTRIBUTES
    
    # Thickness - exact match gets full points
    if thickness_diff == 0:
        score += weights.thickness
    else:
        # Partial credit for close match
        thickness_score = weights.thickness * (1 - thickness_diff / weights.thickness_tolerance_mm)
        score += thickness_score
    
    # Process type match (already verified above)
    score += weights.process_type
    
    # Hardness similarity
    source_hardness = source.get('hardness_shore')
    target_hardness = target.get('hardness_shore')
    if source_hardness and target_hardness:
        hardness_diff = abs(source_hardness - target_hardness)
        if hardness_diff <= weights.hardness_tolerance:
            hardness_score = weights.hardness * (1 - hardness_diff / weights.hardness_tolerance)
            score += hardness_score
            if hardness_diff > 1:
                notes.append(f"Slightly {'harder' if target_hardness > source_hardness else 'softer'} ({hardness_diff:.0f} Shore difference)")
        else:
            notes.append(f"Significant hardness difference ({hardness_diff:.0f} Shore) - may affect ink transfer")
    else:
        score += weights.hardness * 0.5  # Neutral if missing
    
    # Surface type match
    if source.get('surface_type') == target.get('surface_type'):
        score += weights.surface_type
    elif source.get('surface_type') and target.get('surface_type'):
        notes.append(f"Different surface type: {target.get('surface_type')} vs {source.get('surface_type')}")
    
    # LPI range overlap
    lpi_overlap = calculate_range_overlap(
        source.get('min_lpi'), source.get('max_lpi'),
        target.get('min_lpi'), target.get('max_lpi')
    )
    score += weights.lpi_range * lpi_overlap
    if lpi_overlap < 0.5 and source.get('min_lpi') and target.get('min_lpi'):
        notes.append(f"Limited LPI overlap - verify screen ruling compatibility")
    
    # Application match
    app_overlap = calculate_array_overlap(
        source.get('applications') or [],
        target.get('applications') or []
    )
    score += weights.application * app_overlap
    
    # Ink compatibility
    ink_overlap = calculate_array_overlap(
        source.get('ink_compatibility') or [],
        target.get('ink_compatibility') or []
    )
    score += weights.ink_compat * ink_overlap
    
    # Context bonuses (if user specified preferences)
    if context:
        if context.get('substrate') and target.get('substrate_categories'):
            if context['substrate'] in target['substrate_categories']:
                score += 3
                notes.append(f"✓ Matches substrate: {context['substrate']}")
        
        if context.get('ink_system') and target.get('ink_compatibility'):
            if context['ink_system'] in target['ink_compatibility']:
                score += 2
                notes.append(f"✓ Compatible with {context['ink_system']} inks")
        
        if context.get('application') and target.get('applications'):
            if context['application'] in target['applications']:
                score += 3
                notes.append(f"✓ Suitable for {context['application']}")
    
    # Normalize to 0-100
    max_possible = (
        weights.thickness + weights.process_type + weights.hardness +
        weights.surface_type + weights.lpi_range + weights.application + 
        weights.ink_compat + 8  # Context bonuses
    )
    normalized_score = int(min(100, (score / max_possible) * 100))
    
    return normalized_score, notes

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    return {
        "name": "FlexoPlate IQ API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "plates": "/api/plates",
            "equivalency": "/api/equivalency",
            "exposure": "/api/exposure/calculate",
            "suppliers": "/api/suppliers"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_status = "connected" if db_pool else "disconnected"
    return {"status": "healthy", "database": db_status}

# ----------------------------------------------------------------------------
# SUPPLIERS
# ----------------------------------------------------------------------------

@app.get("/api/suppliers")
async def list_suppliers(
    plate_suppliers_only: bool = False,
    conn = Depends(get_db)
):
    """List all suppliers"""
    query = """
        SELECT id, name, website_url, country, is_plate_supplier, is_equipment_supplier
        FROM suppliers
        WHERE ($1 = FALSE OR is_plate_supplier = TRUE)
        ORDER BY name
    """
    rows = await conn.fetch(query, plate_suppliers_only)
    return [dict(row) for row in rows]

# ----------------------------------------------------------------------------
# PLATES
# ----------------------------------------------------------------------------

@app.get("/api/plates")
async def list_plates(
    supplier: Optional[str] = None,
    family: Optional[str] = None,
    thickness_mm: Optional[float] = None,
    process_type: Optional[str] = None,
    imaging_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    conn = Depends(get_db)
):
    """List plates with optional filters"""
    query = """
        SELECT 
            p.id::text,
            p.sku_code,
            p.display_name,
            p.thickness_mm,
            p.hardness_shore,
            p.imaging_type,
            p.surface_type,
            p.min_lpi,
            p.max_lpi,
            p.ink_compatibility,
            p.substrate_categories,
            p.applications,
            p.main_exposure_energy_min_mj_cm2,
            p.main_exposure_energy_max_mj_cm2,
            p.is_active,
            pf.family_name,
            pf.process_type,
            pf.technology_tags,
            s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.is_active = TRUE
          AND p.organization_id IS NULL  -- Global catalog only
          AND ($1::text IS NULL OR s.name ILIKE $1)
          AND ($2::text IS NULL OR pf.family_name ILIKE $2)
          AND ($3::numeric IS NULL OR p.thickness_mm = $3)
          AND ($4::text IS NULL OR pf.process_type = $4)
          AND ($5::text IS NULL OR p.imaging_type = $5)
          AND ($6::text IS NULL OR 
               p.display_name ILIKE '%' || $6 || '%' OR
               p.sku_code ILIKE '%' || $6 || '%' OR
               pf.family_name ILIKE '%' || $6 || '%')
        ORDER BY s.name, pf.family_name, p.thickness_mm
        LIMIT $7
    """
    rows = await conn.fetch(
        query, 
        supplier, family, thickness_mm, process_type, imaging_type, search,
        limit
    )
    return [dict(row) for row in rows]

@app.get("/api/plates/{plate_id}")
async def get_plate(plate_id: str, conn = Depends(get_db)):
    """Get single plate by ID"""
    query = """
        SELECT 
            p.id::text,
            p.sku_code,
            p.display_name,
            p.thickness_mm,
            p.hardness_shore,
            p.imaging_type,
            p.surface_type,
            p.relief_recommended_mm,
            p.min_lpi,
            p.max_lpi,
            p.ink_compatibility,
            p.substrate_categories,
            p.applications,
            p.main_exposure_energy_min_mj_cm2,
            p.main_exposure_energy_max_mj_cm2,
            p.back_exposure_energy_min_mj_cm2,
            p.back_exposure_energy_max_mj_cm2,
            p.post_exposure_energy_mj_cm2,
            p.detack_energy_mj_cm2,
            p.notes,
            pf.family_name,
            pf.process_type,
            pf.technology_tags,
            pf.description as family_description,
            s.name as supplier_name,
            s.website_url as supplier_url
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.id = $1::uuid
    """
    row = await conn.fetchrow(query, plate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Plate not found")
    return dict(row)

# ----------------------------------------------------------------------------
# PLATE EQUIVALENCY
# ----------------------------------------------------------------------------

@app.post("/api/equivalency/find")
async def find_equivalents(
    request: EquivalencyRequest,
    conn = Depends(get_db)
):
    """Find equivalent plates for a given source plate"""
    
    # Get source plate
    source_query = """
        SELECT 
            p.id::text,
            p.sku_code,
            p.display_name,
            p.thickness_mm,
            p.hardness_shore,
            p.imaging_type,
            p.surface_type,
            p.min_lpi,
            p.max_lpi,
            p.ink_compatibility,
            p.substrate_categories,
            p.applications,
            pf.family_name,
            pf.process_type,
            s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.id = $1::uuid
    """
    source_row = await conn.fetchrow(source_query, request.source_plate_id)
    if not source_row:
        raise HTTPException(status_code=404, detail="Source plate not found")
    
    source = dict(source_row)
    
    # Get candidate plates (different from source, matching basic criteria)
    candidates_query = """
        SELECT 
            p.id::text,
            p.sku_code,
            p.display_name,
            p.thickness_mm,
            p.hardness_shore,
            p.imaging_type,
            p.surface_type,
            p.min_lpi,
            p.max_lpi,
            p.ink_compatibility,
            p.substrate_categories,
            p.applications,
            pf.family_name,
            pf.process_type,
            s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.is_active = TRUE
          AND p.organization_id IS NULL
          AND p.id != $1::uuid
          AND s.name != $2  -- Different supplier (or same if needed)
          AND pf.process_type = $3  -- Same process type
          AND ABS(p.thickness_mm - $4) <= 0.1  -- Close thickness
          AND ($5::text IS NULL OR s.name ILIKE $5)  -- Optional target supplier filter
        ORDER BY ABS(p.thickness_mm - $4), s.name
        LIMIT 50
    """
    candidate_rows = await conn.fetch(
        candidates_query,
        request.source_plate_id,
        source['supplier_name'],
        source['process_type'],
        source['thickness_mm'],
        request.target_supplier
    )
    
    # Calculate similarity for each candidate
    weights = EquivalencyWeights()
    context = {
        'substrate': request.substrate,
        'ink_system': request.ink_system,
        'application': request.application
    }
    
    results = []
    for row in candidate_rows:
        target = dict(row)
        score, notes = calculate_plate_similarity(source, target, weights, context)
        
        if score > 0:  # Only include viable matches
            results.append({
                **target,
                'similarity_score': score,
                'match_notes': notes
            })
    
    # Sort by score descending
    results.sort(key=lambda x: x['similarity_score'], reverse=True)
    
    return {
        'source_plate': source,
        'equivalents': results[:10],  # Top 10 matches
        'total_candidates': len(results)
    }

@app.get("/api/equivalency/quick")
async def quick_equivalency(
    plate_id: str,
    target_supplier: Optional[str] = None,
    conn = Depends(get_db)
):
    """Quick equivalency lookup - simpler endpoint for basic use"""
    request = EquivalencyRequest(
        source_plate_id=plate_id,
        target_supplier=target_supplier
    )
    return await find_equivalents(request, conn)

# ----------------------------------------------------------------------------
# EXPOSURE CALCULATOR
# ----------------------------------------------------------------------------

@app.post("/api/exposure/calculate")
async def calculate_exposure(
    request: ExposureCalculation,
    conn = Depends(get_db)
):
    """Calculate exposure times based on plate and current UV intensity"""
    
    # Get plate data
    plate_query = """
        SELECT 
            p.display_name,
            p.thickness_mm,
            p.main_exposure_energy_min_mj_cm2,
            p.main_exposure_energy_max_mj_cm2,
            p.back_exposure_energy_min_mj_cm2,
            p.back_exposure_energy_max_mj_cm2,
            p.post_exposure_energy_mj_cm2,
            p.detack_energy_mj_cm2,
            p.relief_recommended_mm,
            pf.family_name,
            pf.process_type,
            s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE p.id = $1::uuid
    """
    plate = await conn.fetchrow(plate_query, request.plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail="Plate not found")
    
    plate = dict(plate)
    intensity = request.current_intensity_mw_cm2
    notes = []
    
    # Calculate exposure times: Time(s) = Energy(mJ/cm²) / Intensity(mW/cm²)
    
    # Main exposure
    main_time = None
    main_range = None
    if plate.get('main_exposure_energy_min_mj_cm2') and plate.get('main_exposure_energy_max_mj_cm2'):
        main_min = plate['main_exposure_energy_min_mj_cm2'] / intensity
        main_max = plate['main_exposure_energy_max_mj_cm2'] / intensity
        main_time = (main_min + main_max) / 2  # Midpoint recommendation
        main_range = (round(main_min, 1), round(main_max, 1))
        notes.append(f"Main exposure based on {plate['main_exposure_energy_min_mj_cm2']}-{plate['main_exposure_energy_max_mj_cm2']} mJ/cm²")
    
    # Back exposure
    back_time = None
    back_range = None
    if plate.get('back_exposure_energy_min_mj_cm2') and plate.get('back_exposure_energy_max_mj_cm2'):
        back_min = plate['back_exposure_energy_min_mj_cm2'] / intensity
        back_max = plate['back_exposure_energy_max_mj_cm2'] / intensity
        back_time = (back_min + back_max) / 2
        back_range = (round(back_min, 1), round(back_max, 1))
        
        # Adjust for target floor if specified
        if request.target_floor_mm and plate.get('thickness_mm'):
            target_relief = plate['thickness_mm'] - request.target_floor_mm
            recommended_relief = plate.get('relief_recommended_mm') or (plate['thickness_mm'] * 0.6)
            if target_relief < recommended_relief:
                # More floor = more back exposure
                adjustment = 1 + (recommended_relief - target_relief) / recommended_relief * 0.2
                back_time *= adjustment
                notes.append(f"Back exposure adjusted for {request.target_floor_mm}mm floor target")
    
    # Post exposure
    post_time = None
    if plate.get('post_exposure_energy_mj_cm2'):
        post_time = round(plate['post_exposure_energy_mj_cm2'] / intensity, 1)
    
    # Detack
    detack_time = None
    if plate.get('detack_energy_mj_cm2'):
        detack_time = round(plate['detack_energy_mj_cm2'] / intensity, 1)
    
    # Add general notes
    notes.append(f"Calculated at {intensity} mW/cm² measured intensity")
    if plate.get('process_type') == 'thermal':
        notes.append("Thermal plate - no solvent washout required")
    
    return {
        'plate': {
            'name': plate.get('display_name') or plate.get('family_name'),
            'thickness_mm': plate['thickness_mm'],
            'supplier': plate['supplier_name'],
            'process_type': plate['process_type']
        },
        'exposure': {
            'back_exposure_time_s': round(back_time, 1) if back_time else None,
            'back_exposure_range_s': back_range,
            'main_exposure_time_s': round(main_time, 1) if main_time else None,
            'main_exposure_range_s': main_range,
            'post_exposure_time_s': post_time,
            'detack_time_s': detack_time
        },
        'notes': notes,
        'input': {
            'intensity_mw_cm2': intensity,
            'target_floor_mm': request.target_floor_mm
        }
    }

@app.get("/api/exposure/scale")
async def scale_exposure_time(
    reference_time_s: float,
    reference_intensity: float,
    current_intensity: float
):
    """Scale exposure time when lamp intensity changes"""
    if current_intensity <= 0:
        raise HTTPException(status_code=400, detail="Current intensity must be positive")
    
    # Lower intensity = longer time (inverse relationship)
    scaled_time = reference_time_s * (reference_intensity / current_intensity)
    
    return {
        'reference_time_s': reference_time_s,
        'reference_intensity_mw_cm2': reference_intensity,
        'current_intensity_mw_cm2': current_intensity,
        'scaled_time_s': round(scaled_time, 1),
        'intensity_change_percent': round((current_intensity - reference_intensity) / reference_intensity * 100, 1)
    }

# ----------------------------------------------------------------------------
# EQUIPMENT (for future use)
# ----------------------------------------------------------------------------

@app.get("/api/equipment/models")
async def list_equipment_models(
    equipment_type: Optional[str] = None,
    supplier: Optional[str] = None,
    conn = Depends(get_db)
):
    """List equipment models"""
    query = """
        SELECT 
            em.id::text,
            em.model_name,
            em.equipment_type,
            em.technology,
            em.uv_source_type,
            em.nominal_intensity_mw_cm2,
            em.has_integrated_back_exposure,
            s.name as supplier_name
        FROM equipment_models em
        JOIN suppliers s ON em.supplier_id = s.id
        WHERE ($1::text IS NULL OR em.equipment_type = $1)
          AND ($2::text IS NULL OR s.name ILIKE $2)
        ORDER BY s.name, em.model_name
    """
    rows = await conn.fetch(query, equipment_type, supplier)
    return [dict(row) for row in rows]

# ----------------------------------------------------------------------------
# PLATE FAMILIES
# ----------------------------------------------------------------------------

@app.get("/api/families")
async def list_plate_families(
    supplier: Optional[str] = None,
    process_type: Optional[str] = None,
    conn = Depends(get_db)
):
    """List plate families with plate counts"""
    query = """
        SELECT 
            pf.id::text,
            pf.family_name,
            pf.process_type,
            pf.technology_tags,
            pf.description,
            s.name as supplier_name,
            COUNT(p.id) as plate_count
        FROM plate_families pf
        JOIN suppliers s ON pf.supplier_id = s.id
        LEFT JOIN plates p ON p.plate_family_id = pf.id AND p.is_active = TRUE
        WHERE ($1::text IS NULL OR s.name ILIKE $1)
          AND ($2::text IS NULL OR pf.process_type = $2)
        GROUP BY pf.id, pf.family_name, pf.process_type, pf.technology_tags, 
                 pf.description, s.name
        ORDER BY s.name, pf.family_name
    """
    rows = await conn.fetch(query, supplier, process_type)
    return [dict(row) for row in rows]


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
