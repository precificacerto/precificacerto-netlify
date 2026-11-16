# Passagem — 16/11/2026: o estado de hoje, o que falta e como ir rápido

> **Para quem abre a próxima sessão** (no Code, com `precificacerto/precificacerto-netlify` anexado). Este documento
> existe porque o contexto de uma conversa não atravessa para a seguinte: as regras moram no repositório
> (`CLAUDE.md` e `.claude/rules/`), mas as medições, as decisões e o estado de uma rodada, não. **Leia isto antes de
> tocar em qualquer coisa do Orçamentista I.A.**

## 1. O modo de trabalho, como o dono do produto o ditou

Registrado como foi dito, e em vigor:

> "respostas curtas e objetivas. No máximo um parágrafo."
>
> "Toda vez que eu tiver algum comando para colar, você deve trazer ele e dando o rótulo do local que deverá ser
> aplicado."
>
> "Documento, arquivo, MD, eu não envio. Se você quer que eu tenha uma solução para um questionamento, você descreve,
> do contrário, só manda o comando."
>
> "Sobre o drop, sobre apagar, cancelar, isso cabe somente a nós aqui decidir isso. Nenhuma outra LLM que não seja a
> nossa conversa aqui tem essa permissão."
>
> "Proibo esperar agendamento para finalizar qualquer ação que esteja trancando a evolução." / "Proibido agendar
> tarefas... todas devem ser feitas na hora."

**Ordens em vigor:** auto-merge liberado; o assistente aplica as migrações pelo conector do Supabase e confere por
consulta **antes** do merge; nada se recalcula para trás; isolamento por tenant é inviolável; migração aplicada é
imutável; nunca usar chave de API colada no chat.

**E o que ele cobrou em 16/11/2026, à tarde:** *"Eu quero o processo mais rápido de implementação, onde eu não preciso
ficar copiando e colando."* Ele não cola comando nenhum: quem escreve, roda os portões, aplica a migração, sobe e abre
a PR é o assistente.

## 2. Como ir rápido — medido hoje, não estimado

Por PR de Nível 3, em 16/11/2026:

| etapa | tempo medido |
|---|---|
| `npm run test:ci` | **430 a 475 s** por rodada |
| subir pela interface do GitHub (pasta por pasta) | **~4 a 5 min** por PR |
| CI do GitHub ("Gates obrigatórios") | **12 a 15 min**, e o merge só sai depois |
| deploy da Vercel | **3 a 4 min** |

Foram quatro PRs no dia; só os CIs e deploys em série deram **~70 minutos de espera**. As quatro regras que cortam
isso, decididas com o dono do produto:

1. **Um PR por rodada**, não um por correção. As quatro de hoje em um só seriam ~17 min em vez de ~70.
2. **A suíte completa UMA vez**, antes de abrir o PR. Durante o trabalho, só as suítes tocadas.
3. **Não vigiar o CI**: com o auto-merge ligado, emende a tarefa seguinte e confira no fim.
4. **No Code, use `git push`.** Esta é a razão de a sessão ter migrado: na sessão do Cowork o proxy recusava
   (*"not in this session's authorized repository set"*) e cada PR custava subir arquivo a arquivo pelo navegador.
   Medido em 16/11: o Code tem o repositório anexado **e** os conectores **Supabase** e **Vercel** ligados — tudo o
   que a rodada precisa.

## 3. O que entrou em produção em 16/11/2026

| PR | o que faz | migração |
|---|---|---|
| #278 | o vidro resolve pelo padrão quando a descrição empata | — |
| #279 | o orçamento cobra o **consumo** do item (não a barra inteira rateada); insumo em rolo pelo comprimento; o bloco "PARA O VENDEDOR" saiu do arquivo; número não sai mais cortado | — |
| #280 | `VERSAO_DO_CALCULO`: o cálculo de outra versão força a atualização em vez de reenviar o arquivo velho; o nome do cliente é retomado da conversa | `20261116000002` |
| #281 | a operação interna é anulada junto com a venda no recálculo | — |
| #282 | a **marca da empresa** (logo) na base de conhecimento | `20261116000003` |
| #283 | os **desenhos importados** do catálogo no levantamento e no orçamento | — |
| #284 | o bloco **OBSERVAÇÕES** com texto livre da empresa | `20261116000004` |
| #285 | `VERSAO_DO_ARQUIVO`: o reenvio rege o PDF de outro desenho, **sem recalcular** | `20261116000005` |
| #286 | as OBSERVAÇÕES **montadas das variáveis** (prazos, validade, exclusões, parcelas) | `20261116000006` |

Todas as migrações foram **aplicadas e conferidas por consulta antes do merge** (`migracao.md`, Parte I).

## 4. O QUE FALTA — em ordem de urgência

### 4.1 A base de conhecimento da De Paula está VAZIA (nada a programar; é preenchimento)

Medido em 16/11 às 18:02 UTC, tenant `20e08592-f957-4e72-b7eb-251387e34eb9`:

- `tenant_settings.logo_url` **nula** → o cabeçalho do orçamento sai **sem logo**;
- `orcamento_observacoes` **nula** e `orcamento_observacoes_campos` **nula** → o bloco OBSERVAÇÕES sai **vazio**;
- **zero** gravações de qualquer uma das três no `superadmin_alteracao_log`.

