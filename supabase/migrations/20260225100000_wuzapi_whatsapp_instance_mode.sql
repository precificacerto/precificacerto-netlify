-- WUZAPI WhatsApp: token por usuário e modo de instância (OWN vs SHARED)
-- Plan: WhatsApp WUZAPI QR e disparo

-- 1. Token WUZAPI por usuário (para sessão/QR e envio)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wuzapi_token text;

COMMENT ON COLUMN public.users.wuzapi_token IS 'Token da instância WUZAPI deste usuário. Usado no header "token" nas chamadas session/qr e chat/send/text.';

-- 2. Modo de instância em tenant_settings (super admin decide: cada um com seu WhatsApp ou instância única)
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS whatsapp_instance_mode text DEFAULT 'OWN',
  ADD COLUMN IF NOT EXISTS whatsapp_shared_instance_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenant_settings.whatsapp_instance_mode IS 'OWN = cada usuário tem sua instância; SHARED = todos usam a instância do usuário em whatsapp_shared_instance_user_id';
COMMENT ON COLUMN public.tenant_settings.whatsapp_shared_instance_user_id IS 'Quando whatsapp_instance_mode = SHARED, usuário dono da instância (ex.: super admin).';
