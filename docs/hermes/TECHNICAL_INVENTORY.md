# TECHNICAL_INVENTORY — o inventário técnico

> Auditoria de 13/11/2026, só leitura. Legenda **ao lado de cada afirmação**: **[CONFIRMADO]** por inspeção nesta auditoria ·
> **[CONFIRMADO NA SESSÃO]** usado com sucesso nesta mesma sessão de trabalho (13/11/2026), mas não reconsultado agora ·
> **[DOCUMENTADO]** · **[INFERIDO]** · **[RECOMENDADO]** · **[NÃO VERIFICADO]**.
>
> **O escopo do que eu enxergo:** esta auditoria roda dentro de uma **sessão cloud do Claude Code** (claude.ai/code), num container efêmero
> **[CONFIRMADO]**. Eu **não** enxergo o computador do dono do produto, o VS Code dele, nem a conta Anthropic dele.

## 1. Ambiente de execução desta sessão

| item | valor | fonte |
|---|---|---|
| sistema | Ubuntu 24.04.5 LTS, kernel 6.18 x86_64 | **[CONFIRMADO]** `uname -a`, `/etc/os-release` |
| forma de uso do Claude Code | sessão **cloud** (container remoto); variáveis `CCR_*` e `CLAUDE_CODE_*` presentes | **[CONFIRMADO]** `env` (só os nomes) |
| binário | `/opt/node22/bin/claude` | **[CONFIRMADO]** `which claude` |
| versão | `2.1.323 (Claude Code)` | **[CONFIRMADO]** `claude --version` |
| autenticação desta sessão | conta OAuth do claude.ai (`oauthAccount` existe em `/root/.claude.json`) | **[CONFIRMADO]** só a chave; o conteúdo não foi lido |
| Node / npm | v22.23.4 / 10.9.9 | **[CONFIRMADO]** |
| git / gh / psql | 2.43.0 / 2.89.0 / presente | **[CONFIRMADO]** |
| rede | saída por proxy do agente; hosts liberados pela política do ambiente | **[CONFIRMADO]** (`HTTPS_PROXY`, README do proxy); a lista completa de hosts **[NÃO VERIFICADO]** |
| limite de arquivos abertos | 20000 — o `next build` compila e cai em `EMFILE` ao gravar `.next` | **[CONFIRMADO]** em todos os builds desta sessão |
| uso local do dono do produto (Windows, VS Code, Desktop) | há `fazer-commit-web-app.ps1` e `COMO-COMMITAR-WEB-APP.md` no repositório | **[INFERIDO]** que já houve uso em Windows; **[NÃO VERIFICADO]** o que está instalado lá |

## 2. Repositório

