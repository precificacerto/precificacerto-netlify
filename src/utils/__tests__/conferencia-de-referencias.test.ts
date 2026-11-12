/**
 * PORTÃO — A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR (dono do produto, 12/11/2026). Duas partes:
 *   (1) a escada, degrau por degrau, com casos sintéticos — cada degrau acha o que deve e recusa o que não deve;
 *   (2) A FOTOGRAFIA DE PRODUÇÃO de 12/11/2026 (motor 022fc55e, as 9 tabelas com itens), lida só para leitura: os números de hoje presos, para que
 *       um motor ou uma tabela nova que os mude acenda este teste.
 *
 * A FOTOGRAFIA (fixtures/conferencia-de-referencias/) traz só o que a conferência lê: o código, o código WVetro, a descrição e as contagens das
 * regras; o código e a descrição de cada item, o fornecedor, a categoria e, de cada campo de preço, crédito e NCM, só se EXISTE (1) ou não
 * (vazio) — nenhum valor de preço vai ao repositório. sha256 da extração: referencias.tsv 8086da9a…, itens.tsv 611631a6…, tabelas.tsv abc411a2….
 *
 * OS NÚMEROS — medidos, não os da conferência à mão. O pedido dizia 549 / 456 / 1 / 92. Pela escada que o próprio pedido define, na ordem dele, o
 * degrau 2 (o código do item sem o sufixo /WOLFF) acha mais 34 códigos, todos com preço: 549 / 490 / 1 / 58. Os 92 eram os não achados só pelo
 * código exato; a tabela traz 138 itens com o sufixo no código (`1326/WOLFF`), que o casamento exato não vê.
 */
import fs from 'fs'
import path from 'path'
import {
    agregarRegras, baseDoWvetro, comDescricaoDivergente, conferirReferencias, descricaoNormalizada, itensDoDegrau, semSufixo, sufixoDoFornecedor,
    type ItemParaConferir, type ReferenciaDoMotor,
} from '@/lib/atendimentos-ia/conferencia-de-referencias'

const item = (codigo: string, descricao: string, extra: Partial<ItemParaConferir> = {}): ItemParaConferir => ({
    codigo, descricao, custo: 10, valor_barra_interno: null, valor_metro_interno: null, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: null,
    nc_ipi_pct: null, ncm: '39162000', tabela_id: 't1', tabela_arquivo: 'Tabela.xlsx', fornecedor: 'Wolf', categoria: 'PERFIL', ...extra,
})
const ref = (codigo: string, codigo_wvetro: string | null, descricao: string, regras = 1): ReferenciaDoMotor => ({ codigo, codigo_wvetro, descricao, regras, tipologias: 1 })

