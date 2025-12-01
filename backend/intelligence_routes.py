# ============================================================================
# FlexoPlate IQ - Intelligence Engine API Endpoints (FIXED VERSION)
# ============================================================================
# Fixed: Queries tables directly instead of using PostgreSQL functions
# ============================================================================

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import statistics

# Create router for intelligence endpoints
intelligence_router = APIRouter(prefix="/api/intelligence", tags=["Intelligence Engine"])

# Reference to database pool - set this in your main.py after creating the pool
_pool = None

def get_pool(request: Request = None):
    """Get database pool - tries multiple patterns"""
    global _pool
    if _pool:
        return _pool
    if request:
        if hasattr(request.app.state, 'pool'):
            return request.app.state.pool
        if hasattr(request.app, 'pool'):
            return request.app.pool
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
# DATABASE QUERIES (Direct queries, no PostgreSQL functions needed)
# ============================================================================

async def get_predicted_tvi_direct(
    pool, 
    supplier: str, 
    family: str, 
    thickness: float,
    substrate: Optional[str] = None,
    press_type: Optional[str] = None
) -> Dict[str, List]:
    """Get aggregated TVI curves by querying tables directly"""
    async with pool.acquire() as conn:
        # Build query with optional filters
        query = """
            SELECT 
                t.channel,
                t.nominal_pct,
                AVG(t.measured_pct) as avg_measured,
                STDDEV(t.measured_pct) as stddev_measured,
                COUNT(*) as sample_count
            FROM tvi_curves t
            JOIN fingerprints f ON t.fingerprint_id = f.id
            WHERE f.plate_supplier = $1 
              AND f.plate_family = $2 
              AND f.plate_thickness_mm = $3
        """
        params = [supplier, family, thickness]
        param_idx = 4
        
        if substrate:
            query += f" AND f.substrate_category = ${param_idx}"
            params.append(substrate)
            param_idx += 1
        
        if press_type:
            query += f" AND f.press_type = ${param_idx}"
            params.append(press_type)
            param_idx += 1
        
        query += " GROUP BY t.channel, t.nominal_pct ORDER BY t.channel, t.nominal_pct"
        
        rows = await conn.fetch(query, *params)
        
        curves = {'C': [], 'M': [], 'Y': [], 'K': []}
        for row in rows:
            channel = row['channel']
            if channel in curves:
                curves[channel].append({
                    'nominal': row['nominal_pct'],
                    'measured': float(row['avg_measured']) if row['avg_measured'] else 0,
                    'stddev': float(row['stddev_measured']) if row['stddev_measured'] else 0,
                    'samples': row['sample_count']
                })
        return curves


async def get_suggested_dgc_direct(
    pool,
    supplier: str,
    family: str,
    thickness: float,
    substrate: Optional[str] = None,
    press_type: Optional[str] = None
) -> Dict[str, Dict[int, float]]:
    """Get aggregated DGC curves by querying tables directly"""
    async with pool.acquire() as conn:
        query = """
            SELECT d.channel, d.input_pct, AVG(d.output_pct) as avg_output
            FROM dgc_curves d
            JOIN fingerprints f ON d.fingerprint_id = f.id
            WHERE f.plate_supplier = $1 AND f.plate_family = $2 AND f.plate_thickness_mm = $3
        """
        params = [supplier, family, thickness]
        param_idx = 4
        
        if substrate:
            query += f" AND f.substrate_category = ${param_idx}"
            params.append(substrate)
            param_idx += 1
        if press_type:
            query += f" AND f.press_type = ${param_idx}"
            params.append(press_type)
            param_idx += 1
            
        query += " GROUP BY d.channel, d.input_pct ORDER BY d.channel, d.input_pct"
        
        rows = await conn.fetch(query, *params)
        
        dgc = {}
        for row in rows:
            channel = row['channel']
            if channel not in dgc:
                dgc[channel] = {}
            dgc[channel][row['input_pct']] = round(float(row['avg_output']), 1)
        
        return dgc


