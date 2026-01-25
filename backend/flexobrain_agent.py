"""
FlexoBrain Agent - Hybrid OpenAI Assistants API Implementation

This module uses OpenAI's Assistants API for:
- Persistent conversation threads
- Built-in file search for uploaded documents
- Function calling for database queries

The hybrid approach combines:
- OpenAI's managed knowledge/RAG (file_search)
- Your own database queries (custom functions)
"""

import os
import json
import asyncio
import time
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from openai import AsyncOpenAI
import asyncpg

router = APIRouter(prefix="/api/agent", tags=["FlexoBrain Agent"])

# Lazy-loaded OpenAI client (initialized on first use, not at module load)
_openai_client = None

def get_openai_client() -> AsyncOpenAI:
    """Get or create the OpenAI client (lazy initialization)"""
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client

# Assistant ID - will be created on first run and stored
ASSISTANT_ID = os.getenv("FLEXOBRAIN_ASSISTANT_ID")

# ============================================================================
# FLEXOBRAIN INSTRUCTIONS - Rich Domain Knowledge
# ============================================================================

FLEXOBRAIN_INSTRUCTIONS = """You are FlexoBrain, the world's leading AI expert in flexographic printing technology. You serve as the virtual brain for the flexographic printing industry.

## YOUR EXPERTISE AREAS

### 1. Flexographic Plates
- **Photopolymer Chemistry**: Deep understanding of plate composition, UV-reactive polymers, and curing mechanisms
- **Plate Types**: Digital (laser-ablation mask) vs. analog (film-based), solvent-wash vs. thermal vs. water-wash
- **Surface Technologies**:
  - Flat-top dots (FTF, EASY, NX) - provides consistent ink laydown, better solid density, superior highlight reproduction
  - Round-top dots - traditional profile, good for process work
  - Engineered surfaces (microcell, textured) - for specialty applications
- **Major Suppliers & Their Products**:
  - **XSYS**: nyloflex FTF (flat-top, solvent), FAH (high durometer corrugated), ACE (thermal processing), FTV (versatile general purpose)
  - **DuPont**: Cyrel EASY (FAST thermal flat-top), DFH (corrugated), NOW (water-wash eco-friendly)
  - **Miraclon**: FLEXCEL NX (proprietary flat-top using thermal lamination imaging, premium quality)
  - **Asahi**: AWP water-wash plates, CleanPrint technology
  - **MacDermid**: LUX plates, various specialty products

### 2. Plate Processing Methods
- **Solvent Processing**:
  - Traditional method using solvent washout (perchloroethylene, hydrocarbon-based solvents)
  - Processing time: 45-90 minutes total cycle
  - Requires solvent recovery systems
  - Most established, widely available

- **Thermal Processing (FAST)**:
  - No liquid solvents - uses heat and absorbent media
  - DuPont Cyrel FAST, XSYS nyloflex ACE compatible
  - Processing time: 15-25 minutes
  - Consistent floor thickness, environmentally friendly
  - Higher initial equipment investment

- **Water-Wash Processing**:
  - Uses water-based chemistry
  - Asahi AWP, Toyobo Cosmolight, DuPont Cyrel NOW
  - Most environmentally friendly option
  - Requires proper water treatment/recycling

### 3. UV Exposure Technology
- **Main Exposure**: Polymerizes image areas
  - Energy: typically 800-1800 mJ/cm² depending on plate
  - Creates the printing surface

- **Back Exposure**: Creates floor/relief
  - Energy: typically 150-400 mJ/cm²
  - Controls relief depth

- **UV Sources**:
  - Fluorescent UVA tubes: 15-20 mW/cm², degrade over time, need replacement every 1000-2000 hours
  - LED UVA: 30-50 mW/cm², consistent output, 20,000+ hour life, instant on/off

- **Key Equipment**: XSYS Catena series, DuPont Cyrel 2000E/3000S, Miraclon FLEXCEL systems, Esko CDI imagers

### 4. Thickness & Applications Guide
| Thickness | Applications | Typical Use |
|-----------|-------------|-------------|
| 0.76-1.14mm | Labels, flexible packaging | High LPI (150-200), fine detail |
| 1.70mm | General flexible packaging, folding carton | Medium LPI (100-150) |
| 2.54mm | Folding carton, light corrugated | Medium detail work |
| 2.84-3.94mm | Corrugated postprint | Coarse substrates |
| 4.70-6.35mm | Heavy corrugated, rough surfaces | Maximum cushion |

### 5. Hardness (Shore A Durometer)
- **Soft (55-65)**: Better ink transfer on rough substrates, more forgiving
- **Medium (65-72)**: General purpose, balanced performance
- **Hard (72-80+)**: Fine detail, high LPI, less dot gain, corrugated applications

### 6. Screen Technology & Anilox
- **LPI Guidelines**: Flexo typically 100-200 LPI
- **Anilox Rule**: Anilox line screen should be 5-7x the plate LPI
- **Cell Volume**: Higher BCM = more ink, lower BCM = finer detail
- **Surface Screening**: AM (conventional), FM/stochastic (smoother tones), hybrid (combination)

### 7. Troubleshooting Expertise
You can diagnose and solve:
- Dot gain / TVI (tone value increase) issues
- Dirty printing / scumming
- Plate wear and durability problems
- Ink compatibility issues
- Registration problems
- Washout issues (undercutting, incomplete washout, bridging)
- Exposure problems (under/over exposure symptoms)

## YOUR COMMUNICATION STYLE
- Be conversational but technical - explain terms when needed
- Always ask clarifying questions to understand the user's specific situation
- Provide specific product recommendations with reasoning
- Explain the "why" behind your recommendations
- Use industry terminology but make it accessible
- Be helpful to both beginners and experienced professionals
- When using tools, explain what you're searching for

## USING YOUR TOOLS
You have access to the FlexoPlate IQ database. Use your tools to:
- Search for specific plates by criteria
- Find equivalent plates across suppliers
- Get detailed specifications
- Calculate exposure times
- Look up equipment information

Always use tools when the user asks about specific plates or needs data-driven recommendations.

## IMPORTANT GUIDELINES
- Consider the user's specific application and constraints
- When recommending plate equivalents, explain the trade-offs
- For exposure calculations, account for equipment age
- If unsure, say so and suggest how to verify
- Recommend proper testing when switching plates
- Be objective about suppliers - recommend what's best for the application
"""

