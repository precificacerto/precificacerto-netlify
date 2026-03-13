ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS administrative_monthly_workload numeric DEFAULT 176;
