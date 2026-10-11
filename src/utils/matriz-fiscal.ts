/**
 * matriz-fiscal.ts — A MATRIZ REGIME × SEGMENTO × TRIBUTO. A FONTE.
 *
 * Transcrição da **PARTE XIV** da especificação consolidada do PO (11/10/2026), célula por
 * célula. As Partes II e III daquele documento explicam; esta é o dado.
 *
 * ══ A REGRA QUE GOVERNA O ARQUIVO INTEIRO ════════════════════════════════════════════════
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > **Só há colocação aqui. Nenhum percentual.** A alíquota é **manual**, sempre, em toda
 *   > célula. Se um número aparecer nesta parte, é defeito de redação.
 *
 * É a regra I.3: *"A matriz decide ONDE. Nunca QUANTO."* E a consequência é o que torna o
 * desenho durável: **a matriz não envelhece.** O IPI vai a zero em 2027? Preenche zero e o
 * preço não muda. Volta? Preenche e ele entra no lugar certo sozinho.
 *
 * Um caso do portão de concordância afirma que **nenhum literal decimal** existe no programa
 * deste arquivo. Se alguém escrever `0.18` aqui, ele fica vermelho.
 *
 * ══ POR QUE ESTE ARQUIVO NASCE COMO FONTE, E OS ANTIGOS VIRAM DERIVADOS ══════════════════
 *
 * `copia-divergente.md`: *"o remédio, quando ela existe, **não é conferir as duas**: é apagar
 * uma. Com um construtor só, acrescentar um campo vale para todas as rotas, e a omissão deixa
 * de ser possível."*
 *
 * Então **nenhum call site de produção muda nesta rodada**. O que muda é de ONDE
 * `TAX_MATRIX`, `placementOf` e `POR_FORA_POR_REGIME` leem. As assinaturas, os nomes e os
 * módulos ficam todos onde estão — a dependência é que se inverte. Trocar a fonte e os call
 * sites na mesma rodada deixaria sem rede justamente o passo que precisa dela
 * (`portao-que-nao-alcanca.md`).
 *
 * ══ `placementOf` LÊ A COLUNA DO LUCRO REAL, E ISSO É FIEL AO QUE ELA JÁ ERA ══════════════
 *
 * `placementOf(segmento, tributo)` não recebe regime. O cabeçalho da `TAX_MATRIX` sempre
 * disse o que ela é: *"A matriz da Parte 0, transcrita célula a célula (**Lucro Real**, três
 * segmentos)."* Então a derivação lê `MATRIZ_FISCAL.LUCRO_REAL`, e o resultado é bit-exact
 * com o dado literal que ela substitui — afirmado caso a caso no portão de concordância.
 *
 * O regime entra na assinatura quando os call sites passarem a informá-lo. Não nesta rodada.
 */

import type { CalcType, TaxName } from './pricing-engine'
import type { TaxRegime } from '@/supabase/types'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// OS EIXOS E A CÉLULA
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Os quatro estados de colocação da regra I.3.
 *
 * `ACRESCIMO` é o estado que **não existia** antes desta rodada: `Placement` em
 * `pricing-engine.ts` tinha três valores, e a especificação define quatro. ICMS-ST e DIFAL
 * são custo puro sobre a nota e **não formam preço** — quem os trata continua sendo
 * `computeAdvancedOutsideTaxes`, e nenhuma célula deles muda de lugar aqui.
 *
 * >>> `INEXISTENTE` NÃO É ZERO <<<
 * Zero é uma alíquota que resulta em valor nulo mas ocupa linha, entra em soma e aparece na
 * decomposição. Inexistente não tem linha, e o campo nem aparece na tela. Tratar os dois como
 * a mesma coisa é o que permite uma alíquota de ICMS vazar para um orçamento de serviço sem
 * que nada falhe (`ausente-vs-falso.md`).
 */
export type Colocacao = 'POR_DENTRO' | 'POR_FORA' | 'ACRESCIMO' | 'INEXISTENTE'

