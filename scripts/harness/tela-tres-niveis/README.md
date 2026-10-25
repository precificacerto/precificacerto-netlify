# Harness — a tela dos três níveis (as mutações)

**NÃO TOCA PRODUÇÃO nem banco nenhum.** Só jest. Prova que cada regra da tela "Matérias-primas e
seus fornecedores" (e do `GET /arvore` que a alimenta) tem um caso que **fica vermelho** quando a
regra é retirada: 58 mutações reais e um controle.

Uma bateria que prova 60 coisas e não pode ser repetida por outra pessoa prova 60 coisas uma vez
só. Ela vivia no scratchpad de uma sessão; está aqui para ser rodada de novo.

## Como rodar

```bash
python3 -B scripts/harness/tela-tres-niveis/mutacoes.py            # as 60 (~45 s cada)
python3 -B scripts/harness/tela-tres-niveis/mutacoes.py M45 M47    # só estas
```

Precisa de `node_modules` instalado (`npm ci`). O script se posiciona sozinho na raiz do
repositório.

**Saída:** uma linha por mutação, e os casos que caíram (até quatro):

| veredito | significa |
|---|---|
| `VERMELHO` | a linha `Tests:` do jest traz `N failed`, N > 0 — a mutação derrubou caso |
| `NAO DERRUBOU` | tudo verde. Numa mutação real, é um caso que não exercita a regra |
| `NAO CARREGOU` | exit ≠ 0 **sem** caso falho: a suíte não carregou. **Não conta como vermelho** |
| `TRECHO APARECE N VEZES` | o código mudou e a mutação não se aplica mais — ajuste-a |

Sai com **1** se alguma mutação real não sair `VERMELHO` ou se o controle `M34` não sair verde;
com **2** se um arquivo-alvo não voltar byte a byte ao que era.

## Por que `NAO CARREGOU` não é vermelho

Uma mutação que quebra a sintaxe faz o jest sair com erro, e `Tests:` não registra falha nenhuma —
a suíte que não carrega tem zero casos. Contá-la como vermelha seria dizer que um caso derrubou a
regra quando nenhum caso rodou. É a aparição 6 de `docs/regras/portao-que-nao-alcanca.md`: o
indicador (`exit ≠ 0`) não distingue os dois estados. A primeira versão desta bateria, no
scratchpad, tinha esse furo; foi corrigido ao versionar. Nenhuma das 49 dependia dele: as 49
derrubaram caso.

## O que o script faz com os arquivos — e o cuidado que isso pede

Diferente dos harness de SQL desta pasta, que mutam uma **cópia** da migração, aqui o jest lê o
arquivo do lugar: a mutação é escrita **no arquivo do repositório**, com cópia `.bak`, e
restaurada em `finally`. Por isso:

- o script **recusa** rodar se algum arquivo-alvo tiver mudança não commitada — a mutação seria
  sobre outra coisa, e a restauração apagaria o trabalho (conferido: sai com 1, `RECUSADO`);
- no fim confere, por sha256, que cada arquivo-alvo voltou ao que era;
- **não commite enquanto ele roda**: a árvore está mutada de propósito, e um `.bak` aparece no
  `git status`.

Arquivos-alvo: `arvore.ts`, `materias-primas.component.tsx` e `base-de-conhecimento.component.tsx`
(em `src/page-parts/atendimentos-ia/base-de-conhecimento/`), e
`src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`. Portões que rodam a cada mutação, em
`src/utils/__tests__/`: `base-de-conhecimento-tres-niveis-a-tela.test.tsx`,
`base-de-conhecimento-a-tela.test.tsx` e `base-de-conhecimento-tres-niveis-rotas.test.ts`.

## As 60 mutações — o que cada uma derruba

Medido em 23/10/2026 sobre o `e868c2b`: 219 casos nos três portões, **49 de 49 vermelhas**. Medido de novo em
24/10/2026, com o tipo `opcao` (M51 a M59): **228 casos, 58 de 58 vermelhas, e o controle verde.**
"Casos" é quantos ficaram vermelhos; a última coluna é um deles.

