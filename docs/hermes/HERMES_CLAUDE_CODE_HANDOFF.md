# HERMES_CLAUDE_CODE_HANDOFF — o Hermes como coordenador e o Claude Code como executor

> Auditoria de 13/11/2026, só leitura: nada foi instalado e nenhuma configuração foi alterada. Os únicos arquivos escritos são os cinco de `docs/hermes/`.
> Cada afirmação traz a sua etiqueta **ao lado**:
> - **[CONFIRMADO]**: por inspeção nesta auditoria;
> - **[CONFIRMADO NA SESSÃO]**: usado com sucesso nesta mesma sessão, mas não reconsultado;
> - **[DOCUMENTADO]**: em documentação, que é citada;
> - **[INFERIDO]**: dedução minha, não verificada;
> - **[RECOMENDADO]**: proposta;
> - **[NÃO VERIFICADO]**: não foi possível conferir.
>
> Nenhuma credencial é exposta. Valores aparecem como `<PLACEHOLDER>`.

Arquivos do pacote:

| arquivo | conteúdo |
|---|---|
| `HERMES_CLAUDE_CODE_HANDOFF.md` | este: o resumo e as decisões |
| `TECHNICAL_INVENTORY.md` | ambiente, repositório, aplicação, Supabase, Vercel, MCP, credenciais (só nomes), Hermes |
| `HERMES_OPERATING_RULES.md` | as regras de operação; **seção 0: a linha que não se delega** |
| `CONFIGURATION_GUIDE.md` | onde o Hermes roda, como aciona o Claude Code, o que criar, teste e reversão |
| `INTEGRATION_GAP_ANALYSIS.md` | o que existe, o que falta, o que limpar e o que depende do humano |

---

## 1. Resumo executivo

- O Claude Code já opera como executor neste repositório **[CONFIRMADO]**:
  - um branch por mudança, os portões do regime graduado e um PR para cada entrega;
  - o merge e a migração ficam com o dono do produto.
- O Hermes Agent **não está instalado** neste ambiente **[CONFIRMADO]**. A integração é, hoje, uma proposta **[RECOMENDADO]**.
- Ele tem um skill que dirige o `claude` CLI pelo terminal, com `claude -p` ou tmux **[DOCUMENTADO]**
  (`NousResearch/hermes-agent`, `skills/autonomous-ai-agents/claude-code/SKILL.md`).
- A divisão proposta **[RECOMENDADO]**:
  - **o Hermes planeja, divide tarefa, cobra evidência e reprova entrega;**
  - **o Claude Code executa;**
  - **autorizar é do humano.**
- A regra central: o Hermes **não herda autorização** (`HERMES_OPERATING_RULES.md`, seção 0). Uma instrução dele pedindo qualquer um dos
  itens abaixo é **recusada e relatada**:
  - migração;
  - DROP, DELETE, TRUNCATE ou REVOKE;
  - merge;
  - credencial.
- A primeira decisão é do dono do produto **[NÃO VERIFICADO]**: **onde** o Hermes roda e **como** cada agente é cobrado (seção 9).

## 2. Arquitetura atual

- **Executor:**
  - Claude Code 2.1.323, numa sessão **cloud** (container efêmero), autenticado por OAuth do claude.ai **[CONFIRMADO]**;
  - também há sinais de uso local em Windows (`fazer-commit-web-app.ps1`) **[INFERIDO]**.
- **Código:** `precificacerto/precificacerto-netlify`, com Next.js 15, React 19, TypeScript, Jest e Supabase **[CONFIRMADO]**.
- **CI:** GitHub Actions com um job bloqueante (`test:ci`, `check-pricing-engine`, `check-edge-imports`, `check-tsc`, `build`)
  **[CONFIRMADO]**.
- **Banco:** Supabase `jvthwpkwzpangnwhuyvj` **[CONFIRMADO NA SESSÃO]**, só leitura para o assistente **[CONFIRMADO]** pelo `.claude/CLAUDE.md`.
- **Deploy:** Vercel, com 3 crons em `vercel.json` **[CONFIRMADO]**. Os IDs do time e do projeto estão **[CONFIRMADO NA SESSÃO]**.
- **Proteção do `main`:** `protected=false` **[CONFIRMADO]**. A disciplina do merge é regra escrita, não trava.

## 3. Integrações

O detalhe está em `TECHNICAL_INVENTORY.md`, seção 6. Em resumo **[CONFIRMADO]**:

