-- O estado medido em produção em 21/11/2026, só com as colunas que a 20261121000001 lê: a política da De Paula (orcamentista_esquadrias_base,
-- a única linha) e o log. O vidro padrão vem da própria 20261113000001, aplicada antes (as duas sementes).
CREATE TABLE public.superadmin_alteracao_log (id bigserial PRIMARY KEY, tenant_id uuid, tabela text, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz DEFAULT now());
CREATE TABLE public.orcamentista_esquadrias_base (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id), solda text, barra_mm integer, usa_contramarco boolean, regiao_litoranea boolean,
  guarnicao_externa text, guarnicao_interna text, folga_instalacao_x integer, folga_instalacao_y integer, guarnicao_externa_mm integer,
  guarnicao_interna_mm integer, usa_arremate_externo boolean, usa_arremate_interno boolean, medida_arremate_externo text,
  montagem_arremate_externo text, fechamento_folha_externa text, fechamento_folha_interna text);
INSERT INTO public.orcamentista_esquadrias_base VALUES ('20e08592-f957-4e72-b7eb-251387e34eb9', 'SPVCAL 6MM', 6000, false, true, 'BZ0010', 'BZ1770',
  0, 0, 20, 70, true, true, 'VAO+50MM (CORTE 90/90)', 'PERIMETRAL', 'CREMONA + MACANETA', 'CREMONA + MACANETA');
