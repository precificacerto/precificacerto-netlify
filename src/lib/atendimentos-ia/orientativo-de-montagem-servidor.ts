/**
 * A LEITURA do orientativo de montagem (SÓ SERVIDOR). A montagem é pura e mora em `orientativo-de-montagem.ts`.
 *
 * SÓ LEITURA, como as barras do pedido: nada é gravado, nenhum preço é tocado, e o modo de aproveitamento do orçamento continua o que era.
 * - os itens que valem e o cálculo vigente de cada um (`itensDoRelatorio`);
 * - as PEÇAS e o MATERIAL gravados pelo cálculo vigente (a fonte quando o recálculo não confere);
 * - o RECÁLCULO, pelo mesmo caminho do orçamento (`custoDeAgora`, que não grava): dá a linha e a Obs. do motor de cada peça e acessório e as
 *   medidas dos panos (`montagemPorItem`). Recusa do recálculo não derruba o relatório: as gravadas saem, e a razão é dita;
 * - o cabeçalho de cada esquadria e o DESENHO, pela mesma escolha do arquivo do orçamento (`itensDoArquivo` + `desenhosDosItens`);
 * - o peso, das tabelas que valem (`pesosNasTabelasQueValem`, o mesmo das barras do pedido).
 */
import { supabaseAdmin } from '@/supabase/admin'
import { tabelaAusente, TABELA_DO_ITEM } from './orcamentos-ia'
import { itensDoRelatorio } from './categoria-do-relatorio-servidor'
import { linhasDoCalculoVigente } from './relatorio-de-materiais'
import { TABELA_DAS_PECAS } from './relatorio-de-corte-servidor'
import { pesosNasTabelasQueValem } from './barras-do-pedido-servidor'
import { custoDeAgora, ErroDoCalculo } from './orcamento-calculado'
import { itensDoArquivo } from './arquivo-do-orcamento-servidor'
import { desenhosDosItens, lerCatalogoDeDesenhos } from './desenho-do-catalogo-servidor'
import type { MontagemDoItem } from './custo-do-orcamento-servidor'
import {
    montarOrientativo, type EntradaDaEsquadria, type ImagemDoOrientativo, type MaterialGravadoDaMontagem, type OrientativoDeMontagem, type PecaGravada,
} from './orientativo-de-montagem'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
const falhou = (tabela: string, e: { message: string }): never => { throw new Error(`${tabela}: ${e.message}`) }
const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

export const FRASE_SEM_MIGRACAO_DO_ORIENTATIVO = 'O orientativo de montagem ainda não está disponível: a estrutura do banco das peças (migração 20261117000001) não foi aplicada.'

export type OrientativoDoOrcamento = OrientativoDeMontagem | { semMigracao: string }

/** O recálculo, sem gravar: o que o avaliador deu por item (pelo id do item), ou a razão de não ter rodado. */
async function recalcular(tenantId: string, orcamentoId: string): Promise<Map<string, MontagemDoItem> | { naoRodou: string }> {
    try {
        const { orc, custo } = await custoDeAgora(tenantId, orcamentoId)
        if ('recusas' in custo) return { naoRodou: custo.recusas.join('; ') }
        return new Map(orc.itens.map((i, k) => [i.id, custo.montagemPorItem[k]]))
    } catch (e) {
        if (e instanceof ErroDoCalculo) return { naoRodou: e.recusas.join('; ') }
        throw e
    }
}