describe('(1) a escada, na ordem do pedido', () => {
    it('as formas: o sufixo do fornecedor sai, e só ele — nem zero, nem caixa, nem ponto', () => {
        expect(sufixoDoFornecedor('1326/WOLFF')).toBe('WOLFF')
        expect(sufixoDoFornecedor('1326/wolff')).toBe('WOLFF')
        expect(sufixoDoFornecedor('1326')).toBeNull()
        expect(semSufixo('1326/WOLFF')).toBe('1326')
        expect(semSufixo('0123/WOLFF')).toBe('0123')
        expect(semSufixo('94718.1')).toBe('94718.1')
        expect(baseDoWvetro('BR60/WOLFF')).toBe('BR60')
        expect(baseDoWvetro(null)).toBeNull()
        expect(baseDoWvetro('  ')).toBeNull()
        expect(descricaoNormalizada('Calço  de vidro - 1mm')).toBe('CALCO DE VIDRO 1MM')
        expect(descricaoNormalizada(null)).toBe('')
    })

    it('1) exato: o código da regra é o do item', () => {
        const c = conferirReferencias([ref('9471', 'BR60/WOLFF', 'BR60 - MARCO GIRO - BRANCO')], [item('9471', 'BR60 - MARCO GIRO - BRANCO')])
        expect(c.comPreco.map((r) => [r.codigo, r.degrau, r.itens[0].codigo])).toEqual([['9471', 'exato', '9471']])
    })

    it('2) sem o sufixo: 1326/WOLFF é o 1326 — com o sufixo da regra; outro sufixo não casa; a BASE do WVetro nunca é o que se compara', () => {
        const r = ref('1326', '1326/WOLFF', 'PONTEIRA DE EIXO OITAVADO 40MM')
        expect(conferirReferencias([r], [item('1326/WOLFF', 'PONTEIRA DE EIXO OITAVADO 40MM')]).comPreco[0].degrau).toBe('sem_sufixo')
        expect(itensDoDegrau('sem_sufixo', r, [item('1326/CELSUS', 'PONTEIRA DE EIXO OITAVADO 40MM')])).toEqual([])
        // a regra sem código WVetro não tem sufixo a conferir
        expect(itensDoDegrau('sem_sufixo', { ...r, codigo_wvetro: null }, [item('1326/WOLFF', 'x')])).toEqual([])
        // o caso que a leitura pela base erraria: 83841 (persiana PVC, base 8384) contra o 8384 da Celsus (uma cremona)
        const persiana = ref('83841', '8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO')
        expect(itensDoDegrau('sem_sufixo', persiana, [item('8384', 'CREMONA ZAMAK 1 PONTO OCULTA EP BR', { fornecedor: 'CELSUS' })])).toEqual([])
    })

    it('3) base + cor: só com a descrição batendo — o PREFIXO SOZINHO NÃO VALE (17569 é maçaneta, não a veneziana 17561)', () => {
        const veneziana = ref('17561', '1756/WOLFF', 'VENEZIANA TROPICAL COM VENTILAÇÃO - BRANCO')
        expect(itensDoDegrau('base_e_cor', veneziana, [item('17569', 'MAÇANETA CELSUS MD1 QUADRI EIXO 35MM PRETO FOSCO RAL9005')])).toEqual([])
        const c = conferirReferencias([veneziana], [item('175601', 'Veneziana tropical com ventilação — branco')])
        expect(c.comPreco.map((r) => [r.degrau, r.itens[0].codigo])).toEqual([['base_e_cor', '175601']])
        // sem código WVetro, ou sem descrição na regra, o degrau não tenta
        expect(itensDoDegrau('base_e_cor', { ...veneziana, codigo_wvetro: null }, [item('175601', veneziana.descricao!)])).toEqual([])
        expect(itensDoDegrau('base_e_cor', { ...veneziana, descricao: null }, [item('175601', '')])).toEqual([])
    })

    it('4) a descrição, em qualquer código: PALPITE, na lista de quem confirma — nunca em "com preço"', () => {
        const c = conferirReferencias([ref('X1', 'X1/WOLFF', 'TRILHO Z ALUMINIO 25MM')], [item('ZZ9', 'Trilho "Z" alumínio 25mm')])
        expect(c.porPalpite.map((r) => [r.codigo, r.degrau, r.itens[0].codigo])).toEqual([['X1', 'palpite_por_descricao', 'ZZ9']])
        expect(c.comPreco).toEqual([])
        expect(c.semPreco).toEqual([])
    })

    it('a ordem manda: o degrau de cima que acha vale, e os de baixo não são tentados', () => {
        const r = ref('1326', '1326/WOLFF', 'PONTEIRA')
        const c = conferirReferencias([r], [item('1326', 'PONTEIRA', { tabela_id: 'exato' }), item('1326/WOLFF', 'PONTEIRA', { tabela_id: 'sufixo' }), item('Q', 'PONTEIRA', { tabela_id: 'palpite' })])
        expect(c.comPreco[0].degrau).toBe('exato')
        expect(c.comPreco[0].itens.map((i) => i.tabela_id)).toEqual(['exato'])
    })

    it('com preço é custo, valor da barra OU valor do metro; zero é preço (ausente não é zero); sem nenhum é "sem preço"', () => {
        const r = ref('A', null, 'A')
        const de = (x: Partial<ItemParaConferir>) => conferirReferencias([r], [item('A', 'A', { custo: null, ...x })])
        expect(de({}).semPreco.map((x) => x.codigo)).toEqual(['A'])
        expect(de({ valor_barra_interno: 5 }).comPreco.length).toBe(1)
        expect(de({ valor_metro_interno: 5 }).comPreco.length).toBe(1)
        expect(de({ custo: 0 }).comPreco.length).toBe(1)
        expect(de({ custo: Number.NaN }).semPreco.length).toBe(1)
    })

    it('o item diz o crédito, o NCM e de onde vem; null fica null (nunca zero); o NCM em branco é ausente', () => {
        const c = conferirReferencias([ref('A', null, 'A')], [item('A', 'A', { cred_ipi_pct: 0, ncm: '  ', tabela_arquivo: 'X.xlsx', fornecedor: 'Wolf', categoria: 'REFORCO' })])
        expect(c.comPreco[0].itens[0]).toMatchObject({
            credito: { icms: 12, pis_cofins: 9.25, ipi: 0, ipi_nao_creditavel: null }, ncm: null, tabela_arquivo: 'X.xlsx', fornecedor: 'Wolf', categoria: 'REFORCO',
            preco: { custo: 10, valor_barra: null, valor_metro: null },
        })
    })

    it('a descrição que diverge é marcada (o código casou; alguém confere se é o mesmo produto)', () => {
        const c = conferirReferencias([ref('132114', '132114/WOLFF', 'PASSADOR DE CADARÇO C20 - MARROM'), ref('9411', '9411/WOLFF', 'CORTA VENTO - BRANCO'), ref('905320', 'BZ1770/WOLFF', 'BZ1770 - GUARNIÇÃO 17X70MM - PRETO')],
            [item('132114/WOLFF', 'PASSA FITA INFERIOR - MARROM'), item('9411/WOLFF', 'Corta vento — branco'), item('905320', 'GUARNIÇAO 17X70MM')])
        // só a do degrau 2: a do código exato (905320) tem outra redação, e o código cru é a identidade
        expect(comDescricaoDivergente(c).map((r) => r.codigo)).toEqual(['132114'])
        expect(c.comPreco.find((r) => r.codigo === '905320')!.itens[0].descricaoDiverge).toBe(true)
    })

    it('as listas em ordem de peso (o que mais regras cita primeiro), e o código cru desempata', () => {
        const c = conferirReferencias([ref('B', null, 'b', 2), ref('A', null, 'a', 2), ref('C', null, 'c', 9)], [])
        expect(c.naoAchadas.map((r) => r.codigo)).toEqual(['C', 'A', 'B'])
    })

    it('a agregação: o peso é a contagem de regras; as tipologias são distintas; o código cru é a chave (DP-017 ≠ DP-17, 0123 ≠ 123)', () => {
        const agregadas = agregarRegras([
            { codigo: '0123', codigo_wvetro: 'A/W', descricao: 'd', tipologias: ['DP-017', 'DP-02'] },
            { codigo: '0123', codigo_wvetro: 'A/W', descricao: 'd', tipologias: ['DP-02', 'DP-17'] },
            { codigo: '123', codigo_wvetro: 'A/W', descricao: 'd', tipologias: null },
        ])
        expect(agregadas).toEqual([
            { codigo: '0123', codigo_wvetro: 'A/W', descricao: 'd', regras: 2, tipologias: 3 },
            { codigo: '123', codigo_wvetro: 'A/W', descricao: 'd', regras: 1, tipologias: 0 },
        ])
    })
})

