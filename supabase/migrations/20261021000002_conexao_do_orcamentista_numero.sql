-- ════════════════════════════════════════════════════════════════════════════════════════
-- WhatsApp — O NÚMERO DA CONEXÃO, e o comentário da conversa que ficou falso
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 21/10/2026, para ser lida antes de o dono do produto autorizar.
-- ║ Migração é PENDENTE POR PADRÃO (`migration-delivery.md`): o estado dela só muda com a
-- ║ consulta ao schema depois de aplicada.
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261021000002_conexao_do_orcamentista_numero.
-- ║
-- ║ DEPENDE de `20261020000003_atendimentos_ia_conversa` e de
-- ║ `20261021000001_conexoes_whatsapp_por_canal` — as duas aplicadas em produção, segundo a
-- ║ consulta ao schema relatada pelo dono do produto em 21/10/2026.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- TRÊS COISAS, e só elas (pedido do dono do produto, 21/10/2026 — a terceira acrescentada no
-- mesmo dia, depois da primeira revisão deste arquivo):
--
-- ══ 1. A COLUNA `whatsapp_conexao.numero` ══
-- O número de WhatsApp da instância conectada. Preenchido com o `jid` que o `POST
-- /session/connect` do WUZAPI devolve, SÓ DÍGITOS — a parte do usuário do jid, antes do `:` e
-- do `@` (ex.: `5554999887766:12@s.whatsapp.net` → `5554999887766`). O jid traz o código do
-- país, e o número é gravado como o WUZAPI o informa: com ele.
--   - NULÁVEL E SEM DEFAULT: NULL = o WUZAPI não informou. Um default afirmaria um número que
--     ninguém leu (`ausente-vs-falso.md`);
--   - o `GET /session/status` NÃO informa o número — devolve só `Connected` e `LoggedIn`. Por
--     isso a coluna existe: sem ela, a tela não tem de onde ler o número da conexão;
--   - CHECK de só dígitos — decisão de quem escreveu este arquivo, não pedido expresso: a
--     coluna nasce vazia, e a CHECK impede que a primeira gravação traga o jid inteiro.
--
-- ══ 2. O COMENTÁRIO DE `orcamentista_conversa` ══
-- O `COMMENT ON TABLE` gravado pela `20261020000003` diz que o tenant vem de
-- `users.wuzapi_token`. ISSO FICOU FALSO em 21/10/2026: a conexão do orçamentista mora em
-- `whatsapp_conexao`, pela chave (tenant_id, canal = 'ORCAMENTISTA'), e é por ela que o token
-- da instância leva ao tenant. `users.wuzapi_token` é o número de ENVIO de cada usuário, e não
-- participa.
-- Migração aplicada não se reescreve: o comentário se corrige por cima, aqui.
-- Os outros comentários das cinco tabelas foram conferidos um a um, e NENHUM outro repete a
-- informação velha — `users.wuzapi_token` só aparece neste.
--
-- ══ 3. O COMENTÁRIO DE `orcamentista_remetente_autorizado.telefone` ══
-- O `COMMENT ON COLUMN` gravado pela `20261020000003` diz "So digitos (DDI + DDD + numero)". É
-- FALSO desde que a lista passou a ser gravada pela célula de Conectividade (21/10/2026): ela
-- grava DDD + número, 10 ou 11 dígitos, SEM o DDI (`telefoneDoAutorizado`, o padrão de
-- `src/utils/phone-br.ts`). O CHECK da coluna NÃO muda: continua aceitando 10 a 13 dígitos, e
-- o comentário novo diz isso, em vez de afirmar que nenhuma linha tem DDI.
-- A conferência das SEIS tabelas (as cinco da conversa e `whatsapp_conexao`): nenhum outro
-- comentário gravado afirma formato de telefone com DDI. `orcamentista_conversa.telefone` diz
-- "como chegou no webhook", sem formato; `orcamentista_tentativa_desconhecida.telefone` não tem
-- comentário; `whatsapp_conexao.numero`, criado aqui, é o número da INSTÂNCIA e tem DDI de fato.
--
-- ADITIVA: uma coluna nova, sem dado; dois COMMENT substituídos. Nenhum DROP, nenhum UPDATE.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. O NÚMERO DA CONEXÃO ─────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_conexao
  ADD COLUMN numero text NULL,
  ADD CONSTRAINT whatsapp_conexao_numero_so_digitos CHECK (numero ~ '^[0-9]+$');

COMMENT ON COLUMN public.whatsapp_conexao.numero IS
  'O numero de WhatsApp da instancia conectada, SO DIGITOS, como o WUZAPI o informa (com o codigo do pais): a parte do usuario do jid devolvido pelo POST /session/connect, antes do : e do @. NULL = o WUZAPI nao informou. O GET /session/status NAO informa o numero (so Connected e LoggedIn); por isso ele e gravado aqui. Sem default.';

