# ============================================================================
# FlexoPlate IQ - Intelligence Engine API Endpoints
# ============================================================================
# Add these endpoints to your existing main.py backend
# ============================================================================

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import statistics

# Create router for intelligence endpoints
intelligence_router = APIRouter(prefix="/api/intelligence", tags=["Intelligence Engine"])

# Reference to database pool - set this in your main.py after creating the pool
# Example: intelligence_router.pool = pool
_pool = None

def get_pool(request: Request = None):
    """Get database pool - tries multiple patterns"""
    global _pool
    if _pool:
        return _pool
    if request:
        # Try app.state.pool (common FastAPI pattern)
        if hasattr(request.app.state, 'pool'):
            return request.app.state.pool
        # Try app.pool
        if hasattr(request.app, 'pool'):
            return request.app.pool
    # Try to import from main module
    try:
        import main
        if hasattr(main, 'pool'):
            return main.pool
    except:
        pass
    raise HTTPException(500, "Database pool not available")

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class PlateKey(BaseModel):
    supplier: str
    family: str
    thickness_mm: float

class PressConditions(BaseModel):
    substrate_category: Optional[str] = None
    press_type: Optional[str] = None
    screen_ruling_lpi: Optional[int] = None
    ink_type: Optional[str] = None

class SimilarPlatesRequest(BaseModel):
    plate: PlateKey
    conditions: Optional[PressConditions] = None
    top_n: int = Field(default=5, ge=1, le=20)

class PredictTVIRequest(BaseModel):
    plate: PlateKey
    conditions: Optional[PressConditions] = None

class RecommendationRequest(BaseModel):
    current_plate: PlateKey
    target_plate: PlateKey
    conditions: Optional[PressConditions] = None

# ============================================================================
# DATABASE QUERIES
# ============================================================================

async def get_plate_stats(pool, supplier: str, family: str, thickness: float) -> Optional[Dict]:
    """Get statistics for a plate type from fingerprint data"""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT * FROM plate_fingerprint_stats
            WHERE plate_supplier = $1 AND plate_family = $2 AND plate_thickness_mm = $3
        """, supplier, family, thickness)
        
        if row:
            return dict(row)
        return None


async def get_similar_plates_db(pool, supplier: str, family: str, thickness: float, limit: int = 5) -> List[Dict]:
    """Find plates with similar dot gain behavior"""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM find_similar_plates($1, $2, $3, $4)
        """, supplier, family, thickness, limit)
        return [dict(r) for r in rows]


