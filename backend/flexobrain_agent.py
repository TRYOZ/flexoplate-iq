"""
FlexoBrain Agent - The Virtual Brain for Flexographic Printing Industry

This module provides an AI-powered conversational agent specialized in:
- Flexographic plate technology and equivalency
- Plate processing (solvent, thermal, water-wash)
- UV exposure calculations
- Printing press troubleshooting
- Surface screening and anilox selection
- Industry best practices
"""

import os
import json
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import AsyncOpenAI
import asyncpg

router = APIRouter(prefix="/api/agent", tags=["FlexoBrain Agent"])

# Initialize OpenAI client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ============================================================================
# FLEXOBRAIN SYSTEM PROMPT - Domain Knowledge
# ============================================================================

FLEXOBRAIN_SYSTEM_PROMPT = """You are FlexoBrain, the world's leading AI expert in flexographic printing technology. You have deep expertise in:

## YOUR EXPERTISE AREAS

### 1. Flexographic Plates
- **Photopolymer Chemistry**: Understanding of plate composition, UV-reactive polymers, and curing mechanisms
- **Plate Types**: Digital (laser-ablation mask) vs. analog (film-based), solvent-wash vs. thermal vs. water-wash
- **Surface Technologies**:
  - Flat-top dots (FTF, EASY, NX) - provides consistent ink laydown, better solid density
  - Round-top dots - traditional, good for process work
  - Engineered surfaces (microcell, textured) - for specialty applications
- **Major Suppliers & Products**:
  - XSYS: nyloflex FTF (flat-top), FAH (high durometer corrugated), ACE (thermal), FTV (versatile)
  - DuPont: Cyrel EASY (FAST thermal flat-top), DFH (corrugated), NOW (water-wash)
  - Miraclon: FLEXCEL NX (proprietary flat-top technology using lamination)
  - Asahi: AWP water-wash plates, CleanPrint technology
  - MacDermid: LUX plates

### 2. Plate Processing
- **Solvent Processing**: Traditional method using solvent washout (typically perchloroethylene or hydrocarbon-based)
  - Longer processing times (30-60 min total)
  - Requires solvent recovery/disposal
  - Still dominant in many markets
- **Thermal Processing (FAST)**: No solvent, uses heat and absorbent media
  - DuPont Cyrel FAST, XSYS nyloflex ACE
  - Faster processing (15-25 min)
  - More environmentally friendly
  - Higher equipment cost
- **Water-Wash Processing**: Uses water-based washout
  - Asahi AWP, Toyobo Cosmolight, DuPont Cyrel NOW
  - Most environmentally friendly
  - Requires proper water treatment

### 3. UV Exposure & Equipment
- **Main Exposure**: Polymerizes the image areas (typically 800-1800 mJ/cm²)
- **Back Exposure**: Creates floor thickness (typically 150-400 mJ/cm²)
- **UV Sources**:
  - Fluorescent UVA tubes (traditional, 15-20 mW/cm²)
  - LED UVA (modern, 30-50 mW/cm², more consistent, longer life)
- **Equipment Brands**: XSYS Catena, DuPont Cyrel 2000/3000, Miraclon systems, Esko CDI

### 4. Thickness & Applications
- **Thin plates (0.76-1.14mm)**: Labels, flexible packaging, high LPI work
- **Medium plates (1.70-2.54mm)**: Folding carton, general flexible packaging
- **Thick plates (2.84-6.35mm)**: Corrugated postprint, rough substrates

### 5. Hardness (Shore A)
- **Soft (55-65 Shore A)**: Better ink transfer on rough substrates
- **Medium (65-72 Shore A)**: General purpose, good balance
- **Hard (72-80+ Shore A)**: Fine detail, high LPI, corrugated

### 6. Screen Technology & Anilox
- **LPI (Lines Per Inch)**: Typically 100-200 LPI for flexo
- **Anilox Selection**: Cell volume (BCM) and line screen relationship
- **Surface Screening**: AM (amplitude modulated), FM (stochastic), hybrid

### 7. Troubleshooting Common Issues
- Dot gain/TVI (tone value increase)
- Dirty printing / scumming
- Plate wear and durability
- Ink compatibility issues
- Registration problems
- Washout issues (undercutting, incomplete)

## YOUR COMMUNICATION STYLE
- Be conversational but technical when needed
- Ask clarifying questions to understand the user's specific situation
- Provide specific product recommendations when appropriate
- Explain the "why" behind recommendations
- Use industry terminology but explain it when needed
- Be helpful to both beginners and experienced professionals

## TOOLS AVAILABLE
You have access to tools to query the plate database, find equivalents, and calculate exposure times. Use these to provide accurate, data-driven recommendations.

## IMPORTANT GUIDELINES
- Always consider the user's specific application and constraints
- When recommending plate equivalents, explain the trade-offs
- For exposure calculations, account for equipment age and conditions
- If you're unsure about something, say so and suggest how to find out
- Encourage proper testing when switching plates or processes
"""

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None  # Page context, selected plate, etc.
    stream: bool = False