-- ── 2. O COMENTÁRIO DA CONVERSA, corrigido por cima ────────────────────────────────────────
COMMENT ON TABLE public.orcamentista_conversa IS
  'Uma conversa do Atendimentos I.A. com um REMETENTE AUTORIZADO de um tenant. O tenant vem da conexao do canal ORCAMENTISTA em whatsapp_conexao, pela chave (tenant_id, canal = ORCAMENTISTA), achada pelo token da instancia; o remetente, do telefone, na lista ativa daquele tenant. O telefone nunca escolhe tenant. So pela rota, com service_role. (Corrigido em 21/10/2026: ate entao este comentario dizia que o tenant vinha de users.wuzapi_token, o que deixou de ser verdade quando a conexao do orcamentista passou a morar em whatsapp_conexao.)';

-- ── 3. O COMENTÁRIO DO TELEFONE DA LISTA, corrigido por cima ──────────────────────────────
COMMENT ON COLUMN public.orcamentista_remetente_autorizado.telefone IS
  'So digitos: DDD + numero, 10 ou 11 digitos, SEM o DDI - e a forma que a celula de Conectividade grava. O webhook entrega o remetente COM o DDI, e a comparacao normaliza os dois lados antes da igualdade. O CHECK aceita 10 a 13 digitos, entao uma linha com DDI gravada por outro caminho continua possivel. Unico por tenant, comparado como texto. (Corrigido em 21/10/2026: ate entao este comentario dizia DDI + DDD + numero.)';

COMMIT;

-- Depois do COMMIT, passo separado — ele não vem junto:
--   NOTIFY pgrst, 'reload schema';

-- ── VERIFICAÇÃO, depois de aplicar — pela consulta ao schema, não pelo retorno do comando ──
-- (1) a coluna, nulável e sem default:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'whatsapp_conexao' and column_name = 'numero';
--   → numero | text | YES | NULL
--
-- (2) a CHECK:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.whatsapp_conexao'::regclass and conname = 'whatsapp_conexao_numero_so_digitos';
--   → CHECK ((numero ~ '^[0-9]+$'::text))
--
-- (3) os dois comentários:
--   select col_description('public.whatsapp_conexao'::regclass,
--            (select attnum from pg_attribute where attrelid = 'public.whatsapp_conexao'::regclass and attname = 'numero'));
--   select obj_description('public.orcamentista_conversa'::regclass, 'pg_class');
--   → o segundo NÃO contém mais 'vem do token da instancia (users.wuzapi_token)'
--
-- (3b) o comentário do telefone da lista:
--   select col_description('public.orcamentista_remetente_autorizado'::regclass,
--            (select attnum from pg_attribute where attrelid = 'public.orcamentista_remetente_autorizado'::regclass and attname = 'telefone'));
--   → começa por 'So digitos: DDD + numero, 10 ou 11 digitos, SEM o DDI'
--
-- (4) nenhum comentário das cinco tabelas, nem das colunas delas, cita users.wuzapi_token como
--     origem do tenant — só a nota de correção da conversa o menciona, no passado:
--   select c.relname, coalesce(a.attname, '(tabela)') as alvo, d.description
--   from pg_description d
--   join pg_class c on c.oid = d.objoid
--   left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
--   where c.relnamespace = 'public'::regnamespace
--     and c.relname in ('orcamentista_remetente_autorizado', 'orcamentista_conversa',
--                       'orcamentista_mensagem', 'orcamentista_pre_definicao',
--                       'orcamentista_tentativa_desconhecida')
--     and d.description ilike '%wuzapi_token%';
--   → 1 linha: orcamentista_conversa | (tabela) | ... (Corrigido em 21/10/2026: ...)
--
-- (5) nas SEIS tabelas, nenhum comentário afirma telefone com DDI — só a nota de correção do
--     telefone da lista o menciona, no passado, e o número da instância, que o tem de fato:
--   select c.relname, coalesce(a.attname, '(tabela)') as alvo, d.description
--   from pg_description d
--   join pg_class c on c.oid = d.objoid
--   left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
--   where c.relnamespace = 'public'::regnamespace
--     and c.relname in ('orcamentista_remetente_autorizado', 'orcamentista_conversa',
--                       'orcamentista_mensagem', 'orcamentista_pre_definicao',
--                       'orcamentista_tentativa_desconhecida', 'whatsapp_conexao')
--     and (d.description ilike '%DDI%' or d.description ilike '%codigo do pais%');
--   → 2 linhas: orcamentista_remetente_autorizado | telefone (SEM o DDI ... ate entao ... DDI)
--               whatsapp_conexao | numero (com o codigo do pais)
