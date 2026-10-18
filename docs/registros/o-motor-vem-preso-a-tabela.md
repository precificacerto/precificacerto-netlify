# O Motor Vem Preso à Tabela

> **Regra do Atendimentos I.A., registrada em 18/10/2026** na especificação do bloco 2A
> (`docs/prd/EPIC-ATENDIMENTOS-IA.md`, regra 3.1). Ela vive aqui também porque é uma restrição
> que parece arbitrária para quem chega depois — e restrição que parece arbitrária convida a ser
> alargada (`razao-longe-da-restricao.md`).

## A regra

Formulação do dono do produto, registrada como está:

> O motor vem preso à tabela e **nunca é escolhido à parte**.

Na cadeia `modelo → nicho → fornecedor → tabela → motor`, o motor é a única entidade que não tem
escolha própria. Não há seletor de motor em tela nenhuma, nem campo de motor fora da tabela.

## A razão

**A razão não foi declarada pelo dono do produto até esta data.** O que segue é leitura do
assistente, marcada como tal, e não deve ser citada como a razão da regra até ele confirmar:

> A tabela é feita PARA um motor. Escolher os dois separadamente abre a combinação que ninguém
> montou — uma tabela lida por um motor que espera outra forma. É a mesma família de
> `regime-e-segmento-determinam-a-construcao.md`: quem lê o dado não infere o formato, lê o que
> veio junto com ele.

## O que fazer diante dela

Pela regra 2 de `razao-longe-da-restricao.md`: **restrição sem razão citada não autoriza
remoção — autoriza pergunta.** Quem quiser um seletor de motor pergunta antes ao dono do produto.

## Estado no código

Nenhum. Em 18/10/2026 não existe entidade de motor, de tabela nem de fornecedor no repositório.
A regra é escrita antes do código para que o primeiro desenho já a respeite.