class ChatResponse(BaseModel):
    message: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    sources: Optional[List[Dict[str, Any]]] = None

# ============================================================================
# TOOL DEFINITIONS FOR OPENAI
# ============================================================================

FLEXOBRAIN_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_plates",
            "description": "Search the plate database by various criteria. Use this to find plates matching specific requirements.",
            "parameters": {
                "type": "object",
                "properties": {
                    "supplier": {
                        "type": "string",
                        "description": "Filter by supplier name (XSYS, DuPont, Miraclon, etc.)"
                    },
                    "thickness_mm": {
                        "type": "number",
                        "description": "Filter by plate thickness in mm (e.g., 1.14, 1.70, 2.84)"
                    },
                    "process_type": {
                        "type": "string",
                        "enum": ["solvent", "thermal", "water_wash"],
                        "description": "Filter by processing type"
                    },
                    "surface_type": {
                        "type": "string",
                        "enum": ["flat_top", "round_top", "microcell", "textured"],
                        "description": "Filter by dot/surface type"
                    },
                    "application": {
                        "type": "string",
                        "description": "Filter by application (flexible_packaging, labels, corrugated, folding_carton)"
                    },
                    "min_hardness": {
                        "type": "integer",
                        "description": "Minimum Shore A hardness"
                    },
                    "max_hardness": {
                        "type": "integer",
                        "description": "Maximum Shore A hardness"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_equivalent_plates",
            "description": "Find equivalent plates to a given plate from other suppliers. Returns ranked matches with similarity scores.",
            "parameters": {
                "type": "object",
                "properties": {
                    "plate_name": {
                        "type": "string",
                        "description": "The name or SKU of the source plate (e.g., 'Cyrel EASY EFX 1.14', 'nyloflex FTF 1.14')"
                    },
                    "target_supplier": {
                        "type": "string",
                        "description": "Optional: Only show equivalents from this supplier"
                    }
                },
                "required": ["plate_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_plate_details",
            "description": "Get detailed specifications for a specific plate",
            "parameters": {
                "type": "object",
                "properties": {
                    "plate_name": {
                        "type": "string",
                        "description": "The name or SKU of the plate"
                    }
                },
                "required": ["plate_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_exposure",
            "description": "Calculate UV exposure times for a plate based on equipment specifications",
            "parameters": {
                "type": "object",
                "properties": {
                    "plate_name": {
                        "type": "string",
                        "description": "The name of the plate"
                    },
                    "uv_intensity_mw_cm2": {
                        "type": "number",
                        "description": "Current UV intensity in mW/cm²"
                    },
                    "lamp_age_hours": {
                        "type": "integer",
                        "description": "Optional: Age of UV lamps in hours for degradation calculation"
                    }
                },
                "required": ["plate_name", "uv_intensity_mw_cm2"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_equipment_info",
            "description": "Get information about platemaking equipment models",
            "parameters": {
                "type": "object",
                "properties": {
                    "equipment_type": {
                        "type": "string",
                        "enum": ["exposure", "processor", "imager", "dryer", "all"],
                        "description": "Type of equipment to search for"
                    },
                    "supplier": {
                        "type": "string",
                        "description": "Filter by equipment supplier"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "troubleshoot_issue",
            "description": "Get troubleshooting guidance for common flexographic printing issues",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue": {
                        "type": "string",
                        "description": "Description of the issue (e.g., 'dot gain too high', 'plate washing out too fast', 'dirty printing')"
                    },
                    "plate_type": {
                        "type": "string",
                        "description": "Optional: The plate being used"
                    },
                    "process_type": {
                        "type": "string",
                        "description": "Optional: solvent, thermal, or water_wash"
                    }
                },
                "required": ["issue"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": "Search the FlexoBrain knowledge base for technical information, best practices, and industry knowledge",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    },
                    "category": {
                        "type": "string",
                        "enum": ["plates", "processing", "equipment", "troubleshooting", "best_practices", "all"],
                        "description": "Optional: Filter by knowledge category"
                    }
                },
                "required": ["query"]
            }
        }
    }
]

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
# TOOL IMPLEMENTATIONS
# ============================================================================

async def execute_tool(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool and return the result"""

    pool = await get_db_pool()

    if tool_name == "search_plates":
        return await tool_search_plates(pool, arguments)
    elif tool_name == "find_equivalent_plates":
        return await tool_find_equivalents(pool, arguments)
    elif tool_name == "get_plate_details":
        return await tool_get_plate_details(pool, arguments)
    elif tool_name == "calculate_exposure":
        return await tool_calculate_exposure(pool, arguments)
    elif tool_name == "get_equipment_info":
        return await tool_get_equipment_info(pool, arguments)
    elif tool_name == "troubleshoot_issue":
        return tool_troubleshoot_issue(arguments)
    elif tool_name == "search_knowledge_base":
        return await tool_search_knowledge_base(pool, arguments)
    else:
        return {"error": f"Unknown tool: {tool_name}"}


async def tool_search_plates(pool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Search plates with filters"""
    if not pool:
        return {"error": "Database not available", "plates": []}

    query = """
        SELECT
            p.id, p.display_name, p.sku_code, p.thickness_mm, p.hardness_shore,
            p.imaging_type, p.surface_type, p.min_lpi, p.max_lpi,
            p.ink_compatibility, p.substrate_categories, p.applications,
            pf.family_name, pf.process_type,
            s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE 1=1
    """
    params = []
    param_count = 0

    if args.get("supplier"):
        param_count += 1
        query += f" AND LOWER(s.name) LIKE LOWER(${param_count})"
        params.append(f"%{args['supplier']}%")

    if args.get("thickness_mm"):
        param_count += 1
        query += f" AND ABS(p.thickness_mm - ${param_count}) < 0.1"
        params.append(args["thickness_mm"])

    if args.get("process_type"):
        param_count += 1
        query += f" AND pf.process_type = ${param_count}"
        params.append(args["process_type"])

    if args.get("surface_type"):
        param_count += 1
        query += f" AND p.surface_type = ${param_count}"
        params.append(args["surface_type"])

    if args.get("application"):
        param_count += 1
        query += f" AND ${param_count} = ANY(p.applications)"
        params.append(args["application"])

    if args.get("min_hardness"):
        param_count += 1
        query += f" AND p.hardness_shore >= ${param_count}"
        params.append(args["min_hardness"])

    if args.get("max_hardness"):
        param_count += 1
        query += f" AND p.hardness_shore <= ${param_count}"
        params.append(args["max_hardness"])

    query += " ORDER BY s.name, p.thickness_mm LIMIT 20"

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            plates = []
            for row in rows:
                plates.append({
                    "id": str(row["id"]),
                    "name": row["display_name"],
                    "sku": row["sku_code"],
                    "supplier": row["supplier_name"],
                    "family": row["family_name"],
                    "thickness_mm": float(row["thickness_mm"]),
                    "hardness_shore": row["hardness_shore"],
                    "surface_type": row["surface_type"],
                    "process_type": row["process_type"],
                    "lpi_range": f"{row['min_lpi']}-{row['max_lpi']}",
                    "applications": row["applications"]
                })
            return {"plates": plates, "count": len(plates)}
    except Exception as e:
        return {"error": str(e), "plates": []}


async def tool_find_equivalents(pool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Find equivalent plates"""
    if not pool:
        return {"error": "Database not available"}

    plate_name = args.get("plate_name", "")
    target_supplier = args.get("target_supplier")

    # First, find the source plate
    source_query = """
        SELECT
            p.id, p.display_name, p.thickness_mm, p.hardness_shore,
            p.surface_type, p.min_lpi, p.max_lpi, p.ink_compatibility,
            pf.process_type, s.name as supplier_name
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE LOWER(p.display_name) LIKE LOWER($1)
           OR LOWER(p.sku_code) LIKE LOWER($1)
        LIMIT 1
    """

    try:
        async with pool.acquire() as conn:
            source = await conn.fetchrow(source_query, f"%{plate_name}%")

            if not source:
                return {"error": f"Could not find plate: {plate_name}", "equivalents": []}

            # Find equivalents
            equiv_query = """
                SELECT
                    p.id, p.display_name, p.sku_code, p.thickness_mm, p.hardness_shore,
                    p.surface_type, p.min_lpi, p.max_lpi,
                    pf.process_type, s.name as supplier_name,
                    ABS(p.thickness_mm - $1) as thickness_diff,
                    ABS(p.hardness_shore - $2) as hardness_diff
                FROM plates p
                JOIN plate_families pf ON p.plate_family_id = pf.id
                JOIN suppliers s ON pf.supplier_id = s.id
                WHERE p.id != $3
                  AND ABS(p.thickness_mm - $1) <= 0.15
            """
            params = [source["thickness_mm"], source["hardness_shore"], source["id"]]

            if target_supplier:
                equiv_query += " AND LOWER(s.name) LIKE LOWER($4)"
                params.append(f"%{target_supplier}%")

            equiv_query += " ORDER BY thickness_diff, hardness_diff LIMIT 10"

            rows = await conn.fetch(equiv_query, *params)

            equivalents = []
            for row in rows:
                # Calculate similarity score
                thickness_score = max(0, 30 - (float(row["thickness_diff"]) * 200))
                hardness_score = max(0, 25 - (row["hardness_diff"] * 2))
                surface_score = 20 if row["surface_type"] == source["surface_type"] else 5
                process_score = 15 if row["process_type"] == source["process_type"] else 0
                lpi_score = 10  # Simplified

                total_score = min(100, thickness_score + hardness_score + surface_score + process_score + lpi_score)

                equivalents.append({
                    "id": str(row["id"]),
                    "name": row["display_name"],
                    "supplier": row["supplier_name"],
                    "thickness_mm": float(row["thickness_mm"]),
                    "hardness_shore": row["hardness_shore"],
                    "surface_type": row["surface_type"],
                    "process_type": row["process_type"],
                    "similarity_score": round(total_score),
                    "match_quality": "Excellent" if total_score >= 90 else "Good" if total_score >= 75 else "Fair" if total_score >= 60 else "Poor"
                })

            return {
                "source_plate": {
                    "name": source["display_name"],
                    "supplier": source["supplier_name"],
                    "thickness_mm": float(source["thickness_mm"]),
                    "hardness_shore": source["hardness_shore"],
                    "surface_type": source["surface_type"],
                    "process_type": source["process_type"]
                },
                "equivalents": sorted(equivalents, key=lambda x: x["similarity_score"], reverse=True)
            }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_plate_details(pool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Get detailed plate specifications"""
    if not pool:
        return {"error": "Database not available"}

    plate_name = args.get("plate_name", "")

    query = """
        SELECT
            p.*, pf.family_name, pf.process_type, pf.technology_tags, pf.description as family_description,
            s.name as supplier_name, s.website_url
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        JOIN suppliers s ON pf.supplier_id = s.id
        WHERE LOWER(p.display_name) LIKE LOWER($1)
           OR LOWER(p.sku_code) LIKE LOWER($1)
        LIMIT 1
    """

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, f"%{plate_name}%")

            if not row:
                return {"error": f"Plate not found: {plate_name}"}

            return {
                "plate": {
                    "name": row["display_name"],
                    "sku": row["sku_code"],
                    "supplier": row["supplier_name"],
                    "family": row["family_name"],
                    "description": row["family_description"],
                    "specifications": {
                        "thickness_mm": float(row["thickness_mm"]),
                        "hardness_shore": row["hardness_shore"],
                        "surface_type": row["surface_type"],
                        "imaging_type": row["imaging_type"],
                        "process_type": row["process_type"],
                        "lpi_range": f"{row['min_lpi']}-{row['max_lpi']} LPI",
                        "ink_compatibility": row["ink_compatibility"],
                        "substrate_categories": row["substrate_categories"],
                        "applications": row["applications"]
                    },
                    "exposure": {
                        "main_exposure_min_mj": row["main_exposure_energy_min_mj_cm2"],
                        "main_exposure_max_mj": row["main_exposure_energy_max_mj_cm2"]
                    },
                    "technology_tags": row["technology_tags"],
                    "supplier_website": row["website_url"]
                }
            }
    except Exception as e:
        return {"error": str(e)}


async def tool_calculate_exposure(pool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate exposure times"""
    if not pool:
        return {"error": "Database not available"}

    plate_name = args.get("plate_name", "")
    intensity = args.get("uv_intensity_mw_cm2", 18)
    lamp_age = args.get("lamp_age_hours", 0)

    # Get plate exposure requirements
    query = """
        SELECT
            p.display_name, p.thickness_mm,
            p.main_exposure_energy_min_mj_cm2, p.main_exposure_energy_max_mj_cm2,
            pf.process_type
        FROM plates p
        JOIN plate_families pf ON p.plate_family_id = pf.id
        WHERE LOWER(p.display_name) LIKE LOWER($1)
           OR LOWER(p.sku_code) LIKE LOWER($1)
        LIMIT 1
    """

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, f"%{plate_name}%")

            if not row:
                return {"error": f"Plate not found: {plate_name}"}

            # Adjust intensity for lamp age (rough degradation model)
            degradation_factor = 1.0
            if lamp_age > 0:
                # Assume ~10% degradation per 1000 hours
                degradation_factor = max(0.5, 1.0 - (lamp_age / 10000))

            effective_intensity = intensity * degradation_factor

            # Calculate times
            min_energy = row["main_exposure_energy_min_mj_cm2"] or 800
            max_energy = row["main_exposure_energy_max_mj_cm2"] or 1200
            target_energy = (min_energy + max_energy) / 2

            # Time = Energy / Intensity (convert mJ to mW*s)
            main_time_seconds = target_energy / effective_intensity

            # Back exposure (typically 20-25% of main)
            back_energy = target_energy * 0.22
            back_time_seconds = back_energy / effective_intensity

            def format_time(seconds):
                mins = int(seconds // 60)
                secs = int(seconds % 60)
                return f"{mins}:{secs:02d}"

            return {
                "plate": row["display_name"],
                "calculation": {
                    "input_intensity_mw_cm2": intensity,
                    "lamp_age_hours": lamp_age,
                    "effective_intensity_mw_cm2": round(effective_intensity, 1),
                    "degradation_factor": round(degradation_factor, 2)
                },
                "exposure_times": {
                    "main_exposure": {
                        "seconds": round(main_time_seconds),
                        "formatted": format_time(main_time_seconds),
                        "energy_mj_cm2": round(target_energy)
                    },
                    "back_exposure": {
                        "seconds": round(back_time_seconds),
                        "formatted": format_time(back_time_seconds),
                        "energy_mj_cm2": round(back_energy)
                    }
                },
                "recommendations": [
                    f"Target main exposure energy: {min_energy}-{max_energy} mJ/cm²",
                    "Always run a step test when changing plates or equipment",
                    "Measure UV intensity regularly for consistent results"
                ]
            }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_equipment_info(pool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Get equipment information"""
    if not pool:
        return {"error": "Database not available"}

    equipment_type = args.get("equipment_type", "all")
    supplier = args.get("supplier")

    query = """
        SELECT
            em.*, s.name as supplier_name
        FROM equipment_models em
        JOIN suppliers s ON em.supplier_id = s.id
        WHERE 1=1
    """
    params = []
    param_count = 0

    if equipment_type and equipment_type != "all":
        param_count += 1
        type_map = {
            "exposure": ["MAIN_EXPOSURE", "COMBINED_EXPOSURE", "BACK_EXPOSURE"],
            "processor": ["PROCESSOR_SOLVENT", "PROCESSOR_THERMAL", "PROCESSOR_WATER"],
            "imager": ["IMAGER"],
            "dryer": ["DRYER", "LIGHT_FINISHER"]
        }
        types = type_map.get(equipment_type, [equipment_type.upper()])
        query += f" AND em.equipment_type = ANY(${param_count})"
        params.append(types)

    if supplier:
        param_count += 1
        query += f" AND LOWER(s.name) LIKE LOWER(${param_count})"
        params.append(f"%{supplier}%")

    query += " ORDER BY s.name, em.model_name"

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

            equipment = []
            for row in rows:
                equipment.append({
                    "model_name": row["model_name"],
                    "supplier": row["supplier_name"],
                    "type": row["equipment_type"],
                    "technology": row["technology"],
                    "uv_source_type": row["uv_source_type"],
                    "nominal_intensity_mw_cm2": row["nominal_intensity_mw_cm2"],
                    "supports_digital": row["supports_digital_plates"],
                    "supports_analog": row["supports_analog_plates"]
                })

            return {"equipment": equipment, "count": len(equipment)}
    except Exception as e:
        return {"error": str(e)}


def tool_troubleshoot_issue(args: Dict[str, Any]) -> Dict[str, Any]:
    """Provide troubleshooting guidance based on built-in knowledge"""

    issue = args.get("issue", "").lower()
    plate_type = args.get("plate_type", "")
    process_type = args.get("process_type", "")

    # Troubleshooting knowledge base
    troubleshooting_db = {
        "dot gain": {
            "causes": [
                "Excessive impression pressure",
                "Plate too soft for the application",
                "Anilox volume too high",
                "Ink viscosity too low",
                "Over-exposure creating larger dots"
            ],
            "solutions": [
                "Reduce impression pressure to kiss impression",
                "Consider a harder plate (higher Shore A)",
                "Use a finer anilox with lower volume",
                "Increase ink viscosity",
                "Reduce main exposure time and run step test"
            ]
        },
        "dirty print": {
            "causes": [
                "Incomplete plate washout",
                "Under-exposure leaving uncured polymer",
                "Contaminated processing chemistry",
                "Ink drying in cells",
                "Damaged or worn plate surface"
            ],
            "solutions": [
                "Increase washout time or brush pressure",
                "Verify exposure times with step test",
                "Replace processing solvent/media",
                "Clean anilox and check ink condition",
                "Inspect plate under magnification for damage"
            ]
        },
        "plate wear": {
            "causes": [
                "Aggressive substrate (corrugated, rough paper)",
                "Excessive impression pressure",
                "Plate hardness too low for application",
                "UV ink or harsh chemistry",
                "Insufficient post-exposure/detack"
            ],
            "solutions": [
                "Use a harder durometer plate",
                "Optimize impression to minimum",
                "Consider reinforced or abrasion-resistant plates",
                "Ensure proper detack and light finishing",
                "Rotate plates if possible"
            ]
        },
        "washout": {
            "causes": [
                "Incorrect exposure times",
                "Contaminated or exhausted chemistry",
                "Wrong brush pressure or speed",
                "Temperature issues",
                "Film/mask problems (digital)"
            ],
            "solutions": [
                "Run new exposure step test",
                "Check chemistry condition and replace if needed",
                "Adjust processor settings per manufacturer specs",
                "Verify processor temperature",
                "Check imaging quality and ablation"
            ]
        },
        "registration": {
            "causes": [
                "Plate stretching during mounting",
                "Inconsistent plate thickness",
                "Sleeve or cylinder issues",
                "Web tension problems",
                "Thermal expansion"
            ],
            "solutions": [
                "Use plate mounting equipment with registration marks",
                "Verify plate thickness uniformity",
                "Check sleeve/cylinder condition",
                "Optimize web tension control",
                "Allow plates to acclimate to press room temperature"
            ]
        }
    }

    # Find matching issue
    matched_issue = None
    for key in troubleshooting_db:
        if key in issue:
            matched_issue = key
            break

    if matched_issue:
        data = troubleshooting_db[matched_issue]
        return {
            "issue": matched_issue,
            "possible_causes": data["causes"],
            "recommended_solutions": data["solutions"],
            "note": "These are general guidelines. Always consider your specific setup and consult plate manufacturer documentation."
        }
    else:
        return {
            "issue": issue,
            "message": "I don't have specific troubleshooting data for this issue, but I can help analyze it based on my general flexographic knowledge.",
            "general_approach": [
                "1. Isolate the variable - change one thing at a time",
                "2. Document current settings before making changes",
                "3. Run test prints to verify each change",
                "4. Consult plate and equipment manufacturer specs",
                "5. Consider environmental factors (temperature, humidity)"
            ]
        }


async def tool_search_knowledge_base(pool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Search the knowledge base (placeholder for vector search)"""

    query = args.get("query", "")
    category = args.get("category", "all")

    # For Phase 1, return structured knowledge
    # Phase 2 will implement actual vector search

    knowledge_snippets = {
        "flat_top": {
            "category": "plates",
            "content": "Flat-top dot technology creates dots with flat printing surfaces rather than rounded peaks. This provides more consistent ink transfer, better solid ink density, and improved highlight reproduction. Major flat-top solutions include XSYS nyloflex FTF, DuPont Cyrel EASY, and Miraclon FLEXCEL NX."
        },
        "thermal": {
            "category": "processing",
            "content": "Thermal plate processing (like DuPont FAST) uses heat and absorbent media instead of solvents. Benefits include faster processing (15-25 min vs 45-60 min), no solvent handling/disposal, and more consistent floor thickness. Requires compatible plates and thermal processor equipment."
        },
        "anilox": {
            "category": "equipment",
            "content": "Anilox roller selection is critical for flexo print quality. Key factors: line screen (cells per inch) should be 4-6x the plate LPI, cell volume (BCM) determines ink laydown, ceramic anilox offers durability. Higher line screens = finer detail but less ink."
        },
        "exposure": {
            "category": "processing",
            "content": "UV exposure polymerizes the photopolymer plate. Main exposure (front) creates the image - energy typically 800-1800 mJ/cm². Back exposure creates the floor thickness. Always run a step test (like UGRA/FOGRA) when changing plates or after lamp changes. LED UV provides more consistent intensity over time."
        }
    }

    results = []
    query_lower = query.lower()

    for key, snippet in knowledge_snippets.items():
        if key in query_lower or query_lower in snippet["content"].lower():
            if category == "all" or category == snippet["category"]:
                results.append(snippet)

    return {
        "query": query,
        "results": results,
        "note": "Knowledge base search will be expanded with web-scraped content in Phase 2"
    }


# ============================================================================
# MAIN CHAT ENDPOINT
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint for FlexoBrain agent"""

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    # Build messages for OpenAI
    messages = [{"role": "system", "content": FLEXOBRAIN_SYSTEM_PROMPT}]

    # Add context if provided
    if request.context:
        context_msg = f"\n\nCurrent context: {json.dumps(request.context)}"
        messages[0]["content"] += context_msg

    # Add conversation history
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        # Call OpenAI with tools
        response = await client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=messages,
            tools=FLEXOBRAIN_TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=2000
        )

        assistant_message = response.choices[0].message

        # Handle tool calls
        tool_results = []
        if assistant_message.tool_calls:
            for tool_call in assistant_message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)

                # Execute the tool
                result = await execute_tool(tool_name, tool_args)
                tool_results.append({
                    "tool": tool_name,
                    "args": tool_args,
                    "result": result
                })

            # Add tool results to messages and get final response
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    }
                    for tc in assistant_message.tool_calls
                ]
            })

            for i, tool_call in enumerate(assistant_message.tool_calls):
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_results[i]["result"])
                })

            # Get final response with tool results
            final_response = await client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                temperature=0.7,
                max_tokens=2000
            )

            return ChatResponse(
                message=final_response.choices[0].message.content,
                tool_calls=tool_results
            )

        return ChatResponse(
            message=assistant_message.content,
            tool_calls=None
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint for real-time responses"""

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    async def generate():
        messages = [{"role": "system", "content": FLEXOBRAIN_SYSTEM_PROMPT}]

        if request.context:
            context_msg = f"\n\nCurrent context: {json.dumps(request.context)}"
            messages[0]["content"] += context_msg

        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})

        try:
            stream = await client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                tools=FLEXOBRAIN_TOOLS,
                tool_choice="auto",
                temperature=0.7,
                max_tokens=2000,
                stream=True
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield f"data: {json.dumps({'content': chunk.choices[0].delta.content})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    openai_configured = bool(os.getenv("OPENAI_API_KEY"))
    pool = await get_db_pool()
    db_connected = pool is not None

    return {
        "status": "healthy" if openai_configured else "degraded",
        "openai_configured": openai_configured,
        "database_connected": db_connected,
        "agent": "FlexoBrain v1.0"
    }
