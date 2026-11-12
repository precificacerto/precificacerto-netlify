/**
 * @jest-environment node
 *
 * PORTÃO — o ARQUIVO "ORÇAMENTO" no modelo WVetro (dono do produto, 11/11/2026): a estrutura, de cima para baixo; o valor por item pelo rateio
 * exato (total = unitário × quantidade, Σ = a interna); nada de custo, margem, comissão, RT, lucro ou imposto; vazio é vazio; a observação do item
 * em vermelho; as recusas nomeadas; e os mesmos bytes para a mesma entrada.
 */
import {
    COLUNAS_DO_ITEM, GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA, O_QUE_O_ORCAMENTO_COBRE, carimboDoParcial, conferirArquivoDoOrcamento, dataDeEntrega, fraseDaVendaDiferente,
    gerarArquivoDoOrcamento, linhaDoItem, nomeDoArquivo, recusaDoEnvioAoCliente, type DadosDoArquivoDoOrcamento, type ItemDoArquivo,
} from '@/lib/atendimentos-ia/arquivo-do-orcamento'
import { ratearOperacaoInterna, reais } from '@/lib/atendimentos-ia/rateio-do-orcamento'

/** O que a fonte padrão do PDF (WinAnsi) grava fora do latin1: o travessão, o marcador e as aspas curvas. */
const WIN_ANSI: Record<string, string> = { '\x97': '—', '\x95': '•', '\x93': '“', '\x94': '”' }
/** O texto desenhado no PDF (as cadeias dos operadores Tj), na ordem. */
const textoDoPdf = (pdf: Uint8Array) => [...Buffer.from(pdf).toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, '$1').replace(/[\x93-\x97]/g, (c) => WIN_ANSI[c] ?? c))
const cru = (pdf: Uint8Array) => Buffer.from(pdf).toString('latin1')
/** A altura (em pt, a partir do PÉ da página) em que o texto foi desenhado: o "y" do operador Td antes dele. */
const alturaDe = (pdf: Uint8Array, texto: string) => {
    const m = new RegExp(`([\\d.]+) ([\\d.]+) Td\\s*\\(${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\) Tj`).exec(cru(pdf))
    return m ? Number(m[2]) : null
}

const item = (ordem: number, extra: Partial<ItemDoArquivo> = {}): ItemDoArquivo => ({
    ordem, quantidade: 1, largura_mm: 2500, altura_mm: 2200, tipologia: 'DP-39', descricao: 'Porta de correr 2 folhas | Europa 60', tipo: 'Porta',
    fornecedor: 'Wolf', linha: 'EUROPA 60', ambientes: 'Sala (1)', corPerfil: 'Branco', corAcessorio: 'Branco', vidro: 'comum 6 mm incolor',
    variaveis: [], definicoes: [], obs: null, desenho: { largura_mm: 2500, altura_mm: 2200, colunas: 2, linhas: null, bandeira_mm: null, peitoril_mm: null }, ...extra,
})
// o Geraldo Huck: 3 itens, quantidades 1, 1 e 2, e os custos líquidos totais gravados em produção como pesos
const ITENS = [item(1), item(2, { tipologia: 'DP-01', descricao: 'Maxim-ar', largura_mm: 600, altura_mm: 600, vidro: 'mini boreal', ambientes: null }),
    item(3, { tipologia: 'DP-02', descricao: 'Janela de correr', largura_mm: 1600, altura_mm: 1200, quantidade: 2, vidro: 'incolor 4 mm comum', obs: 'instalar com cuidado no vão de gesso' })]
const INTERNA = 7488.37
const rateio = () => {
    const r = ratearOperacaoInterna(INTERNA, [{ ordem: 1, quantidade: 1, peso: 2594.146 }, { ordem: 2, quantidade: 1, peso: 421.209 }, { ordem: 3, quantidade: 2, peso: 2225.04 }])
    if ('recusa' in r) throw new Error(r.recusa)
    return r.itens
}
const dados = (extra: Partial<DadosDoArquivoDoOrcamento> = {}): DadosDoArquivoDoOrcamento => ({
    empresa: { razaoSocial: 'ESQUADRIAS DE PAULA LTDA', endereco: 'Rua das Flores, 100', cidadeUf: 'Porto Alegre/RS', cep: '90000-000', telefone: null, telefone2: null,
        cnpj: '12.345.678/0001-90', ie: '0960000000', site: null, email: null, logo: null },
    numero: 1, vendedor: 'Cristiano Fernandes', contato: null, emailDoVendedor: 'cristiano@exemplo.com',
    cliente: { nome: 'Geraldo Huck', telFixo: null, celular: '(51) 99999-0000', email: null, tel2: null, endereco: 'Porto Alegre', ieRg: null, cep: null, cnpjCpf: null },
    dataEntrega: null, itens: ITENS, observacoesGerais: null, operacaoInterna: INTERNA, valorVenda: INTERNA, rateio: rateio(), faltas: [], paraOVendedor: null,
    geradoEm: new Date('2026-11-11T15:30:00Z'), ...extra,
})
const gerar = (d = dados()) => { const g = gerarArquivoDoOrcamento(d); if ('recusas' in g) throw new Error(g.recusas.join(' | ')); return g }