async def get_predicted_tvi_db(
    pool, 
    supplier: str, 
    family: str, 
    thickness: float,
    substrate: Optional[str] = None,
    press_type: Optional[str] = None
) -> Dict[str, List]:
    """Get aggregated TVI curves for a plate"""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM get_predicted_tvi($1, $2, $3, $4, $5)
        """, supplier, family, thickness, substrate, press_type)
        
        curves = {'C': [], 'M': [], 'Y': [], 'K': []}
        for row in rows:
            channel = row['channel']
            curves[channel].append({
                'nominal': row['nominal_pct'],
                'measured': float(row['avg_measured']),
                'stddev': float(row['stddev_measured']),
                'samples': row['sample_count']
            })
        return curves


async def get_suggested_dgc_db(
    pool,
    supplier: str,
    family: str,
    thickness: float,
    substrate: Optional[str] = None,
    press_type: Optional[str] = None
) -> Dict[str, Dict[int, float]]:
    """Get aggregated DGC curves"""
    async with pool.acquire() as conn:
        query = """
            SELECT d.channel, d.input_pct, AVG(d.output_pct) as avg_output
            FROM dgc_curves d
            JOIN fingerprints f ON d.fingerprint_id = f.id
            WHERE f.plate_supplier = $1 AND f.plate_family = $2 AND f.plate_thickness_mm = $3
        """
        params = [supplier, family, thickness]
        
        if substrate:
            query += f" AND f.substrate_category = ${len(params) + 1}"
            params.append(substrate)
        if press_type:
            query += f" AND f.press_type = ${len(params) + 1}"
            params.append(press_type)
            
        query += " GROUP BY d.channel, d.input_pct ORDER BY d.channel, d.input_pct"
        
        rows = await conn.fetch(query, *params)
        
        dgc = {}
        for row in rows:
            channel = row['channel']
            if channel not in dgc:
                dgc[channel] = {}
            dgc[channel][row['input_pct']] = round(float(row['avg_output']), 1)
        
        return dgc


# ============================================================================
# API ENDPOINTS
# ============================================================================

@intelligence_router.get("/summary")
async def get_intelligence_summary(request: Request):
    """Get summary of fingerprint database"""
    pool = get_pool(request)
    
    async with pool.acquire() as conn:
        # Count fingerprints
        fp_count = await conn.fetchval("SELECT COUNT(*) FROM fingerprints")
        
        # Count plate types
        plate_types = await conn.fetchval("""
            SELECT COUNT(DISTINCT (plate_supplier, plate_family, plate_thickness_mm)) 
            FROM fingerprints
        """)
        
        # Get substrate distribution
        substrates = await conn.fetch("""
            SELECT substrate_category, COUNT(*) as count 
            FROM fingerprints 
            GROUP BY substrate_category 
            ORDER BY count DESC
        """)
        
        # Get press type distribution
        press_types = await conn.fetch("""
            SELECT press_type, COUNT(*) as count 
            FROM fingerprints 
            GROUP BY press_type 
            ORDER BY count DESC
        """)
        
    return {
        "fingerprint_count": fp_count,
        "plate_types": plate_types,
        "substrates": [{"category": r["substrate_category"], "count": r["count"]} for r in substrates],
        "press_types": [{"type": r["press_type"], "count": r["count"]} for r in press_types]
    }


@intelligence_router.get("/plates")
async def list_fingerprinted_plates(request: Request):
    """List all plate types with fingerprint statistics"""
    pool = get_pool(request)
    
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT 
                plate_supplier as supplier,
                plate_family as family,
                plate_thickness_mm as thickness_mm,
                sample_count,
                avg_dg_c,
                avg_dg_m,
                avg_dg_y,
                avg_dg_k,
                stddev_dg_c
            FROM plate_fingerprint_stats
            ORDER BY plate_supplier, plate_family, plate_thickness_mm
        """)
    
    return {
        "plates": [dict(r) for r in rows],
        "total": len(rows)
    }


@intelligence_router.get("/plates/{supplier}/{family}/{thickness}/stats")
async def get_plate_statistics(
    request: Request,
    supplier: str,
    family: str,
    thickness: float
):
    """Get detailed statistics for a specific plate"""
    pool = get_pool(request)
    stats = await get_plate_stats(pool, supplier, family, thickness)
    
    if not stats:
        raise HTTPException(404, f"No fingerprint data for {supplier} {family} {thickness}mm")
    
    return stats


@intelligence_router.post("/similar")
async def find_similar_plates(request: Request, body: SimilarPlatesRequest):
    """Find plates with similar TVI behavior"""
    pool = get_pool(request)
    
    similar = await get_similar_plates_db(
        pool,
        body.plate.supplier,
        body.plate.family,
        body.plate.thickness_mm,
        body.top_n
    )
    
    if not similar:
        stats = await get_plate_stats(pool, body.plate.supplier, body.plate.family, body.plate.thickness_mm)
        if not stats:
            raise HTTPException(404, f"Plate not found: {body.plate.supplier} {body.plate.family} {body.plate.thickness_mm}mm")
        return {"similar_plates": [], "message": "No similar plates found"}
    
    return {
        "query_plate": f"{body.plate.supplier}|{body.plate.family}|{body.plate.thickness_mm}",
        "similar_plates": similar
    }


@intelligence_router.post("/predict-tvi")
async def predict_tvi_curves(request: Request, body: PredictTVIRequest):
    """Predict TVI curves for a plate under specific conditions"""
    pool = get_pool(request)
    
    substrate = body.conditions.substrate_category if body.conditions else None
    press_type = body.conditions.press_type if body.conditions else None
    
    curves = await get_predicted_tvi_db(
        pool,
        body.plate.supplier,
        body.plate.family,
        body.plate.thickness_mm,
        substrate,
        press_type
    )
    
    if not any(curves.values()):
        raise HTTPException(404, f"Insufficient data for {body.plate.supplier} {body.plate.family} {body.plate.thickness_mm}mm")
    
    # Convert to chart-friendly format
    chart_data = []
    for channel in ['C', 'M', 'Y', 'K']:
        for point in curves.get(channel, []):
            chart_data.append({
                "channel": channel,
                "nominal": point['nominal'],
                "measured": point['measured'],
                "dot_gain": round(point['measured'] - point['nominal'], 1)
            })
    
    return {
        "plate": f"{body.plate.supplier}|{body.plate.family}|{body.plate.thickness_mm}",
        "conditions": body.conditions.dict() if body.conditions else {},
        "curves": curves,
        "chart_data": chart_data
    }