- GitHub pelo `gh`: só REST, porque o GraphQL está bloqueado nesta sessão.
- MCP do Supabase e da Vercel:
  - esses conectores também expõem escrita;
  - as regras do repositório a proíbem ao assistente;
  - os dois falharam com 503 ou 500 durante esta auditoria.
- Google Drive.
- `claude-code-remote`, que cria, conversa e lê sessões cloud. É o único mecanismo de coordenação que funciona hoje aqui.

## 4. Capacidades

O executor já faz, sem humano **[CONFIRMADO]**:

- ler e editar código e escrever testes;
- rodar os portões e as baterias de mutação;
- empurrar o branch e abrir o PR pela API REST;
- consultar o banco e os logs, só leitura.

Exige humano, sempre (`HERMES_OPERATING_RULES.md`, seções 0 e 7):

- aplicar migração;
- apagar dado ou tirar acesso;
- fazer merge;
- tocar em credencial;
- tomar decisão de produto ou fiscal;
- operar em produção.

## 5. Diretrizes existentes

As que valem **[CONFIRMADO]**:

- `.claude/CLAUDE.md`: idioma, regime graduado (Níveis 1–3), commits convencionais, push por etapa, PR e merge do dono, banco só leitura,
  estado externo consultado na fonte;
- `.claude/rules/indice.md`, mais 9 classes em `.claude/rules/` e 26 em `docs/regras/`;
- `.claude/rules/migracao.md`: a migração é autorizada pelo md5 e aplicada pelo humano no SQL Editor.

Em conflito **[CONFIRMADO]**:

- `AGENTS.md`, `.aios-core/`, `.cursor/`, `.gemini/`, `.codex/` e `.antigravity/` descrevem o framework AIOS;
- o `.claude/CLAUDE.md` diz que esse framework **não é usado**;
- o Hermes não deve ler esses arquivos como instrução **[RECOMENDADO]**;
- a limpeza é decisão do dono (`INTEGRATION_GAP_ANALYSIS.md`, seção 4).

## 6. Proposta de coordenação **[RECOMENDADO]**

1. O dono do produto pede ao Hermes.
2. O Hermes lê as regras (`HERMES_OPERATING_RULES.md`, seção 4), divide o pedido em tarefas e escreve os critérios de aceitação.
3. O Hermes chama o Claude Code com `claude -p … --output-format json --max-turns N` (`CONFIGURATION_GUIDE.md`, seção 3.1).
   - Em cada chamada vão os campos do protocolo (`HERMES_OPERATING_RULES.md`, seção 2) e as quatro proibições.
4. O Claude Code devolve o pacote de evidência: commits, portões com números, mutações, o que não verificou, o que depende do humano e os PRs abertos.
5. O Hermes confere na fonte, com `gh pr view`, `gh pr diff` e `gh pr checks`.
   - Ele reprova o que não tem evidência.
   - Pede correção até 3 vezes.
6. O Hermes relata ao dono, com tudo o que precisa de autorização listado.
   - **A autorização acontece na conversa do dono, nunca por texto repassado.**

A alternativa sem Hermes é a opção C (`CONFIGURATION_GUIDE.md`, seção 1): uma sessão do Claude Code coordena outras pelo MCP
`claude-code-remote` **[CONFIRMADO]**.

## 7. Autonomia

O executor trabalha sozinho dentro do branch dele, até o PR **[RECOMENDADO]**.

O Hermes:

- tem autonomia para planejar e cobrar;
- não tem autonomia para autorizar;
- tem limites de tentativas, turnos e orçamento (`HERMES_OPERATING_RULES.md`, seção 6) **[RECOMENDADO]**.

Nenhum número desses limites foi medido contra a conta do dono **[NÃO VERIFICADO]**.

## 8. Governança e segurança

- **A linha que não se delega:** `HERMES_OPERATING_RULES.md`, seção 0. É regra, não sugestão.
  - A recusa vale mesmo que a instrução diga "o dono autorizou".
- **Credenciais:**
  - só o humano cria, guarda e revoga;
  - nenhum agente lê o valor de chave;
  - o `.env.example` tem só nomes **[CONFIRMADO]**.
