-- ════════════════════════════════════════════════════════════════════════════════════════
-- POLÍTICAS DE VISIBILIDADE — o aperto do `orders` e a quarta parcela do `sales`
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ESTA MIGRAÇÃO NÃO FOI APLICADA. O default é PENDENTE até a consulta da VERIFICAÇÃO    ║
-- ║ devolver o esperado — `migration-delivery.md`. Arquivo commitado não é migração       ║
-- ║ aplicada, e build verde não prova política nenhuma.                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- SEPARADA DA RPC DA BAIXA de propósito (`20261016000001`): autorizações diferentes, riscos
-- diferentes. Misturar obrigaria a autorizar as duas juntas.
--
--
-- O MODELO, do dono do produto, 16/10/2026
-- =========================================
-- Dentro de um tenant existem DOIS níveis e só dois:
--   ADMIN     -> tudo, por natureza, qualquer manutenção, sem atribuição.
--   NÃO-ADMIN -> só o que lhe foi atribuído, e obedece. Quem atribui é o admin.
--
-- `employees.position = 'Gerente Administrativo'` é CARGO, não nível de acesso. Medido:
-- `users.role` é enum de TRÊS valores — `super_admin` (1), `admin` (17), `user` (2) —, e
-- `is_admin_or_manager()` é `role = 'admin'` e só. Não existe papel "administrativo" nem
-- "vendedor" no modelo de acesso, e não é esta migração que os cria.
--
--
-- DUAS COISAS QUE PARECEM DEFEITO E SÃO DESENHO — para ninguém "corrigir" depois
-- ==============================================================================
-- 1. O SUPER ADMIN NÃO VÊ NADA, E ISSO É CORRETO. `users.tenant_id` é NULL para ele, e é o
--    que mantém uma conta que atravessa tenants fora dos dados de cada um. Consequência
--    declarada: a ausência de `is_super_admin()` em `orders_select` é INERTE, porque o
--    predicado de tenant já o exclui nas quatro tabelas. NÃO SE ACRESCENTA — código inerte
--    sugere capacidade que não existe.
-- 2. AS TELAS VAZIAS DO GERENTE ADMINISTRATIVO ESTÃO CERTAS. Ele tem a PORTA (permissão de
--    módulo: `budgets`, `sales`, `customers`, `cash_flow` em EDIT) e não tem CONTEÚDO (0
--    documentos criados, 0 clientes sob responsabilidade). Medido: o tenant dele tem 110
--    orçamentos, 21 vendas e 97 clientes, e ele vê 0, 0 e 0. É CONFIGURAÇÃO — alguém tem de
--    atribuir —, não código. Esta migração não mexe nisso.
--
--
-- O QUE ESTA MIGRAÇÃO FAZ, E É POUCO
-- ===================================
--   `budgets`   -> NADA. `budgets_select_owner_or_admin` já é o alvo, letra por letra, com a
--                  quarta parcela do OR. Medido no catálogo vivo.
--   `customers` -> NADA. Já restringe por `owner_id = get_my_employee_id()`.
--   `orders`    -> DROP das políticas `orders_tenant_*` de SELECT, UPDATE e DELETE.
--   `sales`     -> ACRESCENTA a quarta parcela do OR.
--
-- O `orders_tenant_insert` NÃO É REMOVIDO NESTA MIGRAÇÃO, e a razão está na seção própria
-- mais abaixo: a medição que o dono do produto pediu encontrou um caminho de criação que
-- PARARIA DE INSERIR. Remover é uma linha; ela depende de uma correção de código que não é
-- migração.
--
--
-- A MEDIÇÃO DO APERTO, 16/10/2026 — o custo total são 21 linhas e dois usuários
-- =============================================================================
-- Ensaio por `SELECT`, simulando o predicado usuário a usuário:
--
--   | perfil                              | orders hoje | orders depois |
--   |-------------------------------------|------------:|--------------:|
--   | `super_admin` (1)                   |           0 |             0 |
--   | `admin` (17, somados)               |          30 |            30 |
--   | `user` contato@esquadrias…          |      **12** |         **0** |
--   | `user` dudaklein.03@                |       **9** |         **0** |
--
-- NENHUM dos 17 admins muda uma linha. `sales` não muda para ninguém hoje (ver a seção do
-- `sales`). E os dois `user` que perdem a leitura de `orders` JÁ NÃO CONSEGUEM ABRIR a tela:
-- a permissão de módulo de `orders` é "nada" para os dois, e `pedidos/index.tsx` é guardada
-- por `canView(MODULES.ORDERS)`. A perda é real no banco e invisível na tela.
--
-- E NADA QUEBRA, conferido arquivo por arquivo:
--   `comissao-vendedor/index.tsx:197,203,285,296,317,328`, `rt-comissoes/index.tsx:197,203,
--   310,321,342,352` e `relatorio-vendas/index.tsx:630,647,689,724,965,982` leem `sales`,
--   `budgets` e `customers` — tabelas que JÁ restringem hoje, então estas telas já só
--   funcionam para admin e não são tocadas por esta migração.
--   `dfc/`, `fluxo-de-caixa/`, `caixa/` e `dre/` NÃO têm uma só leitura de `orders`.
--   Quem lê `orders` é `pedidos/`, `vendas/`, `orcamentos/`, o histórico do cliente
--   (`historico-do-cliente.component.tsx:161`) e `api/delete/orders.ts` — este último por
--   `supabaseAdmin`, que não passa por RLS e portanto não muda de comportamento.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. `orders` — AS TRÊS POLÍTICAS QUE ANULAM AS RESTRITIVAS AO LADO
-- ────────────────────────────────────────────────────────────────────────────────────────
-- Cada uma destas é PERMISSIVE e exige SÓ O TENANT. Política permissiva combina por OR com
-- as outras do mesmo comando, então cada uma delas torna inoperante a restritiva vizinha —
-- que já diz `tenant + (admin OR created_by = uid)`, exatamente o modelo.
--
-- É `portao-que-nao-alcanca.md` em forma de política: o portão existe, tem o predicado certo
-- escrito, e outra política ao lado o torna irrelevante.
--
-- AS TRÊS JUNTAS, E NÃO SÓ A DE LEITURA. Remover apenas `orders_tenant_select` deixaria a
-- pessoa SEM VER o pedido E PODENDO APAGÁ-LO — um aperto que fecha a vitrine e deixa a porta
-- dos fundos aberta é pior que nenhum, porque dá a impressão de ter fechado.

