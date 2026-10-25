/**
 * PORTÃO 5a — os vencimentos na ficha, a autossoma, e a tela da parcela em LEITURA.
 *
 * `hoje` é injetado em todo caso. As asserções negativas comparam contra o PRODUTO (o id da
 * fixture, `formatBRL(...)`), nunca contra literal transcrito —
 * `docs/regras/assercao-negativa-que-nunca-falha.md`.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { formatBRL } from '@/utils/formatters'
import { montarParcelasDoCliente, type LinhaDeParcela } from '@/utils/parcelas-do-cliente'
import {
    acharLinha,
    irmasDaMesmaSerie,
    montarVencimentosDaFicha,
    somarSelecionadas,
    contarSelecionadas,
    type VendaComCodigo,
} from '@/utils/vencimentos-da-ficha'
import {
    ROTULO_MAIS_INFORMACOES,
    informacoesExtras,
    temAlgumaInformacaoExtra,
    type ClienteComInformacoesExtras,
} from '@/utils/informacoes-extras-do-cliente'
import { CabecalhoDaFicha } from '@/page-parts/clientes/cabecalho-da-ficha.component'
import {
    ListaDeVencimentos,
    ROTULO_DO_TOTAL_SELECIONADO,
    TITULO_SEM_VENCIMENTO_LISTA,
} from '@/page-parts/clientes/lista-de-vencimentos.component'
import { TelaDaParcela, TEXTO_PARCELA_NAO_ENCONTRADA } from '@/page-parts/clientes/tela-da-parcela.component'
import { ROTULO_DAR_BAIXA } from '@/utils/baixa-de-parcela'
import { diaBR } from '@/utils/dia-de-hoje'
import { montarResumoDoCliente } from '@/utils/resumo-do-cliente'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query),
        media: query,
        onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const HOJE = '2026-10-16'

function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(no) })
    return { host, texto: () => host.textContent || '', desmontar: () => { act(() => { root.unmount() }); host.remove() } }
}

// ── A fixture: DUAS vendas intercaladas no tempo, uma parcela órfã, e valores que quebram
//    em float. Os ids são uuid-like de propósito: é contra eles que a negativa do caso 3
//    compara.
const VENDAS: (VendaComCodigo & { id: string; customer_id: string | null })[] = [
    { id: '11111111-1111-1111-1111-111111111111', customer_id: 'c1', sale_code: 'VD-121365' },
    { id: '22222222-2222-2222-2222-222222222222', customer_id: 'c1', sale_code: 'AG-1368A8' },
]

const linha = (p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela => ({
    amount: 0, due_date: null, paid_date: null, is_active: true,
    origin_type: 'SALE', origin_id: null, contact_id: null, ...p,
})

const PARCELAS: LinhaDeParcela[] = [
    // venda A — 1ª e 3ª do calendário
    linha({ id: 'pa1', origin_id: VENDAS[0].id, due_date: '2026-09-10', amount: 10.1 }),
    linha({ id: 'pa2', origin_id: VENDAS[0].id, due_date: '2026-11-10', amount: 30.3 }),
    // venda B — 2ª e 4ª
    linha({ id: 'pb1', origin_id: VENDAS[1].id, due_date: '2026-10-10', amount: 20.2 }),
    linha({ id: 'pb2', origin_id: VENDAS[1].id, due_date: '2026-12-10', amount: 40.4, paid_date: '2026-10-01' }),
    // órfã: a origem não resolve venda nenhuma
    linha({ id: 'po1', origin_id: '99999999-9999-9999-9999-999999999999', contact_id: 'c1', due_date: '2026-10-05', amount: 7 }),
]

const COBRANCA = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: HOJE, escopo: 'TODAS' })
const VENCIMENTOS = montarVencimentosDaFicha({
    parcelas: COBRANCA.parcelas.filter((p) => p.customerId === 'c1'),
    vendas: VENDAS,
})
const TODAS = [...VENCIMENTOS.datadas, ...VENCIMENTOS.semVencimento]

// ════════════════════════════════════════════════════════════════════════════════════════
describe('1 — o botão "Mais informações" e a trava POR CLIENTE', () => {
    // ANOTADO de propósito: com `strictNullChecks` desligado, um literal todo-`null` infere
    // `any` em cada propriedade e sobe o baseline do `tsc` em 9 (`TS7018`). O jest passou
    // verde com os nove vivos — ver `assercao-negativa-que-nunca-falha.md`, seção do `tsc`.
    const VAZIO: ClienteComInformacoesExtras = {
        email: null, document: null, ie: null, cep: null, address: null, city: null,
        state_code: null, notes: null, owner_id: null, is_icms_contributor: false,
    }

    it('cliente com tudo vazio e `is_icms_contributor = false` NÃO tem informação extra', () => {
        expect(temAlgumaInformacaoExtra(VAZIO)).toBe(false)
    })

    it('`false` não é conteúdo; `true` é', () => {
        expect(temAlgumaInformacaoExtra({ ...VAZIO, is_icms_contributor: false })).toBe(false)
        expect(temAlgumaInformacaoExtra({ ...VAZIO, is_icms_contributor: true })).toBe(true)
    })

    it('o PRIMEIRO campo com conteúdo liga a trava — o critério é por cliente', () => {
        expect(temAlgumaInformacaoExtra({ ...VAZIO, email: 'a@b.c' })).toBe(true)
        expect(temAlgumaInformacaoExtra({ ...VAZIO, document: '123' })).toBe(true)
        expect(temAlgumaInformacaoExtra({ ...VAZIO, city: 'Porto Alegre' })).toBe(true)
        expect(temAlgumaInformacaoExtra({ ...VAZIO, notes: 'cliente antigo' })).toBe(true)
    })

    const base = {
        nome: 'Alfa Ltda', situacao: 'ACTIVE',
        resolverResponsavel: (): string | null => null,
        aoAlternarMais: () => {},
        temCobranca: false,
        resumo: montarResumoDoCliente({ historico: [], agregado: undefined }),
    }

    // MUTAÇÃO: renderizar o botão sempre.
    it('EM CONSULTA o botão NÃO aparece para cliente vazio', () => {
        const t = montar(<CabecalhoDaFicha {...base} cliente={VAZIO} maisAberto={false} emEdicao={false} />)
        expect(t.texto()).not.toContain(ROTULO_MAIS_INFORMACOES)
        t.desmontar()
    })

    it('EM CONSULTA ele aparece quando um campo tem conteúdo', () => {
        const t = montar(<CabecalhoDaFicha {...base} cliente={{ ...VAZIO, email: 'a@b.c' }} maisAberto={false} emEdicao={false} />)
        expect(t.texto()).toContain(ROTULO_MAIS_INFORMACOES)
        t.desmontar()
    })

    it('EM EDIÇÃO ele aparece SEMPRE — é onde se preenche', () => {
        const t = montar(<CabecalhoDaFicha {...base} cliente={VAZIO} maisAberto={false} emEdicao />)
        expect(t.texto()).toContain(ROTULO_MAIS_INFORMACOES)
        t.desmontar()
    })

    it('o bloco aberto lista os sete campos, com travessão no que falta', () => {
        const t = montar(<CabecalhoDaFicha {...base} cliente={{ ...VAZIO, email: 'a@b.c' }} maisAberto emEdicao={false} />)
        const bloco = t.host.querySelector('[data-testid="bloco-mais-informacoes"]')!
        expect(bloco.textContent).toContain('a@b.c')
        expect(bloco.textContent).toContain('—')
        expect(informacoesExtras({ ...VAZIO, email: 'a@b.c' }, () => null)).toHaveLength(7)
        t.desmontar()
    })

    // O e-mail SAI do cabeçalho: ele só existe dentro do bloco.
    it('o cabeçalho enxuto não mostra o e-mail nem o documento com o bloco FECHADO', () => {
        const cliente = { ...VAZIO, email: 'a@b.c', document: '12.345.678/0001-90' }
        const t = montar(<CabecalhoDaFicha {...base} cliente={cliente} maisAberto={false} emEdicao={false} />)
        expect(t.texto()).not.toContain(cliente.email)
        expect(t.texto()).not.toContain(cliente.document)
        t.desmontar()
    })
})

describe('2 — uma lista, por vencimento crescente, MISTURANDO vendas', () => {
    // MUTAÇÃO: agrupar por venda.
    it('a ordem é a do calendário, e as duas vendas se intercalam', () => {
        expect(VENCIMENTOS.datadas.map((l) => l.id)).toEqual(['pa1', 'po1', 'pb1', 'pa2', 'pb2'])
        const codigos = VENCIMENTOS.datadas.map((l) => l.codigoDaVenda)
        // Agrupado por venda, os iguais ficariam adjacentes. Aqui NÃO ficam.
        expect(codigos).toEqual(['VD-121365', null, 'AG-1368A8', 'VD-121365', 'AG-1368A8'])
    })

    it('o bloco SEM VENCIMENTO nasce vazio — `due_date` nulo em 0 de 1.659', () => {
        expect(VENCIMENTOS.semVencimento).toHaveLength(0)
    })

    /**
     * O CASO QUE FALTAVA, e ele é um defeito de instrumento meu.
     *
     * Os dois casos acima afirmam o DADO (`semVencimento` tem 0 itens). A mutação "renderizar
     * o bloco sempre" os deixou VERDES, porque nenhum deles olha a TELA. É
     * `teste-que-nao-exercita.md` na forma mais direta: a asserção mede o insumo e não o
     * efeito. Estes dois afirmam o efeito, e a negativa compara contra a constante exportada.
     */
    // MUTAÇÃO: renderizar o bloco sem vencimento sempre.
    it('sem linha sem data, o BLOCO não aparece na tela', () => {
        const t = montar(
            <ListaDeVencimentos vencimentos={VENCIMENTOS} selecionados={[]} aoSelecionar={() => {}} aoAbrirParcela={() => {}} />,
        )
        expect(t.texto()).not.toContain(TITULO_SEM_VENCIMENTO_LISTA)
        t.desmontar()
    })

    it('com linha sem data, o bloco aparece COM ela', () => {
        const comSemData = montarVencimentosDaFicha({
            parcelas: montarParcelasDoCliente({
                parcelas: [...PARCELAS, linha({ id: 'psd', origin_id: VENDAS[0].id, due_date: null, amount: 5 })],
                vendas: VENDAS, hoje: HOJE, escopo: 'TODAS',
            }).parcelas.filter((p) => p.customerId === 'c1'),
            vendas: VENDAS,
        })
        const t = montar(
            <ListaDeVencimentos vencimentos={comSemData} selecionados={[]} aoSelecionar={() => {}} aoAbrirParcela={() => {}} />,
        )
        expect(t.texto()).toContain(TITULO_SEM_VENCIMENTO_LISTA)
        expect(t.texto()).toContain(formatBRL(5))
        t.desmontar()
    })

    it('e ele aparece quando houver linha sem data', () => {
        const comSemData = montarVencimentosDaFicha({
            parcelas: montarParcelasDoCliente({
                parcelas: [...PARCELAS, linha({ id: 'psd', origin_id: VENDAS[0].id, due_date: null, amount: 5 })],
                vendas: VENDAS, hoje: HOJE, escopo: 'TODAS',
            }).parcelas.filter((p) => p.customerId === 'c1'),
            vendas: VENDAS,
        })
        expect(comSemData.semVencimento.map((l) => l.id)).toEqual(['psd'])
    })
})

