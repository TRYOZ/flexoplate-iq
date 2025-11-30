const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Plate {
  id: string;
  sku_code: string | null;
  display_name: string | null;
  thickness_mm: number;
  hardness_shore: number | null;
  imaging_type: string | null;
  surface_type: string | null;
  min_lpi: number | null;
  max_lpi: number | null;
  ink_compatibility: string[] | null;
  substrate_categories: string[] | null;
  applications: string[] | null;
  family_name: string;
  process_type: string | null;
  supplier_name: string;
  
  // NEW ENHANCED FIELDS
  tonal_range_min_pct: number | null;
  tonal_range_max_pct: number | null;
  recommended_lpi: number | null;
  max_imager_dpi: number | null;
  flat_top_technology: string | null;
  engineered_surface: boolean;
  led_optimized: boolean;
  key_differentiators: string[] | null;
  substrate_detail: string | null;
  product_sheet_url: string | null;
  region_availability: string[] | null;
  plate_generation: string | null;
}

export interface PlateEquivalent extends Plate {
  similarity_score: number;
  match_score: number;
  match_notes: string[];
  match_quality?: string;
  match_details?: string[];
}

export interface EquivalencyResult {
  source_plate: Plate;
  equivalents: PlateEquivalent[];
  total_candidates?: number;
  good_matches_count?: number;
}

export interface Supplier {
  id: string;
  name: string;
  website_url?: string | null;
  country?: string | null;
  is_plate_supplier?: boolean;
  is_equipment_supplier?: boolean;
}

export interface ExposureResult {
  plate: {
    name: string;
    thickness_mm: number;
    supplier: string;
    process_type: string;
  };
  exposure: {
    back_exposure_time_s: number | null;
    back_exposure_range_s: [number, number] | null;
    main_exposure_time_s: number | null;
    main_exposure_range_s: [number, number] | null;
    post_exposure_time_s: number | null;
    detack_time_s: number | null;
  };
  notes: string[];
  input?: {
    intensity_mw_cm2: number;
    target_floor_mm: number | null;
  };
}

export interface FilterOptions {
  suppliers: string[];
  process_types: string[];
  surface_types: string[];
  ink_types: string[];
  applications: string[];
  thickness_range: {
    min: number;
    max: number;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  }

  // Health check
  async health(): Promise<{ status: string; database: string }> {
    return this.fetch('/health');
  }

  // Suppliers
  async getSuppliers(plateOnly = true): Promise<Supplier[]> {
    return this.fetch(`/api/suppliers`);
  }

  // Filter options
  async getFilterOptions(): Promise<FilterOptions> {
    return this.fetch('/api/filters');
  }

  // Plates - ENHANCED with new filter options
  async getPlates(params?: {
    supplier?: string;
    family?: string;
    thickness_mm?: number;
    process_type?: string;
    surface_type?: string;
    led_optimized?: boolean;
    flat_top_only?: boolean;
    has_product_sheet?: boolean;
    search?: string;
    limit?: number;
  }): Promise<Plate[]> {
    const searchParams = new URLSearchParams();
    if (params?.supplier) searchParams.set('supplier', params.supplier);
    if (params?.family) searchParams.set('family', params.family);
    if (params?.thickness_mm) searchParams.set('thickness', params.thickness_mm.toString());
    if (params?.process_type) searchParams.set('process_type', params.process_type);
    if (params?.surface_type) searchParams.set('surface_type', params.surface_type);
    if (params?.led_optimized) searchParams.set('led_optimized', 'true');
    if (params?.flat_top_only) searchParams.set('flat_top_only', 'true');
    if (params?.has_product_sheet) searchParams.set('has_product_sheet', 'true');
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    
    const query = searchParams.toString();
    return this.fetch(`/api/plates${query ? `?${query}` : ''}`);
  }

  async getPlate(id: string): Promise<Plate> {
    return this.fetch(`/api/plates/${id}`);
  }

  // Equivalency
  async findEquivalents(params: {
    source_plate_id: string;
    target_supplier?: string;
    substrate?: string;
    ink_system?: string;
    application?: string;
  }): Promise<EquivalencyResult> {
    const searchParams = new URLSearchParams();
    searchParams.set('plate_id', params.source_plate_id);
    if (params.target_supplier) searchParams.set('target_supplier', params.target_supplier);
    
    return this.fetch(`/api/equivalency/find?${searchParams}`);
  }

  async quickEquivalency(plateId: string, targetSupplier?: string): Promise<EquivalencyResult> {
    const params = new URLSearchParams({ plate_id: plateId });
    if (targetSupplier) params.set('target_supplier', targetSupplier);
    return this.fetch(`/api/equivalency/find?${params}`);
  }

  // Exposure calculator
  async calculateExposure(params: {
    plate_id: string;
    current_intensity_mw_cm2: number;
    equipment_instance_id?: string;
    target_floor_mm?: number;
  }): Promise<ExposureResult> {
    return this.fetch('/api/exposure/calculate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async scaleExposure(params: {
    reference_time_s: number;
    reference_intensity: number;
    current_intensity: number;
  }): Promise<{
    reference_time_s: number;
    scaled_time_s: number;
    intensity_change_percent: number;
  }> {
    const searchParams = new URLSearchParams({
      reference_time_s: params.reference_time_s.toString(),
      reference_intensity: params.reference_intensity.toString(),
      current_intensity: params.current_intensity.toString(),
    });
    return this.fetch(`/api/exposure/scale?${searchParams}`);
  }

  // Plate families
  async getFamilies(params?: {
    supplier?: string;
    process_type?: string;
  }): Promise<Array<{
    id: string;
    family_name: string;
    process_type: string;
    supplier_name: string;
    plate_count: number;
  }>> {
    const searchParams = new URLSearchParams();
    if (params?.supplier) searchParams.set('supplier', params.supplier);
    if (params?.process_type) searchParams.set('process_type', params.process_type);
    
    const query = searchParams.toString();
    return this.fetch(`/api/families${query ? `?${query}` : ''}`);
  }
}

export const api = new ApiClient();