DROP POLICY IF EXISTS "orders_tenant_select" ON public.orders;
-- Sobra `orders_select`: `tenant AND ((is_admin_or_manager() = true) OR created_by = uid)`.

DROP POLICY IF EXISTS "orders_tenant_update" ON public.orders;
-- Sobra `orders_update`: mesmo predicado, mais `with_check` de tenant.

DROP POLICY IF EXISTS "orders_tenant_delete" ON public.orders;
-- Sobra `orders_delete`: mesmo predicado.

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. `sales` — A QUARTA PARCELA DO OR
-- ────────────────────────────────────────────────────────────────────────────────────────
-- É o que faz a ficha do cliente NÃO MENTIR: o responsável pelo cliente vê a CADEIA INTEIRA
-- daquele cliente — orçamento, pedido e venda —, não metade dela. `budgets` já tem esta
-- parcela; `sales` não tinha, e sem ela a ficha mostraria o orçamento e esconderia a venda.
--
-- O EFEITO COMEÇA EM ZERO, E ISSO É DECISÃO, NÃO DEFEITO
-- -------------------------------------------------------
-- Medido em 16/10/2026: `customers.owner_id` é nulo em **116 de 116**, e apenas **1 dos 20
-- usuários** tem `employees.user_id` vinculado — então `get_my_employee_id()` devolve NULL
-- para 19 deles. A parcela não alcança uma linha sequer hoje.
--
-- NÃO HÁ BACKFILL de `owner_id`, por decisão do dono do produto: nulo É a verdade — ninguém
-- atribuiu vendedor responsável. "Quem cadastrou" não é "de quem é o cliente", e igualar os
-- dois atribuiria 116 carteiras que nenhuma pessoa decidiu (`ausente-vs-falso.md`). O campo
-- da aba DADOS da ficha é por onde o dado passa a existir.
--
-- Portanto: o efeito desta parcela CRESCE conforme alguém atribui responsável, a partir de
-- zero. Quem a encontrar inerte não encontrou um defeito — encontrou uma regra esperando o
-- primeiro dado.
--
-- `ALTER POLICY` e não DROP+CREATE: preserva nome e comando, e o diff fica no predicado.
--
-- O PREDICADO ABAIXO É O VIVO, VERBATIM, MAIS UM RAMO. Nada mais muda — nem a função de
-- tenant, nem a ordem dos ramos existentes, nem a forma `f() = true`.
--
-- A primeira versão deste arquivo escrevia o OR na forma de `budgets_select_owner_or_admin`
-- (`is_super_admin() OR is_admin_or_manager()`, sem o `= true`), achando que deixar as duas
-- políticas iguais na escrita valia mais. Conferido contra `pg_policies` em 16/10/2026, o
-- `qual` vivo de `sales` é:
--
--   ((tenant_id = get_auth_tenant_id())
--    AND ((is_admin_or_manager() = true) OR (is_super_admin() = true) OR (created_by = auth.uid())))
--
-- — ou seja, aquela escrita teria trocado a ORDEM dos dois primeiros ramos e removido os
-- `= true` DE CARONA com a regra nova. Semanticamente idêntico (as duas funções são
-- `SELECT EXISTS(...)`, que nunca devolve NULL), mas são três mudanças onde foi pedida uma,
-- e o `qual` gravado mudaria de texto sem que a regra mudasse — tornando a conferência
-- depois de aplicar incapaz de distinguir o ramo novo do reescrito.
--
-- A FUNÇÃO DE TENANT CONTINUA `get_auth_tenant_id()`, que é a que já estava lá. Trocar o
-- mecanismo de tenant junto com a regra de visibilidade seriam duas mudanças numa, no pior
-- lugar possível.

