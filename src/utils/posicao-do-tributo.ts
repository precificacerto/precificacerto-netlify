/**
 * posicao-do-tributo.ts — em qual dos dois blocos cada tributo da compra aparece.
 *
 * Comando do dono do produto de 23/09/2026, §1 e §2, registrado como está:
 *
 *   > O bloco de impostos da compra passa a ter duas metades: em cima o que gera crédito,
 *   > embaixo o que virou custo. **A POSIÇÃO da linha é a decisão — o switch "gera crédito"
 *   > sai.**
 *
 * >>> A POSIÇÃO É A DECISÃO, E POR ISSO ELA NÃO É UM SEGUNDO ESTADO <<<
 *
 * O switch e a posição diziam a mesma coisa por dois caminhos: o botão ligado e a linha em
 * cima. Dois lugares para o mesmo fato é como a divergência começa — bastaria um deles
 * deixar de ser atualizado. Aqui a posição é DERIVADA da bandeira ao abrir, e a bandeira é
 * DERIVADA da posição ao salvar; não existe um terceiro estado guardado em lugar nenhum.
 *
 * >>> A VEDAÇÃO CONTINUA SENDO DE `resolverFlagsDoItem` <<<
 *
 * Tributo vedado não tem linha no bloco de crédito, e não é porque alguém o arrastou para
 * baixo: é porque a lei proíbe. A linha aparece no bloco de custo em LEITURA, com cadeado e
 * motivo. Um campo editável ali convidaria a digitar um crédito que o regime não dá, e o
 * número entraria no preço sem nada falhar (`ausente-vs-falso.md` no estado da bandeira).
 */
import type {
  BandeiraDeCredito,
  BandeirasDeCredito,
  TributoCreditavel,
} from '@/utils/custo-liquido-do-item'
import { TRIBUTOS_CREDITAVEIS } from '@/utils/custo-liquido-do-item'

/** Em cima gera crédito; embaixo compõe o custo. */
export type BlocoDoTributo = 'CREDITO' | 'CUSTO'

export const ROTULO_DO_BLOCO: Record<BlocoDoTributo, string> = {
  CREDITO: 'Gera crédito',
  CUSTO: 'Não gera crédito — compõe o custo',
}

/**
 * A posição de UM tributo.
 *
 * Vedado vai para baixo sempre; fora isso, a bandeira ligada é o bloco de crédito. Bandeira
 * ausente já chegou aqui resolvida pelo padrão da destinação — `resolverFlagsDoItem` faz
 * isso, e refazê-lo aqui seria a segunda cópia da regra de padrão.
 */
export function posicaoDoTributo(b: BandeiraDeCredito | undefined | null): BlocoDoTributo {
  if (!b) return 'CUSTO'
  if (b.vedado) return 'CUSTO'
  return b.ativo ? 'CREDITO' : 'CUSTO'
}

/** A posição dos cinco, na ordem em que a tela os mostra. */
export function posicoesDosTributos(
  bandeiras: BandeirasDeCredito | null | undefined,
): Record<TributoCreditavel, BlocoDoTributo> {
  const saida = {} as Record<TributoCreditavel, BlocoDoTributo>
  for (const t of TRIBUTOS_CREDITAVEIS) saida[t] = posicaoDoTributo(bandeiras?.[t])
  return saida
}

/** Os tributos de cada bloco, já separados — é o que os dois blocos da tela percorrem. */
export function tributosPorBloco(
  bandeiras: BandeirasDeCredito | null | undefined,
): { credito: TributoCreditavel[]; custo: TributoCreditavel[] } {
  const pos = posicoesDosTributos(bandeiras)
  return {
    credito: TRIBUTOS_CREDITAVEIS.filter((t) => pos[t] === 'CREDITO'),
    custo: TRIBUTOS_CREDITAVEIS.filter((t) => pos[t] === 'CUSTO'),
  }
}

/**
 * A linha ACEITA ENTRADA?
 *
 * Só no bloco de crédito, e só quando não há vedação. No bloco de custo a linha de um
 * tributo creditável é leitura: ela está ali para dizer que o imposto existe e virou custo,
 * não para receber um número que o usuário não tem onde conferir.
 */
export function aceitaEntrada(b: BandeiraDeCredito | undefined | null): boolean {
  return posicaoDoTributo(b) === 'CREDITO' && !b?.vedado
}

/**
 * O caminho de volta: da POSIÇÃO para o que se grava em `*_credit_enabled`.
 *
 * Bloco de crédito → `true`; bloco de custo → `false`. As colunas são as mesmas de sempre,
 * com os mesmos valores: nenhuma migração de dado, e item já cadastrado abre idêntico.
 *
 * O tributo VEDADO não vira `false` gravado: a vedação é da lei e vale enquanto valer, e
 * gravar `false` ali transformaria uma proibição de hoje numa escolha do usuário registrada
 * para sempre. `null` continua significando "nunca escolhido", que é o que ele é.
 */
export function bandeirasGravadasDaPosicao(
  posicoes: Partial<Record<TributoCreditavel, BlocoDoTributo>>,
  bandeiras?: BandeirasDeCredito | null,
): Record<TributoCreditavel, boolean | null> {
  const saida = {} as Record<TributoCreditavel, boolean | null>
  for (const t of TRIBUTOS_CREDITAVEIS) {
    if (bandeiras?.[t]?.vedado) { saida[t] = null; continue }
    const p = posicoes[t]
    saida[t] = p == null ? null : p === 'CREDITO'
  }
  return saida
}