/** A base sobre a qual o tributo incide. Decide a ETAPA, não o valor. */
export type BaseDeCalculo = 'RECEITA' | 'RECEITA_RECEBIDA' | 'LUCRO' | 'PRESUNCAO' | 'VALOR_OPERACAO'

/**
 * A etapa da cascata em que o tributo é apurado (Parte VI.2).
 *
 * É este campo que distingue Lucro Real de Lucro Presumido **sem inventar um quinto estado de
 * colocação**: nos dois o IRPJ é `POR_DENTRO`; o que muda é a BASE (lucro × presunção) e, por
 * consequência, a etapa — `16` no Real, `13C` no Presumido.
 */
export type EtapaDaCascata = '13A' | '13B' | '13C' | '16' | 'POR_FORA'

/**
 * Os tributos da matriz. **Maior que `TaxName`**, de propósito.
 *
 * `TaxName` tem os SETE que o motor de preço conhece. A Parte XIV precisa de mais — DAS, RET,
 * IRPJ, CSLL, adicional, ICMS-ST e DIFAL têm célula lá. Fazer a matriz caber em `TaxName`
 * obrigaria a deixar metade da XIV de fora, e `placementOf` continua funcionando porque
 * `TaxName` é subconjunto deste tipo.
 */
export type TributoFiscal =
  | TaxName
  | 'DAS' | 'DAS_REDUZIDO' | 'DAS_FIXO' | 'RET'
  | 'IRPJ' | 'CSLL' | 'ADICIONAL_IRPJ'
  | 'ICMS_ST' | 'DIFAL'

/**
 * A célula. **Três atributos obrigatórios** (o contrato I.3) mais base e etapa.
 *
 * >>> `colocacao` ACEITA `'NAO_DECIDIDA'`, E ISSO NÃO É UMA QUINTA COLOCAÇÃO <<<
 *
 * É um estado da CÉLULA, não um lado da operação. A Parte XIV.9 deixa quatro perguntas
 * marcadas com `?` e manda, literalmente: *"Nada disto se escreve por dedução."* Escrever
 * `POR_FORA` ou `INEXISTENTE` numa delas seria escolher o lado — e é exatamente o que o
 * comando desta rodada proíbe para o IS em revenda.
 *
 * >>> E `vigenteHoje` É UM SEGUNDO FATO, DE OUTRA NATUREZA <<<
 *
 * `colocacao: 'NAO_DECIDIDA'` afirma **"não há regra decidida"**. `vigenteHoje` afirma **"é
 * isto que o código faz hoje"**. São duas afirmações distintas sobre coisas distintas — a
 * regra e o comportamento — e a razão de serem dois campos é `ausente-vs-falso.md`: um campo
 * só obrigaria a inventar uma regra para poder registrar o comportamento.
 *
 * É esse par que permite a esta rodada não derrubar nenhum caso existente: a derivação lê
 * `colocacaoVigente()`, que devolve o comportamento; quem quiser a REGRA lê `colocacao` e vê
 * que não há. No dia da decisão muda UM campo, e o `vigenteHoje` sai com ele.
 */
export interface Celula {
  readonly colocacao: Colocacao | 'NAO_DECIDIDA'
  /** `'NAO_DECIDIDO'` pela mesma razão de `colocacao` — ver a pendência 21. */
  readonly credito: boolean | 'NAO_DECIDIDO'
  /** `null` = desde sempre. Data ISO, nunca percentual. */
  readonly vigenciaInicio: string | null
  /** `null` = sem fim previsto. */
  readonly vigenciaFim: string | null
  readonly base?: BaseDeCalculo
  readonly etapa?: EtapaDaCascata
  /** Obrigatório quando `colocacao` ou `credito` é não decidido: QUAL pendência. */
  readonly pendencia?: string
  /** O que o CÓDIGO faz hoje. Só existe em célula não decidida. */
  readonly vigenteHoje?: Colocacao
}

export type MatrizFiscal = Readonly<
  Record<TaxRegime, Readonly<Record<CalcType, Readonly<Partial<Record<TributoFiscal, Celula>>>>>>
