# CONFIGURATION_GUIDE — como ligar o Hermes ao Claude Code

> Auditoria de 13/11/2026, só leitura. **Nada deste guia foi executado** — nenhuma instalação, nenhuma configuração foi feita nesta auditoria.
> Legenda **ao lado de cada afirmação**: **[CONFIRMADO]** · **[DOCUMENTADO]** · **[INFERIDO]** · **[RECOMENDADO]** · **[NÃO VERIFICADO]**.
> Todo valor de credencial aparece como `<PLACEHOLDER>`. Nenhum valor real foi lido nem é reproduzido.

## 1. A decisão que vem antes de qualquer comando: ONDE o Hermes roda **[NÃO VERIFICADO]** — é do dono do produto

O Hermes precisa de uma máquina persistente com terminal **[DOCUMENTADO]** (README: Linux, macOS, WSL2, Windows nativo). As opções:

| opção | como o Hermes aciona o Claude Code | custo de infraestrutura |
|---|---|---|
| **A. Computador do dono do produto** | `claude -p` local, na pasta do repositório clonado | nenhum adicional **[INFERIDO]**; a máquina tem de ficar ligada |
| **B. Um servidor/VM próprio** | `claude -p` no servidor | o do servidor **[NÃO VERIFICADO]** — não estimo |
| **C. Sem Hermes local: o coordenador usa as sessões cloud** | MCP `claude-code-remote` (`create_session`, `send_message`, `list_events`, `get_session`) — o mecanismo que esta sessão já tem **[CONFIRMADO]** | sem servidor; o consumo é o das sessões **[NÃO VERIFICADO]** |

A opção C **não** é o Hermes: é o próprio Claude Code coordenando sessões. Fica registrada porque é o único mecanismo de coordenação que
**existe e funciona hoje** neste ambiente **[CONFIRMADO]**.

## 2. Configurações que já existem **[CONFIRMADO]**

| arquivo | conteúdo relevante |
|---|---|
| `.claude/CLAUDE.md` | regras do projeto — o executor já as lê sozinho ao abrir o repositório |
| `.claude/rules/*.md`, `docs/regras/*.md` | as classes de regra |
| `.claude/settings.json` | `{"language": "portuguese"}` |
| `.github/workflows/ci.yml` | os portões do CI |
| `~/.claude/launcher-settings.json` (só nesta sessão cloud) | hook `Stop` que cobra commit e push; permissões `deny` de arquivos de controle |

## 3. Como o Hermes aciona o Claude Code — os mecanismos

### 3.1 `claude -p` (print mode, não interativo) **[CONFIRMADO]** no `claude --help` da versão 2.1.323

```bash
# uma tarefa, saída estruturada, com teto de turnos e ferramentas permitidas
claude -p "<TAREFA, com os campos do protocolo de HERMES_OPERATING_RULES.md, seção 2>" \
  --output-format json \
  --max-turns 30 \
  --permission-mode acceptEdits \
  --allowedTools "Read Edit Write Glob Grep Bash(git *) Bash(npm run *) Bash(npx jest *)" \
  --disallowedTools "Bash(git push --force*) Bash(gh pr merge*)"
```

- `--output-format json` devolve um objeto com `session_id`, `num_turns`, `total_cost_usd` e `subtype` (`success`, `error_max_turns`,
  `error_budget`) **[DOCUMENTADO]** no skill `claude-code` do Hermes; **[NÃO VERIFICADO]** contra esta versão.
- Continuar a mesma conversa: `--resume <session_id>` ou `-c/--continue` **[CONFIRMADO]** no `--help`.
- `--max-budget-usd <valor>` existe **[CONFIRMADO]**; só tem efeito com cobrança por API **[INFERIDO]**.
- `--permission-mode` aceita `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan` **[CONFIRMADO]**.
- **Proibido** para o Hermes: `--dangerously-skip-permissions` e `--permission-mode bypassPermissions` fora de container descartável
  **[RECOMENDADO]**; o skill do Hermes os chama de "opt-in only" **[DOCUMENTADO]**.
- As regras de negação (`--disallowedTools`) são **rede**, não autorização: a regra da seção 0 de `HERMES_OPERATING_RULES.md` vale com ou
  sem elas **[RECOMENDADO]**.

### 3.2 Sessão interativa por tmux **[DOCUMENTADO]** (skill do Hermes)
`tmux new-session -d -s <nome>`, `tmux send-keys`, `tmux capture-pane`. Serve para tarefa longa com acompanhamento; é mais frágil que o print
mode **[INFERIDO]**.

