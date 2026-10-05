-- ============================================================================================
-- AGENDAMENTO PÚBLICO — FASE 1: GRADE DE HORÁRIO, FOLGAS E O LINK
--
-- Comando do PO de 05/10/2026, §2. Migração ADITIVA: três tabelas NOVAS, nenhuma coluna
-- existente alterada, nenhum dado movido, NENHUM BACKFILL. Zero linhas criadas.
--
-- >>> ESTA FASE NÃO CRIA NENHUMA ROTA PÚBLICA <<<
-- A porta pública nasce na fase 2, no mesmo commit que a fechadura. `is_enabled` NASCE `false`
-- e o link não resolve página nenhuma ao fim desta rodada. Exposição ZERO, de propósito.
--
-- ── ORDEM — `migration-delivery.md` ────────────────────────────────────────────────────────
-- >>> APLICAR **ANTES OU JUNTO** DO MERGE <<<
--
-- O código novo GRAVA nas três tabelas (painel de configuração da Agenda e a rota de API que
-- gera o token). Mergear sem aplicar deixa o painel falhando no INSERT com a mensagem do
-- PostgREST — exatamente o que derrubou produção em 01/09/2026 com `expense_snapshot`.
--
-- Merge NÃO é entrega. O default é PENDENTE até alguém consultar o schema.
--
-- >>> O `BEGIN`/`COMMIT` É DO ARQUIVO, E QUEM APLICA DECIDE SE TIRA <<<
-- O conector do Supabase abre transação própria e avisa `there is already a transaction in
-- progress`; o SQL Editor e o psql aceitam o arquivo como está. Escrever sem eles seria pior:
-- uma falha no meio não teria rollback.
--
-- Ao aplicar por fora do CLI, o `name` registrado é o nome COMPLETO deste arquivo, com o
-- prefixo e sem a extensão: `20261006000001_agendamento_publico_fase1`.
--
-- ============================================================================================
-- ACHADO 1 — A PREMISSA (g) ESTÁ CERTA SOBRE O BANCO, E EXISTE UMA GRADE NO PAPEL
-- ============================================================================================
-- O §0 pede: "Se (g) estiver errado e existir grade em algum lugar, PARE e me diga onde."
--
-- Onde: `supabase/migrations/20260213100000_whatsapp_employees_customers.sql:84` declara
-- `public.employee_schedules (employee_id, day_of_week CHECK 0..6, start_time, end_time,
-- is_off)` — mesmo propósito desta tabela 2, e MESMA convenção de dia (`0=Dom, 6=Sáb`).
--
-- Medido em 05/10/2026, por consulta ao `pg_class` (fonte primária, `estado-relatado-vs-real`):
--
--   | pergunta                                   | medido |
--   |--------------------------------------------|--------|
--   | `employee_schedules` existe no banco?      | **NÃO** — 0 linhas em pg_class |
--   | usos de `employee_schedules` em `src/`     | **0** |
--
-- Então a premissa (g) está CORRETA como afirmação sobre o sistema: não há grade, nem no banco
-- nem no código. O que existe é uma DECLARAÇÃO MORTA, num dos arquivos que o repositório nunca
-- aplicou (`migration-delivery.md`: 4 das 146 versões locais estão em `schema_migrations`).
-- O arquivo é a intenção; a tabela existindo é o fato — e o fato é que ela não existe.
--
-- POR QUE A TABELA NOVA NÃO É A MESMA COISA, e não se trata de reusar o nome:
--   - `employee_schedules` NÃO tem `tenant_id` — a política dela passa por `employees`;
--   - ela mistura folga (`is_off boolean`) na mesma tabela da grade. Este comando separa:
--     folga é PERÍODO (`employee_time_off`, timestamptz), não um dia da semana marcado;
--   - `is_active` aqui desliga uma faixa sem apagá-la, que `is_off` não distingue.
--
-- >>> DECISÃO QUE NÃO É MINHA, E ESTÁ REGISTRADA AQUI POR ISSO <<<
-- Se um dia alguém aplicar o lote pendente, `employee_schedules` NASCE ao lado desta — duas
-- tabelas para a mesma coisa, que é `copia-divergente.md` entrando pelo banco. Apagar aquele
-- arquivo (ou marcá-lo como morto) é decisão do PO, e NÃO foi tomada nesta rodada.
--
-- ============================================================================================
-- ACHADO 2 — A PREMISSA (f) VALE **CONFORME QUEM CRIA A TABELA**
-- ============================================================================================
-- O §0 afirma: "Em 05/10/2026 todo privilégio de `anon` em `public` foi revogado, com
-- `ALTER DEFAULT PRIVILEGES`. Tabela nova NÃO nasce acessível por `anon`."
--
-- A primeira metade está confirmada: `anon` tem **0** grants em `public` hoje (contra 553 de
-- `authenticated`). A segunda metade é verdadeira com uma condição que não estava escrita.
--
-- `pg_default_acl` tem DUAS entradas para tabela em `public`, e elas discordam — a default ACL
-- que vale é a do PAPEL QUE CRIA o objeto:
--
--   | dono da default ACL | `anon` na ACL de tabela nova  |
--   |---------------------|-------------------------------|
--   | `postgres`          | **AUSENTE** — é a de 05/10/2026 |
--   | `supabase_admin`    | **`arwdDxtm` — TUDO**           |
--
-- O SQL Editor roda como `postgres`, então pelo caminho que o PO usa a premissa (f) se cumpre.
-- Mas ela se cumpre por QUEM APLICA, não por propriedade da tabela — e a entrada de
-- `supabase_admin` não foi tocada em 05/10. É `portao-que-nao-alcanca.md` em forma de ACL: o
-- revoke ficou verde e a proteção declarada depende de um fator que o enunciado não mencionava.
--
-- >>> DAÍ O `REVOKE` EXPLÍCITO ABAIXO <<<
-- Ele torna o resultado independente de quem aplica o arquivo. É REVOKE, não GRANT: o §0 pede
-- que `anon` volte VAZIO e manda PARAR se voltar linha. Nenhum GRANT foi inventado — se
-- `authenticated` não receber, está escrito na verificação DEPOIS e o PO decide.
--
-- ============================================================================================
-- VERIFICAÇÃO — ANTES (a consultar, não presumir)
-- ============================================================================================
--   -- (1) as três ainda NÃO existem — esperado: 0
--   select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('tenant_booking_settings','employee_working_hours','employee_time_off');
--
--   -- (2) `anon` não tem nada em `public` — esperado: 0
--   select count(*) from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'anon';
--
--   -- (3) o helper das políticas existe — esperado: 1
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'get_auth_tenant_id';
--
-- ============================================================================================
-- VERIFICAÇÃO — DEPOIS
-- ============================================================================================
--   -- (4) as três existem, com RLS LIGADA e QUATRO políticas cada
--   select c.relname, c.relrowsecurity as rls,
--          (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('tenant_booking_settings','employee_working_hours','employee_time_off')
--    order by 1;
--   -- esperado: 3 linhas, rls = true, politicas = 4 em todas
--
--   -- (5) O CHECK DO §0: `anon` NÃO recebeu nada nas novas — TEM DE VOLTAR VAZIO
--   select grantee, table_name from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'anon'
--      and (table_name like '%booking%' or table_name like '%working_hours%'
--           or table_name like '%time_off%');
--   -- Se voltar linha: PARAR. A fase 2 nasceria exposta.
--
--   -- (6) O OUTRO CHECK DO §0: `authenticated` RECEBEU grants nas novas
--   select table_name, count(*) as privilegios
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'authenticated'
--      and table_name in ('tenant_booking_settings','employee_working_hours','employee_time_off')
--    group by 1 order by 1;
--   -- esperado: 3 linhas. Se vier vazio, NÃO inventar GRANT — avisar o PO.
--
--   -- (7) os dois índices do §2
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('idx_employee_working_hours_tenant_emp_weekday',
--                        'idx_employee_time_off_tenant_emp_starts');
--   -- esperado: 2 linhas
--
--   -- (8) SEM BACKFILL — nenhuma linha criada pela migração
--   select (select count(*) from public.tenant_booking_settings) as settings,
--          (select count(*) from public.employee_working_hours)  as grade,
--          (select count(*) from public.employee_time_off)       as folgas;
--   -- esperado: 0, 0, 0
--
-- E o `NOTIFY` é passo SEPARADO — ele NÃO vem com o COMMIT, e "esqueci o NOTIFY" é
-- indistinguível de "a tabela não existe" pela mensagem que o usuário vê.
-- ============================================================================================

BEGIN;

-- ── 1. tenant_booking_settings — uma linha por tenant, criada pelo botão "Gerar link" ───────
CREATE TABLE IF NOT EXISTS public.tenant_booking_settings (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  public_token     text        NOT NULL UNIQUE,
  is_enabled       boolean     NOT NULL DEFAULT false,
  lead_time_min    integer     NOT NULL DEFAULT 60  CHECK (lead_time_min >= 0),
  horizon_days     integer     NOT NULL DEFAULT 30  CHECK (horizon_days BETWEEN 1 AND 180),
  grid_minutes     integer     NOT NULL DEFAULT 30  CHECK (grid_minutes BETWEEN 5 AND 120),
  msg_confirmacao  text,
  msg_cancelamento text,
  msg_alteracao    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_booking_settings IS
  'Configuração do agendamento público, por tenant. Uma linha nasce quando o tenant clica "Gerar link" na Agenda — a migração NÃO faz backfill. Fase 1 (05/10/2026): nenhuma rota pública consome esta tabela ainda.';

COMMENT ON COLUMN public.tenant_booking_settings.public_token IS
  'Token OPACO do link, gerado NO SERVIDOR com crypto.randomBytes(16).toString(''base64url'') — 128 bits. NÃO é slug e NÃO carrega o nome da empresa: /agendar/barbearia-do-ze deixaria varrer nomes e descobrir quem é cliente do sistema. Link bonito é decisão de produto depois, com coluna `slug` SEPARADA.';

COMMENT ON COLUMN public.tenant_booking_settings.is_enabled IS
  'NASCE false, por decisão do PO de 05/10/2026: auto-agendamento é opcional por tenant, e DEFAULT true daria link público a 27 empresas de uma vez. Quem não quiser, não liga.';

COMMENT ON COLUMN public.tenant_booking_settings.grid_minutes IS
  'PASSO da lista de horários (09:00, 09:30, 10:00…), NÃO a duração do atendimento — essa vem de services.estimated_duration_minutes. Um serviço de 60min começando às 09:00 ocupa até 10:00 e some os passos de 09:30 e 10:00.';

COMMENT ON COLUMN public.tenant_booking_settings.lead_time_min IS
  'Antecedência mínima, em minutos, entre agora e o horário agendável. 0 é legítimo (aceita agendamento imediato) e é por isso que a CHECK é >= 0 e não > 0.';

-- ── 2. employee_working_hours — a grade, POR FUNCIONÁRIO. É o que falta (premissa g) ────────
CREATE TABLE IF NOT EXISTS public.employee_working_hours (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday     smallint    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_working_hours_fim_depois_do_inicio CHECK (end_time > start_time)
);

COMMENT ON TABLE public.employee_working_hours IS
  'Grade de atendimento por funcionário. UMA LINHA POR FAIXA: dois turnos no mesmo dia são duas linhas — é o barbeiro que atende de manhã e à tarde com intervalo no meio. employees.work_hours_per_day NÃO serve aqui: é CUSTO, não grade.';

COMMENT ON COLUMN public.employee_working_hours.weekday IS
  '>>> 0=DOMINGO .. 6=SÁBADO <<< É a convenção de Date.getDay() e de EXTRACT(DOW), e é a MESMA de employee_schedules.day_of_week. NÃO é a de agenda/index.tsx:152 (`recurWeekdays`), que é isoWeekday, 0=Segunda..6=Domingo, e vale para RECORRÊNCIA DE EVENTO, não para esta grade. A travessia entre as duas é deRecurWeekdayParaWeekday() em src/utils/agendamento-config.ts — única autorizada. Converter à mão desloca a semana em um dia e NADA falha.';

COMMENT ON COLUMN public.employee_working_hours.is_active IS
  'Desliga a faixa sem apagá-la. A validação de sobreposição IGNORA faixa inativa, de propósito: uma faixa desligada não ocupa horário nenhum.';

-- ── 3. employee_time_off — férias, folga, feriado ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_time_off (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_time_off_fim_depois_do_inicio CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.employee_time_off IS
  'Período de ausência do funcionário — férias, folga, feriado. É PERÍODO (timestamptz), não dia da semana marcado: é a diferença contra o is_off de employee_schedules, que confundia as duas coisas na mesma tabela.';

COMMENT ON COLUMN public.employee_time_off.reason IS
  'Texto livre, NULÁVEL E SEM DEFAULT. `ausente-vs-falso.md`: string vazia afirmaria "ausência sem motivo informado" como se fosse um motivo apurado. NULL não afirma nada.';

-- ── 4. RLS — LIGADA nas três, política por tenant nas QUATRO operações, NESTE MESMO ARQUIVO ──
-- Ligar RLS sem política torna a tabela INACESSÍVEL — foi a trava do passo 2 de 05/10/2026.
-- As quatro são explícitas em vez de um `FOR ALL` para que a ausência de uma delas apareça na
-- contagem de `pg_policy` (esperado: 4), e não some dentro de uma política que cobre tudo.
--
-- `(SELECT public.get_auth_tenant_id())` entre parênteses: a função é STABLE SECURITY DEFINER
-- (`select tenant_id from public.users where id = auth.uid()`), e o subselect faz o Postgres
-- avaliá-la UMA vez por consulta em vez de uma vez por linha.

ALTER TABLE public.tenant_booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_working_hours  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_time_off       ENABLE ROW LEVEL SECURITY;

-- tenant_booking_settings
DROP POLICY IF EXISTS tenant_booking_settings_select ON public.tenant_booking_settings;
CREATE POLICY tenant_booking_settings_select ON public.tenant_booking_settings
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS tenant_booking_settings_insert ON public.tenant_booking_settings;
CREATE POLICY tenant_booking_settings_insert ON public.tenant_booking_settings
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS tenant_booking_settings_update ON public.tenant_booking_settings;
CREATE POLICY tenant_booking_settings_update ON public.tenant_booking_settings
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
         WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS tenant_booking_settings_delete ON public.tenant_booking_settings;
CREATE POLICY tenant_booking_settings_delete ON public.tenant_booking_settings
  FOR DELETE USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- employee_working_hours
DROP POLICY IF EXISTS employee_working_hours_select ON public.employee_working_hours;
CREATE POLICY employee_working_hours_select ON public.employee_working_hours
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS employee_working_hours_insert ON public.employee_working_hours;
CREATE POLICY employee_working_hours_insert ON public.employee_working_hours
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS employee_working_hours_update ON public.employee_working_hours;
CREATE POLICY employee_working_hours_update ON public.employee_working_hours
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
         WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS employee_working_hours_delete ON public.employee_working_hours;
CREATE POLICY employee_working_hours_delete ON public.employee_working_hours
  FOR DELETE USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- employee_time_off
DROP POLICY IF EXISTS employee_time_off_select ON public.employee_time_off;
CREATE POLICY employee_time_off_select ON public.employee_time_off
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS employee_time_off_insert ON public.employee_time_off;
CREATE POLICY employee_time_off_insert ON public.employee_time_off
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS employee_time_off_update ON public.employee_time_off;
CREATE POLICY employee_time_off_update ON public.employee_time_off
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
         WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS employee_time_off_delete ON public.employee_time_off;
CREATE POLICY employee_time_off_delete ON public.employee_time_off
  FOR DELETE USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- ── 5. Índices do §2 ────────────────────────────────────────────────────────────────────────
-- `tenant_booking_settings` não leva índice próprio: `tenant_id` é a PRIMARY KEY, e
-- `public_token` já tem o índice da UNIQUE — que é por onde a fase 2 vai resolver o link.
CREATE INDEX IF NOT EXISTS idx_employee_working_hours_tenant_emp_weekday
  ON public.employee_working_hours (tenant_id, employee_id, weekday);

CREATE INDEX IF NOT EXISTS idx_employee_time_off_tenant_emp_starts
  ON public.employee_time_off (tenant_id, employee_id, starts_at);

-- ── 6. REVOKE explícito de `anon` — ver ACHADO 2 no cabeçalho ───────────────────────────────
-- A default ACL de `supabase_admin` ainda concede `arwdDxtm` a `anon` em tabela nova de
-- `public`; a de `postgres` (a de 05/10/2026) não. Qual vale depende de QUEM CRIA o objeto.
-- Este REVOKE torna o resultado independente disso. É REVOKE, não GRANT — nenhum privilégio
-- foi inventado para ninguém.
REVOKE ALL ON public.tenant_booking_settings FROM anon;
REVOKE ALL ON public.employee_working_hours  FROM anon;
REVOKE ALL ON public.employee_time_off       FROM anon;

COMMIT;

-- ============================================================================================
-- Passo SEPARADO — NÃO vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================================
--
-- LIMITE CONHECIDO, declarado em vez de descoberto depois — `portao-que-nao-alcanca.md`:
--
-- A recusa de FAIXAS SOBREPOSTAS do mesmo funcionário no mesmo dia (§3a) mora na APLICAÇÃO,
-- em `validarFaixa()` de `src/utils/agendamento-config.ts`, e NÃO no banco. Um INSERT direto
-- por SQL, ou um segundo cliente gravando no mesmo instante, passa pelas CHECK desta tabela
-- sem ser barrado: as CHECK aqui olham UMA linha de cada vez (`end_time > start_time`,
-- `weekday BETWEEN 0 AND 6`), e sobreposição é uma relação ENTRE DUAS LINHAS.
--
-- O portão de banco para isso seria `EXCLUDE USING gist` sobre `(employee_id, weekday,
-- timerange)`, que exige a extensão `btree_gist`. NÃO foi feito nesta rodada: o §2 não o
-- pediu, e instalar extensão é decisão de infraestrutura, não de correção. Fica escrito para
-- que a próxima pessoa saiba que a proteção é de aplicação e qual seria a de banco.
-- ============================================================================================