describe('3 — o código da venda, nunca o uuid', () => {
    const abrir = () => {}
    // MUTAÇÃO: exibir o `saleId` no lugar do código.
    it('a linha mostra o `sale_code`; a órfã mostra travessão e NENHUM link', () => {
        const t = montar(
            <ListaDeVencimentos vencimentos={VENCIMENTOS} selecionados={[]} aoSelecionar={() => {}} aoAbrirParcela={abrir} />,
        )
        expect(t.texto()).toContain('VD-121365')
        expect(t.texto()).toContain('AG-1368A8')
        // A negativa compara contra o PRODUTO — os ids da fixture, não um literal.
        for (const v of VENDAS) expect(t.texto()).not.toContain(v.id)
        expect(t.texto()).not.toContain('99999999-9999-9999-9999-999999999999')
        t.desmontar()
    })

    it('a órfã fica com `codigoDaVenda` e `saleId` nulos', () => {
        const orfa = TODAS.find((l) => l.id === 'po1')!
        expect(orfa.codigoDaVenda).toBeNull()
        expect(orfa.saleId).toBeNull()
    })
})

describe('4 — a autossoma, em centavos inteiros', () => {
    // MUTAÇÃO: somar em float.
    it('três selecionadas dão a soma EXATA, e em float dariam dízima', () => {
        const ids = ['pa1', 'pb1', 'pa2'] // 10,10 + 20,20 + 30,30
        expect(10.1 + 20.2 + 30.3).not.toBe(60.6)
        expect(somarSelecionadas(TODAS, ids)).toBe(60.6)
        expect(contarSelecionadas(TODAS, ids)).toBe(3)
    })

    it('a soma atravessa vendas — é o ponto da lista única', () => {
        const ids = ['pa1', 'pb1']
        const vendasEnvolvidas = new Set(TODAS.filter((l) => ids.includes(l.id)).map((l) => l.codigoDaVenda))
        expect(vendasEnvolvidas.size).toBe(2)
        expect(somarSelecionadas(TODAS, ids)).toBe(30.3)
    })

    it('o rodapé só aparece com seleção, e mostra o total', () => {
        const vazio = montar(
            <ListaDeVencimentos vencimentos={VENCIMENTOS} selecionados={[]} aoSelecionar={() => {}} aoAbrirParcela={() => {}} />,
        )
        expect(vazio.host.querySelector('[data-testid="rodape-da-soma"]')).toBeNull()
        vazio.desmontar()

        const cheio = montar(
            <ListaDeVencimentos vencimentos={VENCIMENTOS} selecionados={['pa1', 'pb1', 'pa2']} aoSelecionar={() => {}} aoAbrirParcela={() => {}} />,
        )
        const rodape = cheio.host.querySelector('[data-testid="rodape-da-soma"]')!
        expect(rodape.textContent).toContain('3 parcelas selecionadas')
        expect(rodape.textContent).toContain(ROTULO_DO_TOTAL_SELECIONADO)
        expect(rodape.textContent).toContain(formatBRL(60.6))
        cheio.desmontar()
    })
})