// ── (2) a fotografia de produção ────────────────────────────────────────────────────────────────────────────────────────────────────
const DIR = path.join(__dirname, 'fixtures', 'conferencia-de-referencias')
const tsv = (nome: string) => {
    const [cab, ...linhas] = fs.readFileSync(path.join(DIR, nome), 'utf-8').split('\n').filter((l) => l !== '')
    const cols = cab.split('\t')
    return linhas.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])) as Record<string, string>)
}
const presente = (v: string) => (v === '1' ? 1 : null)

describe('(2) A FOTOGRAFIA DE PRODUÇÃO de 12/11/2026 — motor 022fc55e e as 9 tabelas com itens: os números de hoje', () => {
    const tabelas = new Map(tsv('tabelas.tsv').map((t) => [t.tabela, t]))
    const refs: ReferenciaDoMotor[] = tsv('referencias.tsv').map((r) => ({
        codigo: r.codigo, codigo_wvetro: r.codigo_wvetro || null, descricao: r.descricao || null, regras: Number(r.regras), tipologias: Number(r.tipologias),
    }))
    const itens: ItemParaConferir[] = tsv('itens.tsv').map((i) => {
        const t = tabelas.get(i.tabela)
        if (t === undefined) throw new Error(`item ${i.codigo} aponta a tabela ${i.tabela}, que não está no mapa`)
        return {
            codigo: i.codigo, descricao: i.descricao || null, custo: presente(i.custo), valor_barra_interno: presente(i.valor_barra), valor_metro_interno: presente(i.valor_metro),
            cred_icms_pct: presente(i.cred_icms), cred_pis_cofins_pct: presente(i.cred_pis_cofins), cred_ipi_pct: presente(i.cred_ipi), nc_ipi_pct: presente(i.nc_ipi),
            ncm: i.ncm === '1' ? 'presente' : null, tabela_id: i.tabela, tabela_arquivo: t.arquivo, fornecedor: t.fornecedor, categoria: t.categoria,
        }
    })
    const c = conferirReferencias(refs, itens)
    const codigos = (l: ReadonlyArray<{ codigo: string }>) => l.map((r) => r.codigo).sort()

    it('a fotografia é a medida: 549 códigos nas 12.116 regras; 1.096 itens em 9 tabelas', () => {
        expect(c.codigos).toBe(549)
        expect(c.regras).toBe(12116)
        expect(itens.length).toBe(1096)
        expect(new Set(itens.map((i) => i.tabela_id)).size).toBe(9)
    })

    it('AS QUATRO LISTAS: 490 achadas com preço · 1 sem preço (o 2202) · 58 não achadas · 0 por palpite — e somam os 549', () => {
        expect(c.comPreco.length).toBe(490)
        expect(codigos(c.semPreco)).toEqual(['2202'])
        expect(c.naoAchadas.length).toBe(58)
        expect(c.porPalpite.length).toBe(0)
        expect(c.comPreco.length + c.semPreco.length + c.naoAchadas.length + c.porPalpite.length).toBe(549)
    })

    it('por degrau: 457 pelo código exato (456 com preço e o 2202), 34 pelo código sem o sufixo /WOLFF, 0 pela base com cor', () => {
        const achadas = [...c.comPreco, ...c.semPreco]
        expect(achadas.filter((r) => r.degrau === 'exato').length).toBe(457)
        expect(c.comPreco.filter((r) => r.degrau === 'exato').length).toBe(456)
        expect(achadas.filter((r) => r.degrau === 'sem_sufixo').length).toBe(34)
        expect(achadas.filter((r) => r.degrau === 'base_e_cor').length).toBe(0)
    })

    it('o 2202 está cadastrado SEM PREÇO, na tabela de Reforço da Wolff', () => {
        expect(c.semPreco[0]).toMatchObject({ codigo: '2202', degrau: 'exato', regras: 30 })
        expect(c.semPreco[0].itens.map((i) => [i.codigo, i.fornecedor, i.categoria, i.temPreco])).toEqual([['2202', 'Wolf', 'REFORCO', false]])
    })

    it('os 58 não achados, código a código — todos da Wolff', () => {
        expect(codigos(c.naoAchadas)).toEqual([
            '1027.1', '13791', '13799', '17561', '17571', '18741', '18749', '22321',
            '34851', '348518', '348519', '348520', '348521', '348530', '348531', '348532', '348533', '348536', '348537', '348538', '348539', '348540', '348541',
            '4661',
            '54561', '545618', '545619', '545620', '545621', '545630', '545631', '545632', '545633', '545636', '545637', '545638', '545639', '545640', '545641',
            '83841',
            '86451', '864518', '864519', '864520', '864521', '864530', '864531', '864532', '864533', '864536', '864537', '864539', '864540', '864541',
            '8833', '8834', '91251', '91259',
        ])
        expect(c.naoAchadas.every((r) => sufixoDoFornecedor(r.codigo_wvetro ?? '') === 'WOLFF')).toBe(true)
    })

    it('os três falsos positivos do prefixo ficam NÃO ACHADOS (17561 × maçaneta 17569, 17571 × maçaneta 17574, 83841 × cremona 8384)', () => {
        const nao = new Set(codigos(c.naoAchadas))
        for (const x of ['17561', '17571', '83841']) expect(nao.has(x)).toBe(true)
        // e o prefixo, sem a descrição, os teria achado: a guarda é o que os segura
        const veneziana = refs.find((r) => r.codigo === '17561')!
        expect(itens.some((i) => semSufixo(i.codigo).startsWith(baseDoWvetro(veneziana.codigo_wvetro)!))).toBe(true)
    })

    it('as 4 achadas com outra descrição, para alguém conferir: 132114 e 13219 (passador de cadarço × passa fita inferior), 40581, 7266', () => {
        expect(codigos(comDescricaoDivergente(c))).toEqual(['132114', '13219', '40581', '7266'])
        // e as 69 do código exato com outra redação NÃO entram: o código cru é a identidade
        expect([...c.comPreco, ...c.semPreco].filter((r) => r.degrau === 'exato' && r.itens.some((i) => i.descricaoDiverge)).length).toBe(69)
    })

    it('o peso: as 58 não achadas somam as regras que hoje ficam sem preço', () => {
        expect(c.naoAchadas.reduce((s, r) => s + r.regras, 0)).toBe(1680)
    })
})
