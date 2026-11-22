-- Adds parent / child product categories, icon support, and atomic product assignment RPC.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS icon_name TEXT DEFAULT 'folder-tree';

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_categories_parent_order
  ON public.categories(parent_id, display_order, name);

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products(category_id);

CREATE OR REPLACE FUNCTION public.assign_product_categories(p_assignments JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment JSONB;
  target_cat UUID;
BEGIN
  IF jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'Assignments must be an array';
  END IF;
  FOR assignment IN SELECT value FROM jsonb_array_elements(p_assignments)
  LOOP
    IF NULLIF(BTRIM(COALESCE(assignment->>'categoryId', '')), '') IS NULL THEN
      target_cat := NULL;
    ELSE
      target_cat := (assignment->>'categoryId')::UUID;
    END IF;

    UPDATE public.products
       SET category_id = target_cat,
           updated_at = now()
     WHERE id = (assignment->>'productId')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', assignment->>'productId';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_product_categories(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_product_categories(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
