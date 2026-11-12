# O histórico de migrações — medido em 12/11/2026 (só leitura)

Pedido do dono do produto, 12/11/2026: "Me devolva a lista medida no banco, como o projeto deve registrar uma migração aplicada pelo SQL Editor,
o que fazer com a colisão de versão, e o SQL de reparo em arquivo para eu ler. Não rode nada disso."

## 1. O que o banco tem registrado

`supabase_migrations.schema_migrations`, desde 20/10/2026: **13 linhas**, a última `20261025142857` (`20261025000003_levantamento_por_nome`).
Colunas: `version text` (chave primária), `statements text[]`, `name text`, `created_by text`, `idempotency_key text`, `rollback text[]`.

## 2. A lista medida — cada arquivo depois de 20261025142857

**O método.** Para cada arquivo de `supabase/migrations/` da `origin/main` com prefixo maior que `20261025142857`, mais os deste branch e os das
duas branches com `20261111000001`, um leitor tira do texto (sem os comentários) o que ele CRIA — tabela, coluna, constraint, índice — e o
**corpo de cada função**, e confere no catálogo de produção: o objeto existe; o md5 do corpo (sem o `\r`) é o de `prosrc`. Função cujo corpo não
bate é conferida contra a migração seguinte que a redefine ("redefinida depois"); objeto ausente é conferido contra a migração que o tira.
O leitor e a consulta (uma só, só de leitura) estão em `scripts/harness/historico-de-migracoes/` (`sondas.py`, `catalogo.sql`).

**O controle** (`instrumento-que-nao-enxerga.md`): o leitor diz "aplicada" para a `20261112000002` (que o dono do produto conferiu aplicada) e
"não aplicada" para a `20261112000001` (que ele disse que não entrou) — nos dois sentidos, certo.