export async function lerOrientativoDeMontagem(tenantId: string, orcamentoId: string): Promise<OrientativoDoOrcamento> {
    const itens = await itensDoRelatorio(tenantId, orcamentoId)
    const calculados = itens.filter((i) => i.calculo_id)
    const itensSemCalculo = itens.filter((i) => !i.calculo_id).map((i) => i.ordem)
    if (!calculados.length) return montarOrientativo([], new Map(), itensSemCalculo)
    const ids = calculados.map((i) => i.id)

    const [p, m, it] = await Promise.all([
        db().from(TABELA_DAS_PECAS).select('orcamento_item_id, calculo_id, ordem, perfil, codigo, descricao, comprimento_mm, quantidade_por_esquadria, corte, posicao')
            .eq('tenant_id', tenantId).in('orcamento_item_id', ids).order('ordem'),
        db().from('orcamentista_orcamento_item_material').select('orcamento_item_id, calculo_id, caminho, codigo_na_tabela, descricao, unidade_compra, consumo_item')
            .eq('tenant_id', tenantId).in('orcamento_item_id', ids),
        db().from(TABELA_DO_ITEM).select('id, ordem, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro').eq('tenant_id', tenantId).in('id', ids),
    ])
    if (p.error && tabelaAusente(p.error)) return { semMigracao: FRASE_SEM_MIGRACAO_DO_ORIENTATIVO }
    if (p.error) falhou(TABELA_DAS_PECAS, p.error)
    if (m.error) falhou('orcamentista_orcamento_item_material', m.error)
    if (it.error) falhou(TABELA_DO_ITEM, it.error)
    type Comum = { orcamento_item_id: string; calculo_id: string }
    const pecas = linhasDoCalculoVigente(calculados, (p.data ?? []) as Array<Record<string, unknown> & Comum>)
    const materiais = linhasDoCalculoVigente(calculados, (m.data ?? []) as Array<Record<string, unknown> & Comum>)
    const doItem = new Map(((it.data ?? []) as Array<Record<string, unknown> & { id: string }>).map((x) => [x.id, x]))

    // o cabeçalho (a descrição da tipologia) e o desenho: a MESMA escolha do arquivo do orçamento, por ordem
    const arquivo = await itensDoArquivo(tenantId, orcamentoId)
    const descricaoDa = new Map<number, string | null>()
    const desenhoDa = new Map<number, { desenho: ImagemDoOrientativo | null; semDesenho: string | null }>()
    if ('recusa' in arquivo) {
        for (const i of calculados) desenhoDa.set(i.ordem, { desenho: null, semDesenho: `Sem desenho: ${arquivo.recusa.replace(/\.$/, '')}.` })
    } else {
        arquivo.itens.forEach((x) => descricaoDa.set(x.ordem, x.descricao))
        const alvos = arquivo.paraODesenho.map((d, k) => ({ d, ordem: arquivo.itens[k].ordem })).filter((x) => x.d.tipologia !== '')
        const desenhos = alvos.length ? await desenhosDosItens(alvos.map((x) => x.d), await lerCatalogoDeDesenhos()) : []
        alvos.forEach((x, k) => {
            const d = desenhos[k]
            desenhoDa.set(x.ordem, 'imagem' in d ? { desenho: d.imagem, semDesenho: null } : { desenho: null, semDesenho: `Sem desenho: ${d.frase.replace(/\.$/, '')}.` })
        })
    }

    const recalculo = await recalcular(tenantId, orcamentoId)
    const entradas: EntradaDaEsquadria[] = calculados.map((i) => {
        const x: Record<string, unknown> = doItem.get(i.id) ?? {}
        const gravadas: PecaGravada[] = pecas.filter((y) => y.orcamento_item_id === i.id).map((y) => ({
            perfil: String(y.perfil), codigo: String(y.codigo), descricao: textoOuNulo(y.descricao), comprimento_mm: Number(y.comprimento_mm),
            quantidade_por_esquadria: Number(y.quantidade_por_esquadria), corte: textoOuNulo(y.corte), posicao: textoOuNulo(y.posicao),
        }))
        const doMaterial: MaterialGravadoDaMontagem[] = materiais.filter((y) => y.orcamento_item_id === i.id).map((y) => ({
            caminho: String(y.caminho), codigo_na_tabela: String(y.codigo_na_tabela), descricao: textoOuNulo(y.descricao),
            unidade_compra: textoOuNulo(y.unidade_compra), consumo_item: Number(y.consumo_item),
        }))
        const d = desenhoDa.get(i.ordem) ?? { desenho: null, semDesenho: null }
        const r = recalculo instanceof Map ? recalculo.get(i.id) : undefined
        return {
            ordem: i.ordem, tipologia: textoOuNulo(x.tipologia), descricao: descricaoDa.get(i.ordem) ?? null,
            largura_mm: numero(x.largura_mm), altura_mm: numero(x.altura_mm), quantidade: numero(x.quantidade) ?? 0,
            cor_perfil: textoOuNulo(x.cor_perfil), vidro: textoOuNulo(x.vidro), desenho: d.desenho, semDesenho: d.semDesenho,
            gravadas, materiais: doMaterial,
            recalculo: recalculo instanceof Map ? (r ?? { naoRodou: 'o item não voltou no recálculo' }) : recalculo,
        }
    })
    const codigos = [...new Set(entradas.flatMap((e) => [...e.gravadas.map((g) => g.codigo), ...('pecas' in e.recalculo ? e.recalculo.pecas.map((q) => q.codigo) : [])]))]
    return montarOrientativo(entradas, await pesosNasTabelasQueValem(tenantId, codigos), itensSemCalculo)
}
