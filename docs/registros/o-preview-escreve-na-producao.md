# O preview escreve na produção

Data: 20/10/2026 · Pendência de infraestrutura, aberta

> **REGISTRO DE UMA CONFIGURAÇÃO, não de um defeito.** Nada foi alterado na Vercel nem no
> Supabase para escrever isto. Se e como separar os ambientes é decisão pendente com o dono do
> produto; este arquivo não a toma.

## O fato medido

Medido em 20/10/2026 pela sessão de verificação, **lendo a API da Vercel sem decifrar valor
nenhum** — só o nome e o alvo de cada variável do projeto `precificacerto-netlify`:

| | |
|---|---|
| variáveis do projeto | **20** |
| alvo de cada uma | **`["preview","production"]`** — um único valor servindo os dois ambientes |
| entre elas | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| variáveis com alvo só de preview | **nenhuma** |

**Logo, não existe banco de homologação.** Todo deploy de preview lê e escreve no Supabase de
produção, o projeto `jvthwpkwzpangnwhuyvj` — inclusive com a chave `service_role`, que passa por
cima da RLS.

A medição é da sessão de verificação e não foi refeita por quem escreveu este registro. Por
`estado-relatado-vs-real.md`, ela vale como fonte primária na data dela; uma variável nova, ou o
alvo de uma existente mudado, a invalida — e não avisa.

## O que isso significa

- **Qualquer teste feito num link de preview toca dados reais de clientes.** Criar, editar e
  excluir pelo preview é criar, editar e excluir em produção. Não há área de rascunho.
- **O teste do 2B.2, em 19/10/2026, escreveu em produção por causa desta configuração, não por
  acidente.** É o que `o-caminho-de-exclusao-nao-foi-exercitado.md` registra: o que aquele teste
  criou foram linhas reais da produção, e o que sobrou dele ficou lá até alguém apagar.
- **Os portões automáticos não substituem esse cuidado.** Eles rodam com banco falso
  (`supabaseAdmin` imitado) ou num Postgres local de harness; nenhum deles toca o Supabase. O
  único lugar em que o sistema roda contra o banco real antes do merge é o preview — e ele é a
  produção.
- **O lado útil, que é o mesmo fato:** um teste no preview prova o sistema contra o banco de
  verdade, com o schema que de fato está aplicado. É por isso que o caminho de criação do 2B.2
  ficou provado. A faca tem os dois gumes.

## O que NÃO está decidido

Separar os ambientes exigiria, no mínimo, um projeto Supabase próprio, variáveis próprias com
alvo só de preview, e uma semeadura que dê ao banco de teste o schema e os dados de que os testes
precisam. **Custo e decisão estão pendentes com o dono do produto.** Este registro não propõe a
separação como decidida, nem a escolhe entre outras saídas.

Até uma decisão, a regra prática é a do próprio fato: **teste no preview só com o que se aceita
deixar na produção**, e meça o banco antes e depois.

## Relação com as outras regras

`estado-relatado-vs-real.md` é a razão de a medição ter sido feita na API em vez de suposta, e o
limite dela (vale na data). `migration-delivery.md` é a vizinha do outro lado: lá o repositório e
o banco não estão ligados; aqui o preview e a produção estão ligados demais.
`o-caminho-de-exclusao-nao-foi-exercitado.md` é a primeira consequência registrada desta
configuração.
