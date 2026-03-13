-- Adicionar OWNER ao enum user_role (admin da tenant criado pelo super_admin).
-- Deve ser aplicado antes de funções que referenciem 'OWNER'.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'OWNER';