describe('a estrutura, de cima para baixo', () => {
    it('o cabeçalho da empresa, a caixa ORÇAMENTO, o cliente, cada item com a faixa e a tabela, as OBSERVAÇÕES e o fecho — nessa ordem', () => {
        const t = textoDoPdf(gerar().pdf)
        const ordem = ['ESQUADRIAS DE PAULA LTDA', 'ORÇAMENTO', 'Número:', 'Emissão:', 'Vendedor:', 'Contato:', 'CLIENTE:', 'TEL. FIXO:', 'CELULAR:',
            'TEL2/Fax:', 'ENDEREÇO:', 'IE/RG:', 'CNPJ/CPF:', '*LOCAL/AMBIENTE:', 'TIPO:', 'PORTA DE CORRER 2 FOLHAS | EUROPA 60', '*COR PERFIL:', '*COR ACESSÓRIO:',
            'LINHA:', 'DATA ENTREGA:', ...COLUNAS_DO_ITEM.map((c) => c.titulo), 'OBSERVAÇÕES DESTE ITEM', 'OBSERVAÇÕES', 'Atenciosamente,', 'Dt.Venda:', 'Impresso em:', 'Aceite do Cliente']
        let k = -1
        for (const rotulo of ordem) {
            const achado = t.findIndex((x, j) => j > k && x === rotulo)
            expect([rotulo, achado > k]).toEqual([rotulo, true])
            k = achado
        }
        // o fecho termina com a razão social
        expect(t[t.length - 2]).toBe('ESQUADRIAS DE PAULA LTDA')
    })
    it('cada item tem a sua linha da tabela: ordem, quantidade, largura, altura, COR E ESPESSURA (o vidro), e os dois valores do rateio', () => {
        const t = textoDoPdf(gerar().pdf)
        for (const r of rateio()) {
            const i = ITENS.find((x) => x.ordem === r.ordem)!
            // cada coluna desenha o título e o valor: a sequência das três últimas colunas da linha do item, exata
            const v = t.indexOf(i.vidro!)
            expect(t.slice(v - 1, v + 5)).toEqual(['COR E ESPESSURA', i.vidro, 'VLR. UNIT.', reais(r.unitario), 'VLR. TOTAL', reais(r.total)])
            expect(t.slice(v - 9, v - 1)).toEqual(['ITEM', String(i.ordem), 'QTDE.', String(i.quantidade), 'LARGURA', new Intl.NumberFormat('pt-BR').format(i.largura_mm!), 'ALTURA', new Intl.NumberFormat('pt-BR').format(i.altura_mm!)])
        }
    })
})

describe('o dinheiro: o rateio exato, e nada que não é do cliente', () => {
    it('total do item = unitário × quantidade, e o TOTAL do fecho = Σ dos itens = a interna', () => {
        const r = rateio()
        for (const x of r) expect(x.total).toBe(x.unitario * x.quantidade)
        expect(r.reduce((s, x) => s + x.total, 0)).toBe(748837)
        expect(textoDoPdf(gerar().pdf)).toContain(`TOTAL: ${reais(748837)}`)
    })
    it('NÃO imprime percentual nenhum (comissão, RT, lucro, imposto, margem): nenhum "%" no texto', () => {
        for (const linha of textoDoPdf(gerar().pdf)) expect([linha, linha.includes('%')]).toEqual([linha, false])
    })
    it('o tipo dos dados nem carrega custo, margem ou imposto (a fixture tem só o que o cliente vê)', () => {
        const campos = Object.keys(dados()).sort()
        expect(campos).toEqual(['cliente', 'contato', 'dataEntrega', 'emailDoVendedor', 'empresa', 'faltas', 'geradoEm', 'itens', 'numero', 'observacoesGerais',
            'operacaoInterna', 'paraOVendedor', 'rateio', 'valorVenda', 'vendedor'])
    })
})

