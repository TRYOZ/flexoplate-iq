# FlexoPlate IQ - Complete Backend with Authentication
# =====================================================
# Replace your entire backend/main.py with this file

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import asyncpg
import uuid
import os

# ============================================================
# APP SETUP
# ============================================================
app = FastAPI(title="FlexoPlate IQ API", version="2.0.0")

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

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
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

# ============================================================
# AUTH HELPER FUNCTIONS
# ============================================================
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

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
            "SELECT * FROM users WHERE id = $1 AND is_active = TRUE",
            uuid.UUID(user_id)
        )
        return dict(row) if row else None

async def get_current_user_required(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Requires authenticated user, raises 401 if not."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE id = $1 AND is_active = TRUE",
            uuid.UUID(user_id)
        )
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        return dict(row)

# ============================================================
# HEALTH CHECK
# ============================================================
@app.get("/")
async def root():
    return {"status": "ok", "service": "FlexoPlate IQ API", "version": "2.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

# ============================================================
# AUTHENTICATION ROUTES
# ============================================================
@app.post("/api/auth/register")
async def register(data: UserRegister):
    """Register new user account."""
    async with pool.acquire() as conn:
        # Check existing
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", data.email.lower()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create user
        user_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO users (id, email, password_hash, first_name, last_name, job_title)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, user_id, data.email.lower(), hash_password(data.password),
            data.first_name, data.last_name, data.job_title)
        
        # Create company if provided
        company = None
        if data.company_name:
            company_id = uuid.uuid4()
            await conn.execute(
                "INSERT INTO companies (id, name) VALUES ($1, $2)",
                company_id, data.company_name
            )
            await conn.execute(
                "INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, 'owner')",
                user_id, company_id
            )
            company = {"id": str(company_id), "name": data.company_name}
        
        return {
            "access_token": create_access_token(str(user_id)),
            "token_type": "bearer",
            "user": {
                "id": str(user_id),
                "email": data.email.lower(),
                "first_name": data.first_name,
                "last_name": data.last_name,
                "company": company
            }
        }

