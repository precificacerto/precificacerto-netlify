# INTEGRATION_GAP_ANALYSIS — o que existe, o que falta e o que depende do humano

> Auditoria de 13/11/2026, só leitura. Legenda **ao lado de cada afirmação**: **[CONFIRMADO]** · **[CONFIRMADO NA SESSÃO]** · **[DOCUMENTADO]** ·
> **[INFERIDO]** · **[RECOMENDADO]** · **[NÃO VERIFICADO]**.

## 1. O que já está pronto

| item | estado |
|---|---|
| o Claude Code como executor neste repositório, com branch por mudança, portões e PR | **[CONFIRMADO]** — PRs #260–#271 desta sessão |
| as regras escritas que o executor lê sozinho (`.claude/CLAUDE.md`, 9 regras em `.claude/rules/`, 26 em `docs/regras/`) | **[CONFIRMADO]** |
| o regime graduado de portões (Níveis 1–3) e o CI bloqueante | **[CONFIRMADO]** |
| a disciplina de migração (md5, aplicação humana, conferência por consulta) | **[CONFIRMADO]** — a `20261113000001` passou por ela nesta sessão |
| o `claude` CLI com print mode, saída JSON, resume, `--max-turns`, `--max-budget-usd`, sessões em segundo plano | **[CONFIRMADO]** `claude --help`, v2.1.323 |
| um mecanismo nativo de coordenação entre sessões cloud (MCP `claude-code-remote`) | **[CONFIRMADO]** |
| um skill do Hermes que já sabe dirigir o `claude` CLI | **[DOCUMENTADO]** `NousResearch/hermes-agent`, `skills/autonomous-ai-agents/claude-code/SKILL.md` |

## 2. O que pode ser reutilizado

- O formato de relato que o Claude Code já usa (portões com números, mutações, PRs abertos) vira o **pacote de evidência** que o Hermes cobra
  **[RECOMENDADO]**.
- As regras de `docs/regras/` são gerais e servem de critério de revisão para o Hermes (ex.: `teste-que-nao-exercita`, `portao-que-nao-alcanca`,
  `estado-relatado-vs-real`, `pr-aberto-no-relato`) **[RECOMENDADO]**.
- O `gh` CLI para o Hermes conferir PR, diff e CI sem tocar no código **[RECOMENDADO]**.

## 3. O que falta configurar **[RECOMENDADO]**

| item | quem decide | nota |
|---|---|---|
| a máquina onde o Hermes roda | dono do produto | o Hermes **não** está instalado neste ambiente **[CONFIRMADO]** |
| o provedor e o modelo do Hermes | dono do produto | custos **[NÃO VERIFICADO]** |
| como o Claude Code é autenticado nessa máquina (assinatura × API) | dono do produto | ver handoff, seção 9 |
| a instrução de sistema do Hermes com `HERMES_OPERATING_RULES.md` | o humano que instalar | — |
| proteção de branch no `main` (exigir PR e CI verde) | dono do produto | hoje `protected=false` **[CONFIRMADO]**; sem ela, um token com push pode escrever no `main` |

## 4. O que precisa ser desenvolvido, ou limpo

| item | por quê |
|---|---|
| **instruções conflitantes de outros agentes** no repositório: `AGENTS.md` (Synkra AIOS), `.aios-core/`, `.cursor/`, `.gemini/`, `.codex/`, `.antigravity/` | o `.claude/CLAUDE.md` diz "O framework AIOS não é usado neste projeto" **[CONFIRMADO]**, mas o `AGENTS.md` manda seguir a Constitution do AIOS e rodar `npm run typecheck`/`lint` (que têm centenas de erros herdados) **[CONFIRMADO]**. Um Hermes que leia o `AGENTS.md` receberia regras **opostas** às vigentes. **Não removi nada** — a decisão é do dono |
| **hooks Python descritos em `.claude/hooks/README.md`** (`read-protection.py`, `sql-governance.py`…) | os `.py` não existem na pasta e não há registro em `.claude/settings.json` **[CONFIRMADO]**; o README descreve uma governança que **não roda** **[INFERIDO]** |
| um adaptador que leia o JSON do `claude -p` e monte o pacote de evidência | o skill do Hermes guia, mas a conferência de PR/CI é trabalho do Hermes **[INFERIDO]** |
| **muitos arquivos de cliente e de trabalho na raiz** (`.docx`, `.pdf`, `.xlsx`, imagens de WhatsApp, `_tmp_*`) | não é integração, mas um agente que varre o repositório os lê; e o `CLAUDE.md` pede dado de cliente fora do repositório **[CONFIRMADO]** a regra; **[NÃO VERIFICADO]** se algum arquivo é dado de cliente |

## 5. O que apresenta limitações

| limitação | efeito |
|---|---|
| o `next build` neste ambiente cloud cai em `EMFILE` depois de compilar **[CONFIRMADO]** | o build completo só se confirma no CI do GitHub |
| a pasta `supabase/migrations/` não é a fonte de verdade do schema **[DOCUMENTADO]** | o Hermes não pode deduzir o banco pelos arquivos; precisa de consulta de leitura |
| GraphQL do GitHub bloqueado nesta sessão; só REST **[CONFIRMADO]** | `gh pr create` falha; `gh api …/pulls` funciona |
| conectores MCP do Supabase e da Vercel deram 503/500/timeout durante a auditoria **[CONFIRMADO]** | o inventário deles usa o que foi **[CONFIRMADO NA SESSÃO]** |
| o site de documentação do Hermes não resolveu desta sessão **[CONFIRMADO]** | aprovação, limites de iteração e pré-requisitos do Hermes **[NÃO VERIFICADO]** |
| o Claude Code só roda modelos Claude **[DOCUMENTADO]** (pesquisa sobre o Hermes) | o Hermes pode usar outro modelo; o executor, não |

## 6. O que depende de aprovação humana — sempre

Os quatro itens da seção 0 de `HERMES_OPERATING_RULES.md`, sem exceção: **aplicar migração; DROP/DELETE/TRUNCATE/REVOKE ou qualquer coisa que
apague ou tire acesso; merge de PR; credencial, chave ou variável de ambiente.** E ainda: decisões de produto e fiscais, operações em produção,
exclusão de dado, operação financeira, mudança irreversível, a escolha da máquina, do provedor e da forma de cobrança.