describe('vazio é vazio, a observação em vermelho, a data de entrega', () => {
    it('campo sem dado sai em branco: nada de "null", "undefined" nem zero no lugar', () => {
        for (const linha of textoDoPdf(gerar().pdf)) expect([linha, /null|undefined|NaN/.test(linha)]).toEqual([linha, false])
        const t = textoDoPdf(gerar().pdf)
        // o rótulo do telefone 2 está lá, e o que vem depois dele é o próximo rótulo (o valor não foi escrito)
        expect(t[t.indexOf('Telefone 2:') + 1]).toBe('CNPJ:')
    })
    it('a observação do item em VERMELHO, logo depois da faixa', () => {
        const pdf = cru(gerar().pdf)
        expect(pdf).toMatch(/0\.784 0\.118 0\.118 rg[\s\S]{0,80}\(instalar com cuidado no vão de gesso\) Tj/)
    })
    it('a data de entrega em dd/mm/aaaa; sem ela, o campo em branco do modelo', () => {
        expect(dataDeEntrega('2026-12-01')).toBe('01/12/2026')
        expect(dataDeEntrega(null)).toBe(' / / ')
        expect(dataDeEntrega('dezembro')).toBe(' / / ')
        expect(textoDoPdf(gerar(dados({ dataEntrega: '2026-12-01' })).pdf)).toContain('01/12/2026')
    })
    it('a linha do item: fornecedor | linha, só o que existe', () => {
        expect(linhaDoItem({ fornecedor: 'Wolf', linha: 'EUROPA 60' })).toBe('Wolf | EUROPA 60')
        expect(linhaDoItem({ fornecedor: null, linha: 'EUROPA 60' })).toBe('EUROPA 60')
        expect(linhaDoItem({ fornecedor: null, linha: null })).toBe('')
    })
    it('sem medida o item fecha sem desenho, sem quebrar', () => {
        expect(gerarArquivoDoOrcamento(dados({ itens: ITENS.map((i): ItemDoArquivo => ({ ...i, desenho: null })) })).ok).toBe(true)
    })
})

describe('as recusas, nomeadas — nunca um arquivo aproximado', () => {
    it('a venda diferente da interna (tributos por fora ou despesa acessória): recusa, porque imprimir a diferença seria imprimir imposto', () => {
        expect(conferirArquivoDoOrcamento(dados({ valorVenda: 7700 }))).toEqual([fraseDaVendaDiferente(7700, INTERNA)])
    })
    it('o rateio que não fecha com a interna, o item fora do rateio, a quantidade divergente, sem cliente ou sem empresa', () => {
        const r = rateio()
        expect(conferirArquivoDoOrcamento(dados({ rateio: r.map((x, k) => (k === 0 ? { ...x, total: x.total + 1, unitario: x.unitario + 1 } : x)) })).join(' ')).toContain('não fecha com a operação interna')
        expect(conferirArquivoDoOrcamento(dados({ rateio: r.slice(1) })).join(' ')).toContain('o valor do item 1: ele não está no rateio')
        expect(conferirArquivoDoOrcamento(dados({ itens: ITENS.map((i) => (i.ordem === 3 ? { ...i, quantidade: 3 } : i)) })).join(' ')).toContain('o rateio usou 2 unidade(s) e o item tem 3')
        expect(conferirArquivoDoOrcamento(dados({ cliente: { ...dados().cliente, nome: ' ' } }))).toContain('o nome do cliente')
        expect(conferirArquivoDoOrcamento(dados({ empresa: { ...dados().empresa, razaoSocial: '' } }))).toContain('a razão social da empresa')
        expect(gerarArquivoDoOrcamento(dados({ valorVenda: 7700 })).ok).toBe(false)
    })
})

describe('determinismo e paginação', () => {
    it('a mesma entrada dá os mesmos bytes, e o nome do arquivo sem caractere que o sistema de arquivos recusa', () => {
        expect(Buffer.from(gerar().pdf).equals(Buffer.from(gerar().pdf))).toBe(true)
        expect(nomeDoArquivo(1151, 'Ana / Bia: "obra"')).toBe('Orcamento 1151 - Ana Bia obra .pdf'.replace(' .pdf', '.pdf'))
    })
    it('muitos itens: mais de uma página, numeradas, e o fecho na última', () => {
        const muitos = Array.from({ length: 14 }, (_, k) => item(k + 1))
        const r = ratearOperacaoInterna(14000, muitos.map((i) => ({ ordem: i.ordem, quantidade: 1, peso: 1 })))
        if ('recusa' in r) throw new Error(r.recusa)
        const g = gerar(dados({ itens: muitos, rateio: r.itens, operacaoInterna: 14000, valorVenda: 14000 }))
        expect(g.paginas).toBeGreaterThan(1)
        const t = textoDoPdf(g.pdf)
        expect(t).toContain(`Orçamento 1 · Página 1 de ${g.paginas}`)
        expect(t.indexOf('Aceite do Cliente')).toBeGreaterThan(t.lastIndexOf('*LOCAL/AMBIENTE:'))
    })
})