### 3.3 Sessões em segundo plano do próprio CLI **[CONFIRMADO]** no `--help`
`claude --bg` (inicia e devolve um id), `claude agents`, `claude logs <id>`, `claude attach <id>`, `claude stop <id>`.

### 3.4 Sessões cloud (opção C) **[CONFIRMADO]** — ferramentas MCP `claude-code-remote`
`create_session` (com repositório e prompt), `send_message`, `list_events`, `get_session`, `interrupt_session`, `archive_session`.

## 4. O que precisa ser criado **[RECOMENDADO]** (nada foi criado)

| item | onde | conteúdo |
|---|---|---|
| instalação do Hermes | na máquina escolhida (seção 1) | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` **[DOCUMENTADO]**, depois `hermes setup` / `hermes model` |
| o modelo do Hermes | `~/.hermes/config.yaml` (`model.default`) **[DOCUMENTADO]** | o provedor e o modelo escolhidos pelo dono — ver `HERMES_CLAUDE_CODE_HANDOFF.md`, seção 9 |
| a chave do provedor do Hermes | `~/.hermes/.env` **[INFERIDO]** pelo `.env.example` do Hermes | `OPENROUTER_API_KEY=<PLACEHOLDER>` ou `ANTHROPIC_API_KEY=<PLACEHOLDER>` ou outra — **o humano cria e guarda; nenhum agente lê ou escreve** |
| as regras de operação | a instrução de sistema do Hermes | o conteúdo de `docs/hermes/HERMES_OPERATING_RULES.md` |
| o repositório clonado | na máquina do Hermes | `git clone https://github.com/precificacerto/precificacerto-netlify` |
| a autenticação do Claude Code nessa máquina | `claude` (OAuth da assinatura) ou `ANTHROPIC_API_KEY=<PLACEHOLDER>` | **decisão do dono** — ver handoff, seção 9 |
| a autenticação do GitHub nessa máquina | `gh auth login` | push de branch e PR; **sem** permissão de merge — ver a seção 4.1 **[RECOMENDADO]** |

### 4.1 Push sem merge **[RECOMENDADO]** — nada disto foi configurado

Confirmado pelo dono do produto em 13/11/2026: dá para separar. A montagem:

1. **Proteção de branch no `main`**, exigindo PR com revisão aprovada antes do merge (e o CI verde). Hoje o `main` está com `protected=false`
   **[CONFIRMADO]**. Quem liga é o dono do produto, nas configurações do repositório.
2. **O token da máquina do Hermes sem permissão de merge**: ele empurra branch e abre PR; o merge fica com a conta do dono do produto. O token
   não entra na lista de quem pode contornar a proteção.
3. Com os dois, um pedido de merge que escape da regra da seção 0 de `HERMES_OPERATING_RULES.md` ainda é barrado pelo GitHub. A trava é
   rede; a regra continua valendo sem ela.

**Variáveis de ambiente (só nomes, com placeholder):**

```bash
# máquina do Hermes — valores reais só o humano coloca, e nunca num arquivo versionado
OPENROUTER_API_KEY=<PLACEHOLDER>      # ou outro provedor do Hermes
ANTHROPIC_API_KEY=<PLACEHOLDER>       # SÓ se o Claude Code for cobrado por API em vez da assinatura
HERMES_HOME=<CAMINHO>                 # opcional; padrão ~/.hermes
```

## 5. Procedimento de teste **[RECOMENDADO]**

1. Uma tarefa de **Nível 1** (texto em `docs/`), num branch de teste, por `claude -p` com `--output-format json`.
2. O Hermes confere: o branch existe, o PR existe, o diff é o pedido, o CI está verde.
3. Uma tarefa que **deve ser recusada**: pedir ao Claude Code um `gh pr merge` ou uma migração. Esperado: recusa nomeada e relato. Se ele
   executar, **parar tudo** e revisar as permissões.
4. Só então uma tarefa de Nível 2.

## 6. Procedimento de reversão **[RECOMENDADO]**

- Desligar o Hermes não mexe no repositório: o trabalho dele vive em branches e PRs, que o dono fecha ou mergeia.
- Remover o Hermes: desinstalar e apagar `~/.hermes` **na máquina dele** — operação do humano.
- Revogar as chaves criadas para o Hermes no painel de cada provedor — operação do humano.
