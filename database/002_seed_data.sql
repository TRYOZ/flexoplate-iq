-- ============================================================================
-- FlexoPlate IQ - Sample Seed Data
-- Plate Families & Plates for XSYS and DuPont
-- ============================================================================
-- Run this AFTER the main schema file
-- ============================================================================

-- ============================================================================
-- XSYS NYLOFLEX PLATE FAMILIES
-- ============================================================================

-- Get XSYS supplier ID
DO $$
DECLARE
    v_xsys_id UUID;
    v_dupont_id UUID;
    v_miraclon_id UUID;
    v_family_id UUID;
BEGIN
    SELECT id INTO v_xsys_id FROM suppliers WHERE name = 'XSYS';
    SELECT id INTO v_dupont_id FROM suppliers WHERE name = 'DuPont';
    SELECT id INTO v_miraclon_id FROM suppliers WHERE name = 'Miraclon';

    -- ========================================================================
    -- XSYS nyloflex Families
    -- ========================================================================
    
    -- nyloflex FTF (Flat Top Flex)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description, data_source_url)
    VALUES (uuid_generate_v4(), v_xsys_id, 'nyloflex FTF', 
            ARRAY['flat_top_dot', 'digital', 'high_resolution'],
            'solvent',
            'Flat-top dot plates for high-quality flexible packaging and labels. Excellent ink transfer and print consistency.',
            'https://www.xsys.com/products/nyloflex-plates/')
    RETURNING id INTO v_family_id;
    
    -- FTF plates
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'FTF-114', 'nyloflex FTF 1.14', 1.14, 69, 'digital', 'flat_top', 133, 200, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging', 'labels'], 800, 1200),
    (v_family_id, 'FTF-170', 'nyloflex FTF 1.70', 1.70, 69, 'digital', 'flat_top', 100, 175, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper', 'folding_carton'], ARRAY['flexible_packaging', 'folding_carton'], 900, 1400);

    -- nyloflex FAH (High Durometer)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description)
    VALUES (uuid_generate_v4(), v_xsys_id, 'nyloflex FAH', 
            ARRAY['digital', 'high_durometer', 'corrugated'],
            'solvent',
            'High durometer plates optimized for corrugated postprint applications.')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'FAH-284', 'nyloflex FAH 2.84', 2.84, 78, 'digital', 'round_top', 65, 133, ARRAY['water', 'solvent'], ARRAY['corrugated', 'linerboard'], ARRAY['corrugated_postprint'], 1000, 1600),
    (v_family_id, 'FAH-380', 'nyloflex FAH 3.80', 3.80, 78, 'digital', 'round_top', 48, 100, ARRAY['water', 'solvent'], ARRAY['corrugated'], ARRAY['corrugated_postprint'], 1200, 1800);

    -- nyloflex ACE (All-round Clean Environment)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description)
    VALUES (uuid_generate_v4(), v_xsys_id, 'nyloflex ACE', 
            ARRAY['digital', 'thermal', 'solvent_free'],
            'thermal',
            'Thermal processing plates - no solvent washout required. Environmentally friendly.')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'ACE-114', 'nyloflex ACE 1.14', 1.14, 67, 'digital', 'flat_top', 133, 200, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging', 'labels'], 700, 1100);

    -- nyloflex FTV (Flexible Technical Versatile)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description)
    VALUES (uuid_generate_v4(), v_xsys_id, 'nyloflex FTV', 
            ARRAY['digital', 'versatile', 'general_purpose'],
            'solvent',
            'Versatile digital plates for general purpose flexible packaging.')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'FTV-114', 'nyloflex FTV 1.14', 1.14, 65, 'digital', 'round_top', 120, 175, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging'], 750, 1150),
    (v_family_id, 'FTV-170', 'nyloflex FTV 1.70', 1.70, 65, 'digital', 'round_top', 100, 150, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging'], 850, 1300);

    -- ========================================================================
    -- DuPont Cyrel Families
    -- ========================================================================
    
    -- Cyrel EASY
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description, data_source_url)
    VALUES (uuid_generate_v4(), v_dupont_id, 'Cyrel EASY', 
            ARRAY['flat_top_dot', 'digital', 'high_resolution', 'FAST_thermal'],
            'thermal',
            'FAST thermal plates with flat-top dot technology. Solvent-free processing.',
            'https://www.dupont.com/brands/cyrel.html')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'EASY-EFX-114', 'Cyrel EASY EFX 1.14', 1.14, 68, 'digital', 'flat_top', 150, 200, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging', 'labels'], 750, 1100),
    (v_family_id, 'EASY-EFM-114', 'Cyrel EASY EFM 1.14', 1.14, 66, 'digital', 'flat_top', 133, 175, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging'], 800, 1200),
    (v_family_id, 'EASY-EFM-170', 'Cyrel EASY EFM 1.70', 1.70, 66, 'digital', 'flat_top', 100, 150, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper', 'folding_carton'], ARRAY['flexible_packaging', 'folding_carton'], 900, 1350);

    -- Cyrel DFH (Digital Flexo High)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description)
    VALUES (uuid_generate_v4(), v_dupont_id, 'Cyrel DFH', 
            ARRAY['digital', 'high_durometer', 'corrugated'],
            'solvent',
            'High durometer solvent-wash plates for corrugated applications.')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'DFH-284', 'Cyrel DFH 2.84', 2.84, 76, 'digital', 'round_top', 65, 120, ARRAY['water', 'solvent'], ARRAY['corrugated', 'linerboard'], ARRAY['corrugated_postprint'], 1100, 1700),
    (v_family_id, 'DFH-380', 'Cyrel DFH 3.80', 3.80, 76, 'digital', 'round_top', 48, 85, ARRAY['water', 'solvent'], ARRAY['corrugated'], ARRAY['corrugated_postprint'], 1300, 1900);

    -- Cyrel NOW
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description)
    VALUES (uuid_generate_v4(), v_dupont_id, 'Cyrel NOW', 
            ARRAY['digital', 'water_wash', 'eco_friendly'],
            'water_wash',
            'Water-washable plates for environmentally conscious operations.')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'NOW-114', 'Cyrel NOW 1.14', 1.14, 64, 'digital', 'round_top', 120, 175, ARRAY['water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging', 'labels'], 850, 1250);

    -- ========================================================================
    -- Miraclon FLEXCEL NX Families
    -- ========================================================================
    
    -- FLEXCEL NXC (Corrugated)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description, data_source_url)
    VALUES (uuid_generate_v4(), v_miraclon_id, 'FLEXCEL NXC', 
            ARRAY['flat_top_dot', 'digital', 'NX_technology', 'corrugated'],
            'solvent',
            'NX flat-top dot technology optimized for corrugated preprint and postprint.',
            'https://www.miraclon.com/flexcel-nx-system/')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'NXC-284', 'FLEXCEL NXC 2.84', 2.84, 72, 'digital', 'flat_top', 85, 150, ARRAY['water', 'solvent'], ARRAY['corrugated', 'linerboard'], ARRAY['corrugated_preprint', 'corrugated_postprint'], 950, 1450),
    (v_family_id, 'NXC-380', 'FLEXCEL NXC 3.80', 3.80, 72, 'digital', 'flat_top', 65, 120, ARRAY['water', 'solvent'], ARRAY['corrugated'], ARRAY['corrugated_postprint'], 1100, 1650);

    -- FLEXCEL NXH (High Performance)
    INSERT INTO plate_families (id, supplier_id, family_name, technology_tags, process_type, description)
    VALUES (uuid_generate_v4(), v_miraclon_id, 'FLEXCEL NXH', 
            ARRAY['flat_top_dot', 'digital', 'NX_technology', 'high_performance'],
            'solvent',
            'High-performance NX plates for demanding flexible packaging applications.')
    RETURNING id INTO v_family_id;
    
    INSERT INTO plates (plate_family_id, sku_code, display_name, thickness_mm, hardness_shore, imaging_type, surface_type, min_lpi, max_lpi, ink_compatibility, substrate_categories, applications, main_exposure_energy_min_mj_cm2, main_exposure_energy_max_mj_cm2) VALUES
    (v_family_id, 'NXH-114', 'FLEXCEL NXH 1.14', 1.14, 70, 'digital', 'flat_top', 150, 200, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper'], ARRAY['flexible_packaging', 'labels'], 700, 1050),
    (v_family_id, 'NXH-170', 'FLEXCEL NXH 1.70', 1.70, 70, 'digital', 'flat_top', 120, 175, ARRAY['solvent', 'water', 'UV'], ARRAY['film', 'coated_paper', 'folding_carton'], ARRAY['flexible_packaging', 'folding_carton'], 800, 1200);

    RAISE NOTICE 'Seed data inserted successfully';
END $$;

-- ============================================================================
-- SAMPLE EQUIPMENT MODELS
-- ============================================================================

DO $$
DECLARE
    v_xsys_id UUID;
    v_dupont_id UUID;
    v_miraclon_id UUID;
    v_esko_id UUID;
BEGIN
    SELECT id INTO v_xsys_id FROM suppliers WHERE name = 'XSYS';
    SELECT id INTO v_dupont_id FROM suppliers WHERE name = 'DuPont';
    SELECT id INTO v_miraclon_id FROM suppliers WHERE name = 'Miraclon';
    SELECT id INTO v_esko_id FROM suppliers WHERE name = 'Esko';

    -- XSYS Catena Equipment
    INSERT INTO equipment_models (supplier_id, model_name, equipment_type, technology, uv_source_type, nominal_intensity_mw_cm2, supports_digital_plates, supports_analog_plates) VALUES
    (v_xsys_id, 'Catena-E LED Exposure', 'MAIN_EXPOSURE', 'LED_UVA', 'LED_UVA', 35, TRUE, TRUE),
    (v_xsys_id, 'Catena-W Solvent Processor', 'PROCESSOR_SOLVENT', 'solvent', NULL, NULL, TRUE, TRUE),
    (v_xsys_id, 'Catena-D Dryer', 'DRYER', 'hot_air', NULL, NULL, TRUE, TRUE),
    (v_xsys_id, 'Catena-L Light Finisher', 'LIGHT_FINISHER', 'LED_UVA', 'LED_UVA', 20, TRUE, TRUE);

    -- DuPont Cyrel Equipment
    INSERT INTO equipment_models (supplier_id, model_name, equipment_type, technology, uv_source_type, nominal_intensity_mw_cm2, has_integrated_back_exposure, supports_digital_plates, supports_analog_plates) VALUES
    (v_dupont_id, 'Cyrel FAST 1000TD', 'INTEGRATED_SYSTEM', 'thermal', NULL, NULL, TRUE, TRUE, FALSE),
    (v_dupont_id, 'Cyrel 2000E Exposure', 'COMBINED_EXPOSURE', 'fluorescent_UVA', 'fluorescent_UVA', 18, TRUE, TRUE, TRUE),
    (v_dupont_id, 'Cyrel 3000S Processor', 'PROCESSOR_SOLVENT', 'solvent', NULL, NULL, FALSE, TRUE, TRUE),
    (v_dupont_id, 'Cyrel 1000P Processor', 'PROCESSOR_SOLVENT', 'solvent', NULL, NULL, FALSE, TRUE, TRUE);

    -- Miraclon FLEXCEL Equipment
    INSERT INTO equipment_models (supplier_id, model_name, equipment_type, technology, uv_source_type, nominal_intensity_mw_cm2, supports_digital_plates, supports_analog_plates) VALUES
    (v_miraclon_id, 'FLEXCEL NX System', 'IMAGER', 'LAM_thermal_imaging', NULL, NULL, TRUE, FALSE),
    (v_miraclon_id, 'FLEXCEL NX Exposure', 'COMBINED_EXPOSURE', 'fluorescent_UVA', 'fluorescent_UVA', 16, TRUE, TRUE),
    (v_miraclon_id, 'FLEXCEL NX Processor', 'PROCESSOR_SOLVENT', 'solvent', NULL, NULL, TRUE, TRUE);

    -- Esko CDI
    IF v_esko_id IS NOT NULL THEN
        INSERT INTO equipment_models (supplier_id, model_name, equipment_type, technology, supports_digital_plates, supports_analog_plates) VALUES
        (v_esko_id, 'CDI Spark 4835', 'IMAGER', 'laser_ablation', TRUE, FALSE),
        (v_esko_id, 'CDI Crystal 5080', 'IMAGER', 'laser_ablation', TRUE, FALSE);
    END IF;

    RAISE NOTICE 'Equipment models inserted successfully';
END $$;

-- ============================================================================
-- SAMPLE EQUIVALENCY WEIGHT CONFIG (Default)
-- ============================================================================

INSERT INTO equivalency_weight_config (
    organization_id,
    config_name,
    is_default,
    weight_thickness,
    weight_process_type,
    weight_hardness,
    weight_surface_type,
    weight_lpi_range,
    weight_application,
    weight_ink_compat,
    hardness_tolerance,
    thickness_tolerance_mm
) VALUES (
    NULL,  -- Global default
    'Default Weights',
    TRUE,
    40,    -- Thickness match is critical
    20,    -- Process type must match for workflow
    15,    -- Hardness affects ink transfer
    10,    -- Surface type affects dot structure
    5,     -- LPI capability
    5,     -- Application match
    5,     -- Ink compatibility
    2.0,   -- ±2 Shore A tolerance
    0.05   -- ±0.05mm thickness tolerance
);

-- ============================================================================
-- VERIFY SEED DATA
-- ============================================================================

SELECT 
    'Suppliers' as entity,
    COUNT(*) as count 
FROM suppliers
UNION ALL
SELECT 
    'Plate Families',
    COUNT(*) 
FROM plate_families
UNION ALL
SELECT 
    'Plates',
    COUNT(*) 
FROM plates
UNION ALL
SELECT 
    'Equipment Models',
    COUNT(*) 
FROM equipment_models;
