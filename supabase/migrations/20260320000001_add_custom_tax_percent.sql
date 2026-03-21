-- Add custom_tax_percent column to products table
-- Allows per-product tax override (inherits from tenant config by default)
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_tax_percent REAL DEFAULT NULL;

COMMENT ON COLUMN products.custom_tax_percent IS 'Custom tax percentage override for this product. NULL means inherit from tenant config.';
