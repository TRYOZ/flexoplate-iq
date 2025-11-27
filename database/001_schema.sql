-- ============================================================================
-- FlexoPlate IQ - Database Schema
-- Plate Equivalency & Exposure Assistant
-- ============================================================================
-- Version: 1.0.0
-- Database: PostgreSQL 14+
-- Description: Complete schema for multi-tenant plate room management system
--              supporting plate equivalency lookup and exposure calculations
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SECTION 1: MULTI-TENANT FOUNDATION
-- ============================================================================

-- Organizations (trade shops, converters, etc.)
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    billing_email   TEXT,
    country         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'Top-level tenant representing trade shops, converters, or plate rooms';

-- Sites (physical locations/plants within an organization)
CREATE TABLE sites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    timezone        TEXT DEFAULT 'UTC',
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sites_org_idx ON sites(organization_id);

COMMENT ON TABLE sites IS 'Physical locations or plate rooms within an organization';

-- ============================================================================
-- SECTION 2: USER MANAGEMENT
-- ============================================================================

-- User roles enum-like check
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX users_org_email_uniq ON users(organization_id, email);
CREATE INDEX users_org_idx ON users(organization_id);

COMMENT ON TABLE users IS 'Application users with role-based access within their organization';
COMMENT ON COLUMN users.role IS 'owner: full control | admin: manage users/settings | operator: create/edit recipes | viewer: read-only';

-- ============================================================================
-- SECTION 3: SUPPLIERS (PLATES & EQUIPMENT)
-- ============================================================================

