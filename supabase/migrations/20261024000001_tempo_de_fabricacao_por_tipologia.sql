-- 20261024000001 — tempo de fabricacao por tipologia, no MOTOR
-- O tempo pertence a tipologia, e a tipologia vive no motor: orcamentista_motor_tipologia,
-- por (tabela_id, tipologia, linha). NAO e uma quarta fonte: e coluna da fonte que ja manda.
--
-- DUAS colunas, de proposito:
--   tempo_fabricacao_min  NULL = nao informado. Sem DEFAULT.
--   tempo_origem          de onde veio o numero. 'ESTIMADO' = arbitrado para teste,
--                         'IMPORTADO' = veio da planilha do motor. Um numero sem procedencia
--                         vira fato sem ninguem ver; a coluna obriga a dizer de onde ele saiu.
-- CHECK: um sem o outro e erro — tempo sem origem, ou origem sem tempo, nao existem.

ALTER TABLE public.orcamentista_motor_tipologia
  ADD COLUMN IF NOT EXISTS tempo_fabricacao_min integer,
  ADD COLUMN IF NOT EXISTS tempo_origem text;

ALTER TABLE public.orcamentista_motor_tipologia
  DROP CONSTRAINT IF EXISTS orcamentista_motor_tipologia_tempo_coerente;
ALTER TABLE public.orcamentista_motor_tipologia
  ADD CONSTRAINT orcamentista_motor_tipologia_tempo_coerente
  CHECK ((tempo_fabricacao_min IS NULL AND tempo_origem IS NULL)
      OR (tempo_fabricacao_min > 0 AND tempo_origem IN ('ESTIMADO', 'IMPORTADO')));

COMMENT ON COLUMN public.orcamentista_motor_tipologia.tempo_fabricacao_min IS
  'minutos de fabricacao da tipologia. NULL = nao informado (sem DEFAULT: NULL e zero nao colapsam)';
COMMENT ON COLUMN public.orcamentista_motor_tipologia.tempo_origem IS
  'ESTIMADO = arbitrado, nao medido no chao de fabrica; IMPORTADO = veio da coluna da planilha do motor';

-- Preenchimento ESTIMADO, so onde ainda nao ha tempo. A faixa vem de n_regras, que e o unico
-- proxy de complexidade que existe hoje no banco. NAO e medicao: e numero para o teste rodar.
UPDATE public.orcamentista_motor_tipologia SET
  tempo_fabricacao_min = CASE
    WHEN n_regras < 300 THEN 90
    WHEN n_regras < 800 THEN 150
    ELSE 240 END,
  tempo_origem = 'ESTIMADO'
WHERE tempo_fabricacao_min IS NULL;

DO $$
DECLARE v_sem int; v_est int; v_imp int;
BEGIN
  SELECT count(*) FILTER (WHERE tempo_fabricacao_min IS NULL),
         count(*) FILTER (WHERE tempo_origem = 'ESTIMADO'),
         count(*) FILTER (WHERE tempo_origem = 'IMPORTADO')
    INTO v_sem, v_est, v_imp FROM public.orcamentista_motor_tipologia;
  IF v_sem <> 0 THEN
    RAISE EXCEPTION 'verificacao: % tipologia(s) sem tempo. Nada foi alterado.', v_sem;
  END IF;
  RAISE NOTICE 'tempo por tipologia: % estimadas, % importadas.', v_est, v_imp;
END
$$;