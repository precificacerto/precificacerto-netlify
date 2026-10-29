/**
 * Atendimentos I.A. — UMA TABELA, UMA CATEGORIA DO FORNECEDOR (dono do produto, 27/10/2026).
 *
 * Mora fora do leitor (`atendimentos-ia-importacao.ts`) de propósito: o leitor importa o `exceljs`, e a rota da
 * tabela (PATCH) e o teste dela só precisam de contar e de nomear — sem carregar a planilha.
 */
import { fraseDoArquivo } from '@/utils/atendimentos-ia-catalogo'

/**
 * "Não pode haver margem para o agente usar, no levantamento e nas fórmulas, o preço de uma ramificação que
 * ninguém escolheu": a tabela de preço de uma categoria traz itens de UMA categoria do fornecedor só — a coluna
 * `COLUNA_DA_CATEGORIA_DO_FORNECEDOR` do arquivo. A importação de tabela que DECLARA a categoria recusa o arquivo
 * com mais de uma, NOMEANDO as que achou. A tabela de antes, sem categoria declarada (a da Wolff), não é recusada
 * retroativamente: ela segue como estava, e o aviso diz que a regra não foi aplicada.
 *
 * Duas grafias da mesma categoria ("Acessórios" e "acessórios") contam como UMA: a comparação ignora caixa e
 * espaços de sobra, e o nome mostrado é a primeira grafia que apareceu. Item sem a categoria preenchida não é
 * categoria nenhuma: é contado à parte e avisado, nunca somado a uma delas.
 */
export interface CategoriaNoArquivo { nome: string; itens: number }

export function categoriasDoFornecedorNosItens(valores: ReadonlyArray<string | null | undefined>): { categorias: CategoriaNoArquivo[]; semCategoria: number } {
    const porChave = new Map<string, CategoriaNoArquivo>()
    let semCategoria = 0
    for (const v of valores) {
        const nome = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
        if (nome === '') { semCategoria += 1; continue }
        const chave = nome.toLocaleLowerCase('pt-BR')
        const achada = porChave.get(chave)
        if (achada) achada.itens += 1
        else porChave.set(chave, { nome, itens: 1 })
    }
    return { categorias: [...porChave.values()], semCategoria }
}

const listaDasCategorias = (categorias: readonly CategoriaNoArquivo[]) => categorias.map((c) => `${c.nome} (${c.itens})`).join(', ')

/** A recusa da importação: o arquivo traz mais de uma categoria do fornecedor. Nada foi alterado. */
export function fraseDoArquivoComMaisDeUmaCategoria(nomeDoArquivo: string, categorias: readonly CategoriaNoArquivo[]): string {
    return fraseDoArquivo(nomeDoArquivo, `traz itens de ${categorias.length} categorias do fornecedor: ${listaDasCategorias(categorias)}. `
        + 'Uma tabela é de uma categoria só: separe o arquivo em um por categoria e suba cada um como uma tabela. Nada foi alterado.')
}

/**
 * A recusa de DECLARAR a categoria de uma tabela cujos itens já gravados têm mais de uma categoria do fornecedor. A frase diz que a contagem é a dos
 * ITENS GRAVADOS DO ARQUIVO DE ANTES (dono do produto, 29/10/2026: quem sobe um arquivo novo lia a contagem como se fosse a dele) e aponta o caminho:
 * arquivo de uma categoria só é tabela nova.
 */
export function fraseDaTabelaComMaisDeUmaCategoria(categorias: readonly CategoriaNoArquivo[]): string {
    return `Os itens gravados do arquivo de antes têm ${categorias.length} categorias do fornecedor: ${listaDasCategorias(categorias)}. `
        + 'Uma tabela é de uma categoria só, e esta não pode declarar uma. Para um arquivo de uma categoria só, cadastre uma tabela nova do fornecedor, '
        + 'com a categoria dele. Nada foi alterado.'
}

export const fraseDosItensSemCategoriaDoFornecedor = (n: number) =>
    `${n} ${n === 1 ? 'item do arquivo não traz' : 'itens do arquivo não trazem'} a categoria do fornecedor. ${n === 1 ? 'Foi gravado' : 'Foram gravados'} assim; confira se ${n === 1 ? 'pertence' : 'pertencem'} a esta categoria.`

export const FRASE_DA_TABELA_SEM_CATEGORIA_DECLARADA =
    'Esta tabela não declara a categoria; a regra de uma categoria por tabela não foi aplicada nesta importação.'