async def find_similar_plates_direct(pool, supplier: str, family: str, thickness: float, limit: int = 5) -> List[Dict]:
    """Find plates with similar dot gain behavior"""
    async with pool.acquire() as conn:
        # First get the reference plate's average dot gains
        ref_stats = await conn.fetchrow("""
            SELECT 
                AVG(CASE WHEN t.channel = 'C' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_c,
                AVG(CASE WHEN t.channel = 'M' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_m,
                AVG(CASE WHEN t.channel = 'Y' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_y,
                AVG(CASE WHEN t.channel = 'K' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_k
            FROM tvi_curves t
            JOIN fingerprints f ON t.fingerprint_id = f.id
            WHERE f.plate_supplier = $1 AND f.plate_family = $2 AND f.plate_thickness_mm = $3
        """, supplier, family, thickness)
        
        if not ref_stats or ref_stats['dg_c'] is None:
            return []
        
        # Find other plates and calculate similarity
        rows = await conn.fetch("""
            WITH plate_stats AS (
                SELECT 
                    f.plate_supplier,
                    f.plate_family,
                    f.plate_thickness_mm,
                    AVG(CASE WHEN t.channel = 'C' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_c,
                    AVG(CASE WHEN t.channel = 'M' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_m,
                    AVG(CASE WHEN t.channel = 'Y' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_y,
                    AVG(CASE WHEN t.channel = 'K' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as dg_k,
                    COUNT(DISTINCT f.id) as sample_count
                FROM tvi_curves t
                JOIN fingerprints f ON t.fingerprint_id = f.id
                WHERE NOT (f.plate_supplier = $1 AND f.plate_family = $2 AND f.plate_thickness_mm = $3)
                GROUP BY f.plate_supplier, f.plate_family, f.plate_thickness_mm
            )
            SELECT *,
                SQRT(
                    POWER(COALESCE(dg_c, 0) - $4, 2) + 
                    POWER(COALESCE(dg_m, 0) - $5, 2) + 
                    POWER(COALESCE(dg_y, 0) - $6, 2) + 
                    POWER(COALESCE(dg_k, 0) - $7, 2)
                ) as distance
            FROM plate_stats
            ORDER BY distance
            LIMIT $8
        """, supplier, family, thickness, 
            float(ref_stats['dg_c']), float(ref_stats['dg_m']), 
            float(ref_stats['dg_y']), float(ref_stats['dg_k']), limit)
        
        return [dict(r) for r in rows]

# ============================================================================
# API ENDPOINTS
# ============================================================================

@intelligence_router.get("/summary")
async def get_intelligence_summary(request: Request):
    """Get summary of fingerprint database"""
    pool = get_pool(request)
    
    async with pool.acquire() as conn:
        fp_count = await conn.fetchval("SELECT COUNT(*) FROM fingerprints")
        plate_types = await conn.fetchval("""
            SELECT COUNT(DISTINCT (plate_supplier, plate_family, plate_thickness_mm)) 
            FROM fingerprints
        """)
        substrates = await conn.fetch("""
            SELECT substrate_category as category, COUNT(*) as count 
            FROM fingerprints 
            GROUP BY substrate_category 
            ORDER BY count DESC
        """)
        press_types = await conn.fetch("""
            SELECT press_type as type, COUNT(*) as count 
            FROM fingerprints 
            GROUP BY press_type 
            ORDER BY count DESC
        """)
    
    return {
        "fingerprint_count": fp_count,
        "plate_types": plate_types,
        "substrates": [dict(s) for s in substrates],
        "press_types": [dict(p) for p in press_types]
    }


