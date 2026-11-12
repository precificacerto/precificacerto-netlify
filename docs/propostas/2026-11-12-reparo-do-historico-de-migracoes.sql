-- ════════════════════════════════════════════════════════════════════════════════════════
-- REPARO DO HISTÓRICO DE MIGRAÇÕES — proposta de 12/11/2026. NÃO É MIGRAÇÃO e NÃO FOI RODADO.
-- Fica fora de supabase/migrations/ de propósito: nenhum CLI o trata como trabalho a fazer.
-- Quem decide se roda é o dono do produto, depois de ler este arquivo inteiro e o relatório
-- docs/propostas/2026-11-12-historico-de-migracoes.md, e depois de decidir a colisão abaixo.
--
-- O QUE FAZ: registra em supabase_migrations.schema_migrations as 45 migrações que estão APLICADAS
-- em produção e não têm linha lá (medido em 12/11/2026, só leitura, pelo catálogo: cada objeto que o
-- arquivo cria existe, ou foi tirado por uma migração posterior; cada corpo de função bate pelo md5,
-- ou foi redefinido depois). `version` = o prefixo de 14 dígitos do arquivo; `name` = o nome completo
-- do arquivo sem a extensão (a convenção de migracao.md, Parte II); `statements` NULO — o texto que
-- rodou não está guardado em lugar nenhum, e inventá-lo seria pôr um fato falso no histórico;
-- `created_by` = 'reparo-20261112'.
--
-- A COLISÃO: duas migrações diferentes, nas branches claude/desenhos-das-tipologias (PR #264) e
-- claude/orcamento-ia-arquivar (sem PR), têm o MESMO prefixo 20261111000001, e as DUAS estão aplicadas.
-- `version` é a chave primária: as duas não cabem com o mesmo número. Este reparo PRESSUPÕE a decisão
-- proposta no relatório: o arquivo da arquivar é RENOMEADO para 20261111000002_orcamento_ia_arquivar.sql
-- na branch dela (o conteúdo não muda, nem um byte; o md5 continua o mesmo), e é registrado assim.
-- Se a decisão for outra, a linha dela muda ANTES de rodar.
--
-- O QUE NÃO ENTRA: 20261112000001 (não aplicada), 20261112000004 (o efeito está lá pelo GRANT à mão,
-- mas o arquivo ainda não foi aplicado: registra-se ao aplicar), 20261112000005 (pendente, depois do
-- deploy), os dois rollback_*.sql (não são migração). As duas linhas que já existem
-- (20261024132054 e 20261025142857) ficam como estão: reescrever histórico não vale o risco.
--
-- GUARDA (aborta, nada é gravado): alguma versão a registrar já existe com OUTRO nome.
-- VERIFICAÇÃO (aborta, desfaz): depois, cada versão tem exatamente a linha com o nome esperado.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TEMP TABLE reparo_a_registrar (version text PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
INSERT INTO reparo_a_registrar (version, name) VALUES
    ('20261026000001', '20261026000001_limite_de_tempo_da_importacao'),
    ('20261026000002', '20261026000002_pergunta_em_aberto'),
    ('20261026000003', '20261026000003_pergunta_confirmar_apanhado'),
    ('20261026000004', '20261026000004_familia_da_tabela'),
    ('20261026000005', '20261026000005_tabela_vigente'),
    ('20261027000001', '20261027000001_contexto_do_atendimento'),
    ('20261027000002', '20261027000002_motor_por_familia_e_etapas'),
    ('20261027000003', '20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima'),
    ('20261027000004', '20261027000004_copiar_motor_da_wolff_para_a_planilha'),
    ('20261027000005', '20261027000005_categoria_da_tabela_de_fornecedor'),
    ('20261027000006', '20261027000006_motor_da_familia'),
    ('20261027000007', '20261027000007_motor_so_para_perfil'),
    ('20261027000008', '20261027000008_etapa_aponta_o_motor'),
    ('20261027000009', '20261027000009_tira_perfil_exige_motor'),
    ('20261027000010', '20261027000010_etapa_sobe_o_motor_e_titulo_da_familia'),
    ('20261028000001', '20261028000001_familia_instancia_e_catalogo_de_motores'),
    ('20261028000002', '20261028000002_familia_pvc_wolf_e_familia_so_no_perfil'),
    ('20261029000001', '20261029000001_trocar_arquivo_e_editar_motor'),
    ('20261029000002', '20261029000002_familia_do_motor_so_no_perfil'),
    ('20261029000003', '20261029000003_motor_para_n_familias'),
    ('20261029000004', '20261029000004_familias_do_catalogo'),
    ('20261029000005', '20261029000005_nome_do_motor_e_arquivar_em_uso'),
    ('20261031000001', '20261031000001_excluir_etapa_na_conta'),
    ('20261031000002', '20261031000002_etapa_no_catalogo'),
    ('20261031000003', '20261031000003_catalogo_soberano'),
    ('20261101000001', '20261101000001_tabela_na_soberania'),
    ('20261101000002', '20261101000002_arquivo_em_da_tabela'),
    ('20261102000001', '20261102000001_bloco_tributario_do_item'),
    ('20261102000002', '20261102000002_categorias_do_catalogo'),
    ('20261103000001', '20261103000001_garantia_da_categoria_na_conta'),
    ('20261103000002', '20261103000002_instrucao_da_categoria'),
    ('20261103000003', '20261103000003_responde_a_na_mensagem'),
    ('20261105000001', '20261105000001_varias_montagens_por_remetente'),
    ('20261106000001', '20261106000001_tempo_de_fabricacao_no_arquivo_do_motor'),
    ('20261106000002', '20261106000002_numero_cliente_e_percentuais_do_levantamento'),
    ('20261109000001', '20261109000001_orcamento_ia'),
    ('20261109000002', '20261109000002_orcamento_ia_precificacao'),
    ('20261109000003', '20261109000003_orcamento_ia_material'),
    ('20261109000004', '20261109000004_orcamento_ia_fiscal'),
    ('20261109000005', '20261109000005_orcamento_ia_arquivo'),
    ('20261110000001', '20261110000001_orcamento_ia_operacao_interna'),
    ('20261111000001', '20261111000001_desenhos_das_tipologias'),
    ('20261111000002', '20261111000002_orcamento_ia_arquivar'),
    ('20261112000002', '20261112000002_desconto_da_tabela_e_trava_da_ancora'),
    ('20261112000003', '20261112000003_importacao_que_nao_encolhe');

DO $guarda$
DECLARE
  conflito text;
  n int;
BEGIN
  SELECT count(*) INTO n FROM reparo_a_registrar;
  IF n <> 45 THEN
    RAISE EXCEPTION 'reparo: a lista tem % linhas, e deviam ser 45. Nada foi gravado.', n;
  END IF;
  SELECT string_agg(s.version || ' (' || coalesce(s.name, 'sem nome') || ')', ', ') INTO conflito
    FROM supabase_migrations.schema_migrations s JOIN reparo_a_registrar r USING (version)
   WHERE s.name IS DISTINCT FROM r.name;
  IF conflito IS NOT NULL THEN
    RAISE EXCEPTION 'reparo: versoes ja registradas com outro nome: %. Nada foi gravado.', conflito;
  END IF;
END
$guarda$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)
SELECT version, name, NULL, 'reparo-20261112' FROM reparo_a_registrar
ON CONFLICT (version) DO NOTHING;

DO $verifica$
DECLARE
  faltam int;
BEGIN
  SELECT count(*) INTO faltam FROM reparo_a_registrar r
   WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = r.version AND s.name = r.name);
  IF faltam <> 0 THEN
    RAISE EXCEPTION 'reparo: % versoes sem a linha esperada depois do INSERT. Nada foi gravado.', faltam;
  END IF;
  RAISE NOTICE 'reparo: 45 migracoes registradas (ou ja estavam, com o mesmo nome).';
END
$verifica$;

COMMIT;

-- ── CONFERÊNCIA DEPOIS, por consulta ──────────────────────────────────────────────────────
-- select count(*) from supabase_migrations.schema_migrations where created_by = 'reparo-20261112';
-- -- esperado: 45 (menos as que já existissem com o mesmo nome — hoje, nenhuma)
