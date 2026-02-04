# FlexoPlate IQ - Backend v4.2
# ============================
# Added enhanced plate fields:
# - tonal_range, recommended_lpi, max_imager_dpi
# - flat_top_technology, engineered_surface, led_optimized
# - key_differentiators, substrate_detail, product_sheet_url
# - region_availability, plate_generation

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, date
import bcrypt
import asyncpg
import uuid
import os

try:
    from jose import JWTError, jwt
except ImportError:
    from python_jose import JWTError, jwt
from intelligence_routes import intelligence_router
import intelligence_routes
from flexobrain_agent import router as flexobrain_router
from knowledge_scraper import router as knowledge_router
from knowledge_loader import router as knowledge_loader_router
# ============================================================
# APP SETUP
# ============================================================
app = FastAPI(title="FlexoPlate IQ API", version="4.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(intelligence_router)
app.include_router(flexobrain_router)
app.include_router(knowledge_router)
app.include_router(knowledge_loader_router)
# ============================================================
# CONFIGURATION
# ============================================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:IefWwmDCTTlBrxmERJvpPLZvozhkjaNE@shortline.proxy.rlwy.net:39738/railway")
SECRET_KEY = os.getenv("SECRET_KEY", "flexoplate-iq-secret-key-change-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)
pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    intelligence_routes._pool = pool

@app.on_event("shutdown")
async def shutdown():
    await pool.close()

# ============================================================
# PYDANTIC MODELS
# ============================================================
class UserRegister(BaseModel):
    email: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class EquipmentAdd(BaseModel):
    equipment_model_id: str
    nickname: str
    lamp_install_date: Optional[str] = None
    location: Optional[str] = None

class RecipeSave(BaseModel):
    name: str
    plate_id: str
    main_exposure_time_s: int
    back_exposure_time_s: int
    customer_name: Optional[str] = None
    job_number: Optional[str] = None
    notes: Optional[str] = None
    equipment_id: Optional[str] = None

class ExposureCalculateRequest(BaseModel):
    plate_id: str
    current_intensity_mw_cm2: float
    target_floor_mm: Optional[float] = None

# ============================================================
# AUTH HELPERS
# ============================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    user_id = decode_token(credentials.credentials)
    if not user_id:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", uuid.UUID(user_id))
        if row:
            return dict(row)
    return None

async def get_current_user_required(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", uuid.UUID(user_id))
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        return dict(row)

# ============================================================
# ROOT
# ============================================================
@app.get("/")
async def root():
    return {"status": "ok", "service": "FlexoPlate IQ API", "version": "4.2.0"}

# ============================================================
# AUTH ENDPOINTS
# ============================================================
@app.post("/api/auth/register")
async def register(data: UserRegister):
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", data.email.lower())
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        user_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO users (id, email, password_hash, first_name, last_name, job_title, user_tier, max_plates, max_equipment, max_recipes, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, 'free', 5, 2, 5, TRUE)
        """, user_id, data.email.lower(), hash_password(data.password), data.first_name, data.last_name, data.job_title)
        
        if data.company_name:
            company_id = uuid.uuid4()
            await conn.execute("INSERT INTO companies (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", company_id, data.company_name)
            actual_company_id = await conn.fetchval("SELECT id FROM companies WHERE name = $1", data.company_name)
            if actual_company_id:
                await conn.execute("INSERT INTO user_companies (user_id, company_id, is_primary) VALUES ($1, $2, TRUE)", user_id, actual_company_id)
        
        return {
            "token": create_access_token(str(user_id)),
            "user": {"id": str(user_id), "email": data.email.lower(), "first_name": data.first_name, "last_name": data.last_name, "user_tier": "free"}
        }

@app.post("/api/auth/login")
async def login(data: UserLogin):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", data.email.lower())
        if not row or not verify_password(data.password, row['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return {
            "token": create_access_token(str(row['id'])),
            "user": {"id": str(row['id']), "email": row['email'], "first_name": row['first_name'], "last_name": row['last_name'], "user_tier": row.get('user_tier') or 'free'}
        }

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user_required)):
    return {"id": str(user['id']), "email": user['email'], "first_name": user['first_name'], "last_name": user['last_name'], "user_tier": user.get('user_tier') or 'free'}

# ============================================================
# SUPPLIERS
# ============================================================
@app.get("/api/suppliers")
async def get_suppliers():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name FROM suppliers ORDER BY name")
        return [{"id": str(r['id']), "name": r['name']} for r in rows]

# ============================================================
# PLATES - ENHANCED with new fields
# ============================================================
@app.get("/api/plates")
async def get_plates(
    supplier: Optional[str] = None,
    thickness: Optional[float] = None,
    process_type: Optional[str] = None,
    surface_type: Optional[str] = None,
    led_optimized: Optional[bool] = None,
    flat_top_only: Optional[bool] = None,
    has_product_sheet: Optional[bool] = None,
    limit: int = 200
):
    async with pool.acquire() as conn:
        conditions = ["p.is_active = TRUE"]
        params = []
        idx = 1
        
        if supplier:
            conditions.append(f"s.name = ${idx}")
            params.append(supplier)
            idx += 1
        
        if thickness:
            conditions.append(f"ABS(p.thickness_mm - ${idx}) < 0.01")
            params.append(thickness)
            idx += 1
        
        if process_type:
            conditions.append(f"pf.process_type = ${idx}")
            params.append(process_type)
            idx += 1
        
        if surface_type:
            conditions.append(f"p.surface_type = ${idx}")
            params.append(surface_type)
            idx += 1
        
        if led_optimized:
            conditions.append("p.led_optimized = TRUE")
        
        if flat_top_only:
            conditions.append("p.flat_top_technology IS NOT NULL")
        
        if has_product_sheet:
            conditions.append("p.product_sheet_url IS NOT NULL")
        
        query = f"""
            SELECT p.id, p.display_name, p.thickness_mm, p.hardness_shore,
                   p.imaging_type, p.surface_type, p.min_lpi, p.max_lpi,
                   p.ink_compatibility, p.applications,
                   p.tonal_range_min_pct, p.tonal_range_max_pct,
                   p.recommended_lpi, p.max_imager_dpi,
                   p.flat_top_technology, p.engineered_surface, p.led_optimized,
                   p.key_differentiators, p.substrate_detail, p.product_sheet_url,
                   p.region_availability, p.plate_generation,
                   pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE {' AND '.join(conditions)}
            ORDER BY s.name, p.display_name
            LIMIT ${idx}
        """
        params.append(limit)
        
        rows = await conn.fetch(query, *params)
        result = []
        for r in rows:
            result.append({
                "id": str(r['id']),
                "display_name": r['display_name'],
                "thickness_mm": float(r['thickness_mm']) if r['thickness_mm'] else None,
                "hardness_shore": float(r['hardness_shore']) if r['hardness_shore'] else None,
                "imaging_type": r['imaging_type'],
                "surface_type": r['surface_type'],
                "min_lpi": r['min_lpi'],
                "max_lpi": r['max_lpi'],
                "ink_compatibility": r['ink_compatibility'] or [],
                "applications": r['applications'] or [],
                "tonal_range_min_pct": float(r['tonal_range_min_pct']) if r['tonal_range_min_pct'] else None,
                "tonal_range_max_pct": float(r['tonal_range_max_pct']) if r['tonal_range_max_pct'] else None,
                "recommended_lpi": r['recommended_lpi'],
                "max_imager_dpi": r['max_imager_dpi'],
                "flat_top_technology": r['flat_top_technology'],
                "engineered_surface": r['engineered_surface'] or False,
                "led_optimized": r['led_optimized'] or False,
                "key_differentiators": r['key_differentiators'] or [],
                "substrate_detail": r['substrate_detail'],
                "product_sheet_url": r['product_sheet_url'],
                "region_availability": r['region_availability'] or [],
                "plate_generation": r['plate_generation'] or 'current',
                "family_name": r['family_name'],
                "process_type": r['process_type'] or r['imaging_type'],
                "supplier_name": r['supplier_name'],
            })
        return result

@app.get("/api/plates/{plate_id}")
async def get_plate(plate_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name, s.website as supplier_website
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE p.id = $1
        """, uuid.UUID(plate_id))
        
        if not row:
            raise HTTPException(status_code=404, detail="Plate not found")
        
        return {
            "id": str(row['id']),
            "sku_code": row['sku_code'],
            "display_name": row['display_name'],
            "thickness_mm": float(row['thickness_mm']) if row['thickness_mm'] else None,
            "hardness_shore": float(row['hardness_shore']) if row['hardness_shore'] else None,
            "imaging_type": row['imaging_type'],
            "surface_type": row['surface_type'],
            "min_lpi": row['min_lpi'],
            "max_lpi": row['max_lpi'],
            "ink_compatibility": row['ink_compatibility'] or [],
            "applications": row['applications'] or [],
            "tonal_range_min_pct": float(row['tonal_range_min_pct']) if row['tonal_range_min_pct'] else None,
            "tonal_range_max_pct": float(row['tonal_range_max_pct']) if row['tonal_range_max_pct'] else None,
            "recommended_lpi": row['recommended_lpi'],
            "max_imager_dpi": row['max_imager_dpi'],
            "flat_top_technology": row['flat_top_technology'],
            "engineered_surface": row['engineered_surface'] or False,
            "led_optimized": row['led_optimized'] or False,
            "key_differentiators": row['key_differentiators'] or [],
            "substrate_detail": row['substrate_detail'],
            "product_sheet_url": row['product_sheet_url'],
            "region_availability": row['region_availability'] or [],
            "plate_generation": row['plate_generation'] or 'current',
            "family_name": row['family_name'],
            "process_type": row['process_type'] or row['imaging_type'],
            "supplier_name": row['supplier_name'],
            "supplier_website": row['supplier_website'],
        }

# ============================================================
# EQUIVALENCY
# ============================================================
@app.get("/api/equivalency/find")
async def find_equivalent_plates(
    plate_id: str,
    target_supplier: Optional[str] = None,
    exclude_same_supplier: bool = True,
    limit: int = 20
):
    async with pool.acquire() as conn:
        source = await conn.fetchrow("""
            SELECT p.*, s.name as supplier_name, s.id as supplier_id
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE p.id = $1
        """, uuid.UUID(plate_id))
        
        if not source:
            raise HTTPException(status_code=404, detail="Source plate not found")
        
        conditions = ["p.id != $1", "p.is_active = TRUE"]
        params = [uuid.UUID(plate_id)]
        idx = 2
        
        if source['thickness_mm']:
            conditions.append(f"ABS(p.thickness_mm - ${idx}) < 0.15")
            params.append(source['thickness_mm'])
            idx += 1
        
        if exclude_same_supplier and source['supplier_id']:
            conditions.append(f"pf.supplier_id != ${idx}")
            params.append(source['supplier_id'])
            idx += 1
        
        if target_supplier:
            conditions.append(f"LOWER(s.name) LIKE ${idx}")
            params.append(f"%{target_supplier.lower()}%")
            idx += 1
        
        query = f"""
            SELECT p.id, p.display_name, p.thickness_mm, p.hardness_shore,
                   p.imaging_type, p.surface_type, s.name as supplier_name,
                   p.min_lpi, p.max_lpi,
                   p.flat_top_technology, p.led_optimized, p.engineered_surface,
                   p.product_sheet_url
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE {' AND '.join(conditions)}
        """
        
        candidates = await conn.fetch(query, *params)
        
        scored = []
        for cand in candidates:
            score = 0
            match_details = []
            
            if source['thickness_mm'] and cand['thickness_mm']:
                diff = abs(float(source['thickness_mm']) - float(cand['thickness_mm']))
                if diff <= 0.02:
                    score += 30
                    match_details.append("thickness: exact")
                elif diff <= 0.05:
                    score += 25
                    match_details.append("thickness: close")
                elif diff <= 0.10:
                    score += 15
                    match_details.append("thickness: acceptable")
                else:
                    score += 5
                    match_details.append("thickness: different")
            
            if source['hardness_shore'] and cand['hardness_shore']:
                diff = abs(float(source['hardness_shore']) - float(cand['hardness_shore']))
                if diff <= 1:
                    score += 25
                    match_details.append("hardness: exact")
                elif diff <= 3:
                    score += 20
                    match_details.append("hardness: close")
                elif diff <= 5:
                    score += 12
                    match_details.append("hardness: acceptable")
                elif diff <= 8:
                    score += 5
                    match_details.append("hardness: different")
                else:
                    match_details.append("hardness: mismatch")
            else:
                score += 10
                match_details.append("hardness: unknown")
            
            source_surface = (source['surface_type'] or '').lower().strip()
            cand_surface = (cand['surface_type'] or '').lower().strip()
            
            if source_surface and cand_surface:
                if source_surface == cand_surface:
                    score += 25
                    match_details.append("surface: match")
                else:
                    score -= 10
                    match_details.append(f"surface: MISMATCH ({source_surface} vs {cand_surface})")
            else:
                score += 10
                match_details.append("surface: unknown")
            
            source_imaging = (source['imaging_type'] or '').lower().strip()
            cand_imaging = (cand['imaging_type'] or '').lower().strip()
            
            if source_imaging and cand_imaging:
                if source_imaging == cand_imaging:
                    score += 20
                    match_details.append("imaging: match")
                else:
                    score -= 5
                    match_details.append(f"imaging: MISMATCH")
            else:
                score += 8
                match_details.append("imaging: unknown")
            
            final_score = max(0, min(100, score))
            
            if final_score >= 90:
                quality = "Excellent"
            elif final_score >= 75:
                quality = "Good"
            elif final_score >= 60:
                quality = "Fair"
            else:
                quality = "Poor"
            
            scored.append({
                "id": str(cand['id']),
                "display_name": cand['display_name'],
                "supplier_name": cand['supplier_name'],
                "thickness_mm": float(cand['thickness_mm']) if cand['thickness_mm'] else None,
                "hardness_shore": float(cand['hardness_shore']) if cand['hardness_shore'] else None,
                "imaging_type": cand['imaging_type'],
                "surface_type": cand['surface_type'],
                "min_lpi": cand['min_lpi'],
                "max_lpi": cand['max_lpi'],
                "flat_top_technology": cand['flat_top_technology'],
                "led_optimized": cand['led_optimized'] or False,
                "engineered_surface": cand['engineered_surface'] or False,
                "product_sheet_url": cand['product_sheet_url'],
                "match_score": final_score,
                "similarity_score": final_score,
                "match_quality": quality,
                "match_details": match_details
            })
        
        scored.sort(key=lambda x: x['match_score'], reverse=True)
        good_matches = [s for s in scored if s['match_score'] >= 50]
        
        return {
            "source_plate": {
                "id": str(source['id']),
                "display_name": source['display_name'],
                "supplier_name": source['supplier_name'],
                "thickness_mm": float(source['thickness_mm']) if source['thickness_mm'] else None,
                "hardness_shore": float(source['hardness_shore']) if source['hardness_shore'] else None,
                "imaging_type": source['imaging_type'],
                "surface_type": source['surface_type']
            },
            "equivalents": good_matches[:limit],
            "total_candidates": len(scored),
            "good_matches_count": len(good_matches)
        }

# ============================================================
# EXPOSURE CALCULATOR
# ============================================================
@app.post("/api/exposure/calculate")
async def calculate_exposure(data: ExposureCalculateRequest):
    async with pool.acquire() as conn:
        plate = await conn.fetchrow("SELECT * FROM plates WHERE id = $1", uuid.UUID(data.plate_id))
        
        if not plate:
            raise HTTPException(status_code=404, detail="Plate not found")
        
        main_energy_min = plate.get('main_exposure_energy_min_mj_cm2') or 800
        main_energy_max = plate.get('main_exposure_energy_max_mj_cm2') or 1200
        back_energy_min = plate.get('back_exposure_energy_min_mj_cm2') or 150
        back_energy_max = plate.get('back_exposure_energy_max_mj_cm2') or 250
        
        main_energy = (float(main_energy_min) + float(main_energy_max)) / 2
        back_energy = (float(back_energy_min) + float(back_energy_max)) / 2
        
        main_time_s = int(main_energy / data.current_intensity_mw_cm2)
        back_time_s = int(back_energy / data.current_intensity_mw_cm2)
        
        main_time_s = max(30, min(main_time_s, 1800))
        back_time_s = max(10, min(back_time_s, 600))
        
        return {
            "plate": {
                "id": str(plate['id']),
                "display_name": plate['display_name'],
                "thickness_mm": float(plate['thickness_mm']) if plate['thickness_mm'] else None
            },
            "input": {
                "intensity_mw_cm2": data.current_intensity_mw_cm2
            },
            "exposure": {
                "main_exposure_time_s": main_time_s,
                "back_exposure_time_s": back_time_s,
                "main_exposure_formatted": f"{main_time_s // 60}m {main_time_s % 60}s",
                "back_exposure_formatted": f"{back_time_s // 60}m {back_time_s % 60}s"
            }
        }

# ============================================================
# USER FAVORITE PLATES
# ============================================================
@app.get("/api/me/plates")
async def get_my_plates(user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ufp.id, ufp.plate_id, p.display_name, p.thickness_mm, p.hardness_shore,
                   p.imaging_type, p.surface_type, s.name as supplier_name,
                   p.product_sheet_url, p.flat_top_technology, p.led_optimized
            FROM user_favorite_plates ufp
            JOIN plates p ON ufp.plate_id = p.id
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE ufp.user_id = $1
            ORDER BY s.name, p.display_name
        """, user['id'])
        
        result = []
        for r in rows:
            result.append({
                "id": str(r['id']),
                "plate_id": str(r['plate_id']),
                "display_name": r['display_name'],
                "thickness_mm": float(r['thickness_mm']) if r['thickness_mm'] else None,
                "hardness_shore": float(r['hardness_shore']) if r['hardness_shore'] else None,
                "imaging_type": r['imaging_type'],
                "surface_type": r['surface_type'],
                "supplier_name": r['supplier_name'],
                "process_type": r['imaging_type'],
                "product_sheet_url": r['product_sheet_url'],
                "flat_top_technology": r['flat_top_technology'],
                "led_optimized": r['led_optimized'] or False
            })
        return result

@app.post("/api/me/plates/{plate_id}")
async def add_favorite_plate(plate_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM user_favorite_plates WHERE user_id = $1", user['id'])
        max_limit = user.get('max_plates') or 5
        if count >= max_limit:
            raise HTTPException(status_code=403, detail=f"Plate limit reached ({count}/{max_limit}). Upgrade to premium for unlimited plates.")
        
        await conn.execute("""
            INSERT INTO user_favorite_plates (user_id, plate_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, plate_id) DO NOTHING
        """, user['id'], uuid.UUID(plate_id))
        return {"message": "Plate added to favorites"}

@app.delete("/api/me/plates/{plate_id}")
async def remove_favorite_plate(plate_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM user_favorite_plates WHERE user_id = $1 AND plate_id = $2", user['id'], uuid.UUID(plate_id))
        return {"message": "Plate removed from favorites"}

# ============================================================
# USER EQUIPMENT
# ============================================================
@app.get("/api/me/equipment")
async def get_my_equipment(user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ue.id, ue.nickname, ue.lamp_install_date, ue.location, ue.is_primary,
                   ue.last_intensity_measurement,
                   em.model_name, em.uv_source_type, em.nominal_intensity_mw_cm2
            FROM user_equipment ue
            JOIN equipment_models em ON ue.equipment_model_id = em.id
            WHERE ue.user_id = $1 AND ue.is_active = TRUE
            ORDER BY ue.is_primary DESC, ue.nickname
        """, user['id'])
        
        result = []
        for r in rows:
            lamp_age_months = None
            if r['lamp_install_date']:
                lamp_age_months = (date.today() - r['lamp_install_date']).days // 30
            
            result.append({
                "id": str(r['id']),
                "nickname": r['nickname'],
                "location": r['location'],
                "lamp_install_date": str(r['lamp_install_date']) if r['lamp_install_date'] else None,
                "lamp_age_months": lamp_age_months,
                "is_primary": r['is_primary'],
                "last_intensity_measurement": float(r['last_intensity_measurement']) if r['last_intensity_measurement'] else None,
                "model_name": r['model_name'],
                "uv_source_type": r['uv_source_type'],
                "nominal_intensity_mw_cm2": float(r['nominal_intensity_mw_cm2']) if r['nominal_intensity_mw_cm2'] else None
            })
        return result

@app.post("/api/me/equipment")
async def add_my_equipment(data: EquipmentAdd, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM user_equipment WHERE user_id = $1 AND is_active = TRUE", user['id'])
        max_limit = user.get('max_equipment') or 2
        if count >= max_limit:
            raise HTTPException(status_code=403, detail=f"Equipment limit reached ({count}/{max_limit}). Upgrade to premium.")
        
        equipment_id = uuid.uuid4()
        lamp_date = None
        if data.lamp_install_date:
            try:
                lamp_date = datetime.strptime(data.lamp_install_date, "%Y-%m-%d").date()
            except:
                pass
        
        await conn.execute("""
            INSERT INTO user_equipment (id, user_id, equipment_model_id, nickname, location, lamp_install_date, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        """, equipment_id, user['id'], uuid.UUID(data.equipment_model_id), data.nickname, data.location, lamp_date)
        
        return {"id": str(equipment_id), "message": "Equipment added"}

@app.delete("/api/me/equipment/{equipment_id}")
async def remove_my_equipment(equipment_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE user_equipment SET is_active = FALSE WHERE id = $1 AND user_id = $2", uuid.UUID(equipment_id), user['id'])
        return {"message": "Equipment removed"}

# ============================================================
# EQUIPMENT MODELS
# ============================================================
@app.get("/api/equipment/models")
async def get_equipment_models_alt():
    return await get_equipment_models()

@app.get("/api/equipment-models")
async def get_equipment_models():
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT em.*, s.name as supplier_name
            FROM equipment_models em
            LEFT JOIN suppliers s ON em.supplier_id = s.id
            ORDER BY s.name, em.model_name
        """)
        result = []
        for r in rows:
            result.append({
                "id": str(r['id']),
                "model_name": r['model_name'],
                "equipment_type": r['equipment_type'],
                "technology": r['technology'],
                "uv_source_type": r['uv_source_type'],
                "nominal_intensity_mw_cm2": float(r['nominal_intensity_mw_cm2']) if r['nominal_intensity_mw_cm2'] else None,
                "supplier_name": r['supplier_name'],
                "supplier_id": str(r['supplier_id']) if r['supplier_id'] else None
            })
        return result

# ============================================================
# SAVED RECIPES
# ============================================================
@app.get("/api/me/recipes")
async def get_my_recipes(user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT sr.*, p.display_name as plate_name, s.name as supplier_name,
                   ue.nickname as equipment_nickname
            FROM saved_recipes sr
            JOIN plates p ON sr.plate_id = p.id
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            LEFT JOIN user_equipment ue ON sr.equipment_id = ue.id
            WHERE sr.user_id = $1 AND sr.is_active = TRUE
            ORDER BY sr.created_at DESC
        """, user['id'])
        
        result = []
        for r in rows:
            result.append({
                "id": str(r['id']),
                "name": r['name'],
                "customer_name": r['customer_name'],
                "job_number": r['job_number'],
                "plate_id": str(r['plate_id']),
                "plate_name": r['plate_name'],
                "supplier_name": r['supplier_name'],
                "equipment_id": str(r['equipment_id']) if r['equipment_id'] else None,
                "equipment_nickname": r['equipment_nickname'],
                "main_exposure_time_s": r['main_exposure_time_s'],
                "back_exposure_time_s": r['back_exposure_time_s'],
                "notes": r['notes'],
                "created_at": str(r['created_at']) if r['created_at'] else None
            })
        return result

@app.post("/api/me/recipes")
async def save_recipe(data: RecipeSave, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM saved_recipes WHERE user_id = $1 AND is_active = TRUE", user['id'])
        max_limit = user.get('max_recipes') or 5
        if count >= max_limit:
            raise HTTPException(status_code=403, detail=f"Recipe limit reached ({count}/{max_limit}). Upgrade to premium.")
        
        recipe_id = uuid.uuid4()
        equipment_uuid = uuid.UUID(data.equipment_id) if data.equipment_id else None
        
        await conn.execute("""
            INSERT INTO saved_recipes (id, user_id, name, plate_id, equipment_id, main_exposure_time_s, back_exposure_time_s, customer_name, job_number, notes, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        """, recipe_id, user['id'], data.name, uuid.UUID(data.plate_id), equipment_uuid,
            data.main_exposure_time_s, data.back_exposure_time_s, data.customer_name, data.job_number, data.notes)
        
        return {"id": str(recipe_id), "message": "Recipe saved"}

@app.delete("/api/me/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE saved_recipes SET is_active = FALSE WHERE id = $1 AND user_id = $2", uuid.UUID(recipe_id), user['id'])
        return {"message": "Recipe deleted"}

# ============================================================
# SCREENING PATTERNS (Premium feature)
# ============================================================
@app.get("/api/screening-patterns")
async def get_screening_patterns(user: dict = Depends(get_current_user_optional)):
    async with pool.acquire() as conn:
        is_premium = user and user.get('user_tier') == 'premium'
        rows = await conn.fetch("SELECT * FROM screening_patterns ORDER BY is_premium, name")
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['locked'] = r.get('is_premium', False) and not is_premium
            result.append(r)
        return result

# ============================================================
# REFERENCE CARDS (Premium feature)
# ============================================================
@app.get("/api/reference-cards")
async def get_reference_cards(category: Optional[str] = None, user: dict = Depends(get_current_user_optional)):
    async with pool.acquire() as conn:
        is_premium = user and user.get('user_tier') == 'premium'
        if category:
            rows = await conn.fetch("SELECT * FROM quick_reference_cards WHERE category = $1 ORDER BY display_order, title", category)
        else:
            rows = await conn.fetch("SELECT * FROM quick_reference_cards ORDER BY display_order, title")
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['locked'] = r.get('is_premium', False) and not is_premium
            if r['locked']:
                r['content'] = "Premium content - upgrade to view"
            result.append(r)
        return result

# ============================================================
# USER LIMITS
# ============================================================
@app.get("/api/me/limits")
async def get_my_limits(user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        counts = await conn.fetchrow("""
            SELECT 
                (SELECT COUNT(*) FROM user_favorite_plates WHERE user_id = $1) as plates_count,
                (SELECT COUNT(*) FROM user_equipment WHERE user_id = $1 AND is_active = TRUE) as equipment_count,
                (SELECT COUNT(*) FROM saved_recipes WHERE user_id = $1 AND is_active = TRUE) as recipes_count
        """, user['id'])
        
        max_p = user.get('max_plates') or 5
        max_e = user.get('max_equipment') or 2
        max_r = user.get('max_recipes') or 5
        
        return {
            "tier": user.get('user_tier') or 'free',
            "usage": {
                "plates": {"used": counts['plates_count'], "limit": max_p, "remaining": max(0, max_p - counts['plates_count'])},
                "equipment": {"used": counts['equipment_count'], "limit": max_e, "remaining": max(0, max_e - counts['equipment_count'])},
                "recipes": {"used": counts['recipes_count'], "limit": max_r, "remaining": max(0, max_r - counts['recipes_count'])}
            }
        }

# ============================================================
# FILTER OPTIONS ENDPOINT
# ============================================================
@app.get("/api/filters")
async def get_filter_options():
    async with pool.acquire() as conn:
        suppliers = await conn.fetch("SELECT DISTINCT name FROM suppliers ORDER BY name")
        process_types = await conn.fetch("SELECT DISTINCT process_type FROM plate_families WHERE process_type IS NOT NULL ORDER BY process_type")
        surface_types = await conn.fetch("SELECT DISTINCT surface_type FROM plates WHERE surface_type IS NOT NULL ORDER BY surface_type")
        
        ink_types = await conn.fetch("""
            SELECT DISTINCT unnest(ink_compatibility) as ink_type 
            FROM plates 
            WHERE ink_compatibility IS NOT NULL
            ORDER BY ink_type
        """)
        
        applications = await conn.fetch("""
            SELECT DISTINCT unnest(applications) as application 
            FROM plates 
            WHERE applications IS NOT NULL
            ORDER BY application
        """)
        
        thickness_range = await conn.fetchrow("""
            SELECT MIN(thickness_mm) as min_thickness, MAX(thickness_mm) as max_thickness
            FROM plates WHERE thickness_mm IS NOT NULL
        """)
        
        return {
            "suppliers": [r["name"] for r in suppliers],
            "process_types": [r["process_type"] for r in process_types],
            "surface_types": [r["surface_type"] for r in surface_types],
            "ink_types": [r["ink_type"] for r in ink_types],
            "applications": [r["application"] for r in applications],
            "thickness_range": {
                "min": float(thickness_range["min_thickness"]) if thickness_range["min_thickness"] else 0.76,
                "max": float(thickness_range["max_thickness"]) if thickness_range["max_thickness"] else 7.00
            }
        }