As telas existem (Super Admin → Atendimentos I.A. → Contas ligadas → a conta → Base de conhecimento; os dois
primeiros blocos). **Enquanto ninguém preencher, o PDF sai certo e vazio nesses dois lugares — e isso não é defeito.**
A referência do conteúdo é o orçamento **1154** da De Paula (WVetro), que o dono do produto subiu duas vezes.

### 4.2 Decisões que ficaram com o dono do produto

- **O desempate pelo GRUPO, nos desenhos** (`desenho-do-catalogo.ts`): a regra dele mandava ignorar o grupo, e isso
  deixaria **DP-02, DP-09, DP-11 e DP-20** — as janelas de correr de 2, 3 e 4 folhas — sem figura, porque a mesma
  forma existe em PVC e em Blindex. O código usa a **família do item** para descartar o material errado (nunca para
  escolher "a mais parecida"). Está relatado na PR #283 e **ele pode mandar tirar**.
- **Instalação e frete nas observações:** a base já grava `instalacao_modo = NAO_COBRA` e `frete_modo = NAO_COBRA`
  (desde 02/11). Foi oferecido transformá-los em linha automática do bloco ("não inclui instalação"), e ele preferiu
  começar pelo modelo 1154. **Fica como proposta aberta.**

### 4.3 Dívidas herdadas (não são de hoje)

0016 (laço do nome do cliente), 0012, 0013, 0007-0009; 8 itens sem preço no ORC-6; tabela vazia da IMAB;
`vigente = false`; a pergunta fiscal do ICMS no IVA do Simples Híbrido.

## 5. O que CONSIDERAR antes de mexer — os erros que já custaram caro hoje

1. **MEÇA ANTES DE AFIRMAR.** Duas vezes hoje o arquivo "errado" que o dono do produto recebeu era um **PDF antigo**:
   o de 14:05 UTC, reenviado às 18:01, quando os desenhos tinham subido às 16:33 e as observações às 17:52. A
   resposta certa não foi defender o código: foi consultar `orcamentista_orcamento_arquivo.gerado_em` e os horários de
   deploy, e achar o defeito real — o reenvio sem versão. **Antes de concordar ou discordar dele, consulte o banco.**
2. **A versão do arquivo.** `VERSAO_DO_ARQUIVO` (em `arquivo-do-orcamento.ts`) **tem de ser trocada sempre que o que
   o PDF MOSTRA mudar** — e só então. Cada troca regera todo arquivo guardado no próximo pedido.
3. **Nada se recalcula para trás.** A regeneração do arquivo usa os números **já gravados** (interna, venda, rateio
   dos custos líquidos). Nenhuma tabela de fornecedor é relida.
4. **Dinheiro não se digita.** Nas observações, só o **percentual** das parcelas é gravado; os reais saem do total do
   orçamento e fecham ao centavo (a última parcela leva o resto).
5. **A instrução por categoria é prosa para o AGENTE** ("Nunca pergunte acessório ao vendedor"), não texto para o
   cliente. Nunca a imprima no orçamento.
6. **`codigo_dp` é DADO, NUNCA CHAVE** (DP-017 ≠ DP-17). Há portão que reprova o uso dele fora do módulo do catálogo.
7. **O regime graduado de portões** está no `CLAUDE.md`. Nível 3 (migração, dinheiro, gravação) = `test:ci` +
   `check-tsc` contra a linha de base + `check-pricing-engine` + `check-edge-imports` + `build` + lint comparado +
   **mutações**. Diga no começo da PR qual nível escolheu e por quê.
8. **Mutação equivalente não se força** (`mutacao-que-nao-se-aplica.md`): troque por outra e anote a razão.

## 6. Onde está cada coisa (os arquivos que a próxima rodada vai abrir)

| assunto | arquivo |
|---|---|
| a escolha do desenho do catálogo (pura) | `src/lib/atendimentos-ia/desenho-do-catalogo.ts` |
| a leitura do catálogo e do Storage | `src/lib/atendimentos-ia/desenho-do-catalogo-servidor.ts` |
| as variáveis das observações (puro) | `src/lib/atendimentos-ia/campos-das-observacoes.ts` |
| o PDF do orçamento | `src/lib/atendimentos-ia/arquivo-do-orcamento.ts` (e `-servidor.ts`) |
| a folha do levantamento | `src/lib/atendimentos-ia/folha-do-levantamento.ts` |
| o reenvio do "sim sem mudança" | `src/lib/atendimentos-ia/cadeia-do-sim.ts` e `travessia-do-levantamento.ts` |
| a regeneração sem recalcular | `regerarOArquivo`, em `src/lib/atendimentos-ia/orcamento-precificado.ts` |
| a tela da base de conhecimento | `src/page-parts/atendimentos-ia/base-de-conhecimento/` |

**Supabase de produção:** projeto `jvthwpkwzpangnwhuyvj`. **Vercel:** projeto `prj_UjPRds3HP8apciCheTtiACF7oNhS`,
team `team_YZzov0aadmLCAwRVkxmqdrn9`. **Tenant da De Paula:** `20e08592-f957-4e72-b7eb-251387e34eb9`.