describe('O ARQUIVO VAI AO VENDEDOR (12/11/2026, o comando único)', () => {
    const FALTAS = [{ codigo: 'SF92/WOLFF', frase: 'SF92/WOLFF não está na tabela de preço', itens: [1, 3] }, { codigo: 'VIDRO', frase: 'o vidro “mini boreal” bate com 5 itens', itens: [2] }]
    const PARA = {
        barras: [{ codigo: '9691', descricao: 'SF92 - FOLHA DE PORTA', n_barras: 3, comprimento_m: 6 }],
        aproveitamento: { pct: 81.25, metros_uteis: 14.625, metros_comprados: 18 }, minutos: [{ ordem: 1, minutos: 600 }, { ordem: 2, minutos: null }, { ordem: 3, minutos: 300 }],
    }
    it('1.5 — PARCIAL: o carimbo com o número de faltas, e a lista das faltas com os itens', () => {
        const t = textoDoPdf(gerar(dados({ faltas: FALTAS })).pdf).join('\n')
        // o carimbo é uma linha SÓ DELE (o título da lista das faltas também cita o parcial, e não conta)
        expect(t.split('\n').filter((l) => l === carimboDoParcial(2))).toHaveLength(1)
        expect(carimboDoParcial(2)).toBe('PARCIAL — faltam 2 valores')
        expect(carimboDoParcial(1)).toBe('PARCIAL — falta 1 valor')
        expect(t).toContain('• SF92/WOLFF (itens 1, 3): SF92/WOLFF não está na tabela de preço.')
        expect(t).toContain('• VIDRO (item 2)')
    })
    it('sem falta, nem carimbo nem lista', () => {
        const t = textoDoPdf(gerar().pdf).join('\n')
        expect(t).not.toContain(carimboDoParcial(0).split(' — ')[0])
        expect(t).not.toContain('FALTAS DE PREÇO')
    })
    it('4.3 — o que a conversa deixou de mandar: barras, aproveitamento, mão de obra EM MINUTOS e o que o preço cobre — sem reais', () => {
        const linhas = textoDoPdf(gerar(dados({ paraOVendedor: PARA })).pdf)
        const t = linhas.join('\n')
        expect(t).toContain('PARA O VENDEDOR')
        expect(t).toContain('• 9691 (SF92 - FOLHA DE PORTA): 3 barra(s) de 6,00 m')
        expect(t).toContain('Aproveitamento: 81,3% (14,63 m úteis de 18,00 m comprados).')
        expect(t).toContain('Mão de obra: item 1: 600 min · item 2: sem tempo · item 3: 300 min.')
        expect(t.replace(/\s+/g, ' ')).toContain(O_QUE_O_ORCAMENTO_COBRE.slice(0, 60))
        // a mão de obra não sai em reais: o bloco do vendedor não tem "R$"
        const doBloco = linhas.slice(linhas.indexOf('PARA O VENDEDOR'), linhas.indexOf('OBSERVAÇÕES'))
        expect(doBloco.some((l) => l.includes('R$'))).toBe(false)
    })
    it('4.2 — as definições de instalação e arremate de cada esquadria, com "(padrão)" na que o vendedor não disse', () => {
        const itens = [item(1, { definicoes: ['ARREMATE INTERNO: 65 mm', 'ARREMATE EXTERNO: sem (padrão)'] }), ITENS[1], ITENS[2]]
        const t = textoDoPdf(gerar(dados({ itens })).pdf).join(' ')
        expect(t).toContain('DEFINIÇÕES: ARREMATE INTERNO: 65 mm · ARREMATE EXTERNO: sem (padrão)')
    })
    it('4.1 — o RODAPÉ no PÉ da página, sempre: as observações e o fecho encostados no fim, com poucos itens também', () => {
        const pdf = gerar().pdf
        const aceite = alturaDe(pdf, 'Aceite do Cliente')!
        const obs = alturaDe(pdf, 'OBSERVAÇÕES')!
        // A4 = 841,89 pt; o fecho acaba a ~22 mm do pé (62 pt) — com 3 itens ele ficava no meio da página
        expect(aceite).toBeLessThan(80)
        expect(obs).toBeLessThan(200)
        expect(obs).toBeGreaterThan(aceite)
    })
    it('1.5 — a GUARDA do envio ao cliente está escrita e DESLIGADA: ligada, o parcial não vai ao cliente', () => {
        expect(GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA).toBe(false)
        expect(recusaDoEnvioAoCliente({ numero: 7, faltas: FALTAS })).toBeNull()
        expect(recusaDoEnvioAoCliente({ numero: 7, faltas: FALTAS }, true)).toBe('o orçamento 7 está PARCIAL (faltam 2 valores): ele vai ao vendedor, não ao cliente, até as faltas serem resolvidas')
        expect(recusaDoEnvioAoCliente({ numero: 7, faltas: [] }, true)).toBeNull()
    })
})