@intelligence_router.post("/suggest-dgc")
async def suggest_dgc_curves(request: Request, body: PredictTVIRequest):
    """Suggest starting DGC (compensation) curves"""
    pool = get_pool(request)
    
    substrate = body.conditions.substrate_category if body.conditions else None
    press_type = body.conditions.press_type if body.conditions else None
    
    dgc = await get_suggested_dgc_db(
        pool,
        body.plate.supplier,
        body.plate.family,
        body.plate.thickness_mm,
        substrate,
        press_type
    )
    
    if not dgc:
        raise HTTPException(404, "Insufficient data for DGC suggestion")
    
    return {
        "plate": f"{body.plate.supplier}|{body.plate.family}|{body.plate.thickness_mm}",
        "conditions": body.conditions.dict() if body.conditions else {},
        "dgc_curves": dgc
    }


@intelligence_router.post("/recommend")
async def get_plate_recommendation(request: Request, body: RecommendationRequest):
    """Get comprehensive plate switching recommendation"""
    pool = get_pool(request)
    
    # Get stats for both plates
    current_stats = await get_plate_stats(
        pool, 
        body.current_plate.supplier, 
        body.current_plate.family, 
        body.current_plate.thickness_mm
    )
    target_stats = await get_plate_stats(
        pool,
        body.target_plate.supplier,
        body.target_plate.family,
        body.target_plate.thickness_mm
    )
    
    if not current_stats or not target_stats:
        raise HTTPException(404, "Insufficient data for one or both plates")
    
    # Calculate expected differences
    expected_diff = {}
    for channel in ['c', 'm', 'y', 'k']:
        current_dg = current_stats.get(f'avg_dg_{channel}')
        target_dg = target_stats.get(f'avg_dg_{channel}')
        if current_dg is not None and target_dg is not None:
            expected_diff[channel.upper()] = round(float(target_dg) - float(current_dg), 2)
    
    # Calculate confidence
    sample_count = int(target_stats.get('sample_count', 0))
    if sample_count >= 10:
        confidence = 'high'
    elif sample_count >= 5:
        confidence = 'medium'
    else:
        confidence = 'low'
    
    # Generate recommendations
    avg_diff = sum(abs(v) for v in expected_diff.values()) / len(expected_diff) if expected_diff else 0
    
    recommendations = []
    if avg_diff < 1.0:
        recommendations.append("Very similar dot gain behavior. Minimal curve adjustment needed.")
    elif avg_diff < 2.5:
        recommendations.append("Moderate difference. Use suggested DGC as starting point.")
    else:
        recommendations.append("Significant difference. Full re-fingerprinting recommended.")
    
    # Get predicted TVI for target
    substrate = body.conditions.substrate_category if body.conditions else None
    press_type = body.conditions.press_type if body.conditions else None
    
    predicted_tvi = await get_predicted_tvi_db(
        pool,
        body.target_plate.supplier,
        body.target_plate.family,
        body.target_plate.thickness_mm,
        substrate,
        press_type
    )
    
    suggested_dgc = await get_suggested_dgc_db(
        pool,
        body.target_plate.supplier,
        body.target_plate.family,
        body.target_plate.thickness_mm,
        substrate,
        press_type
    )
    
    return {
        "current_plate": f"{body.current_plate.supplier}|{body.current_plate.family}|{body.current_plate.thickness_mm}",
        "target_plate": f"{body.target_plate.supplier}|{body.target_plate.family}|{body.target_plate.thickness_mm}",
        "conditions": body.conditions.dict() if body.conditions else {},
        "current_plate_stats": current_stats,
        "target_plate_stats": target_stats,
        "expected_dg_change": expected_diff,
        "confidence": confidence,
        "confidence_note": f"Based on {sample_count} fingerprints for target plate",
        "recommendations": recommendations,
        "predicted_tvi_curves": predicted_tvi,
        "suggested_dgc_curves": suggested_dgc
    }