-- Global supplier registry
CREATE TABLE suppliers (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  TEXT NOT NULL UNIQUE,
    website_url           TEXT,
    country               TEXT,
    is_plate_supplier     BOOLEAN NOT NULL DEFAULT FALSE,
    is_equipment_supplier BOOLEAN NOT NULL DEFAULT FALSE,
    logo_url              TEXT,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE suppliers IS 'Global vendor registry: XSYS, DuPont, Asahi, Miraclon, Lucky Huaguang, MacDermid, Flint, etc.';

-- ============================================================================
-- SECTION 4: PLATE CATALOG
-- ============================================================================

-- Plate families (e.g., nyloflex FTV, Cyrel EASY EFM, FLEXCEL NXC)
CREATE TABLE plate_families (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    family_name     TEXT NOT NULL,
    technology_tags TEXT[],
    process_type    TEXT CHECK (process_type IN ('solvent', 'thermal', 'water_wash')),
    description     TEXT,
    data_source_url TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(supplier_id, family_name)
);

CREATE INDEX plate_families_supplier_idx ON plate_families(supplier_id);

COMMENT ON TABLE plate_families IS 'Plate product lines/families from each supplier';
COMMENT ON COLUMN plate_families.technology_tags IS 'Array: flat_top_dot, digital, high_resolution, etc.';
COMMENT ON COLUMN plate_families.process_type IS 'Processing method: solvent, thermal, or water_wash';

-- Individual plate SKUs (global catalog + org-specific custom plates)
CREATE TABLE plates (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_family_id                 UUID NOT NULL REFERENCES plate_families(id) ON DELETE RESTRICT,
    organization_id                 UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Identification
    sku_code                        TEXT,
    display_name                    TEXT,
    
    -- Physical properties
    thickness_mm                    NUMERIC(5,3) NOT NULL,
    thickness_inch                  NUMERIC(5,3) GENERATED ALWAYS AS (thickness_mm / 25.4) STORED,
    hardness_shore                  NUMERIC(5,1),
    hardness_scale                  TEXT DEFAULT 'A' CHECK (hardness_scale IN ('A', 'C', 'D')),
    
    -- Technical characteristics
    imaging_type                    TEXT CHECK (imaging_type IN ('digital', 'analog')),
    surface_type                    TEXT CHECK (surface_type IN ('flat_top', 'round_top', 'microcell', 'textured')),
    relief_recommended_mm           NUMERIC(5,3),
    
    -- Resolution capabilities
    min_lpi                         INTEGER,
    max_lpi                         INTEGER,
    min_dot_percent                 NUMERIC(4,2),
    max_dot_percent                 NUMERIC(4,2),
    
    -- Compatibility arrays
    ink_compatibility               TEXT[],
    substrate_categories            TEXT[],
    applications                    TEXT[],
    
    -- Vendor exposure recommendations (mJ/cm²)
    main_exposure_energy_min_mj_cm2 NUMERIC(7,3),
    main_exposure_energy_max_mj_cm2 NUMERIC(7,3),
    back_exposure_energy_min_mj_cm2 NUMERIC(7,3),
    back_exposure_energy_max_mj_cm2 NUMERIC(7,3),
    post_exposure_energy_mj_cm2     NUMERIC(7,3),
    detack_energy_mj_cm2            NUMERIC(7,3),
    
    -- Status
    is_active                       BOOLEAN NOT NULL DEFAULT TRUE,
    notes                           TEXT,
    data_source_url                 TEXT,
    
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX plates_family_idx ON plates(plate_family_id);
CREATE INDEX plates_thickness_idx ON plates(thickness_mm);
CREATE INDEX plates_org_idx ON plates(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX plates_imaging_idx ON plates(imaging_type);
CREATE INDEX plates_process_type_idx ON plates(plate_family_id, thickness_mm);

COMMENT ON TABLE plates IS 'Individual plate SKUs. organization_id NULL = global catalog, non-null = org-specific custom plate';
COMMENT ON COLUMN plates.ink_compatibility IS 'Array: solvent, water, UV, EB';
COMMENT ON COLUMN plates.substrate_categories IS 'Array: film, coated_paper, uncoated_paper, linerboard, corrugated';
COMMENT ON COLUMN plates.applications IS 'Array: flexible_packaging, labels, folding_carton, corrugated_preprint, corrugated_postprint';

-- ============================================================================
-- SECTION 5: PLATE EQUIVALENCY
-- ============================================================================

-- Manual equivalency overrides and curated pairings
CREATE TABLE plate_equivalency_rules (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_plate_id      UUID NOT NULL REFERENCES plates(id) ON DELETE CASCADE,
    target_plate_id      UUID NOT NULL REFERENCES plates(id) ON DELETE CASCADE,
    similarity_score     INTEGER CHECK (similarity_score >= 0 AND similarity_score <= 100),
    is_manual_override   BOOLEAN NOT NULL DEFAULT TRUE,
    confidence_level     TEXT CHECK (confidence_level IN ('high', 'medium', 'low')),
    notes                TEXT,
    adjustment_notes     TEXT,
    created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT no_self_equivalency CHECK (source_plate_id != target_plate_id)
);

CREATE UNIQUE INDEX plate_equiv_unique ON plate_equivalency_rules(source_plate_id, target_plate_id);
CREATE INDEX plate_equiv_source_idx ON plate_equivalency_rules(source_plate_id);
CREATE INDEX plate_equiv_target_idx ON plate_equivalency_rules(target_plate_id);

COMMENT ON TABLE plate_equivalency_rules IS 'Manual overrides for plate equivalency. Algorithm calculates dynamically; this table stores curated exceptions';
COMMENT ON COLUMN plate_equivalency_rules.adjustment_notes IS 'E.g., "Slightly harder; bump highlights 3-5%" or "Reduce main exposure by 10%"';

-- Equivalency weight configuration (for algorithm tuning)
CREATE TABLE equivalency_weight_config (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id         UUID REFERENCES organizations(id) ON DELETE CASCADE,
    config_name             TEXT NOT NULL,
    is_default              BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Weight values (0-100, should sum to 100 for normalized scoring)
    weight_thickness        INTEGER NOT NULL DEFAULT 40,
    weight_process_type     INTEGER NOT NULL DEFAULT 20,
    weight_hardness         INTEGER NOT NULL DEFAULT 15,
    weight_surface_type     INTEGER NOT NULL DEFAULT 10,
    weight_lpi_range        INTEGER NOT NULL DEFAULT 5,
    weight_application      INTEGER NOT NULL DEFAULT 5,
    weight_ink_compat       INTEGER NOT NULL DEFAULT 5,
    
    -- Tolerances
    hardness_tolerance      NUMERIC(4,1) DEFAULT 2.0,
    thickness_tolerance_mm  NUMERIC(5,3) DEFAULT 0.05,
    
    created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX equiv_weight_org_idx ON equivalency_weight_config(organization_id);

COMMENT ON TABLE equivalency_weight_config IS 'Configurable weights for plate equivalency scoring algorithm';

-- ============================================================================
-- SECTION 6: EQUIPMENT CATALOG
-- ============================================================================

-- Equipment models (global catalog)
CREATE TABLE equipment_models (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id                 UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    model_name                  TEXT NOT NULL,
    equipment_type              TEXT NOT NULL CHECK (equipment_type IN (
        'IMAGER', 'BACK_EXPOSURE', 'MAIN_EXPOSURE', 'COMBINED_EXPOSURE',
        'PROCESSOR_SOLVENT', 'PROCESSOR_THERMAL', 'PROCESSOR_WATER',
        'DRYER', 'FINISHER', 'LIGHT_FINISHER', 'INTEGRATED_SYSTEM', 'OTHER'
    )),
    technology                  TEXT,
    
    -- Plate compatibility
    min_plate_thickness_mm      NUMERIC(5,3),
    max_plate_thickness_mm      NUMERIC(5,3),
    max_plate_width_mm          NUMERIC(6,1),
    max_plate_length_mm         NUMERIC(6,1),
    
    -- Capabilities
    has_integrated_back_exposure BOOLEAN NOT NULL DEFAULT FALSE,
    supports_digital_plates      BOOLEAN NOT NULL DEFAULT TRUE,
    supports_analog_plates       BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- UV specifications (for exposure units)
    uv_source_type              TEXT CHECK (uv_source_type IN ('fluorescent_UVA', 'LED_UVA', 'mercury_vapor', 'metal_halide')),
    nominal_intensity_mw_cm2    NUMERIC(7,2),
    wavelength_nm               INTEGER,
    
    data_source_url             TEXT,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(supplier_id, model_name)
);

CREATE INDEX equipment_models_supplier_idx ON equipment_models(supplier_id);
CREATE INDEX equipment_models_type_idx ON equipment_models(equipment_type);

COMMENT ON TABLE equipment_models IS 'Global catalog of equipment models: Cyrel FAST, Catena, FLEXCEL NX, Lucky Huaguang systems, etc.';
COMMENT ON COLUMN equipment_models.technology IS 'Free-form: fluorescent_UVA, LED_UVA, thermal, solvent, water_wash';

-- Equipment instances (per site)
CREATE TABLE equipment_instances (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    equipment_model_id  UUID NOT NULL REFERENCES equipment_models(id) ON DELETE RESTRICT,
    
    display_name        TEXT NOT NULL,
    serial_number       TEXT,
    asset_tag           TEXT,
    
    role_hint           TEXT CHECK (role_hint IN (
        'BACK_EXPOSURE', 'MAIN_EXPOSURE', 'POST_EXPOSURE', 'DETACK',
        'PROCESSOR', 'DRYER', 'FINISHER', 'COMBINED', 'IMAGER'
    )),
    
    installed_at        DATE,
    last_maintenance_at DATE,
    next_maintenance_at DATE,
    lamp_hours          INTEGER,
    lamp_replaced_at    DATE,
    
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'offline')),
    location_note       TEXT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX equipment_instances_org_idx ON equipment_instances(organization_id);
CREATE INDEX equipment_instances_site_idx ON equipment_instances(site_id);
CREATE INDEX equipment_instances_model_idx ON equipment_instances(equipment_model_id);
CREATE INDEX equipment_instances_status_idx ON equipment_instances(status) WHERE status = 'active';

COMMENT ON TABLE equipment_instances IS 'Actual equipment installed at customer sites';
COMMENT ON COLUMN equipment_instances.role_hint IS 'Primary function for UI filtering';

-- ============================================================================
-- SECTION 7: UV MEASUREMENTS (Exposure Calculator Input)
-- ============================================================================

CREATE TABLE uv_measurements (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipment_instance_id   UUID NOT NULL REFERENCES equipment_instances(id) ON DELETE CASCADE,
    measured_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measurement_type        TEXT NOT NULL CHECK (measurement_type IN (
        'MAIN_EXPOSURE', 'BACK_EXPOSURE', 'POST_EXPOSURE', 'GENERIC'
    )),
    measured_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    
    intensity_value         NUMERIC(10,3) NOT NULL,
    intensity_unit          TEXT NOT NULL CHECK (intensity_unit IN ('mW/cm2', 'mJ/cm2', 'integrator_units')),
    
    radiometer_model        TEXT,
    radiometer_serial       TEXT,
    measurement_position    TEXT,
    ambient_temp_c          NUMERIC(4,1),
    
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX uv_measurements_equipment_idx ON uv_measurements(equipment_instance_id);
CREATE INDEX uv_measurements_date_idx ON uv_measurements(measured_at DESC);
CREATE INDEX uv_measurements_type_idx ON uv_measurements(equipment_instance_id, measurement_type);

COMMENT ON TABLE uv_measurements IS 'UV intensity readings for exposure units, used for exposure time calculations';
COMMENT ON COLUMN uv_measurements.intensity_unit IS 'mW/cm2 for instantaneous, mJ/cm2 for energy, integrator_units for integrated readings';

-- ============================================================================
-- SECTION 8: RECIPES & EXPOSURE PARAMETERS
-- ============================================================================

-- Recipe headers
CREATE TABLE recipes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id             UUID REFERENCES sites(id) ON DELETE SET NULL,
    plate_id            UUID NOT NULL REFERENCES plates(id) ON DELETE RESTRICT,
    
    name                TEXT NOT NULL,
    recipe_type         TEXT NOT NULL CHECK (recipe_type IN ('PLATE_PROFILE', 'JOB_SPECIFIC', 'TEST', 'CALIBRATION')),
    
    -- Job context (for job-specific recipes)
    customer_name       TEXT,
    job_name            TEXT,
    job_number          TEXT,
    
    -- Target specifications
    substrate_category  TEXT,
    ink_system          TEXT,
    target_lpi          INTEGER,
    target_floor_mm     NUMERIC(5,3),
    target_relief_mm    NUMERIC(5,3),
    
    -- Metadata
    created_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_template         BOOLEAN NOT NULL DEFAULT FALSE,
    parent_recipe_id    UUID REFERENCES recipes(id) ON DELETE SET NULL,
    
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recipes_org_idx ON recipes(organization_id);
CREATE INDEX recipes_site_idx ON recipes(site_id);
CREATE INDEX recipes_plate_idx ON recipes(plate_id);
CREATE INDEX recipes_customer_idx ON recipes(organization_id, customer_name) WHERE customer_name IS NOT NULL;
CREATE INDEX recipes_active_idx ON recipes(organization_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE recipes IS 'Saved exposure recipes combining plate + equipment + parameters';
COMMENT ON COLUMN recipes.recipe_type IS 'PLATE_PROFILE: general plate setup | JOB_SPECIFIC: customer/job tied | TEST/CALIBRATION: internal use';

-- Recipe steps (back exposure, main exposure, post exposure, etc.)
CREATE TABLE recipe_steps (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id                   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_order                  INTEGER NOT NULL,
    step_type                   TEXT NOT NULL CHECK (step_type IN (
        'BACK_EXPOSURE', 'MAIN_EXPOSURE', 'POST_EXPOSURE', 'DETACK',
        'WASHOUT', 'DRYING', 'OTHER'
    )),
    
    equipment_instance_id       UUID REFERENCES equipment_instances(id) ON DELETE SET NULL,
    
    -- Target parameters
    target_energy_mj_cm2        NUMERIC(7,3),
    target_time_seconds         NUMERIC(7,2),
    min_time_seconds            NUMERIC(7,2),
    max_time_seconds            NUMERIC(7,2),
    
    -- Reference calibration
    reference_uv_measurement_id UUID REFERENCES uv_measurements(id) ON DELETE SET NULL,
    reference_intensity_mw_cm2  NUMERIC(10,3),
    
    -- Additional parameters
    temperature_c               NUMERIC(4,1),
    speed_setting               TEXT,
    power_percent               INTEGER CHECK (power_percent >= 0 AND power_percent <= 100),
    passes                      INTEGER DEFAULT 1,
    
    comments                    TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(recipe_id, step_order)
);

CREATE INDEX recipe_steps_recipe_idx ON recipe_steps(recipe_id);
CREATE INDEX recipe_steps_equipment_idx ON recipe_steps(equipment_instance_id);

COMMENT ON TABLE recipe_steps IS 'Individual processing steps within a recipe';
COMMENT ON COLUMN recipe_steps.reference_uv_measurement_id IS 'Links recipe to specific lamp calibration for time scaling';

-- ============================================================================
-- SECTION 9: RECIPE RUN LOGS (QC & Auto-Tuning)
-- ============================================================================

CREATE TABLE recipe_run_logs (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id                   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    site_id                     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    
    -- Run details
    run_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    plate_batch                 TEXT,
    plate_serial                TEXT,
    
    -- Actual parameters used
    used_uv_measurement_id      UUID REFERENCES uv_measurements(id) ON DELETE SET NULL,
    used_back_exposure_time_s   NUMERIC(7,2),
    used_main_exposure_time_s   NUMERIC(7,2),
    used_post_exposure_time_s   NUMERIC(7,2),
    
    -- Measured results
    measured_plate_thickness_mm NUMERIC(5,3),
    measured_floor_thickness_mm NUMERIC(5,3),
    measured_relief_mm          NUMERIC(5,3),
    
    -- QC evaluation
    qc_result                   TEXT CHECK (qc_result IN ('PASS', 'FAIL', 'MARGINAL', 'PENDING')),
    highlight_result            TEXT CHECK (highlight_result IN ('GOOD', 'PLUGGED', 'OPEN', 'NA')),
    solid_result                TEXT CHECK (solid_result IN ('GOOD', 'WEAK', 'OVEREXPOSED', 'NA')),
    
    qc_notes                    TEXT,
    qc_image_url                TEXT,
    
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recipe_run_logs_recipe_idx ON recipe_run_logs(recipe_id);
CREATE INDEX recipe_run_logs_site_idx ON recipe_run_logs(site_id);
CREATE INDEX recipe_run_logs_date_idx ON recipe_run_logs(run_at DESC);
CREATE INDEX recipe_run_logs_qc_idx ON recipe_run_logs(recipe_id, qc_result);

COMMENT ON TABLE recipe_run_logs IS 'Historical log of recipe executions for QC tracking and auto-tuning';
COMMENT ON COLUMN recipe_run_logs.qc_result IS 'PASS: meets spec | FAIL: remake required | MARGINAL: acceptable but not ideal';

-- ============================================================================
-- SECTION 10: AUDIT & VERSIONING
-- ============================================================================

-- Generic audit log for compliance
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_org_idx ON audit_log(organization_id);
CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id);
CREATE INDEX audit_log_date_idx ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS 'Audit trail for compliance and change tracking';

-- ============================================================================
-- SECTION 11: HELPER VIEWS
-- ============================================================================

-- View: Full plate details with family and supplier info
CREATE VIEW v_plates_full AS
SELECT 
    p.id,
    p.sku_code,
    p.display_name,
    p.thickness_mm,
    p.thickness_inch,
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
    p.organization_id,
    pf.id AS family_id,
    pf.family_name,
    pf.process_type,
    pf.technology_tags,
    s.id AS supplier_id,
    s.name AS supplier_name
FROM plates p
JOIN plate_families pf ON p.plate_family_id = pf.id
JOIN suppliers s ON pf.supplier_id = s.id;

-- View: Equipment instances with model details
CREATE VIEW v_equipment_full AS
SELECT 
    ei.id,
    ei.display_name,
    ei.serial_number,
    ei.role_hint,
    ei.status,
    ei.lamp_hours,
    ei.site_id,
    ei.organization_id,
    em.id AS model_id,
    em.model_name,
    em.equipment_type,
    em.technology,
    em.uv_source_type,
    em.nominal_intensity_mw_cm2,
    s.id AS supplier_id,
    s.name AS supplier_name,
    st.name AS site_name
FROM equipment_instances ei
JOIN equipment_models em ON ei.equipment_model_id = em.id
JOIN suppliers s ON em.supplier_id = s.id
JOIN sites st ON ei.site_id = st.id;

-- View: Latest UV measurement per equipment instance
CREATE VIEW v_latest_uv_measurements AS
SELECT DISTINCT ON (equipment_instance_id, measurement_type)
    id,
    equipment_instance_id,
    measurement_type,
    measured_at,
    intensity_value,
    intensity_unit,
    radiometer_model,
    measured_by_user_id
FROM uv_measurements
ORDER BY equipment_instance_id, measurement_type, measured_at DESC;

-- ============================================================================
-- SECTION 12: FUNCTIONS
-- ============================================================================

-- Function: Calculate exposure time based on current UV measurement
CREATE OR REPLACE FUNCTION calculate_exposure_time(
    p_target_energy_mj_cm2 NUMERIC,
    p_current_intensity_mw_cm2 NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    -- Time (seconds) = Energy (mJ/cm²) / Intensity (mW/cm²)
    -- mJ/cm² ÷ mW/cm² = seconds (since mJ = mW × s)
    IF p_current_intensity_mw_cm2 IS NULL OR p_current_intensity_mw_cm2 <= 0 THEN
        RETURN NULL;
    END IF;
    
    RETURN ROUND(p_target_energy_mj_cm2 / p_current_intensity_mw_cm2, 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_exposure_time IS 'Calculate exposure time in seconds from target energy and current intensity';

-- Function: Scale recipe time based on current vs reference intensity
CREATE OR REPLACE FUNCTION scale_exposure_time(
    p_reference_time_s NUMERIC,
    p_reference_intensity NUMERIC,
    p_current_intensity NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    IF p_current_intensity IS NULL OR p_current_intensity <= 0 THEN
        RETURN NULL;
    END IF;
    IF p_reference_intensity IS NULL OR p_reference_intensity <= 0 THEN
        RETURN p_reference_time_s;
    END IF;
    
    -- Lower intensity = longer time (inverse relationship)
    RETURN ROUND(p_reference_time_s * (p_reference_intensity / p_current_intensity), 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION scale_exposure_time IS 'Scale exposure time when lamp intensity changes from reference';

-- Function: Update timestamp trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update_timestamp trigger to relevant tables
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_plate_families_updated BEFORE UPDATE ON plate_families
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_plates_updated BEFORE UPDATE ON plates
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_equipment_models_updated BEFORE UPDATE ON equipment_models
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_equipment_instances_updated BEFORE UPDATE ON equipment_instances
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_recipe_steps_updated BEFORE UPDATE ON recipe_steps
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_equiv_weight_config_updated BEFORE UPDATE ON equivalency_weight_config
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- SECTION 13: SEED DATA - SUPPLIERS
-- ============================================================================

INSERT INTO suppliers (id, name, website_url, country, is_plate_supplier, is_equipment_supplier, notes) VALUES
    (uuid_generate_v4(), 'XSYS', 'https://www.xsys.com', 'Germany', TRUE, TRUE, 'nyloflex plates, Catena processing systems, Rotec sleeves'),
    (uuid_generate_v4(), 'DuPont', 'https://www.dupont.com', 'USA', TRUE, TRUE, 'Cyrel plates and platemaking equipment'),
    (uuid_generate_v4(), 'Miraclon', 'https://www.miraclon.com', 'USA', TRUE, TRUE, 'FLEXCEL NX plates and imaging/processing systems'),
    (uuid_generate_v4(), 'Asahi Photoproducts', 'https://www.asahi-photoproducts.com', 'Japan', TRUE, TRUE, 'Water-wash and solvent plates, CleanPrint technology'),
    (uuid_generate_v4(), 'Lucky Huaguang', 'https://www.luckygraphics.com', 'China', TRUE, TRUE, 'Digital and analog flexo plates, processing equipment'),
    (uuid_generate_v4(), 'MacDermid Graphics Solutions', 'https://www.macdermid.com', 'USA', TRUE, FALSE, 'LUX plates and photopolymer solutions'),
    (uuid_generate_v4(), 'Flint Group', 'https://www.flintgrp.com', 'Luxembourg', TRUE, TRUE, 'nyloflex and nyloprint plates (legacy), rotec sleeves'),
    (uuid_generate_v4(), 'Toyobo', 'https://www.toyobo.co.jp', 'Japan', TRUE, FALSE, 'Cosmolight water-wash plates'),
    (uuid_generate_v4(), 'Anderson & Vreeland', 'https://www.andersonvreeland.com', 'USA', FALSE, TRUE, 'Platemaking equipment distributor'),
    (uuid_generate_v4(), 'Esko', 'https://www.esko.com', 'Belgium', FALSE, TRUE, 'CDI imaging systems, workflow software');

-- ============================================================================
-- SECTION 14: SAMPLE PLATE FAMILIES (for reference)
-- ============================================================================

-- Note: In production, you would populate these from vendor datasheets
-- This shows the structure; actual data entry would be done via admin interface

/*
-- Example: XSYS nyloflex families
INSERT INTO plate_families (supplier_id, family_name, technology_tags, process_type, description) 
SELECT 
    id, 
    'nyloflex FTF',
    ARRAY['flat_top_dot', 'digital', 'high_resolution'],
    'solvent',
    'Flat-top dot technology for high-resolution flexible packaging and labels'
FROM suppliers WHERE name = 'XSYS';

-- Example: DuPont Cyrel families  
INSERT INTO plate_families (supplier_id, family_name, technology_tags, process_type, description)
SELECT 
    id,
    'Cyrel EASY EFX',
    ARRAY['flat_top_dot', 'digital', 'extended_gamut'],
    'solvent',
    'Extended color gamut plates for high-end flexible packaging'
FROM suppliers WHERE name = 'DuPont';
*/

-- ============================================================================
-- GRANTS (adjust based on your application user)
-- ============================================================================

-- Example: Grant permissions to application role
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flexoplate_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flexoplate_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO flexoplate_app;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