E a M60, em 24/10/2026, sobre o catálogo com PERSIANAS (a 20261024000004): **233 casos, a M60
vermelha em exatamente os 2 casos novos, e o controle verde** — rodadas só a M60 e o M0. Que ela
NÃO derrube nenhum caso antigo é o achado: os casos de antes comparavam contra
`fraseDasCategorias(N, 6)` sobre um catálogo de 6, e passariam igual numa tela com o 6 escrito à
mão (`teste-que-nao-exercita.md`, variante 2).

| # | mutação | casos | um dos que caem |
|---|---|---:|---|
| M1 | materias_primas PARCIAL (só as que têm categoria mudada) | 3 | a nova SÓ com o nome vai como { nome } — sem categoria nenhuma, e depois da gravada,… |
| M2 | sem matéria-prima, manda materias_primas: [] em vez de omitir | 1 | remover a única gravada: { remover: [id] } — e a chave materias_primas não existe |
| M3 | remoção não vai em remover | 2 | o contraste: removida a gravada e acrescentada outra, materias_primas volta, com a list… |
| M4 | não barra remover e gravar a mesma | 1 | removida a PVC, uma nova chamada "pvc": a tela diz por quê, e o PUT /arvore não sai |
| M5 | a barreira compara sem ignorar caixa | 1 | removida a PVC, uma nova chamada "pvc": a tela diz por quê, e o PUT /arvore não sai |
| M6 | `ordem` no corpo da matéria-prima | 5 | a nova SÓ com o nome vai como { nome } — sem categoria nenhuma, e depois da gravada,… |
| M7 | `ordem` no item da lista | 7 | o vidro e a ferragem NOVOS sem as colunas preenchidas: a chave não vai |
| M8 | null colapsa em false | 4 | par em inox: limpar o gravado manda null — não ausente, não vazio |
| M9 | chave não tocada vai no corpo (ausente vira valor) | 25 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M10 | lista vazia [] do banco vira null | 19 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M11 | booleano novo nasce false (valor inventado) | 5 | "+ Adicionar matéria-prima" abre um bloco com as 6 categorias na ordem, "0 de 6", e o… |
| M12 | booleano de DOIS estados (sem "não informado") | 4 | NENHUM valor inventado: textos vazios, números vazios, booleanos em "não informado",… |
| M13 | NULL exibido como "não" | 4 | NENHUM valor inventado: textos vazios, números vazios, booleanos em "não informado",… |
| M14 | sem o name único do grupo de rádio | 1 | de "não informado" para "não" e DE VOLTA: a ida conta, a volta desconta — e nada é enviado |
| M15 | categorias na ordem da RESPOSTA, não do catálogo | 3 | as SEIS categorias na ordem do catálogo, com "número · rótulo" vindos dele — e o catálogo… |
| M16 | campos fora da ordem do catálogo | 1 | os campos de cada categoria são os de catalogo.campos, na ordem dele, com o rótulo de… |
| M17 | título da categoria sem o número do catálogo | 1 | as SEIS categorias na ordem do catálogo, com "número · rótulo" vindos dele — e o catálogo… |
| M18 | campo com tipo fora do switch some (lista à mão por tipo) | 1 | um campo NOVO no catálogo aparece na tela, com o controle do tipo dele — a lista não… |
| M19 | ferragem: uma linha por TIPOLOGIA (interna e externa juntas) | 24 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M20 | referência da ferragem gravada editável | 2 | a referência de uma ferragem GRAVADA não se edita — é a chave dela |
| M21 | erro da função trocado por frase genérica (na categoria) | 1 | 400 com o caminho: a mensagem COMO VEIO, dentro do cartão da categoria PERFIL do PVC — e a… |
| M22 | erro sem caminho trocado por frase genérica (no topo) | 1 | mensagem sem caminho (ex.: 403): no topo do cartão, inteira |
| M23 | erro não localizado: tudo no topo | 1 | 400 com o caminho: a mensagem COMO VEIO, dentro do cartão da categoria PERFIL do PVC — e a… |
| M24 | depois do salvar NÃO redesenha pelo depois (fica o local) | 2 | ROUND-TRIP: depois do salvar, as duas colunas mostram o que o banco gravou |
| M25 | depois do salvar relê pelo GET em vez do depois | 2 | ROUND-TRIP: depois do salvar, as duas colunas mostram o que o banco gravou |
| M26 | o redesenho perde o nome do fornecedor | 1 | o nome do fornecedor continua no chip depois do redesenho (o `depois` não traz nome) |
| M27 | tornar principal não põe primeiro | 1 | acrescentar e tornar principal: a lista inteira, na ordem, com UM principal — o primeiro… |
| M28 | "+ fornecedor" oferece também os já escolhidos | 1 | "+ fornecedor" oferece os do nicho que ainda não estão na categoria |
| M29 | usa SIM sem referência passa | 1 | usa SIM sem referência NÃO é enviado, e a tela diz o que falta (é a CHECK do banco) |
| M30 | nome da matéria-prima GRAVADA editável | 3 | o cabeçalho: o nome, "N de 6 categorias" e Remover |
| M31 | Desfazer devolve no fim da lista | 1 | "Desfazer" devolve a matéria-prima NA POSIÇÃO GRAVADA — no fim, a lista iria reordenada… |
| M32 | a árvore fora do botão único (não entra nas chamadas) | 24 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M33 | a contagem não soma a árvore | 25 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M35 | sem o AVISO da linha fora da tabela | 1 | ESTADO 3 — linha fora das duas fontes ("Suprema", digitada): o aviso de fora da tab… |
| M36 | sem a coluna Par em inox | 5 | ROUND-TRIP: depois do salvar, as duas colunas mostram o que o banco gravou |
| M37 | sem a coluna Referência do vidro | 3 | ROUND-TRIP: depois do salvar, as duas colunas mostram o que o banco gravou |
| M38 | par em inox fora do corpo (a coluna aparece, o campo não vai) | 4 | ROUND-TRIP: depois do salvar, as duas colunas mostram o que o banco gravou |
| M39 | sem tabela em uso: lista vazia em silêncio | 2 | SEM TABELA EM USO: a tela diz isso — não oferece lista vazia em silêncio, e o campo… |
| M40 | sem principal: nada dito | 1 | SEM FORNECEDOR PRINCIPAL: a tela diz que falta o principal |
| M41 | as linhas do ÚLTIMO fornecedor, não do principal | 7 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M42 | servidor: só a fórmula de família, sem a regra | 1 | as LINHAS de cada fornecedor com tabela em uso NESTA conta, POR FONTE — fórmula e regra se… |
| M43 | servidor: lê tudo e tira os distintos no JS (o corte do PostgREST esconde linha) | 1 | as LINHAS de cada fornecedor com tabela em uso NESTA conta, POR FONTE — fórmula e regra se… |
| M44 | servidor: tabelas em uso de QUALQUER conta | 3 | as LINHAS de cada fornecedor com tabela em uso NESTA conta, POR FONTE — fórmula e regra se… |
| M45 | estado 1 com aviso: linha COM fórmula tratada como só-regra | 1 | ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos |
| M46 | sem o AVISO PRÓPRIO da linha só com regra (DESIGN) | 1 | ESTADO 2 — linha que o motor conhece SEM fórmula de família (DESIGN): o aviso PRÓPR… |
| M47 | estados 2 e 3 juntos: só-regra recebe o aviso de fora da tabela | 1 | ESTADO 2 — linha que o motor conhece SEM fórmula de família (DESIGN): o aviso PRÓPR… |
| M48 | servidor: as duas fontes misturadas (regra vira fórmula) | 2 | as LINHAS de cada fornecedor com tabela em uso NESTA conta, POR FONTE — fórmula e regra se… |
| M49 | a lista só com a fórmula (DESIGN some do combobox) | 2 | ESTADO 2 — linha que o motor conhece SEM fórmula de família (DESIGN): o aviso PRÓPR… |
| M50 | aviso 2 com o texto do aviso 3 | 1 | ESTADO 2 — linha que o motor conhece SEM fórmula de família (DESIGN): o aviso PRÓPR… |
| M51 | normalizar devolve UNDEFINED no tipo desconhecido (o que estourava a tela) | 3 | TIPO DESCONHECIDO no catálogo: a tela não quebra, o campo não aparece, e o cabeçalho conta… |
| M52 | normalizar sem o ramo 'opcao' (cai no desconhecido) | 2 | escolher BARRA_INTEIRA manda SÓ { criterio_custo_barra: "BARRA_INTEIRA" } — o resto do PER… |
| M53 | o em branco vira '' em vez de null | 3 | O CASO MEDIDO: com o campo no catálogo, "+ Adicionar matéria-prima" não estoura — o cabeça… |
| M54 | o salvar não pula o tipo desconhecido (null apagaria o gravado) | 1 | TIPO DESCONHECIDO: salvar outra mudança do PERFIL NÃO MEXE no valor gravado dele — a chave… |
| M55 | a grade mostra o campo de tipo desconhecido | 1 | TIPO DESCONHECIDO no catálogo: a tela não quebra, o campo não aparece, e o cabeçalho conta… |
| M56 | a seleção sem a opção em branco | 3 | NULL gravado aparece como "em branco"; o valor gravado aparece escolhido |
| M57 | as opções fora da ordem do catálogo | 1 | o campo é SELEÇÃO: as opções do catálogo, na ordem dele, mais a de deixar em branco — e na… |
| M58 | NULL aparece com a PRIMEIRA opção escolhida (valor por omissão) | 2 | NULL gravado aparece como "em branco"; o valor gravado aparece escolhido |
| M59 | 'opcao' fora dos tipos conhecidos (some da tela e do salvar) | 4 | NULL gravado aparece como "em branco"; o valor gravado aparece escolhido |
| M60 | o total de "N de M categorias" escrito à mão (6), e não a contagem do catálogo | 2 | a gravada diz "5 de 7": PERSIANAS conta no total e, sem nada, não conta como configurada |
| **M34** | **controle: nada muda** | **0** | **verde — o detector não é vermelho por construção** |