describe('5 — parcela paga não é selecionável', () => {
    // MUTAÇÃO: marcar a paga como selecionável.
    it('a paga tem `selecionavel: false`, e as outras `true`', () => {
        expect(TODAS.find((l) => l.id === 'pb2')!.estado).toBe('PAGA')
        expect(TODAS.find((l) => l.id === 'pb2')!.selecionavel).toBe(false)
        expect(TODAS.filter((l) => l.id !== 'pb2').every((l) => l.selecionavel)).toBe(true)
    })

    it('a trava está TAMBÉM na soma: id de paga na seleção não soma', () => {
        expect(somarSelecionadas(TODAS, ['pb2'])).toBe(0)
        expect(contarSelecionadas(TODAS, ['pb2'])).toBe(0)
        // E não contamina a soma das demais.
        expect(somarSelecionadas(TODAS, ['pa1', 'pb2'])).toBe(10.1)
    })

    it('o checkbox da paga renderiza desabilitado', () => {
        const t = montar(
            <ListaDeVencimentos vencimentos={VENCIMENTOS} selecionados={[]} aoSelecionar={() => {}} aoAbrirParcela={() => {}} />,
        )
        const linhas = Array.from(t.host.querySelectorAll('tbody tr.ant-table-row'))
        const daPaga = linhas.find((tr) => (tr.textContent || '').includes(formatBRL(40.4)))!
        expect((daPaga.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true)
        const daAberta = linhas.find((tr) => (tr.textContent || '').includes(formatBRL(10.1)))!
        expect((daAberta.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(false)
        t.desmontar()
    })
})

describe('6 — a tela da parcela, por endereço', () => {
    it('o id resolve e a tela mostra a parcela e a venda', () => {
        const l = acharLinha(VENCIMENTOS, 'pa1')!
        const t = montar(
            <TelaDaParcela
                linha={l}
                venda={{ codigo: 'VD-121365', efetivadaEm: '2026-09-01', vendedor: 'Fulano', formaCombinada: 'BOLETO' }}
                irmas={irmasDaMesmaSerie(VENCIMENTOS, l)}
                aoFechar={() => {}}
                hoje={HOJE}
                podeDarBaixa={false}
            />,
        )
        expect(t.texto()).toContain('VD-121365')
        expect(t.texto()).toContain('01/09/2026')
        expect(t.texto()).toContain('Fulano')
        expect(t.texto()).toContain('BOLETO')
        expect(t.texto()).toContain(formatBRL(10.1))
        t.desmontar()
    })

    it('as outras parcelas da MESMA série aparecem, e só elas', () => {
        const l = acharLinha(VENCIMENTOS, 'pa1')!
        const irmas = irmasDaMesmaSerie(VENCIMENTOS, l)
        expect(irmas.map((i) => i.id)).toEqual(['pa1', 'pa2'])
        const t = montar(
            <TelaDaParcela linha={l} venda={{}} irmas={irmas} aoFechar={() => {}} hoje={HOJE} podeDarBaixa={false} />,
        )
        expect(t.texto()).toContain(formatBRL(30.3))
        // A parcela da OUTRA venda não entra.
        expect(t.texto()).not.toContain(formatBRL(20.2))
        t.desmontar()
    })

    it('id que NÃO resolve mostra o estado, sem derrubar nada', () => {
        expect(acharLinha(VENCIMENTOS, 'nao-existe')).toBeNull()
        const t = montar(
            <TelaDaParcela linha={null} venda={{}} irmas={[]} aoFechar={() => {}} hoje={HOJE} podeDarBaixa={false} />,
        )
        expect(t.texto()).toContain(TEXTO_PARCELA_NAO_ENCONTRADA)
        t.desmontar()
    })

    it('parcela órfã não tem irmãs — sem venda, não há série', () => {
        const orfa = acharLinha(VENCIMENTOS, 'po1')!
        expect(irmasDaMesmaSerie(VENCIMENTOS, orfa)).toEqual([])
    })
})

describe('7 — a tela da parcela escreve UMA coisa só, e é a baixa de UMA parcela', () => {
    // Este describe afirmava AUSÊNCIA de botão na 5a. Com a 5b ele afirma a PRESENÇA DESTE
    // e só dele — é o mesmo papel: impedir que a 5c (seleção múltipla e valor diferente)
    // entre sem comando.
    const comBaixa = {
        hoje: HOJE,
        podeDarBaixa: true,
        aoDarBaixa: async () => {},
    }

    it('com permissão e parcela em aberto, os botões são Voltar e a baixa — nada mais', () => {
        const l = acharLinha(VENCIMENTOS, 'pa1')!
        const t = montar(
            <TelaDaParcela
                linha={l}
                venda={{ codigo: 'VD-121365', efetivadaEm: '2026-09-01', vendedor: 'Fulano', formaCombinada: 'BOLETO' }}
                irmas={irmasDaMesmaSerie(VENCIMENTOS, l)}
                aoFechar={() => {}}
                {...comBaixa}
            />,
        )
        const rotulos = Array.from(t.host.querySelectorAll('button')).map((b) => (b.textContent || '').trim())
        expect(rotulos).toEqual(['Voltar', ROTULO_DAR_BAIXA])
        t.desmontar()
    })

    // MUTAÇÃO: acrescentar campo de valor, ou seleção múltipla, na tela da parcela.
    it('SEM OUTRA PARCELA EM ABERTO, NÃO existe campo de valor — a camada de cima da regra 5', () => {
        const l = acharLinha(VENCIMENTOS, 'pa1')!
        const t = montar(
            <TelaDaParcela linha={l} venda={{ codigo: 'VD-121365' }} irmas={[]} aoFechar={() => {}} {...comBaixa} />,
        )
        const painel = t.host.querySelector('[data-testid="tela-da-parcela"]')!
        expect(painel.querySelector('[data-testid="valor-da-baixa"]')).toBeNull()
        // Nenhum checkbox: seleção múltipla não mora aqui.
        expect(painel.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
        expect(painel.querySelectorAll('textarea')).toHaveLength(0)
        t.desmontar()
    })

    it('a data da baixa é VISÍVEL antes de confirmar, e é o `hoje` injetado', () => {
        const l = acharLinha(VENCIMENTOS, 'pa1')!
        const t = montar(
            <TelaDaParcela linha={l} venda={{ codigo: 'VD-121365' }} irmas={[]} aoFechar={() => {}} {...comBaixa} />,
        )
        expect(t.host.querySelector('[data-testid="data-da-baixa"]')!.textContent).toBe(diaBR(HOJE))
        t.desmontar()
    })

    // O lote (5c.2) mora FORA da tabela, num bloco próprio — `o-lote-na-ficha.test.tsx`. Cada
    // LINHA continua só com "Abrir": a baixa de uma é na tela da parcela.
    it('cada LINHA da lista segue só com "Abrir" — o lote é bloco à parte', () => {
        const t = montar(
            <ListaDeVencimentos vencimentos={VENCIMENTOS} selecionados={['pa1']} aoSelecionar={() => {}} aoAbrirParcela={() => {}} />,
        )
        const rotulos = Array.from(t.host.querySelectorAll('tbody button')).map((b) => (b.textContent || '').trim())
        expect(new Set(rotulos)).toEqual(new Set(['Abrir']))
        expect(rotulos.some((r) => /baixa|receber|pagar|confirmar/i.test(r))).toBe(false)
        t.desmontar()
    })
})