@app.post("/api/auth/login")
async def login(data: UserLogin):
    """Login with email/password."""
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
            data.email.lower()
        )
        if not user or not verify_password(data.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Update last login
        await conn.execute(
            "UPDATE users SET last_login_at = $1 WHERE id = $2",
            datetime.utcnow(), user['id']
        )
        
        # Get company
        company_row = await conn.fetchrow("""
            SELECT c.* FROM companies c
            JOIN user_companies uc ON c.id = uc.company_id
            WHERE uc.user_id = $1 LIMIT 1
        """, user['id'])
        
        company = {"id": str(company_row['id']), "name": company_row['name']} if company_row else None
        
        return {
            "access_token": create_access_token(str(user['id'])),
            "token_type": "bearer",
            "user": {
                "id": str(user['id']),
                "email": user['email'],
                "first_name": user['first_name'],
                "last_name": user['last_name'],
                "company": company
            }
        }

@app.get("/api/auth/me")
async def get_profile(user: dict = Depends(get_current_user_required)):
    """Get current user profile."""
    async with pool.acquire() as conn:
        company_row = await conn.fetchrow("""
            SELECT c.* FROM companies c
            JOIN user_companies uc ON c.id = uc.company_id
            WHERE uc.user_id = $1 LIMIT 1
        """, user['id'])
        
        return {
            "id": str(user['id']),
            "email": user['email'],
            "first_name": user['first_name'],
            "last_name": user['last_name'],
            "job_title": user.get('job_title'),
            "company": {"id": str(company_row['id']), "name": company_row['name']} if company_row else None
        }

# ============================================================
# SUPPLIERS ROUTES
# ============================================================
@app.get("/api/suppliers")
async def get_suppliers():
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, country, is_plate_supplier
            FROM suppliers
            WHERE is_plate_supplier = TRUE
            ORDER BY name
        """)
        return [{"id": str(r['id']), "name": r['name'], "country": r['country']} for r in rows]

# ============================================================
# PLATES ROUTES
# ============================================================
@app.get("/api/plates")
async def get_plates(
    supplier_id: Optional[str] = None,
    thickness: Optional[float] = None,
    limit: int = Query(default=100, le=500)
):
    async with pool.acquire() as conn:
        query = """
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE 1=1
        """
        params = []
        idx = 1
        
        if supplier_id:
            query += f" AND pf.supplier_id = ${idx}"
            params.append(uuid.UUID(supplier_id))
            idx += 1
        
        if thickness:
            query += f" AND ABS(p.thickness_mm - ${idx}) < 0.05"
            params.append(thickness)
            idx += 1
        
        query += f" ORDER BY s.name, p.display_name LIMIT ${idx}"
        params.append(limit)
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for r in rows:
            item = dict(r)
            item['id'] = str(item['id'])
            item['plate_family_id'] = str(item['plate_family_id'])
            result.append(item)
        
        return result

@app.get("/api/plates/{plate_id}")
async def get_plate(plate_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
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
# PLATE EQUIVALENCY ROUTES
# ============================================================
@app.get("/api/equivalency/find")
async def find_equivalent_plates(
    plate_id: str,
    limit: int = Query(default=10, le=50)
):
    """Find equivalent plates based on weighted scoring."""
    async with pool.acquire() as conn:
        # Get source plate
        source = await conn.fetchrow("""
            SELECT p.*, pf.process_type, s.name as supplier_name, s.id as supplier_id
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE p.id = $1
        """, uuid.UUID(plate_id))
        
        if not source:
            raise HTTPException(status_code=404, detail="Plate not found")
        
        # Find candidates (same thickness, different supplier)
        rows = await conn.fetch("""
            SELECT p.*, pf.process_type, pf.family_name, s.name as supplier_name, s.id as supplier_id
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE ABS(p.thickness_mm - $1) < 0.05
              AND s.id != $2
              AND p.id != $3
        """, float(source['thickness_mm']), source['supplier_id'], source['id'])
        
        # Score candidates
        results = []
        for r in rows:
            score = 100.0
            
            # Hardness match (weight: 30%)
            if source['hardness_shore'] and r['hardness_shore']:
                hardness_diff = abs(float(source['hardness_shore']) - float(r['hardness_shore']))
                score -= min(30, hardness_diff * 2)
            
            # Process type match (weight: 25%)
            if source['process_type'] != r['process_type']:
                score -= 25
            
            # Imaging type match (weight: 15%)
            if source['imaging_type'] and r['imaging_type']:
                if source['imaging_type'] != r['imaging_type']:
                    score -= 15
            
            # Surface type match (weight: 10%)
            if source.get('surface_type') and r.get('surface_type'):
                if source['surface_type'] != r['surface_type']:
                    score -= 10
            
            results.append({
                "id": str(r['id']),
                "display_name": r['display_name'],
                "family_name": r['family_name'],
                "supplier_name": r['supplier_name'],
                "thickness_mm": float(r['thickness_mm']),
                "hardness_shore": float(r['hardness_shore']) if r['hardness_shore'] else None,
                "process_type": r['process_type'],
                "imaging_type": r['imaging_type'],
                "match_score": round(max(0, score), 1)
            })
        
        # Sort by score
        results.sort(key=lambda x: x['match_score'], reverse=True)
        
        return {
            "source_plate": {
                "id": str(source['id']),
                "display_name": source['display_name'],
                "supplier_name": source['supplier_name'],
                "thickness_mm": float(source['thickness_mm']),
                "hardness_shore": float(source['hardness_shore']) if source['hardness_shore'] else None,
                "process_type": source['process_type']
            },
            "equivalents": results[:limit]
        }

# ============================================================
# EQUIPMENT ROUTES
# ============================================================
@app.get("/api/equipment/models")
async def get_equipment_models():
    """Get all available equipment models."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT em.*, s.name as supplier_name
            FROM equipment_models em
            JOIN suppliers s ON em.supplier_id = s.id
            ORDER BY s.name, em.model_name
        """)
        
        result = []
        for r in rows:
            item = dict(r)
            item['id'] = str(item['id'])
            item['supplier_id'] = str(item['supplier_id'])
            result.append(item)
        
        return result

# ============================================================
# EXPOSURE CALCULATOR ROUTES
# ============================================================
@app.post("/api/exposure/calculate")
async def calculate_exposure(data: ExposureCalculateRequest):
    """Calculate exposure times based on plate and intensity."""
    async with pool.acquire() as conn:
        plate = await conn.fetchrow("""
            SELECT p.*, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE p.id = $1
        """, uuid.UUID(data.plate_id))
        
        if not plate:
            raise HTTPException(status_code=404, detail="Plate not found")
        
        # Get energy values
        main_min = float(plate['main_exposure_energy_min_mj_cm2'] or 10000)
        main_max = float(plate['main_exposure_energy_max_mj_cm2'] or 15000)
        back_min = float(plate['back_exposure_energy_min_mj_cm2'] or 4000)
        back_max = float(plate['back_exposure_energy_max_mj_cm2'] or 6000)
        post_energy = float(plate['post_exposure_energy_mj_cm2'] or 15000)
        detack_energy = float(plate['detack_energy_mj_cm2'] or 2000)
        
        intensity = data.current_intensity_mw_cm2
        
        # Calculate times (Energy / Intensity = Time in seconds)
        main_time = ((main_min + main_max) / 2) / intensity
        main_time_min = main_min / intensity
        main_time_max = main_max / intensity
        
        back_time = ((back_min + back_max) / 2) / intensity
        back_time_min = back_min / intensity
        back_time_max = back_max / intensity
        
        post_time = post_energy / intensity
        detack_time = detack_energy / intensity
        
        return {
            "plate": {
                "name": plate['display_name'],
                "thickness_mm": float(plate['thickness_mm']),
                "supplier": plate['supplier_name'],
                "process_type": plate['process_type']
            },
            "exposure": {
                "main_exposure_time_s": round(main_time),
                "main_exposure_range_s": [round(main_time_min), round(main_time_max)],
                "back_exposure_time_s": round(back_time),
                "back_exposure_range_s": [round(back_time_min), round(back_time_max)],
                "post_exposure_time_s": round(post_time),
                "detack_time_s": round(detack_time)
            },
            "notes": [
                f"Main exposure based on {int(main_min)}-{int(main_max)} mJ/cm²",
                f"Calculated at {intensity} mW/cm² measured intensity"
            ]
        }

# ============================================================
# MY EQUIPMENT ROUTES (Authenticated)
# ============================================================
@app.get("/api/me/equipment")
async def get_my_equipment(user: dict = Depends(get_current_user_required)):
    """Get user's saved equipment."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ue.*, em.model_name, em.uv_source_type, em.nominal_intensity_mw_cm2,
                   s.name as supplier_name
            FROM user_equipment ue
            LEFT JOIN equipment_models em ON ue.equipment_model_id = em.id
            LEFT JOIN suppliers s ON em.supplier_id = s.id
            WHERE ue.user_id = $1 AND ue.is_active = TRUE
            ORDER BY ue.is_primary DESC, ue.nickname
        """, user['id'])
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            r['user_id'] = str(r['user_id'])
            if r.get('equipment_model_id'):
                r['equipment_model_id'] = str(r['equipment_model_id'])
            # Calculate lamp age in months
            if r.get('lamp_install_date'):
                days = (datetime.now().date() - r['lamp_install_date']).days
                r['lamp_age_months'] = round(days / 30)
            result.append(r)
        
        return result

@app.post("/api/me/equipment")
async def add_my_equipment(data: EquipmentAdd, user: dict = Depends(get_current_user_required)):
    """Add equipment to user's saved list."""
    async with pool.acquire() as conn:
        equipment_id = uuid.uuid4()
        lamp_date = None
        if data.lamp_install_date:
            lamp_date = datetime.strptime(data.lamp_install_date, "%Y-%m-%d").date()
        
        await conn.execute("""
            INSERT INTO user_equipment (id, user_id, equipment_model_id, nickname, lamp_install_date, location)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, equipment_id, user['id'], uuid.UUID(data.equipment_model_id), 
            data.nickname, lamp_date, data.location)
        
        return {"id": str(equipment_id), "message": "Equipment added"}

@app.put("/api/me/equipment/{equipment_id}/lamp-date")
async def update_lamp_date(equipment_id: str, lamp_install_date: str, user: dict = Depends(get_current_user_required)):
    """Update lamp install date for equipment."""
    async with pool.acquire() as conn:
        lamp_date = datetime.strptime(lamp_install_date, "%Y-%m-%d").date()
        await conn.execute("""
            UPDATE user_equipment SET lamp_install_date = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND user_id = $3
        """, lamp_date, uuid.UUID(equipment_id), user['id'])
        return {"message": "Lamp date updated"}

@app.delete("/api/me/equipment/{equipment_id}")
async def remove_my_equipment(equipment_id: str, user: dict = Depends(get_current_user_required)):
    """Remove equipment from user's list."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE user_equipment SET is_active = FALSE
            WHERE id = $1 AND user_id = $2
        """, uuid.UUID(equipment_id), user['id'])
        return {"message": "Equipment removed"}

# ============================================================
# MY PLATES (FAVORITES) ROUTES
# ============================================================
@app.get("/api/me/plates")
async def get_my_plates(user: dict = Depends(get_current_user_required)):
    """Get user's favorite plates."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ufp.*, p.display_name, p.thickness_mm, p.hardness_shore,
                   pf.family_name, pf.process_type, s.name as supplier_name
            FROM user_favorite_plates ufp
            JOIN plates p ON ufp.plate_id = p.id
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE ufp.user_id = $1
            ORDER BY ufp.created_at DESC
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
    """Add plate to favorites."""
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO user_favorite_plates (user_id, plate_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, plate_id) DO NOTHING
        """, user['id'], uuid.UUID(plate_id))
        return {"message": "Plate added to favorites"}

@app.delete("/api/me/plates/{plate_id}")
async def remove_favorite_plate(plate_id: str, user: dict = Depends(get_current_user_required)):
    """Remove plate from favorites."""
    async with pool.acquire() as conn:
        await conn.execute("""
            DELETE FROM user_favorite_plates WHERE user_id = $1 AND plate_id = $2
        """, user['id'], uuid.UUID(plate_id))
        return {"message": "Plate removed from favorites"}

# ============================================================
# SAVED RECIPES ROUTES
# ============================================================
@app.get("/api/me/recipes")
async def get_my_recipes(customer: Optional[str] = None, user: dict = Depends(get_current_user_required)):
    """Get user's saved recipes."""
    async with pool.acquire() as conn:
        if customer:
            rows = await conn.fetch("""
                SELECT sr.*, p.display_name as plate_name, s.name as supplier_name
                FROM saved_recipes sr
                LEFT JOIN plates p ON sr.plate_id = p.id
                LEFT JOIN plate_families pf ON p.plate_family_id = pf.id
                LEFT JOIN suppliers s ON pf.supplier_id = s.id
                WHERE sr.user_id = $1 AND sr.is_active = TRUE AND sr.customer_name ILIKE $2
                ORDER BY sr.last_used_at DESC NULLS LAST
            """, user['id'], f"%{customer}%")
        else:
            rows = await conn.fetch("""
                SELECT sr.*, p.display_name as plate_name, s.name as supplier_name
                FROM saved_recipes sr
                LEFT JOIN plates p ON sr.plate_id = p.id
                LEFT JOIN plate_families pf ON p.plate_family_id = pf.id
                LEFT JOIN suppliers s ON pf.supplier_id = s.id
                WHERE sr.user_id = $1 AND sr.is_active = TRUE
                ORDER BY sr.last_used_at DESC NULLS LAST
            """, user['id'])
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            if r.get('plate_id'): r['plate_id'] = str(r['plate_id'])
            result.append(r)
        return result

@app.post("/api/me/recipes")
async def save_recipe(data: RecipeSave, user: dict = Depends(get_current_user_required)):
    """Save a new recipe."""
    async with pool.acquire() as conn:
        recipe_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO saved_recipes (
                id, user_id, name, plate_id, customer_name, job_number,
                main_exposure_time_s, back_exposure_time_s, notes, equipment_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """, recipe_id, user['id'], data.name, uuid.UUID(data.plate_id),
            data.customer_name, data.job_number, data.main_exposure_time_s,
            data.back_exposure_time_s, data.notes,
            uuid.UUID(data.equipment_id) if data.equipment_id else None)
        
        return {"id": str(recipe_id), "message": "Recipe saved"}

@app.delete("/api/me/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: dict = Depends(get_current_user_required)):
    """Delete a saved recipe."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE saved_recipes SET is_active = FALSE
            WHERE id = $1 AND user_id = $2
        """, uuid.UUID(recipe_id), user['id'])
        return {"message": "Recipe deleted"}

# ============================================================
# REVERSE LOOKUP
# ============================================================
@app.get("/api/plates/recommend")
async def recommend_plates(
    application: Optional[str] = None,
    thickness: Optional[float] = None,
    process_type: Optional[str] = None,
    ink_type: Optional[str] = None,
    user: dict = Depends(get_current_user_optional)
):
    """Reverse lookup: Find plates matching requirements."""
    async with pool.acquire() as conn:
        conditions = ["1=1"]
        params = []
        idx = 1
        
        if thickness:
            conditions.append(f"ABS(p.thickness_mm - ${idx}) < 0.1")
            params.append(thickness)
            idx += 1
        
        if process_type:
            conditions.append(f"pf.process_type ILIKE ${idx}")
            params.append(f"%{process_type}%")
            idx += 1
        
        query = f"""
            SELECT p.*, pf.family_name, pf.process_type, s.name as supplier_name
            FROM plates p
            JOIN plate_families pf ON p.plate_family_id = pf.id
            JOIN suppliers s ON pf.supplier_id = s.id
            WHERE {' AND '.join(conditions)}
            ORDER BY s.name, p.display_name
            LIMIT 20
        """
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for row in rows:
            r = dict(row)
            r['id'] = str(r['id'])
            result.append(r)
        return result