### O grupo da linha do perfil

`PERFIL.linha` tem três estados, e cada um tem a sua mutação:

| estado | aviso | mutação que o derruba |
|---|---|---|
| 1 · com fórmula de família (EUROPA 42) | nenhum | M45 põe aviso onde não há |
| 2 · só com regra, sem fórmula (DESIGN) | o próprio: a tabela não dimensiona essa linha | M46 tira o aviso; M47 o funde no 3; M50 troca o texto pelo do 3 |
| 3 · fora das duas fontes ("Suprema") | o de fora da tabela | M35 tira o aviso |

M42, M43, M44 e M48 são do servidor (`linhasDaFonte` / `linhasPorFornecedor`): só a fórmula; ler
tudo e tirar os distintos no JS (o mock corta em 3 linhas, como o `max_rows` do PostgREST);
tabelas em uso de qualquer conta; e as duas fontes trocadas.

## Ao mudar a tela

Quando um trecho mudar e a mutação sair `TRECHO APARECE 0 VEZES`, **ajuste a mutação ao código
novo — não a apague.** Uma regra que perdeu a mutação é uma regra que ninguém mais prova. E uma
regra nova entra com o caso **e** com a mutação que o derruba.

## Relação com as outras regras

`teste-que-nao-exercita.md` é o critério: cada asserção precisa FALHAR sem a sua correção.
`portao-que-nao-alcanca.md` é a razão do veredito `NAO CARREGOU`.
`trabalho-que-vive-no-container.md` é a razão de esta pasta existir.
