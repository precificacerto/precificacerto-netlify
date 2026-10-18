# O Teto Que Virou Projeção

> **Pendência nomeada em 18/10/2026, bloco 2A do Atendimentos I.A.** Registrada, **não
> corrigida**, por decisão do dono do produto. Não deve ser puxada no meio de outra correção.

## O que mudou de significado

`public.orcamentista_config` nasceu no bloco 1 (migração `20261018000001`, aplicada em
18/10/2026) com três colunas de cobrança e consumo:

| coluna | o que a migração diz | o que vale desde o bloco 2A |
|---|---|---|
| `teto_de_consumo_brl` | "teto de CONSUMO em R$ no mês. NULL = sem teto" | **PROJEÇÃO de gasto.** Nada bloqueia e nada avisa ao atingi-la |
| `valor_adicional_brl` | "R$ por mês cobrado pelo adicional" | **sem uso no produto** |
| `acao_ao_atingir_teto` | "BLOQUEAR \| AVISAR", NOT NULL, DEFAULT 'AVISAR' | **sem uso no produto** |

## A decisão

As três colunas **FICAM no banco**, com os nomes de hoje. **Nada é apagado e nada é renomeado.**
O comentário da migração e o `COMMENT ON COLUMN` de `acao_ao_atingir_teto` continuam dizendo o
significado antigo — e é por isso que este registro existe: quem ler a migração e não ler esta
página vai concluir que existe um teto que bloqueia.

## O que isso deixa armado

1. **O nome mente.** `teto_de_consumo_brl` é lido como teto por quem não conhece esta página. Uma
   tela futura que o rotule "Teto" afirma um comportamento que o produto não tem — é
   `ausente-vs-falso.md` no nome da coluna.
2. **A CHECK do teto continua.** `teto_de_consumo_brl > 0` ainda vale, e faz sentido para uma
   projeção. `acao_ao_atingir_teto` continua NOT NULL com DEFAULT 'AVISAR': toda linha tem uma
   ação que nada executa.
3. **O código ainda os conhece.** `src/utils/orcamentista-config.ts` valida e grava os quatro
   campos do contrato (`CorpoDaConfig`), e a rota PATCH os aceita. Desde o bloco 2A nenhuma tela
   os edita: o interruptor da lista preserva os valores gravados (`corpoParaAlternar`), e a ficha
   que os editava saiu da tela.

## O que NÃO foi feito, de propósito

- nenhuma migração, nenhum `DROP COLUMN`, nenhum `RENAME`;
- nenhum `COMMENT ON COLUMN` atualizado — isso também é mudança de banco;
- nenhuma mudança no contrato da rota.

A decisão de renomear ou apagar é do dono do produto, numa rodada própria — e, se vier, precisa
olhar o `fato-vs-referencia.md`: as linhas gravadas até lá carregam valores que alguém digitou
como teto.