>

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A FORMA EM QUE A XIV É ESCRITA — e por que a transcrição usa ela
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * A Parte XIV é uma tabela por regime, com UMA LINHA POR TRIBUTO e três colunas de segmento,
 * mais as colunas de crédito, base e etapa que valem para a linha inteira.
 *
 * A transcrição abaixo tem essa mesma forma, e isso é escolha deliberada: 6 regimes × 3
 * segmentos × 16 tributos são 288 células, e escrevê-las literalmente produziria um arquivo
 * que ninguém confere contra a fonte. Na forma de linha, cada entrada se lê ao lado da linha
 * correspondente da XIV, e a expansão é mecânica.
 *
 * Os códigos são os da LEGENDA da própria XIV.0: `D` por dentro · `F` por fora ·
 * `A` acréscimo · `-` inexistente · `?` a confirmar com o contador, não deduzir.
 */
type Codigo = 'D' | 'F' | 'A' | '-' | '?'

const DE_CODIGO: Readonly<Record<Exclude<Codigo, '?'>, Colocacao>> = {
  D: 'POR_DENTRO',
  F: 'POR_FORA',
  A: 'ACRESCIMO',
  '-': 'INEXISTENTE',
}

interface Linha {
  /** `[industrialização, revenda, serviço]` — a ordem das colunas da XIV. */
  readonly col: readonly [Codigo, Codigo, Codigo]
  readonly credito: boolean | 'NAO_DECIDIDO'
  readonly ini?: string | null
  readonly fim?: string | null
  readonly base?: BaseDeCalculo
  readonly etapa?: EtapaDaCascata
  readonly pendencia?: string
  /** Obrigatório quando algum código é `?`. */
  readonly vigenteHoje?: Colocacao
}

const SEGMENTOS: readonly CalcType[] = ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO']

/**
 * XIV.7 — O EIXO DE VIGÊNCIA. **Nenhum percentual, por desenho.**
 *
 * A data muda **colocação**, nunca alíquota. O ponto de ter o eixo, nas palavras da ESPEC:
 * *"em 01/01/2027 nenhuma linha de código muda. O PIS/COFINS passa a `INEXISTENTE` por
 * vigência, o IPI fica em zero por alíquota manual, a CBS passa a ter número."*
 *
 * `undefined` numa linha significa "herda daqui".
 */
const VIGENCIA: Readonly<Partial<Record<TributoFiscal, { ini: string | null; fim: string | null }>>> = {
  ICMS: { ini: null, fim: '2032-12-31' },
  ISS: { ini: null, fim: '2032-12-31' },
  PIS_COFINS: { ini: null, fim: '2026-12-31' },
  IPI: { ini: null, fim: '2032-12-31' },
  CBS: { ini: '2026-01-01', fim: null },
  IBS: { ini: '2026-01-01', fim: null },
  IS: { ini: '2027-01-01', fim: null },
  ICMS_ST: { ini: null, fim: '2032-12-31' },
  DIFAL: { ini: null, fim: '2032-12-31' },
}