ALTER POLICY "sales_select_owner_or_admin" ON public.sales
  USING (
    (tenant_id = get_auth_tenant_id())
    AND (
      (is_admin_or_manager() = true)
      OR (is_super_admin() = true)
      OR (created_by = auth.uid())
      -- O ÚNICO RAMO NOVO. Escrito na forma que `budgets` já renderiza, para que o `qual`
      -- gravado nas duas tabelas fique comparável NESTE ramo.
      OR (customer_id IN (
            SELECT customers.id
            FROM customers
            WHERE ((customers.tenant_id = get_auth_tenant_id())
               AND (customers.owner_id = get_my_employee_id()))
          ))
    )
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- O QUARTO DROP — `orders_tenant_insert` — NÃO ESTÁ NESTA MIGRAÇÃO
--
-- O dono do produto pediu as QUATRO e mandou medir antes, dizendo que a medição podia mudar
-- o item. **Mudou.**
--
-- Com `orders_tenant_insert` fora, o `with_check` que sobra é o de `orders_insert`:
--
--   (tenant_id = (SELECT get_auth_tenant_id())) AND (created_by = (SELECT auth.uid()))
--
-- ou seja, `created_by` passa a ser OBRIGATÓRIO e igual ao usuário da sessão.
--
-- EXISTE UM ÚNICO `insert` em `orders` no repositório inteiro — `orcamentos/index.tsx:2188`,
-- o "enviar para pedido" —, e ele grava:
--
--   created_by: currentUser?.uid || null
--
-- Com `currentUser` não hidratado, isso grava **NULL**, e `NULL = auth.uid()` não é `true`:
-- o INSERT seria **RECUSADO**. Hoje passa porque `orders_tenant_insert` exige só o tenant.
--
-- E a prova de que a condição é real está NO MESMO ARQUIVO, 690 linhas acima
-- (`orcamentos/index.tsx:1497-1498`), no insert de `budgets`:
--
--   const createdBy = currentUser?.uid ?? (await getCurrentUserId())
--   if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); return }
--
-- O padrão com fallback e guarda existe em CINCO lugares do repositório. O insert de
-- `orders` é o que não o tem — `copia-divergente.md`: a mesma necessidade escrita duas
-- vezes, uma esquecendo o fallback, e nada falha enquanto a política vazada cobre.
--
-- Medido: `orders` tem `created_by` preenchido em 21 de 21, então o caminho nunca produziu
-- NULL até hoje. Isso NÃO torna o risco teórico — torna-o não observado, que é outra coisa.
--
-- A ORDEM CORRETA, e ela é o inverso da migração de função:
--   1º  alinhar `orcamentos/index.tsx:2188` com o padrão de `:1497` (uma linha e uma guarda);
--   2º  depois, `DROP POLICY IF EXISTS "orders_tenant_insert" ON public.orders;`
--
-- Dropar primeiro quebra a criação de pedido para quem abrir a tela com a sessão ainda
-- carregando — e o sintoma seria "não consigo enviar para pedido", sem relação aparente com
-- uma migração de políticas.
--
-- A linha fica escrita aqui, pronta, NÃO EXECUTADA e fora do BEGIN/COMMIT de propósito:
-- copiá-la para uma migração própria depois da correção de código é um gesto; descobrir que
-- ela existia é o que esta seção garante.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. QUATRO consultas, não uma.
--
-- (1) AS POLÍTICAS VIVAS DE `orders`. É a que prova que os três DROP pegaram:
--
--   select policyname, cmd, permissive, qual
--     from pg_policies
--    where schemaname='public' and tablename='orders'
--    order by cmd, policyname;
--
--   -- esperado: QUATRO linhas, e nenhuma com nome `orders_tenant_*` exceto a de INSERT:
--   --   orders_delete        DELETE   tenant AND (is_admin_or_manager() OR created_by=uid)
--   --   orders_insert        INSERT   (qual null; with_check exige tenant E created_by)
--   --   orders_tenant_insert INSERT   <- FICA, de propósito. Ver a seção acima.
--   --   orders_select        SELECT   tenant AND (is_admin_or_manager() OR created_by=uid)
--   --   orders_update        UPDATE   tenant AND (is_admin_or_manager() OR created_by=uid)
--   --
--   -- Qualquer `orders_tenant_select`, `orders_tenant_update` ou `orders_tenant_delete`
--   -- remanescente significa NÃO APLICADA: a restritiva ao lado continua inoperante.
--
-- (2) O `qual` NOVO DE `sales`, e ele tem de conter a quarta parcela:
--
--   select policyname, cmd, qual
--     from pg_policies
--    where schemaname='public' and tablename='sales' and cmd='SELECT';
--
--   -- esperado: UMA linha, `sales_select_owner_or_admin`, e o `qual` contendo
--   -- `get_my_employee_id()`. Sem essa chamada no texto, o ALTER não pegou — e a ficha
--   -- voltaria a mostrar o orçamento e esconder a venda do mesmo cliente.
--
-- (3) O ENSAIO, CONFERIDO CONTRA O PREVISTO. Roda sem tocar em dado nenhum, e é o que
--     distingue "aplicou" de "aplicou e deu o que se esperava":
--
--   with eu as (
--     select u.id, u.email, u.role, u.tenant_id,
--            (select e.id from public.employees e
--              where e.user_id = u.id and e.tenant_id = u.tenant_id limit 1) as meu_employee
--       from public.users u
--   )
--   select eu.role, eu.email,
--          (select count(*) from public.orders o
--            where o.tenant_id = eu.tenant_id
--              and (eu.role in ('admin','super_admin')
--                   or o.created_by = eu.id
--                   or o.customer_id in (select c.id from public.customers c
--                                         where c.tenant_id = eu.tenant_id
--                                           and c.owner_id = eu.meu_employee))) as orders_visiveis
--     from eu
--    order by eu.role, eu.email;
--
--   -- esperado, e são os números do ensaio de 16/10/2026:
--   --   `super_admin`                       -> 0   (tenant NULL, por desenho)
--   --   `admin` fernandescof@               -> 12
--   --   `admin` esteticaelianer@            -> 9
--   --   `admin` felipegklein@               -> 9
--   --   `admin` os outros 14                -> 0
--   --   `user`  contato@esquadrias…         -> 0   (era 12)
--   --   `user`  dudaklein.03@               -> 0   (era 9)
--   --
--   -- Qualquer `user` com número > 0 significa que uma política permissiva sobrou. Qualquer
--   -- `admin` que tenha DIMINUÍDO significa que o aperto pegou quem não devia — e aí a
--   -- reversão é recriar as três políticas, não "ajustar" as restritivas.
--
-- (4) E O `NOTIFY`, que NÃO vem junto com o COMMIT. Política é metadado que o PostgREST
--     consulta; sem o reload, ele continua decidindo pelo cache antigo:
--
--   NOTIFY pgrst, 'reload schema';
--
-- APLICAÇÃO: o `BEGIN`/`COMMIT` é do ARQUIVO. Quem aplicar pelo conector do Supabase precisa
-- REMOVÊ-LOS — o conector abre transação própria e o `COMMIT` daqui fecharia a dele. Pelo
-- SQL Editor o arquivo vai como está. O `name` da migração aplicada é o NOME COMPLETO DESTE
-- ARQUIVO sem a extensão (`migration-delivery.md`): é a única coisa que liga a linha de
-- `schema_migrations` ao arquivo do repositório.
--
-- REVERSÃO, se preciso: recriar as três políticas removidas é trivial e está escrito acima
-- (cada DROP tem, no comentário ao lado, o que sobra). O `ALTER POLICY` do `sales` se
-- reverte removendo a quarta parcela do OR — e, como ela é inerte hoje, revertê-la não muda
-- número nenhum.
-- ════════════════════════════════════════════════════════════════════════════════════════
