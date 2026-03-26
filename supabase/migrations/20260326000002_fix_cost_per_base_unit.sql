-- Fix cost_per_base_unit for existing items that have measure_quantity > 1
-- Before this fix: cost_per_base_unit = unit_price (per package/embalagem)
-- After this fix:  cost_per_base_unit = unit_price / measure_quantity (per base unit: per ml, g, cm etc.)
--
-- Example: item 1000ml bottle at R$20 → cost_per_base_unit goes from R$20 to R$0.02/ml
-- Products using 300ml of this item will now correctly cost R$6 instead of R$6000

UPDATE public.items
SET cost_per_base_unit = CASE
  WHEN measure_quantity IS NOT NULL AND measure_quantity > 1
  THEN cost_per_base_unit / measure_quantity
  ELSE cost_per_base_unit
END
WHERE measure_quantity IS NOT NULL AND measure_quantity > 1;