| arquivo | onde | estado | objetos presentes | funções | nota |
|---|---|---|---|---|---|
| `20261026000001_limite_de_tempo_da_importacao` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 0 · diferentes 0 | sem objeto novo (ALTER FUNCTION … SET): o `statement_timeout=35s` de `importar_conteudo_da_tabela` está no `proconfig` |
| `20261026000002_pergunta_em_aberto` | main | aplicada | 1/1 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261026000003_pergunta_confirmar_apanhado` | main | aplicada | 1/1 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261026000004_familia_da_tabela` | main | aplicada | 5/5 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261026000005_tabela_vigente` | main | aplicada | 3/3 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261027000001_contexto_do_atendimento` | main | aplicada | 1/1 | iguais 1 · redefinidas depois 0 · diferentes 0 |  |
| `20261027000002_motor_por_familia_e_etapas` | main | aplicada | 10/15 | iguais 0 · redefinidas depois 0 · diferentes 0 | os ausentes saíram depois (`orcamentista_motor_uma_vigente` na 20261028000001; `…_tenant_familia_idx` na 20261028000001) |
| `20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 3 · diferentes 0 |  |
| `20261027000004_copiar_motor_da_wolff_para_a_planilha` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 0 · diferentes 0 | só copia dado: as 12.116 regras do motor `9a233c55` estão em produção por `motor_id` |
| `20261027000005_categoria_da_tabela_de_fornecedor` | main | aplicada | 2/2 | iguais 1 · redefinidas depois 0 · diferentes 0 |  |
| `20261027000006_motor_da_familia` | main | aplicada | 7/11 | iguais 0 · redefinidas depois 0 · diferentes 0 | os ausentes saíram depois (as FKs `(motor_id, familia)` e o UNIQUE na 20261029000002/3; `uma_vigente` na 20261028000001) |
| `20261027000007_motor_so_para_perfil` | main | aplicada | 1/2 | iguais 0 · redefinidas depois 0 · diferentes 0 | a CHECK do Perfil saiu na 20261027000009 |
| `20261027000008_etapa_aponta_o_motor` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 1 · diferentes 1 | `superadmin_gravar_etapas_da_familia` não existe mais (trocada pela `…_da_materia_prima` na 20261028000001) |
| `20261027000009_tira_perfil_exige_motor` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 0 · diferentes 0 | só tira a CHECK `orcamentista_tabela_perfil_exige_motor`: ela não existe |
| `20261027000010_etapa_sobe_o_motor_e_titulo_da_familia` | main | aplicada | 0/0 | iguais 1 · redefinidas depois 0 · diferentes 1 | `superadmin_criar_motor_da_etapa` não existe mais (saiu na 20261028000001) |
| `20261028000001_familia_instancia_e_catalogo_de_motores` | main | aplicada | 7/7 | iguais 1 · redefinidas depois 4 · diferentes 0 |  |
| `20261028000002_familia_pvc_wolf_e_familia_so_no_perfil` | main | aplicada | 1/1 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261029000001_trocar_arquivo_e_editar_motor` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 2 · diferentes 0 |  |
| `20261029000002_familia_do_motor_so_no_perfil` | main | aplicada | 6/9 | iguais 0 · redefinidas depois 3 · diferentes 0 | os ausentes saíram na 20261029000003 (o desenho do `*`) |
| `20261029000003_motor_para_n_familias` | main | aplicada | 2/2 | iguais 1 · redefinidas depois 4 · diferentes 0 |  |
| `20261029000004_familias_do_catalogo` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 2 · diferentes 1 | `superadmin_remover_familia` saiu na 20261031000003 |
| `20261029000005_nome_do_motor_e_arquivar_em_uso` | main | aplicada | 4/4 | iguais 1 · redefinidas depois 3 · diferentes 0 |  |
| `20261031000001_excluir_etapa_na_conta` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 1 · diferentes 0 |  |
| `20261031000002_etapa_no_catalogo` | main | aplicada | 6/6 | iguais 4 · redefinidas depois 0 · diferentes 1 | `superadmin_remover_etapa_do_catalogo` saiu na 20261031000003 |
| `20261031000003_catalogo_soberano` | main | aplicada | 0/0 | iguais 1 · redefinidas depois 4 · diferentes 0 |  |
| `20261101000001_tabela_na_soberania` | main | aplicada | 0/0 | iguais 0 · redefinidas depois 2 · diferentes 0 |  |
| `20261101000002_arquivo_em_da_tabela` | main | aplicada | 1/1 | iguais 1 · redefinidas depois 0 · diferentes 0 |  |
| `20261102000001_bloco_tributario_do_item` | main | aplicada | 14/14 | iguais 1 · redefinidas depois 0 · diferentes 0 |  |
| `20261102000002_categorias_do_catalogo` | main | aplicada | 2/2 | iguais 7 · redefinidas depois 0 · diferentes 0 |  |
| `20261103000001_garantia_da_categoria_na_conta` | main | aplicada | 0/0 | iguais 4 · redefinidas depois 0 · diferentes 1 | `superadmin_gravar_materia_prima` em produção tem o corpo com 11 caracteres a mais e acento fora do ASCII: é a colagem pelo SQL Editor no Windows reescrevendo o não-ASCII dos comentários (a mesma de 02/11, em `tabela-de-preco-por-categoria.md`); as outras 4 funções batem |
| `20261103000002_instrucao_da_categoria` | main | aplicada | 2/2 | iguais 2 · redefinidas depois 0 · diferentes 0 |  |
| `20261103000003_responde_a_na_mensagem` | main | aplicada | 8/8 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261105000001_varias_montagens_por_remetente` | main | aplicada | 3/4 | iguais 0 · redefinidas depois 0 · diferentes 0 | o índice `…_um_em_montagem` é o que ela TIRA (o leitor o pegou no texto do DROP) |
| `20261106000001_tempo_de_fabricacao_no_arquivo_do_motor` | main | aplicada | 2/2 | iguais 2 · redefinidas depois 0 · diferentes 0 |  |
| `20261106000002_numero_cliente_e_percentuais_do_levantamento` | main | aplicada | 19/19 | iguais 2 · redefinidas depois 0 · diferentes 0 |  |
| `20261109000001_orcamento_ia` | main | aplicada | 7/7 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261109000002_orcamento_ia_precificacao` | main | aplicada | 2/2 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261109000003_orcamento_ia_material` | main | aplicada | 4/4 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261109000004_orcamento_ia_fiscal` | main | aplicada | 4/4 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261109000005_orcamento_ia_arquivo` | main | aplicada | 4/4 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261110000001_orcamento_ia_operacao_interna` | main | aplicada | 4/4 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261111000001_desenhos_das_tipologias` | claude/desenhos-das-tipologias | aplicada | 3/3 | iguais 1 · redefinidas depois 0 · diferentes 0 | COLISÃO de prefixo com a de arquivar; aplicada |
| `20261111000001_orcamento_ia_arquivar` | claude/orcamento-ia-arquivar | aplicada | 2/2 | iguais 0 · redefinidas depois 0 · diferentes 0 | COLISÃO de prefixo com a de desenhos; aplicada |
| `20261112000001_fotografia_da_resolucao` | HEAD | **não aplicada** | 0/3 | iguais 0 · redefinidas depois 0 · diferentes 0 | NÃO APLICADA: nenhuma das duas colunas nem a CHECK |
| `20261112000002_desconto_da_tabela_e_trava_da_ancora` | HEAD | aplicada | 3/3 | iguais 0 · redefinidas depois 0 · diferentes 0 |  |
| `20261112000003_importacao_que_nao_encolhe` | HEAD | aplicada | 0/0 | iguais 1 · redefinidas depois 0 · diferentes 0 |  |
| `20261112000004_devolve_execute_da_importacao_ao_service_role` | HEAD | efeito presente, arquivo não aplicado | 0/0 | iguais 0 · redefinidas depois 0 · diferentes 0 | o efeito está lá (o GRANT à mão); o arquivo, não aplicado |
| `20261112000005_corta_o_caminho_por_fora_da_importacao` | HEAD | pendente | 0/0 | iguais 0 · redefinidas depois 0 · diferentes 0 | pendente: só depois do deploy da rota nova |
**Em resumo:** **45 migrações aplicadas sem linha no histórico** (41 da main, de `20261026000001` a `20261110000001`; as duas
`20261111000001`; a `20261112000002` e a `20261112000003`). Não aplicadas: a `20261112000001`; a `20261112000004` (o efeito está lá, pelo GRANT
à mão); a `20261112000005` (pendente). Os dois `rollback_*.sql` não são migração.

**O que a medição NÃO diz:** que o texto aplicado é byte a byte o arquivo — só que o que ele cria existe e que o corpo das funções bate. Os
arquivos sem objeto próprio (`20261026000001`, `20261027000004`, `20261027000009`) foram conferidos pelo efeito, na nota. E a `20261103000001`
deixou em `prosrc` um corpo com os acentos reescritos pela colagem (o mesmo efeito registrado em `tabela-de-preco-por-categoria.md`, 02/11/2026).

## 3. Como o projeto deve registrar uma migração aplicada pelo SQL Editor

O SQL Editor **não grava linha nenhuma** em `schema_migrations` (é por isso que o histórico parou em 25/10: dali em diante tudo foi pelo
Editor). O conector grava, com a `version` = o instante da aplicação. A proposta, para todo caminho:

1. **`version` = o prefixo de 14 dígitos do arquivo**, não o instante. É o que o CLI espera, e é o que liga a linha ao arquivo sem
   adivinhar. O instante da aplicação fica no `postgres_logs` (24 h) e no relato do PR.
2. **`name` = o nome completo do arquivo, sem a extensão** (a convenção que já existe, `migracao.md`, Parte II).
3. **Logo depois de aplicar e verificar**, na MESMA aba do Editor, quem aplicou roda:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name, created_by)
   values ('<prefixo>', '<nome do arquivo sem .sql>', 'sql-editor')
   on conflict (version) do nothing;
   ```
   e confere com `select version, name from supabase_migrations.schema_migrations where version = '<prefixo>'`. Proposta: o cabeçalho de toda
   migração nova traz essa linha pronta, com o prefixo e o nome dela, na seção "VERIFICAÇÃO DEPOIS DE APLICAR". Não vai dentro da transação da
   migração: aplicada pelo conector, ela registraria duas vezes (a do conector, com o instante, e esta).
