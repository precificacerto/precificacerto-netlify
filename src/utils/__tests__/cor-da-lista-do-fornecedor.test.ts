/**
 * @jest-environment node
 *
 * PORTÃO — A COR SÓ É GRAVADA SE ESTIVER NA LISTA DO FORNECEDOR (dono do produto, 26/11/2026, pedido 0038; Critérios §4.2): fora da lista, a cor do
 * item vai vazia e o aviso a nomeia, com a quantidade — nunca outro nome. A lista é a aba CORES da Wolff (`orcamentista_fornecedor_cor`).
 */
import { coresDaListaDoFornecedor, FRASE_DO_FORNECEDOR_SEM_LISTA_DE_CORES } from '@/utils/atendimentos-ia-importacao'

const LISTA = ['BRANCO', 'PRETO LISO', 'EXTERNO PRETO LISO', 'AMADEIRADO GOLDEN OAK', 'PRETO']
const i = (codigo: string, cor: string | null) => ({ codigo, cor })

describe('a cor do item contra a lista de cores do fornecedor', () => {
    it('a cor da lista fica como veio — sem olhar caixa nem acento — e o LADO MAIOR/MENOR depois do nome também vale', () => {
        const itens = [i('1', 'BRANCO'), i('2', 'preto liso'), i('3', 'EXTERNO PRETO LISO LADO MAIOR'), i('4', 'Amadeirado Golden Oak'), i('5', null), i('6', 'PRETO')]
        const r = coresDaListaDoFornecedor(itens, LISTA)
        expect(r.itens).toEqual(itens)
        expect(r.aviso).toBeNull()
    })
    it('a cor FORA da lista vai VAZIA (nunca outro nome) e o aviso nomeia cada uma, com quantos itens, da mais frequente à menos', () => {
        const itens = [i('1', 'PRETO LISO TOTAL'), i('2', 'GOLDEN OAK'), i('3', 'PRETO LISO TOTAL'), i('4', 'BRANCO'), i('5', 'PRETO LISO LADO MAIOR X')]
        const r = coresDaListaDoFornecedor(itens, LISTA)
        expect(r.itens.map((x) => x.cor)).toEqual([null, null, null, 'BRANCO', null])
        expect(r.aviso).toEqual(expect.objectContaining({ tipo: 'cor_fora_da_lista_do_fornecedor', cores: [{ cor: 'PRETO LISO TOTAL', itens: 2 }, { cor: 'GOLDEN OAK', itens: 1 }, { cor: 'PRETO LISO LADO MAIOR X', itens: 1 }] }))
        expect(r.aviso?.mensagem).toContain('"PRETO LISO TOTAL" (2)')
        // o resto do item não muda
        expect(r.itens[0]).toEqual({ codigo: '1', cor: null })
    })
    it('sem lista, nada se confere, e o aviso diz', () => {
        const itens = [i('1', 'PRETO LISO TOTAL')]
        const r = coresDaListaDoFornecedor(itens, [])
        expect(r.itens).toEqual(itens)
        expect(r.aviso).toEqual({ tipo: 'fornecedor_sem_lista_de_cores', mensagem: FRASE_DO_FORNECEDOR_SEM_LISTA_DE_CORES })
    })
})
