# O Envelope do Mockup

> **Registro de 19/10/2026, bloco 2A do Atendimentos I.A.** Uma ocorrência, com a nota da busca
> por precedentes (`registro-de-classe.md`). Não depende do Atendimentos I.A.: vale para todo
> arquivo que é conferido por hash e chega por um caminho que não é o do próprio arquivo.

## O critério

Formulação do dono do produto, registrada como está:

> O conteúdo certo dentro do invólucro errado tem a forma de um arquivo diferente, e só o hash
> denuncia.

## O que aconteceu

O dono do produto substituiu `docs/prd/atendimentos-ia-mockup.html` na `main` pela web (commit
`5b16d6a`) e publicou o hash esperado. O arquivo que chegou **não batia**:

| | esperado | na `main` |
|---|---|---|
| md5 | `c456f37d4d9bd969077d8141ebca071a` | `0fa41caec44cf99a546b4bc96849b3eb` |
| bytes | 51.222 | 51.768 |
| linhas | 752 | 754 |

A diferença era um **envelope**: uma primeira linha de **531 bytes** —
`<!doctype html><html><head><meta charset=utf8><meta name=viewport …><style>…</style></head><body>`
— e um `</body></html>` no fim, depois do `</script>`, com a quebra de linha final removida.

**A causa, nas palavras do dono do produto: o arquivo foi salvo da PÁGINA renderizada, e não do
arquivo.** A página que o exibe embrulha o HTML num esqueleto de documento; salvar a página salva o
esqueleto junto.

**O conteúdo estava intacto dentro dele.** Medido: tirando a linha 1 e o `\n</body></html>` final,
e devolvendo a quebra de linha final, o resultado é `c456f37d…`, 51.222 bytes, 752 linhas —
idêntico byte a byte ao esperado. A conta dos bytes fecha:

```
51.768 − 51.222 = 546
531 (a linha 1, com a quebra) + 16 ("\n\n</body></html>") − 1 (a quebra final que sumiu) = 546
```

## O que foi feito

**A branch manteve o arquivo cru.** O assistente parou no portão do md5 e relatou, sem tirar o
envelope por conta própria — tirar seria uma transformação sobre conteúdo autorizado por hash, que
é a classe de `transformacao-quebra-a-cadeia-de-hash.md`. O dono do produto decidiu:

1. resolver o conflito do merge com a versão da branch (`git checkout --ours`), que estava em
   `8ebb77c8…`, sem envelope;
2. aplicar sobre ela, por substituição literal, as quatro mudanças de conteúdo da versão nova;
3. exigir o mesmo portão: `c456f37d…`, 51.222 bytes, 752 linhas.

O portão passou, e o arquivo da branch ficou idêntico ao conteúdo de dentro do envelope.

**A `main` continua com o envelope** (`0fa41cae…`) até o merge desta branch. Quem conferir o
mockup na `main` antes disso vai achar um hash que não é o publicado — e a razão está aqui.

## Por que a distinção é difícil de ver

Porque **as duas versões são o mesmo documento para o olho e para o navegador.** O envelope é
HTML válido, o navegador o absorve, e a página renderizada é a mesma. Um diff que olhasse só o
miolo não acusaria nada. Nenhuma ferramenta de leitura humana distingue "o arquivo" de "o arquivo
dentro de uma página".

E o caminho que produz o envelope é o caminho natural: abre-se o mockup para ver, e salva-se o que
se está vendo.

## A aparição

| # | Quando | O invólucro | Quem pegou |
|---|---|---|---|
| 1 | 19/10/2026, `5b16d6a` na `main` | `<!doctype html>…<body>` de 531 bytes + `</body></html>`, de salvar a página renderizada | o portão de md5 que o próprio dono do produto pôs na instrução |

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`. **Uma aparição, e nenhuma segunda foi forçada.**

A vizinha mais próxima é `transformacao-quebra-a-cadeia-de-hash.md`, e **não é a mesma**: lá a
transformação é PRESCRITA (remover `BEGIN`/`COMMIT`, enxugar comentário) e o problema é ninguém
dizer o que ela faz com o hash; aqui a transformação **não foi prescrita por ninguém** — veio do
caminho de transporte, sem que nenhuma das partes soubesse. Lá a cura é publicar os dois hashes
com a transformação nomeada; aqui é **não deixar a transformação acontecer**, porque não havia o
que nomear.

A aparição 1 daquela página — o `raw.githubusercontent.com` normalizando indentação — é a mais
parecida em mecanismo (o caminho altera os bytes sem ninguém pedir) e fica registrada aqui como
parente, não como segunda aparição desta.

## O corolário aplicável ANTES do defeito existir

**Arquivo conferido por hash viaja como ARQUIVO, nunca como o que uma tela mostra dele.**

Sinais de que o invólucro vai entrar, em ordem de força:

1. O arquivo é HTML, ou outro formato que uma tela renderiza em vez de mostrar.
2. O caminho de envio passa por "abrir para ver" — preview, artefato publicado, visualizador web.
3. O envio é por **salvar como** ou **copiar da página**, não pelo download do arquivo original.
4. Ninguém publicou o hash antes de enviar.

Quando o 1 e o 3 coincidem, o hash publicado é a única coisa que denuncia — e foi o que denunciou.

## As ressalvas — o que este registro NÃO diz

- **Não diz que o mockup estava errado.** O conteúdo estava certo; o que estava errado era a
  forma do arquivo.
- **Não identifica a ferramenta** que produziu o envelope. A causa registrada é a do dono do
  produto — salvar da página renderizada —, e o envelope tem a forma de um esqueleto de página
  mínimo. Qual visualizador o gerou não foi medido.
- **Não propõe portão automático.** Um check de "HTML de documento não começa com
  `<!doctype` duplicado" seria específico demais para uma ocorrência.

## Relação com as outras regras

`transformacao-quebra-a-cadeia-de-hash.md` é a vizinha — ver a nota da busca acima.
`estado-relatado-vs-real.md` é a forma geral: o relato ("subi o mockup") era verdadeiro, e o hash
foi a fonte primária que mostrou que o arquivo não era o relatado. `registro-de-classe.md` decidiu
a forma desta página e o limite que a manteve numa aparição.