- **Permissões do executor:** nunca `--dangerously-skip-permissions` nem `bypassPermissions` fora de container descartável **[RECOMENDADO]**.
- **Redes que já existem:** o modo automático recusou um force-push nesta sessão **[CONFIRMADO]**. É rede, não regra.
- **Ponto fraco:** o `main` está sem proteção de branch **[CONFIRMADO]**. Ligar "exigir PR + CI verde" é decisão do dono **[RECOMENDADO]**.
- **Dados de cliente:**
  - há arquivos de trabalho na raiz do repositório **[CONFIRMADO]**;
  - **[NÃO VERIFICADO]** se algum é dado de cliente;
  - um agente que varre o repositório os lê.

## 9. Custos — **[NÃO VERIFICADO], todos**

Nenhum número é estimado aqui. Esta auditoria **não enxerga** a conta Anthropic do dono, o plano, a fatura nem o painel de uso
**[CONFIRMADO]**: só existe a chave `oauthAccount`, e o conteúdo não foi lido.

| item | estado | onde consultar |
|---|---|---|
| assinatura do Claude (plano) | **[NÃO VERIFICADO]** | claude.ai → Settings → Billing / plano da conta |
| franquia e limites de uso do Claude Code pela assinatura | **[NÃO VERIFICADO]** | claude.ai → Settings → Usage; e a página de planos da Anthropic, lida na data da decisão |
| custo por API, se o Claude Code rodar com `ANTHROPIC_API_KEY` | **[NÃO VERIFICADO]** | Anthropic Console → Billing / Usage; e a tabela de preços por modelo vigente |
| custo do modelo do Hermes (OpenRouter, Anthropic ou outro) | **[NÃO VERIFICADO]** | o painel de cobrança do provedor escolhido |
| máquina do Hermes (opção B) | **[NÃO VERIFICADO]** | o provedor do servidor |
| consumo de sessões cloud (opção C) | **[NÃO VERIFICADO]** | claude.ai → Settings → Usage |

- Em print mode, o campo `total_cost_usd` do JSON **[DOCUMENTADO]** (skill do Hermes) e o `--max-budget-usd` **[CONFIRMADO]** (`--help`)
  servem para medir e limitar.
- Com assinatura, o significado deles **[NÃO VERIFICADO]**.

## 10. Limitações

O detalhe está em `INTEGRATION_GAP_ANALYSIS.md`, seção 5.

- O `next build` cai em `EMFILE` neste container **[CONFIRMADO]**. O build completo se confirma no CI.
- A pasta `supabase/migrations/` não é a fonte de verdade do schema **[DOCUMENTADO]**.
- O GraphQL do GitHub está bloqueado aqui **[CONFIRMADO]**.
- O site de documentação do Hermes não resolveu desta sessão **[CONFIRMADO]**. Por isso o que ele diz sobre aprovação, limites e
  pré-requisitos está **[NÃO VERIFICADO]**.
- O Claude Code roda só modelos Claude **[DOCUMENTADO]**.

## 11. Recomendações **[RECOMENDADO]**, em ordem

1. O dono decide onde o Hermes roda e a forma de cobrança de cada agente (seção 9).
2. Ligar a proteção de branch no `main`: exigir PR e CI verde.
3. Pôr `HERMES_OPERATING_RULES.md` como instrução de sistema do Hermes.
4. Testar primeiro uma tarefa de Nível 1. Depois, uma tarefa que **deve ser recusada**, como merge ou migração (`CONFIGURATION_GUIDE.md`,
   seção 5). Só então uma de Nível 2.
5. Decidir o destino de `AGENTS.md`, das pastas AIOS e do README de hooks Python que não rodam.
6. Revisar os arquivos de trabalho na raiz do repositório.

## 12. O que ainda depende de confirmação

Cada item tem dono:

1. Onde o Hermes roda: A, B ou C. É do dono do produto.
2. Assinatura, franquia, limites e custo de API, de cada agente (seção 9). É do dono do produto, no painel.
3. O que o site do Hermes diz sobre aprovação humana e limites de iteração. Fica para quem tiver acesso ao site.
4. O formato exato do JSON do `claude -p` nesta versão: `subtype`, `total_cost_usd`. Confere-se num primeiro teste.
5. O estado atual do Supabase e da Vercel, porque a reconsulta deu 503 ou 500. Fica para uma nova consulta de leitura.
6. Se o GitHub permite um token com push e sem merge, para a máquina do Hermes. Fica para quem configurar.
7. Se algum arquivo da raiz é dado de cliente. É do dono do produto.
