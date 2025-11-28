# FlexoPlate IQ - Complete Backend with Premium Features
# ======================================================
# Replace your entire backend/main.py with this file
# Version 3.0 - Added screening patterns, reference cards, user limits

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

# JWT handling
try:
    from jose import JWTError, jwt
except ImportError:
    from python_jose import JWTError, jwt

# ============================================================
# APP SETUP
# ============================================================
app = FastAPI(title="FlexoPlate IQ API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# CONFIGURATION
# ============================================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:IefWwmDCTTlBrxmERJvpPLZvozhkjaNE@shortline.proxy.rlwy.net:39738/railway")
SECRET_KEY = os.getenv("SECRET_KEY", "flexoplate-iq-secret-key-change-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)
pool: asyncpg.Pool = None

# ============================================================
# DATABASE CONNECTION
# ============================================================
@app.on_event("startup")
async def startup():
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)

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

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    phone: Optional[str] = None

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

class PlateNoteAdd(BaseModel):
    plate_id: str
    note: str
    note_type: Optional[str] = "general"
    customer_name: Optional[str] = None
    job_number: Optional[str] = None

# ============================================================
# AUTH HELPER FUNCTIONS (using bcrypt directly)
# ============================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Returns user dict if authenticated, None if guest."""
    if not credentials:
        return None
    
    user_id = decode_token(credentials.credentials)
    if not user_id:
        return None
    
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, first_name, last_name, user_tier, max_plates, max_equipment, max_recipes FROM users WHERE id = $1",
            uuid.UUID(user_id)
        )
        if row:
            return {
                "id": row['id'],
                "email": row['email'],
                "first_name": row['first_name'],
                "last_name": row['last_name'],
                "user_tier": row['user_tier'] or 'free',
                "max_plates": row['max_plates'] or 5,
                "max_equipment": row['max_equipment'] or 2,
                "max_recipes": row['max_recipes'] or 5
            }
    return None

async def get_current_user_required(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Returns user dict, raises 401 if not authenticated."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, first_name, last_name, user_tier, max_plates, max_equipment, max_recipes FROM users WHERE id = $1",
            uuid.UUID(user_id)
        )
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        
        return {
            "id": row['id'],
            "email": row['email'],
            "first_name": row['first_name'],
            "last_name": row['last_name'],
            "user_tier": row['user_tier'] or 'free',
            "max_plates": row['max_plates'] or 5,
            "max_equipment": row['max_equipment'] or 2,
            "max_recipes": row['max_recipes'] or 5
        }

# ============================================================
# LIMIT CHECKING HELPER
# ============================================================
async def check_user_limit(conn, user_id: uuid.UUID, limit_type: str) -> tuple:
    """Check if user has reached their limit. Returns (can_add, current_count, max_limit)"""
    user_data = await conn.fetchrow(
        "SELECT max_plates, max_equipment, max_recipes FROM users WHERE id = $1",
        user_id
    )
    
    if limit_type == "plates":
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_favorite_plates WHERE user_id = $1",
            user_id
        )
        max_limit = user_data['max_plates'] or 5
    elif limit_type == "equipment":
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_equipment WHERE user_id = $1 AND is_active = TRUE",
            user_id
        )
        max_limit = user_data['max_equipment'] or 2
    elif limit_type == "recipes":
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM saved_recipes WHERE user_id = $1 AND is_active = TRUE",
            user_id
        )
        max_limit = user_data['max_recipes'] or 5
    else:
        return True, 0, 999
    
    return count < max_limit, count, max_limit

# ============================================================
# ROOT ENDPOINT
# ============================================================
@app.get("/")
async def root():
    return {"status": "ok", "service": "FlexoPlate IQ API", "version": "3.0.0"}