| item | valor | fonte |
|---|---|---|
| repositório | `precificacerto/precificacerto-netlify` (GitHub) | **[CONFIRMADO]** `git remote -v` |
| diretório de trabalho | `/home/user/precificacerto-netlify` | **[CONFIRMADO]** |
| branch principal | `main` | **[CONFIRMADO]** `origin/HEAD -> origin/main` |
| proteção do `main` | `protected=false` na API | **[CONFIRMADO]** `gh api …/branches/main` — **o merge depende de disciplina, não de trava** |
| estratégia | branch `claude/<assunto>` por mudança → PR → merge pelo dono do produto | **[CONFIRMADO]** (`.claude/CLAUDE.md` e os PRs #260–#271) |
| commits | convencionais (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), em português | **[CONFIRMADO]** `.claude/CLAUDE.md` |
| outros repositórios | `GIT-REPOS.md` fala de um repositório raiz "Precifica certo" com `web-app` dentro | **[DOCUMENTADO]**; **[NÃO VERIFICADO]** se existe e onde |

## 3. Aplicação

| item | valor | fonte |
|---|---|---|
| stack | Next.js 15, React 19, TypeScript 5.7, Ant Design 5, Jest 29, `@supabase/supabase-js` 2, Stripe 17, nodemailer | **[CONFIRMADO]** `package.json` |
| scripts de portão | `test:ci`, `check-tsc` (linha de base de tipos), `check-pricing-engine`, `check-edge-imports`, `build`, `lint` | **[CONFIRMADO]** `package.json` |
| CI | GitHub Actions `.github/workflows/ci.yml`: job **bloqueante** (`npm ci`, `test:ci`, `check-pricing-engine`, `check-edge-imports`, `check-tsc`, `build`, Node 20) e job de diagnóstico não bloqueante | **[CONFIRMADO]** |
| deploy | Vercel; `vercel.json` com 3 crons (`/api/cron/whatsapp-reminders` a cada minuto, `expire-trials` de hora em hora, `reconcile-stripe` às 03:00) | **[CONFIRMADO]** `vercel.json` |
| outras pistas de deploy | `Dockerfile`, `app.json`, nome "netlify" no repositório | **[CONFIRMADO]** que os arquivos existem; **[INFERIDO]** que são legado — não há evidência de uso |

## 4. Supabase

| item | valor | fonte |
|---|---|---|
| projeto de produção | `jvthwpkwzpangnwhuyvj` (Precifica Certo) | **[CONFIRMADO NA SESSÃO]** consultas `execute_sql` de leitura |
| outro projeto | `azyrbuxvecbohdwrjaqe` (DAMA-Consultoria) — credencial injetada pelo proxy só para `/storage/v1/` | **[CONFIRMADO]** (instrução do ambiente) |
| migrações no repositório | `supabase/migrations/`, 244 arquivos | **[CONFIRMADO]** `ls` |
| relação arquivo × banco | a pasta **não** é a fonte de verdade do schema; aplicação pelo SQL Editor, sem linha em `schema_migrations` | **[DOCUMENTADO]** `.claude/rules/migracao.md`, Parte II |
| edge functions no repositório | `supabase/functions/calc-tax-engine` | **[CONFIRMADO]** `ls` |
| `supabase/config.toml` | `project_id = "web-app"` (placeholder do `supabase init`; não aponta produção) | **[CONFIRMADO]** |
| reconsulta agora | `list_projects` voltou **503/timeout** nesta auditoria | **[NÃO VERIFICADO]** o estado atual |

## 5. Vercel

| item | valor | fonte |
|---|---|---|
| time | `team_YZzov0aadmLCAwRVkxmqdrn9` | **[CONFIRMADO NA SESSÃO]** chamadas a logs e deployments |
| projeto | `prj_UjPRds3HP8apciCheTtiACF7oNhS` | **[CONFIRMADO NA SESSÃO]** |
| reconsulta agora | `list_teams` voltou **500/503** nesta auditoria | **[NÃO VERIFICADO]** o estado atual, domínios, variáveis |

## 6. MCP, conectores e ferramentas desta sessão **[CONFIRMADO]** (os que a sessão expõe)

| conector | uso nesta sessão | permissões vistas |
|---|---|---|
| **Supabase** (MCP) | leitura por `execute_sql`, logs, edge functions | o conector expõe também `apply_migration`, `deploy_edge_function`, `create_branch`… — **as regras do repositório proíbem o assistente de usá-los para escrita em produção** |
| **Vercel** (MCP) | deployments, logs de runtime | expõe também deploy, env vars, domínios — **mesma proibição** |
| **GitHub** | `gh` CLI autenticado pelo proxy (GraphQL bloqueado; só REST) | push de branch, PR, comentários; **force-push negado** pelo modo automático nesta sessão |
| **Google Drive** (MCP) | lido em sessões anteriores (summary) | leitura e escrita expostas |
| **claude-code-remote** (MCP) | sessões cloud, triggers, `send_message`, `list_events` | é o mecanismo **nativo** para um agente coordenar sessões cloud do Claude Code — ver `CONFIGURATION_GUIDE.md` |
| **Claude Docs**, **Windsor.ai**, Canva | disponíveis; não usados neste projeto | **[NÃO VERIFICADO]** o escopo |
| hooks do launcher | `SessionStart` (script de setup), `Stop` (`stop-hook-git-check.sh`: cobra commit e push) | **[CONFIRMADO]** `/root/.claude/launcher-settings.json` (só a estrutura) |
| permissões do launcher | `allow: [Skill]`; `deny`: leitura de `~/.claude/remote` e `/run/ccr`, edição do próprio launcher e dos hooks | **[CONFIRMADO]** |
| `.mcp.json` do projeto | **não existe** | **[CONFIRMADO]** |
| `.claude/settings.json` do projeto | só `{"language": "portuguese"}` | **[CONFIRMADO]** |
| `.claude/hooks/` do projeto | `precompact-session-digest.cjs`, `synapse-engine.cjs` e um README de hooks Python que **não estão registrados** no `settings.json` | **[CONFIRMADO]** os arquivos; **[INFERIDO]** que não rodam (nenhum registro achado) |

## 7. Credenciais — só a existência, nunca o valor

| onde | o que existe | fonte |
|---|---|---|
| `.env.example` (143 linhas, só nomes) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `SENTRY_DSN`, `N8N_*`, `CLICKUP_API_KEY`, `RAILWAY_TOKEN`, preços Stripe… | **[CONFIRMADO]** só os nomes |
| o app em produção | as variáveis reais estão no Vercel | **[INFERIDO]**; **[NÃO VERIFICADO]** quais estão preenchidas |
| esta sessão | GitHub e Supabase/Vercel via conectores e proxy; **nenhuma chave em arquivo** foi lida | **[CONFIRMADO]** |

## 8. Hermes Agent

| item | valor | fonte |
|---|---|---|
| instalado neste ambiente | **não** (`which hermes` não acha) | **[CONFIRMADO]** |
| instalação | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash`; config em `~/.hermes/config.yaml` | **[DOCUMENTADO]** README do repositório `NousResearch/hermes-agent`; o host do instalador **não resolveu** desta sessão |
| skill para Claude Code | `skills/autonomous-ai-agents/claude-code/SKILL.md` (v2.2.1): dirige o `claude` CLI pelo terminal, em `claude -p` ou em tmux | **[DOCUMENTADO]** GitHub do Hermes |
| site de documentação | `hermes-agent.nousresearch.com` — **inacessível** desta sessão (DNS) | **[NÃO VERIFICADO]** o que diz sobre aprovação e limites |
