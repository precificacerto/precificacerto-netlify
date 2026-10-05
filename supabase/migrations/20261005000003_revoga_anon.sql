-- ============================================================================================
-- PASSO 3 de 3 — TIRAR O PODER DO PAPEL `anon`
--
-- Comando do PO de 05/10/2026, §4. É o de maior retorno dos três, e não quebra nada — medido.
--
-- ── POR QUE NÃO QUEBRA ──────────────────────────────────────────────────────────────────────
-- Depois do login o navegador roda como `authenticated`, não como `anon`: o JWT troca o papel.
-- `anon` só vale ANTES do login, e antes do login nada toca tabela de `public`. Conferido em
-- 05/10/2026 por grep nos sete pontos pré-login — login.tsx, onboarding.tsx, assinar.tsx,
-- criar-senha.tsx, aceitar-convite.tsx, reset-password/ e introducao/:
--
--   grep -rn "\.from('" <os sete>   → ZERO linhas
--   grep -rn "\.rpc("   <os sete>   → ZERO linhas   (não pedido pelo comando; mesma classe de
--                                     risco, porque este arquivo revoga EXECUTE também)
--
-- Login e cadastro falam com o schema `auth`, não com `public`.
--
-- E a outra metade da medição, que é a que de fato garante o pós-login:
--
--   grantee         tabelas  grants
--   anon                 79     553
--   authenticated        79     553   ← intacto por esta migração
--   service_role         79     553   ← intacto
--
-- `authenticated` tem exatamente os mesmos grants, então revogar `anon` não remove acesso de
-- nenhum usuário logado. A RLS continua sendo quem decide QUAIS linhas ele vê.
--
-- >>> AS TRÊS LINHAS DE `ALTER DEFAULT PRIVILEGES` NÃO SÃO ENFEITE <<<
--
-- Sem elas, a PRÓXIMA tabela criada em `public` nasce aberta para `anon` de novo — e ninguém
-- vai lembrar de rodar este arquivo outra vez. O `REVOKE` conserta o presente; o
-- `ALTER DEFAULT PRIVILEGES` conserta o futuro.
--
-- >>> O `USAGE` NO SCHEMA **NÃO** É REVOGADO, E ISSO É DECISÃO <<<
--
-- Sem `USAGE`, o PostgREST devolve erro de schema em vez de "não autorizado", e a diferença
-- importa para diagnosticar: um erro de schema parece configuração quebrada, e alguém iria
-- "consertar" devolvendo o acesso.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────────────────────
-- ANTES (esperado: 79):
--   select count(distinct table_name) from information_schema.role_table_grants
--    where table_schema='public' and grantee='anon';
-- DEPOIS: 0.
--
-- E a conferência que o número não dá: fazer login de verdade e abrir uma tela com dado. O
-- contador de grants fica em 0 tanto no estado certo quanto num estado em que `authenticated`
-- também perdeu acesso por engano.
-- ============================================================================================

BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