# ============================================================
# AUTH ENDPOINTS
# ============================================================
@app.post("/api/auth/register")
async def register(data: UserRegister):
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1",
            data.email.lower()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        user_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO users (id, email, password_hash, first_name, last_name, job_title, user_tier, max_plates, max_equipment, max_recipes)
            VALUES ($1, $2, $3, $4, $5, $6, 'free', 5, 2, 5)
        """, user_id, data.email.lower(), hash_password(data.password),
            data.first_name, data.last_name, data.job_title)
        
        if data.company_name:
            company_id = uuid.uuid4()
            await conn.execute("""
                INSERT INTO companies (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING
            """, company_id, data.company_name)
            
            actual_company_id = await conn.fetchval(
                "SELECT id FROM companies WHERE name = $1", data.company_name
            )
            await conn.execute("""
                INSERT INTO user_companies (user_id, company_id, is_primary)
                VALUES ($1, $2, TRUE)
            """, user_id, actual_company_id)
        
        token = create_access_token(str(user_id))
        
        return {
            "token": token,
            "user": {
                "id": str(user_id),
                "email": data.email.lower(),
                "first_name": data.first_name,
                "last_name": data.last_name,
                "user_tier": "free"
            }
        }

@app.post("/api/auth/login")
async def login(data: UserLogin):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, password_hash, first_name, last_name, user_tier FROM users WHERE email = $1",
            data.email.lower()
        )
        
        if not row or not verify_password(data.password, row['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        token = create_access_token(str(row['id']))
        
        return {
            "token": token,
            "user": {
                "id": str(row['id']),
                "email": row['email'],
                "first_name": row['first_name'],
                "last_name": row['last_name'],
                "user_tier": row['user_tier'] or 'free'
            }
        }

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user_required)):
    return {
        "id": str(user['id']),
        "email": user['email'],
        "first_name": user['first_name'],
        "last_name": user['last_name'],
        "user_tier": user['user_tier']
    }

# ============================================================
# USER LIMITS & TIER ENDPOINTS
# ============================================================
@app.get("/api/me/limits")
async def get_my_limits(user: dict = Depends(get_current_user_required)):
    """Get user's current usage vs limits."""
    async with pool.acquire() as conn:
        counts = await conn.fetchrow("""
            SELECT 
                (SELECT COUNT(*) FROM user_favorite_plates WHERE user_id = $1) as plates_count,
                (SELECT COUNT(*) FROM user_equipment WHERE user_id = $1 AND is_active = TRUE) as equipment_count,
                (SELECT COUNT(*) FROM saved_recipes WHERE user_id = $1 AND is_active = TRUE) as recipes_count
        """, user['id'])
        
        return {
            "tier": user['user_tier'],
            "usage": {
                "plates": {
                    "used": counts['plates_count'],
                    "limit": user['max_plates'],
                    "remaining": max(0, user['max_plates'] - counts['plates_count'])
                },
                "equipment": {
                    "used": counts['equipment_count'],
                    "limit": user['max_equipment'],
                    "remaining": max(0, user['max_equipment'] - counts['equipment_count'])
                },
                "recipes": {
                    "used": counts['recipes_count'],
                    "limit": user['max_recipes'],
                    "remaining": max(0, user['max_recipes'] - counts['recipes_count'])
                }
            }
        }

@app.get("/api/me/tier")
async def get_my_tier(user: dict = Depends(get_current_user_required)):
    """Get user's tier information."""
    tier = user['user_tier']
    return {
        "tier": tier,
        "is_premium": tier == 'premium',
        "features": {
            "max_plates": user['max_plates'],
            "max_equipment": user['max_equipment'],
            "max_recipes": user['max_recipes'],
            "screening_patterns": tier == 'premium',
            "premium_reference_cards": tier == 'premium',
            "export_reports": tier == 'premium',
            "qc_logging": tier == 'premium'
        }
    }

# ============================================================
# SCREENING PATTERNS ENDPOINTS
# ============================================================
@app.get("/api/screening-patterns")
async def get_screening_patterns(
    pattern_type: Optional[str] = None,
    process_type: Optional[str] = None,
    user: dict = Depends(get_current_user_optional)
):
    """Get screening patterns. Premium patterns marked as locked for free users."""
    async with pool.acquire() as conn:
        is_premium = user and user.get('user_tier') == 'premium'
        
        conditions = ["1=1"]
        params = []
        idx = 1
        
        if pattern_type:
            conditions.append(f"pattern_type = ${idx}")
            params.append(pattern_type)
            idx += 1
        
        if process_type:
            conditions.append(f"${idx} = ANY(compatible_process_types)")
            params.append(process_type)
            idx += 1
        
        query = f"""
            SELECT * FROM screening_patterns
            WHERE {' AND '.join(conditions)}
            ORDER BY is_premium, name
        """
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['locked'] = r.get('is_premium', False) and not is_premium
            result.append(r)
        
        return result

@app.get("/api/screening-patterns/{pattern_id}")
async def get_screening_pattern(pattern_id: str, user: dict = Depends(get_current_user_optional)):
    """Get single screening pattern details."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM screening_patterns WHERE id = $1",
            uuid.UUID(pattern_id)
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="Pattern not found")
        
        result = dict(row)
        result['id'] = str(result['id'])
        
        is_premium = user and user.get('user_tier') == 'premium'
        if result.get('is_premium') and not is_premium:
            raise HTTPException(status_code=403, detail="Premium feature - upgrade to access full details")
        
        return result

# ============================================================
# QUICK REFERENCE CARDS ENDPOINTS
# ============================================================
@app.get("/api/reference-cards")
async def get_reference_cards(
    category: Optional[str] = None,
    user: dict = Depends(get_current_user_optional)
):
    """Get quick reference cards."""
    async with pool.acquire() as conn:
        is_premium = user and user.get('user_tier') == 'premium'
        
        conditions = ["1=1"]
        params = []
        idx = 1
        
        if category:
            conditions.append(f"category = ${idx}")
            params.append(category)
            idx += 1
        
        query = f"""
            SELECT * FROM quick_reference_cards
            WHERE {' AND '.join(conditions)}
            ORDER BY display_order, title
        """
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['locked'] = r.get('is_premium', False) and not is_premium
            if r['locked']:
                r['content'] = "Premium content - upgrade to view"
            result.append(r)
        
        return result

@app.get("/api/reference-cards/categories")
async def get_reference_card_categories():
    """Get list of reference card categories."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT category, COUNT(*) as count
            FROM quick_reference_cards
            GROUP BY category
            ORDER BY category
        """)
        return [{"category": r['category'], "count": r['count']} for r in rows]

# ============================================================
# USER PLATE NOTES ENDPOINTS
# ============================================================
@app.get("/api/me/notes")
async def get_my_notes(
    plate_id: Optional[str] = None,
    user: dict = Depends(get_current_user_required)
):
    """Get user's plate notes."""
    async with pool.acquire() as conn:
        if plate_id:
            rows = await conn.fetch("""
                SELECT upn.*, p.display_name as plate_name
                FROM user_plate_notes upn
                JOIN plates p ON upn.plate_id = p.id
                WHERE upn.user_id = $1 AND upn.plate_id = $2
                ORDER BY upn.is_pinned DESC, upn.updated_at DESC
            """, user['id'], uuid.UUID(plate_id))
        else:
            rows = await conn.fetch("""
                SELECT upn.*, p.display_name as plate_name
                FROM user_plate_notes upn
                JOIN plates p ON upn.plate_id = p.id
                WHERE upn.user_id = $1
                ORDER BY upn.is_pinned DESC, upn.updated_at DESC
                LIMIT 50
            """, user['id'])
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['user_id'] = str(r['user_id'])
            r['plate_id'] = str(r['plate_id'])
            result.append(r)
        
        return result

@app.post("/api/me/notes")
async def add_plate_note(data: PlateNoteAdd, user: dict = Depends(get_current_user_required)):
    """Add note to a plate."""
    async with pool.acquire() as conn:
        note_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO user_plate_notes (id, user_id, plate_id, note, note_type, customer_name, job_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """, note_id, user['id'], uuid.UUID(data.plate_id), data.note, 
            data.note_type, data.customer_name, data.job_number)
        
        return {"id": str(note_id), "message": "Note saved"}

@app.delete("/api/me/notes/{note_id}")
async def delete_plate_note(note_id: str, user: dict = Depends(get_current_user_required)):
    """Delete a plate note."""
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM user_plate_notes WHERE id = $1 AND user_id = $2",
            uuid.UUID(note_id), user['id']
        )
        return {"message": "Note deleted"}

# ============================================================
# SUPPLIERS ENDPOINT
# ============================================================
@app.get("/api/suppliers")
async def get_suppliers():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name FROM suppliers ORDER BY name")
        return [{"id": str(r['id']), "name": r['name']} for r in rows]

# ============================================================
# PLATES ENDPOINTS
# ============================================================
@app.get("/api/plates")
async def get_plates(
    supplier: Optional[str] = None,
    thickness: Optional[float] = None,
    process_type: Optional[str] = None,
    limit: int = 100
):
    async with pool.acquire() as conn:
        conditions = ["1=1"]
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
        
        query = f"""
            SELECT p.id, p.display_name, p.thickness_mm, p.hardness_shore_a as hardness_shore,
                   pf.family_name, pf.process_type, pf.imaging_type, pf.surface_type,
                   s.name as supplier_name
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
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            result.append(r)
        return result

@app.get("/api/plates/{plate_id}")
async def get_plate(plate_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT p.*, pf.family_name, pf.process_type, pf.imaging_type, pf.surface_type,
                   s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE p.id = $1
        """, uuid.UUID(plate_id))
        
        if not row:
            raise HTTPException(status_code=404, detail="Plate not found")
        
        result = dict(row)
        result['id'] = str(result['id'])
        result['plate_family_id'] = str(result['plate_family_id'])
        return result

# ============================================================
# EQUIVALENCY ENDPOINT
# ============================================================
@app.get("/api/equivalency/find")
async def find_equivalent_plates(
    plate_id: str,
    target_supplier: Optional[str] = None,
    limit: int = 10
):
    async with pool.acquire() as conn:
        source = await conn.fetchrow("""
            SELECT p.*, pf.process_type, pf.imaging_type, pf.surface_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE p.id = $1
        """, uuid.UUID(plate_id))
        
        if not source:
            raise HTTPException(status_code=404, detail="Source plate not found")
        
        conditions = ["p.id != $1", "ABS(p.thickness_mm - $2) < 0.1"]
        params = [uuid.UUID(plate_id), source['thickness_mm']]
        idx = 3
        
        if target_supplier:
            conditions.append(f"s.name = ${idx}")
            params.append(target_supplier)
            idx += 1
        
        query = f"""
            SELECT p.id, p.display_name, p.thickness_mm, p.hardness_shore_a,
                   pf.process_type, pf.imaging_type, pf.surface_type,
                   s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE {' AND '.join(conditions)}
        """
        
        candidates = await conn.fetch(query, *params)
        
        scored = []
        for cand in candidates:
            score = 50
            
            if source['hardness_shore_a'] and cand['hardness_shore_a']:
                hardness_diff = abs(source['hardness_shore_a'] - cand['hardness_shore_a'])
                if hardness_diff <= 2:
                    score += 30
                elif hardness_diff <= 5:
                    score += 20
                elif hardness_diff <= 10:
                    score += 10
            
            if source['process_type'] == cand['process_type']:
                score += 25
            
            if source['imaging_type'] == cand['imaging_type']:
                score += 15
            
            if source['surface_type'] == cand['surface_type']:
                score += 10
            
            scored.append({
                "id": str(cand['id']),
                "display_name": cand['display_name'],
                "supplier_name": cand['supplier_name'],
                "thickness_mm": float(cand['thickness_mm']),
                "hardness_shore": cand['hardness_shore_a'],
                "process_type": cand['process_type'],
                "match_score": min(score, 100),
                "similarity_score": min(score, 100)
            })
        
        scored.sort(key=lambda x: x['match_score'], reverse=True)
        
        return {
            "source_plate": {
                "id": str(source['id']),
                "display_name": source['display_name'],
                "supplier_name": source['supplier_name'],
                "thickness_mm": float(source['thickness_mm'])
            },
            "equivalents": scored[:limit]
        }

# ============================================================
# EXPOSURE CALCULATOR ENDPOINT
# ============================================================
@app.post("/api/exposure/calculate")
async def calculate_exposure(data: ExposureCalculateRequest):
    async with pool.acquire() as conn:
        plate = await conn.fetchrow("""
            SELECT p.*, pf.process_type
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            WHERE p.id = $1
        """, uuid.UUID(data.plate_id))
        
        if not plate:
            raise HTTPException(status_code=404, detail="Plate not found")
        
        base_energy = plate.get('main_exposure_energy_mj_cm2') or 1000
        back_energy = plate.get('back_exposure_energy_mj_cm2') or 200
        
        main_time_s = int((base_energy / data.current_intensity_mw_cm2) * 1000 / 60)
        back_time_s = int((back_energy / data.current_intensity_mw_cm2) * 1000 / 60)
        
        main_time_s = max(30, min(main_time_s, 1800))
        back_time_s = max(10, min(back_time_s, 600))
        
        return {
            "plate": {
                "id": str(plate['id']),
                "display_name": plate['display_name'],
                "thickness_mm": float(plate['thickness_mm'])
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
# USER FAVORITE PLATES ENDPOINTS
# ============================================================
@app.get("/api/me/plates")
async def get_my_plates(user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ufp.id, ufp.plate_id, p.display_name, p.thickness_mm, 
                   p.hardness_shore_a as hardness_shore,
                   pf.process_type, pf.surface_type, s.name as supplier_name
            FROM user_favorite_plates ufp
            JOIN plates p ON ufp.plate_id = p.id
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE ufp.user_id = $1
            ORDER BY s.name, p.display_name
        """, user['id'])
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['plate_id'] = str(r['plate_id'])
            result.append(r)
        return result

@app.post("/api/me/plates/{plate_id}")
async def add_favorite_plate(plate_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        can_add, current, limit = await check_user_limit(conn, user['id'], 'plates')
        if not can_add:
            raise HTTPException(
                status_code=403,
                detail=f"Plate limit reached ({current}/{limit}). Upgrade to premium for unlimited plates."
            )
        
        await conn.execute("""
            INSERT INTO user_favorite_plates (user_id, plate_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, plate_id) DO NOTHING
        """, user['id'], uuid.UUID(plate_id))
        return {"message": "Plate added to favorites"}

@app.delete("/api/me/plates/{plate_id}")
async def remove_favorite_plate(plate_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM user_favorite_plates WHERE user_id = $1 AND plate_id = $2",
            user['id'], uuid.UUID(plate_id)
        )
        return {"message": "Plate removed from favorites"}

# ============================================================
# USER EQUIPMENT ENDPOINTS
# ============================================================
@app.get("/api/me/equipment")
async def get_my_equipment(user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ue.id, ue.nickname, ue.lamp_install_date, ue.location, ue.is_primary,
                   em.model_name, em.uv_source_type, em.nominal_intensity_mw_cm2,
                   es.name as supplier_name
            FROM user_equipment ue
            JOIN equipment_models em ON ue.equipment_model_id = em.id
            JOIN equipment_suppliers es ON em.supplier_id = es.id
            WHERE ue.user_id = $1 AND ue.is_active = TRUE
            ORDER BY ue.is_primary DESC, ue.nickname
        """, user['id'])
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            
            if r.get('lamp_install_date'):
                age_days = (date.today() - r['lamp_install_date']).days
                r['lamp_age_months'] = age_days // 30
            else:
                r['lamp_age_months'] = None
            
            result.append(r)
        return result

@app.post("/api/me/equipment")
async def add_my_equipment(data: EquipmentAdd, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        can_add, current, limit = await check_user_limit(conn, user['id'], 'equipment')
        if not can_add:
            raise HTTPException(
                status_code=403,
                detail=f"Equipment limit reached ({current}/{limit}). Upgrade to premium for unlimited equipment."
            )
        
        equipment_id = uuid.uuid4()
        
        lamp_date = None
        if data.lamp_install_date:
            try:
                lamp_date = datetime.strptime(data.lamp_install_date, "%Y-%m-%d").date()
            except:
                pass
        
        await conn.execute("""
            INSERT INTO user_equipment (id, user_id, equipment_model_id, nickname, lamp_install_date, location, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        """, equipment_id, user['id'], uuid.UUID(data.equipment_model_id),
            data.nickname, lamp_date, data.location)
        
        return {"id": str(equipment_id), "message": "Equipment added"}

@app.delete("/api/me/equipment/{equipment_id}")
async def remove_my_equipment(equipment_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE user_equipment SET is_active = FALSE WHERE id = $1 AND user_id = $2",
            uuid.UUID(equipment_id), user['id']
        )
        return {"message": "Equipment removed"}

# ============================================================
# EQUIPMENT MODELS ENDPOINT
# ============================================================
@app.get("/api/equipment-models")
async def get_equipment_models(supplier: Optional[str] = None):
    async with pool.acquire() as conn:
        if supplier:
            rows = await conn.fetch("""
                SELECT em.*, es.name as supplier_name
                FROM equipment_models em
                JOIN equipment_suppliers es ON em.supplier_id = es.id
                WHERE es.name = $1
                ORDER BY em.model_name
            """, supplier)
        else:
            rows = await conn.fetch("""
                SELECT em.*, es.name as supplier_name
                FROM equipment_models em
                JOIN equipment_suppliers es ON em.supplier_id = es.id
                ORDER BY es.name, em.model_name
            """)
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['supplier_id'] = str(r['supplier_id'])
            result.append(r)
        return result

@app.get("/api/equipment-suppliers")
async def get_equipment_suppliers():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name FROM equipment_suppliers ORDER BY name")
        return [{"id": str(r['id']), "name": r['name']} for r in rows]

# ============================================================
# USER RECIPES ENDPOINTS
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
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['user_id'] = str(r['user_id'])
            r['plate_id'] = str(r['plate_id'])
            if r.get('equipment_id'):
                r['equipment_id'] = str(r['equipment_id'])
            result.append(r)
        return result

@app.post("/api/me/recipes")
async def save_recipe(data: RecipeSave, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        can_add, current, limit = await check_user_limit(conn, user['id'], 'recipes')
        if not can_add:
            raise HTTPException(
                status_code=403,
                detail=f"Recipe limit reached ({current}/{limit}). Upgrade to premium for unlimited recipes."
            )
        
        recipe_id = uuid.uuid4()
        equipment_uuid = uuid.UUID(data.equipment_id) if data.equipment_id else None
        
        await conn.execute("""
            INSERT INTO saved_recipes (id, user_id, name, plate_id, equipment_id,
                main_exposure_time_s, back_exposure_time_s, customer_name, job_number, notes, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        """, recipe_id, user['id'], data.name, uuid.UUID(data.plate_id), equipment_uuid,
            data.main_exposure_time_s, data.back_exposure_time_s,
            data.customer_name, data.job_number, data.notes)
        
        return {"id": str(recipe_id), "message": "Recipe saved"}

@app.delete("/api/me/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: dict = Depends(get_current_user_required)):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE saved_recipes SET is_active = FALSE WHERE id = $1 AND user_id = $2",
            uuid.UUID(recipe_id), user['id']
        )
        return {"message": "Recipe deleted"}