4. **`statements` fica nulo**: o texto que rodou não está guardado em lugar nenhum, e não se inventa.

## 4. A colisão de versão `20261111000001`

Dois arquivos diferentes, os dois aplicados, com o mesmo prefixo:

- `20261111000001_desenhos_das_tipologias.sql` — branch `claude/desenhos-das-tipologias`, PR #264 (rascunho);
- `20261111000001_orcamento_ia_arquivar.sql` — branch `claude/orcamento-ia-arquivar`, **sem PR**.

`version` é a chave primária: as duas não cabem com o mesmo número, e no dia em que as duas entrarem na main, a pasta passa a ter quatro pares de
prefixo repetido (hoje são três, todos de março e abril). **Proposta:** renomear o arquivo da arquivar para
`20261111000002_orcamento_ia_arquivar.sql`, na branch dela, **sem mudar nenhum byte do conteúdo** — o md5 que autorizou a aplicação continua
valendo, porque o hash é do conteúdo e não do nome (`migracao.md`, Parte III). A escolha de qual renomear é sua: a arquivar foi a escolhida aqui
por não ter PR (nada a reescrever no corpo de um PR) — e o reparo abaixo pressupõe essa escolha.
**Proposta de portão** (não implementada): um teste que reprova prefixo repetido em `supabase/migrations/`, com os três pares antigos numa lista
de permitidos com a razão.

## 5. O SQL de reparo

`docs/propostas/2026-11-12-reparo-do-historico-de-migracoes.sql` — **não é migração, fica fora da pasta, e não foi rodado em produção.**
Registra as 45, com `version` = prefixo, `name` = nome do arquivo, `statements` nulo e `created_by = 'reparo-20261112'`; aborta se alguma versão já
existir com outro nome; confere depois. **Provado num Postgres 16 local** com a tabela na estrutura de produção e as duas linhas de hoje: aplica
(2 → 47 linhas), reaplica sem duplicar (47), e a guarda aborta com uma versão registrada com outro nome, sem gravar.

**O risco que ele NÃO resolve:** os 142 arquivos de antes que a Parte II de `migracao.md` mediu sem correspondência continuam sem ela, e
`supabase db push` continua não sendo um comando seguro aqui.