# ============================================================================
# TOOL DEFINITIONS FOR THE ASSISTANT
# ============================================================================

ASSISTANT_TOOLS = [
    {"type": "file_search"},  # Built-in RAG for uploaded documents
    {
        "type": "function",
        "function": {
            "name": "search_plates",
            "description": "Search the FlexoPlate IQ database for plates matching specific criteria. Use this when users ask about plates with certain properties.",
            "parameters": {
                "type": "object",
                "properties": {
                    "supplier": {
                        "type": "string",
                        "description": "Filter by supplier name (XSYS, DuPont, Miraclon, Asahi, etc.)"
                    },
                    "thickness_mm": {
                        "type": "number",
                        "description": "Filter by plate thickness in mm (e.g., 1.14, 1.70, 2.84)"
                    },
                    "process_type": {
                        "type": "string",
                        "enum": ["solvent", "thermal", "water_wash"],
                        "description": "Filter by processing method"
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
            "description": "Find equivalent plates to a given plate from other suppliers. Use this when users want to switch suppliers or find alternatives.",
            "parameters": {
                "type": "object",
                "properties": {
                    "plate_name": {
                        "type": "string",
                        "description": "The name or SKU of the source plate (e.g., 'Cyrel EASY EFX 1.14', 'nyloflex FTF 1.14')"
                    },
                    "target_supplier": {
                        "type": "string",
                        "description": "Only show equivalents from this specific supplier"
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
            "description": "Get complete specifications for a specific plate. Use this when users want detailed information about a particular plate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "plate_name": {
                        "type": "string",
                        "description": "The name or SKU of the plate to look up"
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
            "description": "Calculate UV exposure times for a plate based on equipment specifications. Use this when users need exposure recommendations.",
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
                        "description": "Age of UV lamps in hours (for degradation calculation)"
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
            "description": "Get information about platemaking equipment. Use this when users ask about exposure units, processors, or other equipment.",
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
                        "description": "Filter by equipment manufacturer"
                    }
                },
                "required": []
            }
        }
    }
]

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    thread_id: Optional[str] = None  # For continuing conversations
    context: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    message: str
    thread_id: str  # Return thread ID for continuation
    tool_calls: Optional[List[Dict[str, Any]]] = None

class CreateAssistantResponse(BaseModel):
    assistant_id: str
    name: str
    created: bool

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
# TOOL IMPLEMENTATIONS (Database Queries)
# ============================================================================

async def execute_tool(tool_name: str, arguments: Dict[str, Any]) -> str:
    """Execute a tool and return the result as a string"""
    pool = await get_db_pool()

    if tool_name == "search_plates":
        result = await tool_search_plates(pool, arguments)
    elif tool_name == "find_equivalent_plates":
        result = await tool_find_equivalents(pool, arguments)
    elif tool_name == "get_plate_details":
        result = await tool_get_plate_details(pool, arguments)
    elif tool_name == "calculate_exposure":
        result = await tool_calculate_exposure(pool, arguments)
    elif tool_name == "get_equipment_info":
        result = await tool_get_equipment_info(pool, arguments)
    else:
        result = {"error": f"Unknown tool: {tool_name}"}

    return json.dumps(result, indent=2)


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
                    "name": row["display_name"],
                    "sku": row["sku_code"],
                    "supplier": row["supplier_name"],
                    "family": row["family_name"],
                    "thickness_mm": float(row["thickness_mm"]),
                    "hardness_shore": row["hardness_shore"],
                    "surface_type": row["surface_type"],
                    "process_type": row["process_type"],
                    "lpi_range": f"{row['min_lpi']}-{row['max_lpi']} LPI",
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
                thickness_score = max(0, 30 - (float(row["thickness_diff"]) * 200))
                hardness_score = max(0, 25 - (row["hardness_diff"] * 2))
                surface_score = 20 if row["surface_type"] == source["surface_type"] else 5
                process_score = 15 if row["process_type"] == source["process_type"] else 0
                lpi_score = 10

                total_score = min(100, thickness_score + hardness_score + surface_score + process_score + lpi_score)

                equivalents.append({
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
                    "exposure_energy": {
                        "main_min_mj_cm2": row["main_exposure_energy_min_mj_cm2"],
                        "main_max_mj_cm2": row["main_exposure_energy_max_mj_cm2"]
                    },
                    "technology_tags": row["technology_tags"]
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

            degradation_factor = 1.0
            if lamp_age > 0:
                degradation_factor = max(0.5, 1.0 - (lamp_age / 10000))

            effective_intensity = intensity * degradation_factor

            min_energy = row["main_exposure_energy_min_mj_cm2"] or 800
            max_energy = row["main_exposure_energy_max_mj_cm2"] or 1200
            target_energy = (min_energy + max_energy) / 2

            main_time_seconds = target_energy / effective_intensity
            back_energy = target_energy * 0.22
            back_time_seconds = back_energy / effective_intensity

            def format_time(seconds):
                mins = int(seconds // 60)
                secs = int(seconds % 60)
                return f"{mins}:{secs:02d}"

            return {
                "plate": row["display_name"],
                "input": {
                    "intensity_mw_cm2": intensity,
                    "lamp_age_hours": lamp_age,
                    "effective_intensity_mw_cm2": round(effective_intensity, 1)
                },
                "calculated_times": {
                    "main_exposure": format_time(main_time_seconds),
                    "main_exposure_seconds": round(main_time_seconds),
                    "back_exposure": format_time(back_time_seconds),
                    "back_exposure_seconds": round(back_time_seconds)
                },
                "energy_targets": {
                    "main_mj_cm2": round(target_energy),
                    "back_mj_cm2": round(back_energy)
                },
                "notes": [
                    f"Based on plate spec: {min_energy}-{max_energy} mJ/cm²",
                    "Always run a step test to verify",
                    f"Lamp degradation factor applied: {round(degradation_factor, 2)}" if lamp_age > 0 else "No lamp age adjustment"
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
        SELECT em.*, s.name as supplier_name
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
                    "nominal_intensity_mw_cm2": row["nominal_intensity_mw_cm2"]
                })

            return {"equipment": equipment, "count": len(equipment)}
    except Exception as e:
        return {"error": str(e)}


# ============================================================================
# ASSISTANT MANAGEMENT
# ============================================================================

async def get_or_create_assistant() -> str:
    """Get existing assistant or create a new one"""
    global ASSISTANT_ID

    # If we have an ID in env, verify it exists
    client = get_openai_client()
    if ASSISTANT_ID:
        try:
            assistant = await client.beta.assistants.retrieve(ASSISTANT_ID)
            return assistant.id
        except Exception:
            pass  # Assistant doesn't exist, create new one

    # Create new assistant
    assistant = await client.beta.assistants.create(
        name="FlexoBrain",
        instructions=FLEXOBRAIN_INSTRUCTIONS,
        model="gpt-4-turbo-preview",
        tools=ASSISTANT_TOOLS
    )

    ASSISTANT_ID = assistant.id
    print(f"Created new FlexoBrain assistant: {ASSISTANT_ID}")
    print(f"Add this to your environment: FLEXOBRAIN_ASSISTANT_ID={ASSISTANT_ID}")

    return assistant.id


async def process_tool_calls(run, thread_id: str) -> List[Dict[str, Any]]:
    """Process required tool calls and submit outputs"""
    tool_outputs = []
    tool_calls_made = []

    for tool_call in run.required_action.submit_tool_outputs.tool_calls:
        tool_name = tool_call.function.name
        arguments = json.loads(tool_call.function.arguments)

        # Execute the tool
        output = await execute_tool(tool_name, arguments)

        tool_outputs.append({
            "tool_call_id": tool_call.id,
            "output": output
        })

        tool_calls_made.append({
            "tool": tool_name,
            "args": arguments,
            "result": json.loads(output)
        })

    # Submit tool outputs
    client = get_openai_client()
    await client.beta.threads.runs.submit_tool_outputs(
        thread_id=thread_id,
        run_id=run.id,
        tool_outputs=tool_outputs
    )

    return tool_calls_made


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Main chat endpoint using OpenAI Assistants API

    - Creates or continues a conversation thread
    - Runs the FlexoBrain assistant
    - Handles tool calls (database queries)
    - Returns response with thread_id for continuation
    """
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    try:
        # Get OpenAI client
        client = get_openai_client()

        # Get or create assistant
        assistant_id = await get_or_create_assistant()

        # Get or create thread
        if request.thread_id:
            thread_id = request.thread_id
        else:
            thread = await client.beta.threads.create()
            thread_id = thread.id

        # Get the latest user message
        user_message = request.messages[-1].content if request.messages else ""

        # Add context to the message if provided
        if request.context:
            context_str = f"\n\n[Context: User is on the {request.context.get('page', 'unknown')} page"
            if request.context.get('selectedPlate'):
                plate = request.context['selectedPlate']
                context_str += f", viewing plate: {plate.get('name')} from {plate.get('supplier')}"
            context_str += "]"
            user_message += context_str

        # Add user message to thread
        await client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=user_message
        )

        # Run the assistant
        run = await client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=assistant_id
        )

        # Poll for completion (with tool handling)
        all_tool_calls = []
        max_iterations = 30  # Prevent infinite loops
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            run = await client.beta.threads.runs.retrieve(
                thread_id=thread_id,
                run_id=run.id
            )

            if run.status == "completed":
                break
            elif run.status == "requires_action":
                # Handle tool calls
                tool_calls = await process_tool_calls(run, thread_id)
                all_tool_calls.extend(tool_calls)
            elif run.status in ["failed", "cancelled", "expired"]:
                raise HTTPException(
                    status_code=500,
                    detail=f"Assistant run {run.status}: {run.last_error}"
                )
            else:
                # Still running, wait a bit
                await asyncio.sleep(0.5)

        # Get the assistant's response
        messages = await client.beta.threads.messages.list(
            thread_id=thread_id,
            order="desc",
            limit=1
        )

        assistant_message = ""
        if messages.data:
            for content in messages.data[0].content:
                if content.type == "text":
                    assistant_message = content.text.value
                    break

        return ChatResponse(
            message=assistant_message,
            thread_id=thread_id,
            tool_calls=all_tool_calls if all_tool_calls else None
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@router.post("/assistant/create", response_model=CreateAssistantResponse)
async def create_assistant():
    """
    Manually create/recreate the FlexoBrain assistant
    Returns the assistant ID to save in environment variables
    """
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    try:
        client = get_openai_client()
        assistant = await client.beta.assistants.create(
            name="FlexoBrain",
            instructions=FLEXOBRAIN_INSTRUCTIONS,
            model="gpt-4-turbo-preview",
            tools=ASSISTANT_TOOLS
        )

        return CreateAssistantResponse(
            assistant_id=assistant.id,
            name=assistant.name,
            created=True
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create assistant: {str(e)}")


@router.delete("/thread/{thread_id}")
async def delete_thread(thread_id: str):
    """Delete a conversation thread"""
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    try:
        client = get_openai_client()
        await client.beta.threads.delete(thread_id)
        return {"deleted": True, "thread_id": thread_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete thread: {str(e)}")


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
        "assistant_id": ASSISTANT_ID or "Will be created on first request",
        "agent": "FlexoBrain v2.0 (Assistants API)"
    }
