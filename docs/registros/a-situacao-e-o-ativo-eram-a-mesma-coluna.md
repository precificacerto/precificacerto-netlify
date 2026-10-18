# A Situação e o Ativo Eram a Mesma Coluna

> **Registro de 18/10/2026, bloco 2A do Atendimentos I.A.** Não é defeito nem classe: é a razão
> de uma fusão de colunas, escrita aqui para que ninguém a desfaça achando que eram duas
> informações.

## O que havia

A lista de contas do super admin (`src/pages/super-admin/tenants/index.tsx`) tinha, lado a lado:

| coluna | o que exibia | de onde lia |
|---|---|---|
| **Status** | a Tag de `planStatusLabels` — Trial, Ativo, Suspenso, Cancelado | `plan_status` |
| **Ativo** | um Switch, ligado quando ACTIVE ou TRIAL | `plan_status` |

**As duas liam o MESMO campo.** O Switch é uma projeção do `plan_status` em dois estados, e a Tag
é o mesmo `plan_status` em quatro. Não havia informação na segunda coluna que a primeira não
tivesse — havia o controle.

E as duas podiam parecer contraditórias sem estar: uma conta CANCELLED mostrava a Tag
"Cancelado" numa coluna e um Switch desligado na outra, e quem lesse só o Switch não saberia se
era suspensa ou cancelada.

## A decisão

Formulação do dono do produto, 18/10/2026: funde 'Status' e 'Ativo' numa célula só — o Switch
atual seguido da Tag de `planStatusLabels`. **O comportamento do Switch não muda**: ligado =
ACTIVE, desligado = SUSPENDED. CANCELLED aparece desligado com a Tag "Cancelado". **Não se cria
controle novo para cancelar.**

Com o controle e o estado na mesma célula, a Tag diz qual dos estados "desligados" é o caso, ao
lado do controle que o mudaria.

## O que NÃO mudou, e está afirmado

- ligado para ACTIVE **e TRIAL** — o Switch já tratava trial como ativo, e continua;
- ligar grava `ACTIVE`, desligar grava `SUSPENDED`, pela mesma rota de antes;
- nenhum botão de cancelar.

Portão: `src/utils/__tests__/a-situacao-e-uma-coluna-so.test.tsx`. O caso "o Switch não muda" é
o par dos outros: ele passa antes e depois da fusão **de propósito** — o que ele afirma é que a
fusão não alterou o comportamento, e o que o faz ficar vermelho é mudar o Switch.

## Ressalva

Ligar o Switch de uma conta em TRIAL não acontece pela tela (ela já aparece ligada); desligá-la
grava SUSPENDED e tira a conta do trial. Isso é o comportamento de antes, preservado — não foi
avaliado nesta rodada se é o desejado.