@intelligence_router.get("/plates")
async def list_fingerprinted_plates(request: Request):
    """List all plate types with fingerprint statistics"""
    pool = get_pool(request)
    
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT 
                f.plate_supplier as supplier,
                f.plate_family as family,
                f.plate_thickness_mm as thickness_mm,
                COUNT(DISTINCT f.id) as sample_count,
                AVG(CASE WHEN t.channel = 'C' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_c,
                AVG(CASE WHEN t.channel = 'M' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_m,
                AVG(CASE WHEN t.channel = 'Y' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_y,
                AVG(CASE WHEN t.channel = 'K' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_k
            FROM fingerprints f
            LEFT JOIN tvi_curves t ON t.fingerprint_id = f.id
            GROUP BY f.plate_supplier, f.plate_family, f.plate_thickness_mm
            ORDER BY f.plate_supplier, f.plate_family, f.plate_thickness_mm
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
    
    async with pool.acquire() as conn:
        stats = await conn.fetchrow("""
            SELECT 
                f.plate_supplier,
                f.plate_family,
                f.plate_thickness_mm,
                COUNT(DISTINCT f.id) as sample_count,
                AVG(CASE WHEN t.channel = 'C' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_c,
                AVG(CASE WHEN t.channel = 'M' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_m,
                AVG(CASE WHEN t.channel = 'Y' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_y,
                AVG(CASE WHEN t.channel = 'K' AND t.nominal_pct = 50 THEN t.measured_pct - 50 END) as avg_dg_k
            FROM fingerprints f
            LEFT JOIN tvi_curves t ON t.fingerprint_id = f.id
            WHERE f.plate_supplier = $1 AND f.plate_family = $2 AND f.plate_thickness_mm = $3
            GROUP BY f.plate_supplier, f.plate_family, f.plate_thickness_mm
        """, supplier, family, thickness)
    
    if not stats:
        raise HTTPException(404, f"No fingerprint data for {supplier} {family} {thickness}mm")
    
    return dict(stats)


@intelligence_router.post("/similar")
async def find_similar_plates(request: Request, body: SimilarPlatesRequest):
    """Find plates with similar TVI behavior"""
    pool = get_pool(request)
    
    similar = await find_similar_plates_direct(
        pool,
        body.plate.supplier,
        body.plate.family,
        body.plate.thickness_mm,
        body.top_n
    )
    
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
    
    curves = await get_predicted_tvi_direct(
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
    
    dgc = await get_suggested_dgc_direct(
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
    
    # Get TVI curves for both plates
    current_curves = await get_predicted_tvi_direct(
        pool,
        body.current_plate.supplier,
        body.current_plate.family,
        body.current_plate.thickness_mm
    )
    
    target_curves = await get_predicted_tvi_direct(
        pool,
        body.target_plate.supplier,
        body.target_plate.family,
        body.target_plate.thickness_mm
    )
    
    if not any(current_curves.values()):
        raise HTTPException(404, f"No data for current plate")
    if not any(target_curves.values()):
        raise HTTPException(404, f"No data for target plate")
    
    # Calculate differences
    differences = {}
    for channel in ['C', 'M', 'Y', 'K']:
        curr_50 = next((p['measured'] for p in current_curves.get(channel, []) if p['nominal'] == 50), None)
        targ_50 = next((p['measured'] for p in target_curves.get(channel, []) if p['nominal'] == 50), None)
        if curr_50 and targ_50:
            differences[channel] = round(targ_50 - curr_50, 1)
    
    # Generate recommendations
    recommendations = []
    for ch, diff in differences.items():
        if abs(diff) < 2:
            recommendations.append(f"{ch}: Similar behavior, minimal adjustment needed")
        elif diff > 0:
            recommendations.append(f"{ch}: Target has {diff}% more dot gain - reduce curve compensation")
        else:
            recommendations.append(f"{ch}: Target has {abs(diff)}% less dot gain - increase curve compensation")
    
    return {
        "current_plate": f"{body.current_plate.supplier}|{body.current_plate.family}|{body.current_plate.thickness_mm}",
        "target_plate": f"{body.target_plate.supplier}|{body.target_plate.family}|{body.target_plate.thickness_mm}",
        "dot_gain_differences": differences,
        "recommendations": recommendations,
        "current_curves": current_curves,
        "target_curves": target_curves
    }


# ============================================================================
# VISUALIZATION PAGE
# ============================================================================

@intelligence_router.get("/visualization", response_class=HTMLResponse)
async def visualization_page(request: Request):
    """Interactive TVI curve visualization dashboard"""
    pool = get_pool(request)
    
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
                background: #0f172a; color: #e2e8f0; width: 100%;
            }}
            button {{ background: linear-gradient(135deg, #3b82f6, #2563eb); border: none; cursor: pointer; font-weight: bold; }}
            button:hover {{ background: linear-gradient(135deg, #2563eb, #1d4ed8); }}
            .charts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
            .chart-box {{ background: #1e293b; padding: 20px; border-radius: 12px; min-height: 400px; }}
            .stats {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 15px; }}
            .stat {{ background: #0f172a; padding: 15px; border-radius: 8px; text-align: center; }}
            .stat-value {{ font-size: 24px; font-weight: bold; }}
            .cyan {{ color: #22d3ee; }}
            .magenta {{ color: #f472b6; }}
            .yellow {{ color: #fbbf24; }}
            .black {{ color: #94a3b8; }}
            label {{ font-size: 12px; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 5px; }}
            .error {{ color: #f87171; padding: 10px; background: #450a0a; border-radius: 6px; margin-top: 10px; }}
            .loading {{ color: #60a5fa; }}
            @media (max-width: 768px) {{
                .charts {{ grid-template-columns: 1fr; }}
                .stats {{ grid-template-columns: repeat(2, 1fr); }}
            }}
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
                <option value="foil laminate">Foil Laminate</option>
                <option value="shrink film">Shrink Film</option>
            </select></div>
            <div><label>&nbsp;</label><button onclick="updateCharts()">Update Charts</button></div>
        </div>
        
        <div class="charts">
            <div class="chart-box">
                <h3 style="color: #60a5fa;">Primary Plate TVI</h3>
                <canvas id="chart1"></canvas>
                <div class="stats" id="stats1"><p class="loading">Select a plate and click Update Charts</p></div>
            </div>
            <div class="chart-box">
                <h3 style="color: #60a5fa;">Comparison Plate TVI</h3>
                <canvas id="chart2"></canvas>
                <div class="stats" id="stats2"><p style="color:#64748b">Select comparison plate</p></div>
            </div>
        </div>
        
        <div id="error-container"></div>
        
        <script>
            let chart1 = null, chart2 = null;
            const colors = {{ C: '#22d3ee', M: '#f472b6', Y: '#fbbf24', K: '#94a3b8' }};
            
            async function fetchTVI(plateKey, substrate) {{
                const [supplier, family, thickness] = plateKey.split('|');
                const body = {{
                    plate: {{ supplier, family, thickness_mm: parseFloat(thickness) }},
                    conditions: substrate ? {{ substrate_category: substrate }} : {{}}
                }};
                
                console.log('Fetching TVI for:', body);
                
                try {{
                    const resp = await fetch('/api/intelligence/predict-tvi', {{
                        method: 'POST',
                        headers: {{ 'Content-Type': 'application/json' }},
                        body: JSON.stringify(body)
                    }});
                    
                    if (!resp.ok) {{
                        const errorText = await resp.text();
                        console.error('API Error:', resp.status, errorText);
                        throw new Error(`API returned ${{resp.status}}: ${{errorText}}`);
                    }}
                    
                    return await resp.json();
                }} catch (err) {{
                    console.error('Fetch error:', err);
                    document.getElementById('error-container').innerHTML = 
                        `<div class="error">Error: ${{err.message}}</div>`;
                    return null;
                }}
            }}
            
            function createChart(canvasId, data, existingChart) {{
                if (existingChart) existingChart.destroy();
                
                const ctx = document.getElementById(canvasId).getContext('2d');
                const datasets = [];
                
                for (const ch of ['C', 'M', 'Y', 'K']) {{
                    if (data.curves[ch]?.length) {{
                        datasets.push({{
                            label: ch,
                            data: data.curves[ch].map(p => ({{ x: p.nominal, y: p.measured }})),
                            borderColor: colors[ch],
                            backgroundColor: colors[ch] + '20',
                            fill: false,
                            tension: 0.3,
                            pointRadius: 3
                        }});
                    }}
                }}
                
                // Linear reference line
                datasets.push({{ 
                    label: 'Linear', 
                    data: [{{x:0,y:0}},{{x:100,y:100}}], 
                    borderColor: '#475569', 
                    borderDash: [5,5], 
                    fill: false, 
                    pointRadius: 0 
                }});
                
                return new Chart(ctx, {{
                    type: 'line',
                    data: {{ datasets }},
                    options: {{
                        responsive: true,
                        plugins: {{ 
                            legend: {{ labels: {{ color: '#94a3b8' }} }},
                            title: {{ display: false }}
                        }},
                        scales: {{
                            x: {{ 
                                type: 'linear', min: 0, max: 100, 
                                title: {{ display: true, text: 'Nominal %', color: '#94a3b8' }}, 
                                grid: {{ color: '#334155' }}, 
                                ticks: {{ color: '#94a3b8' }} 
                            }},
                            y: {{ 
                                type: 'linear', min: 0, max: 100, 
                                title: {{ display: true, text: 'Measured %', color: '#94a3b8' }}, 
                                grid: {{ color: '#334155' }}, 
                                ticks: {{ color: '#94a3b8' }} 
                            }}
                        }}
                    }}
                }});
            }}
            
            function showStats(containerId, data) {{
                const el = document.getElementById(containerId);
                if (!data?.curves) {{ 
                    el.innerHTML = '<p style="color:#64748b">No data available</p>'; 
                    return; 
                }}
                
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
                document.getElementById('error-container').innerHTML = '';
                document.getElementById('stats1').innerHTML = '<p class="loading">Loading...</p>';
                
                const plate1 = document.getElementById('plate1').value;
                const plate2 = document.getElementById('plate2').value;
                const substrate = document.getElementById('substrate').value;
                
                console.log('Updating charts for:', plate1, plate2, substrate);
                
                const data1 = await fetchTVI(plate1, substrate);
                if (data1) {{ 
                    chart1 = createChart('chart1', data1, chart1); 
                    showStats('stats1', data1); 
                }} else {{
                    document.getElementById('stats1').innerHTML = '<p style="color:#f87171">Failed to load data</p>';
                }}
                
                if (plate2) {{
                    const data2 = await fetchTVI(plate2, substrate);
                    if (data2) {{ 
                        chart2 = createChart('chart2', data2, chart2); 
                        showStats('stats2', data2); 
                    }} else {{
                        document.getElementById('stats2').innerHTML = '<p style="color:#f87171">Failed to load data</p>';
                    }}
                }} else {{
                    document.getElementById('stats2').innerHTML = '<p style="color:#64748b">Select comparison plate</p>';
                }}
            }}
            
            // Load initial chart
            updateCharts();
        </script>
    </body>
    </html>
    """
    return html
