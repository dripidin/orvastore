export type CategorySchemaCapabilities = {
  hasParentId: boolean;
  hasIconName: boolean;
  hasAssignRpc: boolean;
  needsSqlUpgrade: boolean;
  migrationSql: string;
};

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  icon_name: string;
  display_order: number;
  active: boolean;
  productCount: number;
  totalProductCount: number;
  created_at?: string;
  updated_at?: string;
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  iconName?: string | null;
  displayOrder?: number;
  active?: boolean;
}

export type CategoryDeleteMode = "restrict" | "unlink" | "reassign";

export interface CategoryDeleteOptions {
  mode?: CategoryDeleteMode;
  reassignToCategoryId?: string | null;
}

export interface CategoryDeleteConflict {
  code: "CATEGORY_IN_USE";
  error: string;
  childCount: number;
  productCount: number;
  children: Array<{ id: string; name: string }>;
  products: Array<{ id: string; title: string; sku: string }>;
}

export interface AiProposedSubcategory {
  name: string;
  description?: string;
  iconName?: string;
  isExisting?: boolean;
}

export interface AiProposedCategory {
  name: string;
  description?: string;
  iconName?: string;
  isExisting?: boolean;
  subcategories?: AiProposedSubcategory[];
}

export interface AiCategoryAssignment {
  sku: string;
  productId?: string;
  category: string;
  subcategory?: string | null;
  confidence?: number;
  reason?: string;
}

export interface AiCategoryPlan {
  summary?: string;
  categories: AiProposedCategory[];
  assignments: AiCategoryAssignment[];
  productCount: number;
}
