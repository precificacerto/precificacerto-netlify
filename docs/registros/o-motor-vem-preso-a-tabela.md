# O Motor Vem Preso à Tabela

> **Regra do Atendimentos I.A., registrada em 18/10/2026** na especificação do bloco 2A
> (`docs/prd/EPIC-ATENDIMENTOS-IA.md`, regra 3.1). Ela vive aqui também porque é uma restrição
> que parece arbitrária para quem chega depois — e restrição que parece arbitrária convida a ser
> alargada (`razao-longe-da-restricao.md`).

## A declaração do dono do produto

Registrada como está:

> "eu vou buscar o fornecedor e selecionar a tabela daquele fornecedor. Só isso. E aí clicar em
> adicionar, confirmar. E automaticamente o motor já está atrelado, integrado àquela tabela."
>
> — PO, 18/10/2026

## A regra que decorre dela

**O motor NUNCA é escolhido em separado. Ele é um atributo da tabela e entra junto com ela.**

O caminho declarado tem três passos — buscar o fornecedor, selecionar a tabela dele, adicionar e
confirmar — e nenhum deles é escolher motor. Não há seletor de motor em tela nenhuma, nem campo
de motor fora da tabela.

## O que fazer diante dela

Pela regra 2 de `razao-longe-da-restricao.md`: **restrição sem razão citada no ponto de
declaração não autoriza remoção — autoriza pergunta.** Quem quiser um seletor de motor, ou um
motor que exista fora de uma tabela, pergunta antes ao dono do produto. Quando o código desta
regra existir, o ponto de declaração cita esta página.

## Correção de registro

A primeira versão desta página, de 18/10/2026, trazia no lugar da declaração uma **leitura do
assistente** sobre a razão da regra, marcada como não confirmada. Ela foi substituída pela
declaração literal do dono do produto, a pedido dele.

## Estado no código

Nenhum. Em 18/10/2026 não existe entidade de motor, de tabela nem de fornecedor no repositório.
A regra é escrita antes do código para que o primeiro desenho já a respeite.