# ============================================================================
# VISUALIZATION PAGE (Optional - can also be in frontend)
# ============================================================================

from fastapi.responses import HTMLResponse

@intelligence_router.get("/visualization", response_class=HTMLResponse)
async def visualization_page(request: Request):
    """Interactive TVI curve visualization dashboard"""
    pool = get_pool(request)
    
    # Get plate list for dropdown
    async with pool.acquire() as conn:
        plates = await conn.fetch("""
            SELECT DISTINCT plate_supplier, plate_family, plate_thickness_mm
            FROM fingerprints
            ORDER BY plate_supplier, plate_family, plate_thickness_mm
        """)
    
    plate_options = ""
    for p in plates:
        key = f"{p['plate_supplier']}|{p['plate_family']}|{p['plate_thickness_mm']}"
        label = f"{p['plate_supplier']} {p['plate_family']} {p['plate_thickness_mm']}mm"
        plate_options += f'<option value="{key}">{label}</option>\n'
    
    # Return the HTML dashboard (same as standalone version)
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>FlexoPlate IQ - Intelligence Engine</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            * {{ box-sizing: border-box; }}
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0;
            }}
            .header {{ text-align: center; margin-bottom: 30px; }}
            h1 {{ margin: 0; color: #60a5fa; }}
            .controls {{
                display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px; margin-bottom: 30px; padding: 20px;
                background: #1e293b; border-radius: 12px;
            }}
            select, button {{
                padding: 10px; border-radius: 6px; border: 1px solid #475569;
                background: #0f172a; color: #e2e8f0;
            }}
            button {{ background: linear-gradient(135deg, #3b82f6, #2563eb); border: none; cursor: pointer; }}
            .charts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
            .chart-box {{ background: #1e293b; padding: 20px; border-radius: 12px; }}
            .stats {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 15px; }}
            .stat {{ background: #0f172a; padding: 15px; border-radius: 8px; text-align: center; }}
            .stat-value {{ font-size: 24px; font-weight: bold; }}
            .cyan {{ color: #22d3ee; }}
            .magenta {{ color: #f472b6; }}
            .yellow {{ color: #fbbf24; }}
            .black {{ color: #94a3b8; }}
            label {{ font-size: 12px; color: #94a3b8; text-transform: uppercase; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 TVI Curve Visualization</h1>
            <p style="color: #94a3b8;">FlexoPlate IQ Intelligence Engine</p>
        </div>
        
        <div class="controls">
            <div><label>Primary Plate</label><select id="plate1">{plate_options}</select></div>
            <div><label>Compare With</label><select id="plate2"><option value="">-- Select --</option>{plate_options}</select></div>
            <div><label>Substrate</label><select id="substrate">
                <option value="">All</option>
                <option value="OPP film">OPP Film</option>
                <option value="PE film">PE Film</option>
                <option value="paper">Paper</option>
            </select></div>
            <div><label>&nbsp;</label><button onclick="updateCharts()">Update Charts</button></div>
        </div>
        
        <div class="charts">
            <div class="chart-box">
                <h3 style="color: #60a5fa;">Primary Plate TVI</h3>
                <canvas id="chart1"></canvas>
                <div class="stats" id="stats1"></div>
            </div>
            <div class="chart-box">
                <h3 style="color: #60a5fa;">Comparison Plate TVI</h3>
                <canvas id="chart2"></canvas>
                <div class="stats" id="stats2"></div>
            </div>
        </div>
        
        <script>
            let chart1 = null, chart2 = null;
            const colors = {{ C: '#22d3ee', M: '#f472b6', Y: '#fbbf24', K: '#94a3b8' }};
            
            async function fetchTVI(plateKey, substrate) {{
                const [supplier, family, thickness] = plateKey.split('|');
                const body = {{
                    plate: {{ supplier, family, thickness_mm: parseFloat(thickness) }},
                    conditions: substrate ? {{ substrate_category: substrate }} : {{}}
                }};
                const resp = await fetch('/api/intelligence/predict-tvi', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify(body)
                }});
                return resp.ok ? resp.json() : null;
            }}
            
            function createChart(canvasId, data) {{
                const ctx = document.getElementById(canvasId).getContext('2d');
                const datasets = [];
                for (const ch of ['C', 'M', 'Y', 'K']) {{
                    if (data.curves[ch]?.length) {{
                        datasets.push({{
                            label: ch,
                            data: data.curves[ch].map(p => ({{ x: p.nominal, y: p.measured }})),
                            borderColor: colors[ch],
                            fill: false,
                            tension: 0.3
                        }});
                    }}
                }}
                datasets.push({{ label: 'Linear', data: [{{x:0,y:0}},{{x:100,y:100}}], borderColor: '#475569', borderDash: [5,5], fill: false, pointRadius: 0 }});
                return new Chart(ctx, {{
                    type: 'line',
                    data: {{ datasets }},
                    options: {{
                        plugins: {{ legend: {{ labels: {{ color: '#94a3b8' }} }} }},
                        scales: {{
                            x: {{ type: 'linear', min: 0, max: 100, title: {{ display: true, text: 'Nominal %', color: '#94a3b8' }}, grid: {{ color: '#334155' }}, ticks: {{ color: '#94a3b8' }} }},
                            y: {{ type: 'linear', min: 0, max: 100, title: {{ display: true, text: 'Measured %', color: '#94a3b8' }}, grid: {{ color: '#334155' }}, ticks: {{ color: '#94a3b8' }} }}
                        }}
                    }}
                }});
            }}
            
            function showStats(containerId, data) {{
                const el = document.getElementById(containerId);
                if (!data?.curves) {{ el.innerHTML = '<p style="color:#64748b">No data</p>'; return; }}
                const dg = {{}};
                for (const ch of ['C','M','Y','K']) {{
                    const pt = data.curves[ch]?.find(p => p.nominal === 50);
                    dg[ch] = pt ? (pt.measured - 50).toFixed(1) : 'N/A';
                }}
                el.innerHTML = `
                    <div class="stat"><div class="stat-value cyan">${{dg.C}}%</div><div>Cyan DG@50</div></div>
                    <div class="stat"><div class="stat-value magenta">${{dg.M}}%</div><div>Magenta DG@50</div></div>
                    <div class="stat"><div class="stat-value yellow">${{dg.Y}}%</div><div>Yellow DG@50</div></div>
                    <div class="stat"><div class="stat-value black">${{dg.K}}%</div><div>Black DG@50</div></div>
                `;
            }}
            
            async function updateCharts() {{
                if (chart1) chart1.destroy();
                if (chart2) chart2.destroy();
                
                const plate1 = document.getElementById('plate1').value;
                const plate2 = document.getElementById('plate2').value;
                const substrate = document.getElementById('substrate').value;
                
                const data1 = await fetchTVI(plate1, substrate);
                if (data1) {{ chart1 = createChart('chart1', data1); showStats('stats1', data1); }}
                
                if (plate2) {{
                    const data2 = await fetchTVI(plate2, substrate);
                    if (data2) {{ chart2 = createChart('chart2', data2); showStats('stats2', data2); }}
                }} else {{
                    document.getElementById('stats2').innerHTML = '<p style="color:#64748b">Select comparison plate</p>';
                }}
            }}
            
            updateCharts();
        </script>
    </body>
    </html>
    """
    return html


# ============================================================================
# HOW TO ADD TO YOUR EXISTING MAIN.PY:
# ============================================================================
# 
# 1. Copy this file (intelligence_routes.py) to your backend folder
#
# 2. Add these imports at the top of main.py:
#    from intelligence_routes import intelligence_router, _pool
#
# 3. After creating your pool, set the reference:
#    @app.on_event("startup")
#    async def startup():
#        global pool
#        pool = await asyncpg.create_pool(DATABASE_URL, ...)
#        # ADD THIS LINE:
#        import intelligence_routes
#        intelligence_routes._pool = pool
#
# 4. Add the router after creating FastAPI instance:
#    app.include_router(intelligence_router)
#
# That's it! The endpoints will be available at /api/intelligence/*
#
# Test: https://your-app.railway.app/api/intelligence/summary
# ============================================================================
