# Índice das classes

Uma linha por classe: o nome e quando ela se aplica. Quando a linha casar com o que você está
fazendo, **leia o texto antes de agir**.

## Texto em `docs/regras/<nome>.md`, lido quando a classe se aplica

- `teste-que-nao-exercita`: ao escrever ou revisar um teste. Cada asserção precisa falhar sem a correção.
- `assercao-negativa-que-nunca-falha`: ao escrever `not.toContain` ou `not.toMatch`. O literal vem da função, e a busca é no valor, nunca numa serialização.
- `portao-que-nao-alcanca`: ao chamar um check de portão ou ler um número de relatório. Pergunte o que o faz ficar vermelho, e se ele roda e bloqueia.
- `instrumento-que-nao-enxerga`: ao contar com grep, regex ou filtro escrito à mão. Rode a fixture do caso que deve aparecer e a do caso certo que não deve.
- `instrumento-que-se-enxerga`: ao esperar um processo ou buscar num conjunto que contém o próprio instrumento. Rode a fixture com o alvo ausente, e dê prazo a todo laço.
- `hipotese-derrubada-pela-propria-medicao`: quando a razão para não testar um caso é uma suposição sua. Teste o caso.
- `baseline-measurement`: ao comparar um branch com a main. Use `origin/main` explícito, `tsbuildinfo` limpo e diff por arquivo + código.
- `estado-relatado-vs-real`: ao usar estado de sistema externo (schema, PR, branch, deploy) como premissa. Consulte a fonte primária.
- `trabalho-que-vive-no-container`: ao adiar ou declinar um push. Trabalho não empurrado não está entregue; diga a consequência.
- `faltou-dado-recusa-nomeada`: quando falta dado num cálculo que vira preço, quantidade ou imposto. Recuse com nome e número; nunca aproxime.
- `ausente-vs-falso`: ao exibir ou gravar campo sem dado. Omita ou deixe nulo, nunca o default.
- `fato-vs-referencia`: ao gravar ou reler um valor que compõe preço. Fato histórico congela; referência viva relê.
- `copia-divergente`: ao acrescentar campo a um mapeamento. Procure a segunda cópia.
- `construtor-empobrecido`: num campo opcional com default neutro em contrato de cálculo. Torne-o obrigatório.
- `decisao-sob-regra-da-epoca`: ao nomear um defeito em código antigo. Pergunte se a regra existia quando ele foi escrito.
- `registro-de-classe`: ao registrar uma classe de defeito ou uma regra. Define onde ela mora, a forma, a busca por precedentes e o limite.

## Texto em `.claude/rules/<nome>.md`, carregado ao editar o código do domínio

- `cascata-lucro-real`: formação de preço, orçamento e decomposição no Lucro Real (R1 a R21) e a matriz regime × segmento.
- `regime-e-segmento-determinam-a-construcao`: ao decidir se um tributo existe, de que lado incide ou que percentual exibir. Leia a matriz; não deduza.
- `decomposicao-na-tela`: ao mexer na tabela da decomposição. Coluna congelada, "% médio", nada truncado, residual e as duas bases.
- `limite-do-desconto`: o limite de desconto, a autorização e a repartição acima do limite (ESPEC Parte VII).
- `razao-longe-da-restricao`: ao alargar uma restrição sem razão citada. Pergunte antes; cite a fonte no ponto de declaração.
- `tabela-de-preco-por-categoria`: ao subir, arquivar ou trocar uma tabela de fornecedor, ou ao decidir de onde vem o preço de uma ramificação. Uma tabela = uma categoria; decide o fornecedor principal; o motor se copia antes de mexer na tabela da Wolff.
- `a-coluna-que-parece-enumeracao`: antes de filtrar por igualdade numa coluna com nome de atributo. Liste os valores distintos.
- `tabela-que-a-importacao-apaga`: num processo que apaga e regrava uma tabela, ou numa coluna nova numa tabela assim.
- `migracao`: em todo PR com migração. Aplicar e verificar antes do merge, nomear no PR, e os dois hashes quando o payload é transformado.
