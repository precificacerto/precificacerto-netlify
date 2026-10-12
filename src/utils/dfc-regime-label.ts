/**
 * O RÓTULO DO REGIME E O NOME DO ARQUIVO da exportação da DRE.
 *
 * Extraído de `export-dfc-excel.ts` em 11/10/2026, no passo XI-3.5 FASE C, e a razão é de
 * ALCANCE, não de organização: aquele módulo importa `exceljs` no topo, e `exceljs` arrasta
 * `uuid` em ESM, que o jest deste repositório não transforma. Uma suíte que o importasse
 * **falhava ao CARREGAR** — e uma suíte que não carrega contribui ZERO casos, então a linha
 * `Tests: N passed` não se move e o portão parece não existir em vez de parecer vermelho.
 * Medido: a primeira versão do portão desta rodada deu `Tests: 0 total`.
 *
 * É `portao-que-nao-alcanca.md` pela pergunta 2 — *o portão alcança o ARQUIVO em questão?* —
 * com o eco da aparição 6 daquela página na linha que se confere. Separar as duas funções
 * puras é o que torna o efeito afirmável.
 *
 * ── O RÓTULO AQUI É SEM ACENTO, E ISSO É DE PROPÓSITO
 *
 * `'Simples Hibrido'` e `'Nao definido'` são os textos que a planilha sempre teve. O rótulo da
 * TELA, em `pages/dfc/index.tsx` (`getVariantLabel`), é acentuado. **São dois rótulos, não um
 * duplicado a unificar**: unificá-los mudaria o conteúdo de planilhas já exportadas, e a FASE C
 * não muda comportamento. Quem for unificar decide qual texto vence, e isso é outra rodada.
 */

import type { TaxRegime } from '@/supabase/types'

/**
 * `null` é tratado por NOME, nunca por falsidade.
 *
 * Era `default: return taxRegime || 'Nao definido'`, com a tela passando `''` como estado
 * inicial. `''` é valor falso fingindo estado — `ausente-vs-falso.md` —, e o `||` o convertia
 * numa afirmação ("Nao definido") sem que ninguém tivesse decidido isso. Decisão do dono do
 * produto (D2, rota (a)): o parâmetro aceita `null`, e `null` significa *regime não carregado*.
 *
 * **Sem `default`, por decisão (D5).** Com `TaxRegime` fechado, todo regime exige `case` — e um
 * valor novo no tipo quebra a compilação AQUI, que é exatamente o que um `default` apagava. Era
 * ele que deixava a grafia do banco cair no rótulo cru, e daí no nome do arquivo.
 */
export function getRegimeLabel(taxRegime: TaxRegime | null): string {
  if (taxRegime === null) return 'Nao definido'
  switch (taxRegime) {
    case 'LUCRO_REAL': return 'Lucro Real'
    case 'LUCRO_PRESUMIDO': return 'Lucro Presumido'
    case 'LUCRO_PRESUMIDO_RET': return 'Presumido RET'
    case 'SIMPLES_NACIONAL': return 'Simples Nacional'
    case 'SIMPLES_HIBRIDO': return 'Simples Hibrido'
    case 'MEI': return 'MEI'
  }
}

/**
 * O NOME DO ARQUIVO que o usuário recebe.
 *
 * Estava inline no `a.download` e por isso nenhum caso podia afirmá-lo. É o efeito mais
 * duradouro da exportação: o rótulo fica dentro da planilha, o nome do arquivo vira anexo de
 * e-mail — e foi essa a razão de o dono do produto escolher a rota (a) da D2.
 * `teste-que-nao-exercita.md`: exportar custa uma linha, e o que se compra é poder afirmar
 * efeito em vez de passagem.
 */
export function buildDfcExcelFileName(
  year: number,
  periodLabel: string,
  taxRegime: TaxRegime | null,
): string {
  const regime = getRegimeLabel(taxRegime).replace(/\s+/g, '_')
  return `DRE_${year}_${periodLabel.replace(/\s+/g, '_')}_${regime}.xlsx`
}
