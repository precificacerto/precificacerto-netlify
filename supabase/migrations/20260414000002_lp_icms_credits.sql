-- Migration: LP ICMS Credits Support
-- Adds support for Lucro Presumido regime in item_tax_credits table (ICMS only)
-- Date: 2026-04-14

-- Ensure item_tax_credits table accepts LP entries (no regime restriction)
-- The table structure already supports this - just adding documentation comment
COMMENT ON TABLE item_tax_credits IS
  'Tax credits per item. LR: ICMS/PIS/COFINS/IPI/CBS/IBS credits. LP: ICMS only (regime cumulativo - no PIS/COFINS credits).';

-- Add index for LP ICMS credit queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_item_tax_credits_icms
  ON item_tax_credits(item_id, tax_type)
  WHERE tax_type = 'ICMS' AND is_active = true;