function expande(linhas: Readonly<Partial<Record<TributoFiscal, Linha>>>): Readonly<Record<CalcType, Readonly<Partial<Record<TributoFiscal, Celula>>>>> {
  const out = {} as Record<CalcType, Partial<Record<TributoFiscal, Celula>>>
  for (let i = 0; i < SEGMENTOS.length; i++) {
    const seg = SEGMENTOS[i]
    const porTributo: Partial<Record<TributoFiscal, Celula>> = {}
    for (const [tributo, l] of Object.entries(linhas) as [TributoFiscal, Linha][]) {
      const codigo = l.col[i]
      const vig = VIGENCIA[tributo]
      porTributo[tributo] = {
        colocacao: codigo === '?' ? 'NAO_DECIDIDA' : DE_CODIGO[codigo],
        credito: l.credito,
        vigenciaInicio: l.ini !== undefined ? l.ini : (vig ? vig.ini : null),
        vigenciaFim: l.fim !== undefined ? l.fim : (vig ? vig.fim : null),
        ...(l.base ? { base: l.base } : {}),
        ...(l.etapa ? { etapa: l.etapa } : {}),
        ...(codigo === '?' || l.credito === 'NAO_DECIDIDO' ? { pendencia: l.pendencia } : {}),
        ...(codigo === '?' ? { vigenteHoje: l.vigenteHoje } : {}),
      }
    }
    out[seg] = porTributo
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// XIV.1 — MEI
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * O MEI é o único regime **sem tributo na cascata**. O DAS é fixo mensal, não incide por
 * operação e **não entra no denominador** — o que ele paga por mês é compromisso da empresa,
 * apurado FORA da operação. Pela regra I.4, *"se não tem linha na tela, não pode estar na
 * conta"*.
 *
 * `DAS_FIXO` fica `INEXISTENTE` na formação do preço porque é isso que ele é ali: não há o que
 * apurar por operação. A "linha única, zero" da etapa 13 do MEI é da DECOMPOSIÇÃO, não da
 * colocação — ela existe para ser verdadeira na tela (*"Impostos (MEI — DAS fixo) — R$ 0,00"*),
 * e não para entrar em soma nenhuma.
 */
const MEI_LINHAS: Readonly<Partial<Record<TributoFiscal, Linha>>> = {
  DAS_FIXO: { col: ['-', '-', '-'], credito: false },
  ICMS: { col: ['-', '-', '-'], credito: false },
  ISS: { col: ['-', '-', '-'], credito: false },
  PIS_COFINS: { col: ['-', '-', '-'], credito: false },
  IPI: { col: ['-', '-', '-'], credito: false },
  // XIV.9 pergunta 1 — o IS incide sobre PRODUTO LISTADO, não sobre regime. A XIV marca `?`
  // em industrialização e revenda, e `-` em serviço (não há IS em serviço, pela matriz de
  // segmento). Hoje o código não dá IS nenhum ao MEI.
  IS: { col: ['?', '?', '-'], credito: false, pendencia: 'PENDENCIA_19', vigenteHoje: 'INEXISTENTE' },
  // XIV.9 pergunta 2 — tratamento do MEI na reforma a partir de 2027. Hoje: unificado.
  IBS: { col: ['?', '?', '?'], credito: 'NAO_DECIDIDO', pendencia: 'PENDENCIA_20', vigenteHoje: 'INEXISTENTE' },
  CBS: { col: ['?', '?', '?'], credito: 'NAO_DECIDIDO', pendencia: 'PENDENCIA_20', vigenteHoje: 'INEXISTENTE' },
  IRPJ: { col: ['-', '-', '-'], credito: false },
  CSLL: { col: ['-', '-', '-'], credito: false },
  ADICIONAL_IRPJ: { col: ['-', '-', '-'], credito: false },
  ICMS_ST: { col: ['A', 'A', '-'], credito: false },
  DIFAL: { col: ['A', 'A', '-'], credito: false },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// XIV.2 — SIMPLES NACIONAL (sem a opção híbrida)
// ═══════════════════════════════════════════════════════════════════════════════════════════

const SIMPLES_LINHAS: Readonly<Partial<Record<TributoFiscal, Linha>>> = {
  DAS: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'RECEITA', etapa: '13A' },
  ICMS: { col: ['-', '-', '-'], credito: false },
  ISS: { col: ['-', '-', '-'], credito: false },
  PIS_COFINS: { col: ['-', '-', '-'], credito: false },
  IPI: { col: ['-', '-', '-'], credito: false },
  IS: { col: ['?', '?', '-'], credito: false, pendencia: 'PENDENCIA_19', vigenteHoje: 'INEXISTENTE' },
  // Dentro do DAS a partir de 2027, SE NÃO optar pelo híbrido — e a opção é o outro bloco.
  IBS: { col: ['-', '-', '-'], credito: false },
  CBS: { col: ['-', '-', '-'], credito: false },
  IRPJ: { col: ['-', '-', '-'], credito: false },
  CSLL: { col: ['-', '-', '-'], credito: false },
  ADICIONAL_IRPJ: { col: ['-', '-', '-'], credito: false },
  ICMS_ST: { col: ['A', 'A', '-'], credito: false },
  DIFAL: { col: ['A', 'A', '-'], credito: false },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// XIV.3 — SIMPLES NACIONAL · OPÇÃO HÍBRIDA
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Não é um sétimo regime: é uma chave ligada/desligada dentro do Simples, decidida pelo
 * optante em setembro de cada ano. O crédito de IBS/CBS que o CLIENTE dele recebe é a razão
 * econômica da opção — por isso é negociação B2B.
 */
const HIBRIDO_LINHAS: Readonly<Partial<Record<TributoFiscal, Linha>>> = {
  DAS_REDUZIDO: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'RECEITA', etapa: '13A' },
  IBS: { col: ['F', 'F', 'F'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  CBS: { col: ['F', 'F', 'F'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  // >>> A CÉLULA DE REVENDA É A PENDÊNCIA 11 — ver o bloco que a explica, abaixo <<<
  IS: { col: ['F', '?', '-'], credito: false, base: 'VALOR_OPERACAO', etapa: 'POR_FORA', pendencia: 'PENDENCIA_11', vigenteHoje: 'POR_FORA' },
  ICMS: { col: ['-', '-', '-'], credito: false },
  ISS: { col: ['-', '-', '-'], credito: false },
  PIS_COFINS: { col: ['-', '-', '-'], credito: false },
  IPI: { col: ['-', '-', '-'], credito: false },
  IRPJ: { col: ['-', '-', '-'], credito: false },
  CSLL: { col: ['-', '-', '-'], credito: false },
  ADICIONAL_IRPJ: { col: ['-', '-', '-'], credito: false },
  ICMS_ST: { col: ['A', 'A', '-'], credito: false },
  DIFAL: { col: ['A', 'A', '-'], credito: false },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// XIV.4 — LUCRO PRESUMIDO
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * A diferença estrutural que define a decomposição do Presumido: **IRPJ e CSLL incidem sobre
 * a RECEITA, por presunção** — não sobre o lucro. Logo não são resíduo: comportam-se como o
 * ICMS, alíquota direta sobre a âncora.
 *
 * **Consequência: eles SAEM da etapa 16 e ENTRAM na 13C.** A etapa 16 do Presumido tem duas
 * linhas, não quatro. É o oposto do Lucro Real, e é a distinção mais importante entre os dois.
 */
const PRESUMIDO_LINHAS: Readonly<Partial<Record<TributoFiscal, Linha>>> = {
  ICMS: { col: ['D', 'D', '-'], credito: true, base: 'RECEITA', etapa: '13A' },
  ISS: { col: ['-', '-', 'D'], credito: false, base: 'RECEITA', etapa: '13A' },
  PIS_COFINS: { col: ['D', 'D', 'D'], credito: false, base: 'RECEITA', etapa: '13B' },
  IRPJ: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'PRESUNCAO', etapa: '13C' },
  CSLL: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'PRESUNCAO', etapa: '13C' },
  ADICIONAL_IRPJ: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'PRESUNCAO', etapa: '13C' },
  // XIV.9 pergunta 4, levantada pelo próprio PO: o IPI é não-cumulativo para o contribuinte
  // industrial INDEPENDENTE do regime de IRPJ, e a regra da Parte III diz "crédito do
  // Presumido: só ICMS". As duas podem não ser compatíveis. **Não deduzido.**
  IPI: { col: ['F', '-', '-'], credito: 'NAO_DECIDIDO', base: 'VALOR_OPERACAO', etapa: 'POR_FORA', pendencia: 'PENDENCIA_21' },
  // >>> A CÉLULA DE REVENDA É A PENDÊNCIA 11 <<<
  IS: { col: ['F', '?', '-'], credito: false, base: 'VALOR_OPERACAO', etapa: 'POR_FORA', pendencia: 'PENDENCIA_11', vigenteHoje: 'POR_FORA' },
  IBS: { col: ['F', 'F', 'F'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  CBS: { col: ['F', 'F', 'F'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  ICMS_ST: { col: ['A', 'A', '-'], credito: false },
  DIFAL: { col: ['A', 'A', '-'], credito: false },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// XIV.5 — LUCRO REAL · modelo de referência
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * **É o modelo de referência. Estrutura intocável.**
 *
 * No Real, IRPJ e CSLL incidem sobre o **lucro real** — que é o próprio resíduo. Logo ficam na
 * **etapa 16**, ao lado de comissão e lucro, e o RRO se divide entre as quatro. É por isso que
 * o `LimiteMinimo` do Real não inclui IRPJ/CSLL no denominador: eles não disputam a âncora,
 * disputam o resto.
 *
 * >>> ESTA É A COLUNA DE ONDE `placementOf` E `TAX_MATRIX` DERIVAM <<<
 * As sete linhas de `TaxName` abaixo reproduzem, célula a célula, o dado literal que a
 * `TAX_MATRIX` guardava — com a única exceção da pendência 11, que a derivação resolve por
 * `vigenteHoje`. O portão de concordância afirma a igualdade para os 21 pares.
 */
const REAL_LINHAS: Readonly<Partial<Record<TributoFiscal, Linha>>> = {
  ICMS: { col: ['D', 'D', '-'], credito: true, base: 'RECEITA', etapa: '13A' },
  ISS: { col: ['-', '-', 'D'], credito: false, base: 'RECEITA', etapa: '13A' },
  PIS_COFINS: { col: ['D', 'D', 'D'], credito: true, base: 'RECEITA', etapa: '13B' },
  IRPJ: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'LUCRO', etapa: '16' },
  CSLL: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'LUCRO', etapa: '16' },
  ADICIONAL_IRPJ: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'LUCRO', etapa: '16' },
  IPI: { col: ['F', '-', '-'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  // >>> A CÉLULA DE REVENDA É A PENDÊNCIA 11 <<<
  IS: { col: ['F', '?', '-'], credito: false, base: 'VALOR_OPERACAO', etapa: 'POR_FORA', pendencia: 'PENDENCIA_11', vigenteHoje: 'POR_FORA' },
  IBS: { col: ['F', 'F', 'F'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  CBS: { col: ['F', 'F', 'F'], credito: true, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  ICMS_ST: { col: ['A', 'A', '-'], credito: false },
  DIFAL: { col: ['A', 'A', '-'], credito: false },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// XIV.6 — RET
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * RET é **REGIME DE CAIXA**: alíquota única sobre a receita **RECEBIDA** (Lei 10.931/2004,
 * patrimônio de afetação). Nos outros cinco regimes a venda forma o preço e o recebimento é
 * conciliação financeira; **no RET o recebimento forma o próprio imposto.** Daí
 * `base: 'RECEITA_RECEBIDA'`, que é o único lugar da matriz onde esse valor aparece.
 *
 * >>> IBS E CBS SÃO `POR_FORA` **DESDE JÁ**, E ISSO NÃO É A ALÍQUOTA <<<
 *
 * A ESPEC, na regra de redação que a I.3 ganhou em 11/10/2026:
 *
 *   > Dizer *"RET: por fora **nenhum até 2028**"* é descrever a ALÍQUOTA com a palavra
 *   > reservada à COLOCAÇÃO. A redação correta separa as duas coisas, sempre:
 *   > colocação: POR FORA, desde já · alíquota: 0 até 2028 · manual · redutor de 50% em 2029.
 *
 * **A alíquota não mora nesta matriz.** Ela é manual, fica zero até 2028, e em 2029 o dono
 * digita o número e ele entra no lugar certo sozinho.
 *
 * LIMITE CONHECIDO, registrado em vez de resolvido por invenção de campo: a XIV.6 diz que o
 * crédito de IBS/CBS no RET é *"não até 2028 · sim de 2029"* — crédito COM VIGÊNCIA. A célula
 * tem um `credito` só, e acrescentar um eixo de data nele seria além do que esta rodada pede.
 * Fica `false`, que é o estado de hoje, com esta nota.
 */
const RET_LINHAS: Readonly<Partial<Record<TributoFiscal, Linha>>> = {
  RET: { col: ['D', 'D', 'D'], credito: false, ini: null, fim: null, base: 'RECEITA_RECEBIDA', etapa: '13A' },
  IBS: { col: ['F', 'F', 'F'], credito: false, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  CBS: { col: ['F', 'F', 'F'], credito: false, base: 'VALOR_OPERACAO', etapa: 'POR_FORA' },
  ICMS: { col: ['-', '-', '-'], credito: false },
  // A pendência própria do VIII.6: *"embutido nos 4% ou acréscimo municipal da obra? Não
  // deduzir."* Hoje `calc-tax-preview.ts:176-178` SOMA o ISS ao `retRate` por default
  // (`ret_iss_separate !== false`), então o comportamento vigente é tratá-lo por dentro — e é
  // um lado HERDADO, não decidido. Portão C9 de `portoes-presumido-e-ret.test.ts`.
  ISS: { col: ['?', '?', '?'], credito: false, pendencia: 'PENDENCIA_RET_ISS', vigenteHoje: 'POR_DENTRO' },
  PIS_COFINS: { col: ['-', '-', '-'], credito: false },
  IPI: { col: ['-', '-', '-'], credito: false },
  IS: { col: ['-', '-', '-'], credito: false },
  // Dentro dos 4%, INCLUSIVE de 2029.
  IRPJ: { col: ['-', '-', '-'], credito: false },
  CSLL: { col: ['-', '-', '-'], credito: false },
  ADICIONAL_IRPJ: { col: ['-', '-', '-'], credito: false },
  ICMS_ST: { col: ['A', 'A', '-'], credito: false },
  DIFAL: { col: ['A', 'A', '-'], credito: false },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// >>> A PENDÊNCIA 11 — A CÉLULA QUE ESTA RODADA NÃO DECIDE <<<
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * **IS em REVENDA está em DISPUTA, e os dois lados têm razão escrita no repositório.**
 *
 * | lado | onde | o argumento |
 * |---|---|---|
 * | **POR_FORA** | `TAX_MATRIX.REVENDA.IS` (o dado literal que esta matriz substitui) e as tabelas III.1, XIV.3, XIV.4 e XIV.5 da ESPEC | a matriz de segmento sempre disse POR FORA |
 * | **INEXISTENTE** | `simples-hibrido.ts:51-53` — *"Revenda é **monofásica** — o IS já veio no custo, e **cobrá-lo de novo é bitributar**"* — e um **teste VERDE** em `decomposicao-simples-hibrido-planilha.test.ts:162-170` | e a razão dele vem da **III.4 da própria ESPEC**: *"IS… **monofásico**, nunca gera crédito, só sobre produto listado"* |
 *
 * Monofásico significa incidir UMA VEZ na cadeia. Numa revenda o item foi adquirido para
 * revender: o IS já incidiu antes. **A ESPEC sustenta os dois lados, em seções diferentes.**
 *
 * >>> POR QUE `NAO_DECIDIDA` E NÃO UMA DAS DUAS <<<
 *
 * O comando é explícito: *"NÃO escolha POR_FORA nem INEXISTENTE."* E a razão é de método —
 * `regime-e-segmento-determinam-a-construcao.md`: *"enquanto a matriz não existir, o certo é
 * registrar a dúvida, não escolher a metade que parece mais provável."* Escrever um dos dois
 * aqui faria a matriz, que nasce como FONTE, resolver por omissão uma disputa que ninguém
 * decidiu — e o lado escolhido viraria "a regra" no dia seguinte.
 *
 * >>> E POR QUE `vigenteHoje: 'POR_FORA'` AO LADO <<<
 *
 * Porque é o que o código FAZ, e isso é um fato distinto da regra. `placementOf('REVENDA',
 * 'IS')` devolve `'POR_FORA'` hoje, e **três casos existentes afirmam isso**
 * (`matriz-e-contexto-da-venda.test.ts:103`, `o-campo-some-onde-a-matriz-diz-inexistente.test.ts:62`
 * e o loop de `:77`). O princípio desta rodada é que **nenhum caso cai**: sem o segundo campo,
 * eu teria de escolher um lado ou derrubar três casos — e as duas coisas são proibidas.
 *
 * No dia da decisão: `colocacao` recebe o lado escolhido, `vigenteHoje` e `pendencia` saem, e
 * se o lado for `INEXISTENTE` os três casos ficam vermelhos — que é exatamente o aviso que se
 * quer, em vez de uma mudança silenciosa.
 */
export const PENDENCIA_11 = 'PENDENCIA_11' as const

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A MATRIZ
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const MATRIZ_FISCAL: MatrizFiscal = {
  MEI: expande(MEI_LINHAS),
  SIMPLES_NACIONAL: expande(SIMPLES_LINHAS),
  SIMPLES_HIBRIDO: expande(HIBRIDO_LINHAS),
  LUCRO_PRESUMIDO: expande(PRESUMIDO_LINHAS),
  LUCRO_REAL: expande(REAL_LINHAS),
  LUCRO_PRESUMIDO_RET: expande(RET_LINHAS),
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// OS LEITORES — é por aqui que os derivados leem
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** A célula, ou `undefined` quando o tributo não tem linha naquele regime. */
export function celulaDe(
  regime: TaxRegime,
  segmento: CalcType,
  tributo: TributoFiscal,
): Celula | undefined {
  return MATRIZ_FISCAL[regime]?.[segmento]?.[tributo]
}

/**
 * A colocação **VIGENTE** — a regra quando há regra, o comportamento de hoje quando não há.
 *
 * >>> ESTA É A FUNÇÃO QUE OS DERIVADOS CHAMAM, E A DISTINÇÃO É O PONTO <<<
 *
 * Quem precisa do comportamento (a tela, o motor, o coeficiente) chama esta. Quem precisa
 * saber se existe REGRA lê `celula.colocacao` e vê `'NAO_DECIDIDA'`. Confundir as duas é o que
 * faria uma pendência virar regra sem ninguém decidir.
 *
 * Tributo sem linha devolve `INEXISTENTE`: não há o que apurar ali, e é a mesma leitura que a
 * `TAX_MATRIX` já fazia para as células `-`.
 */
export function colocacaoVigente(
  regime: TaxRegime,
  segmento: CalcType,
  tributo: TributoFiscal,
): Colocacao {
  const c = celulaDe(regime, segmento, tributo)
  if (!c) return 'INEXISTENTE'
  if (c.colocacao === 'NAO_DECIDIDA') {
    // `vigenteHoje` é obrigatório em célula não decidida — o portão de concordância afirma
    // isso para todas elas. O fallback existe para não devolver `undefined` em runtime.
    return c.vigenteHoje ?? 'INEXISTENTE'
  }
  return c.colocacao
}

/**
 * Os tributos POR FORA de um regime, na ordem em que a matriz os declara.
 *
 * Um tributo entra quando é `POR_FORA` em **algum** segmento daquele regime — é o que
 * `POR_FORA_POR_REGIME` sempre significou: a pergunta dela é por REGIME, e o eixo do segmento
 * é composto depois, por `apenasTributosPorFora`.
 *
 * Restrito a `TaxName` porque é o contrato de quem a consome: a tela de preço monta linhas de
 * IBS, CBS, IS e IPI, não de DAS nem de ICMS-ST.
 */
export function tributosPorForaNaMatriz(regime: TaxRegime): readonly TaxName[] {
  const NOMES: readonly TaxName[] = ['IBS', 'CBS', 'IS', 'IPI']
  return NOMES.filter((t) => SEGMENTOS.some((s) => colocacaoVigente(regime, s, t) === 'POR_FORA'))
}
