/**
 * PORTÃO — A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR (dono do produto, 12/11/2026). A resolução não mora aqui (`resolucao-de-referencia.test.ts`
 * prova a escada); este portão prova a agregação, o escopo, as listas, e A FOTOGRAFIA DE PRODUÇÃO de 12/11/2026 (motor 022fc55e, as 9 tabelas
 * com itens), lida só para leitura: os números de hoje presos, para que um motor ou uma tabela nova que os mude acenda este teste.
 *
 * A FOTOGRAFIA (fixtures/conferencia-de-referencias/) traz só o que a conferência lê: o código, o código WVetro, a descrição, a cor e as
 * contagens das regras; o código e a descrição de cada item, o fornecedor, a família, a categoria e, de cada campo de preço, crédito e NCM,
 * só se EXISTE (1) ou não (vazio) — nenhum valor de preço vai ao repositório. O fornecedor entra pelo NOME (o escopo do teste é "Wolf"). sha256
 * da extração: referencias.tsv 98e145e0…, itens.tsv 611631a6…, tabelas.tsv (com a família) no teste abaixo.
 */
import fs from 'fs'
import path from 'path'
import { agregarRegras, comDescricaoDivergente, conferirReferencias, type ItemParaConferir, type ReferenciaDoMotor } from '@/lib/atendimentos-ia/conferencia-de-referencias'
import { sufixoDoFornecedor } from '@/lib/atendimentos-ia/resolucao-de-referencia'

const ESCOPO = { fornecedor_id: 'Wolf', familias: ['PVC'] }
const item = (codigo: string, descricao: string, extra: Partial<ItemParaConferir> = {}): ItemParaConferir => ({
    codigo, descricao, custo: 10, valor_barra_interno: null, valor_metro_interno: null, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: null,
    nc_ipi_pct: null, ncm: '39162000', tabela_id: 't1', tabela_arquivo: 'Tabela.xlsx', fornecedor_id: 'Wolf', fornecedor: 'Wolf', familia: 'PVC', categoria: 'PERFIL', ...extra,
})
const ref = (codigo: string, codigo_wvetro: string | null, descricao: string, regras = 1, cor: string | null = null): ReferenciaDoMotor => ({ codigo, codigo_wvetro, descricao, cor, regras, tipologias: 1 })

describe('(1) a conferência sobre a resolução única', () => {
    it('o ESCOPO primeiro: o item de outro fornecedor, ou de outra família, não conta — nem como candidata', () => {
        const persiana = ref('8384/WOLFF', '8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO')
        const c = conferirReferencias([persiana], [
            item('8384', 'CREMONA ZAMAK 1 PONTO OCULTA EP BR', { fornecedor_id: 'Celsus', fornecedor: 'CELSUS' }),
            item('8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO', { familia: 'ALUMINIO' }),
        ], ESCOPO)
        expect(c.itensNoEscopo).toBe(0)
        expect(c.naoAchadas.map((r) => r.codigo)).toEqual(['8384/WOLFF'])
        // a tabela sem família ("qualquer linha") serve
        expect(conferirReferencias([persiana], [item('8384/WOLFF', 'PERSIANA', { familia: null })], ESCOPO).comPreco.length).toBe(1)
    })

    it('as listas: com preço, sem preço, não achadas, não resolvidas — cada uma com o como, o item ou a falta', () => {
        const c = conferirReferencias([
            ref('9471', 'BR60/WOLFF', 'BR60 - MARCO GIRO - BRANCO'), ref('2202', '2202/WOLFF', 'REFORÇO EMENDA 12MM'),
            ref('4661', '4661/WOLFF', 'TERMINAL'), ref('17561', '1756/WOLFF', 'VENEZIANA TROPICAL', 1, 'BRANCO'),
        ], [item('9471', 'BR60 - MARCO GIRO - BRANCO'), item('2202', 'REFORÇO EMENDA 12MM', { custo: null }), item('17569', 'MAÇANETA CELSUS')], ESCOPO)
        expect(c.comPreco.map((r) => [r.codigo, r.como, r.itens[0].codigo])).toEqual([['9471', 'exato', '9471']])
        expect(c.semPreco.map((r) => [r.codigo, r.como])).toEqual([['2202', 'exato']])
        expect(c.naoAchadas.map((r) => [r.codigo, r.falta!.motivo, r.falta!.candidatas.length])).toEqual([['4661', 'NAO_ACHADA', 0]])
        expect(c.naoResolvidas.map((r) => [r.codigo, r.falta!.motivo, r.falta!.candidatas.map((x) => x.item.codigo)])).toEqual([['17561', 'DESCRICAO_NAO_BATE', ['17569']]])
    })

    it('com preço é custo, valor da barra OU valor do metro; zero é preço (ausente não é zero); NaN não é preço', () => {
        const r = ref('A', null, 'A')
        const de = (x: Partial<ItemParaConferir>) => conferirReferencias([r], [item('A', 'A', { custo: null, ...x })], ESCOPO)
        expect(de({}).semPreco.length).toBe(1)
        expect(de({ valor_barra_interno: 5 }).comPreco.length).toBe(1)
        expect(de({ valor_metro_interno: 5 }).comPreco.length).toBe(1)
        expect(de({ custo: 0 }).comPreco.length).toBe(1)
        expect(de({ custo: Number.NaN }).semPreco.length).toBe(1)
    })

    it('o item diz o crédito, o NCM e de onde vem; null fica null (nunca zero); o NCM em branco é ausente', () => {
        const c = conferirReferencias([ref('A', null, 'A')], [item('A', 'A', { cred_ipi_pct: 0, ncm: '  ', tabela_arquivo: 'X.xlsx', categoria: 'REFORCO' })], ESCOPO)
        expect(c.comPreco[0].itens[0]).toMatchObject({
            credito: { icms: 12, pis_cofins: 9.25, ipi: 0, ipi_nao_creditavel: null }, ncm: null, tabela_arquivo: 'X.xlsx', fornecedor: 'Wolf', categoria: 'REFORCO',
            preco: { custo: 10, valor_barra: null, valor_metro: null },
        })
    })

    it('a descrição que diverge é marcada só no SUFIXO (o código exato é a identidade)', () => {
        const c = conferirReferencias([ref('132114', '132114/WOLFF', 'PASSADOR DE CADARÇO C20 - MARROM'), ref('905320', 'BZ1770/WOLFF', 'BZ1770 - GUARNIÇÃO 17X70MM - PRETO')],
            [item('132114/WOLFF', 'PASSA FITA INFERIOR - MARROM'), item('905320', 'GUARNIÇAO 17X70MM')], ESCOPO)
        expect(comDescricaoDivergente(c).map((r) => r.codigo)).toEqual(['132114'])
        expect(c.comPreco.find((r) => r.codigo === '905320')!.itens[0].descricaoDiverge).toBe(true)
    })

    it('as listas em ordem de peso, e o código cru desempata', () => {
        const c = conferirReferencias([ref('B', null, 'b', 2), ref('A', null, 'a', 2), ref('C', null, 'c', 9)], [], ESCOPO)
        expect(c.naoAchadas.map((r) => r.codigo)).toEqual(['C', 'A', 'B'])
    })

    it('a agregação: o peso é a contagem de regras; as tipologias são distintas; o código cru é a chave (0123 ≠ 123); a cor vem junto', () => {
        expect(agregarRegras([
            { codigo: '0123', codigo_wvetro: 'A/W', descricao: 'd', cor: 'PRETO', tipologias: ['DP-017', 'DP-02'] },
            { codigo: '0123', codigo_wvetro: 'A/W', descricao: 'd', cor: 'PRETO', tipologias: ['DP-02', 'DP-17'] },
            { codigo: '123', codigo_wvetro: 'A/W', descricao: 'd', cor: null, tipologias: null },
        ])).toEqual([
            { codigo: '0123', codigo_wvetro: 'A/W', descricao: 'd', cor: 'PRETO', regras: 2, tipologias: 3 },
            { codigo: '123', codigo_wvetro: 'A/W', descricao: 'd', cor: null, regras: 1, tipologias: 0 },
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

describe('(2) A FOTOGRAFIA DE PRODUÇÃO de 12/11/2026 — motor 022fc55e (Wolf, PVC) e as 9 tabelas com itens: os números de hoje', () => {
    const tabelas = new Map(tsv('tabelas.tsv').map((t) => [t.tabela, t]))
    const refs: ReferenciaDoMotor[] = tsv('referencias.tsv').map((r) => ({
        codigo: r.codigo, codigo_wvetro: r.codigo_wvetro || null, descricao: r.descricao || null, cor: r.cor || null, regras: Number(r.regras), tipologias: Number(r.tipologias),
    }))
    const itens: ItemParaConferir[] = tsv('itens.tsv').map((i) => {
        const t = tabelas.get(i.tabela)
        if (t === undefined) throw new Error(`item ${i.codigo} aponta a tabela ${i.tabela}, que não está no mapa`)
        return {
            codigo: i.codigo, descricao: i.descricao || null, custo: presente(i.custo), valor_barra_interno: presente(i.valor_barra), valor_metro_interno: presente(i.valor_metro),
            cred_icms_pct: presente(i.cred_icms), cred_pis_cofins_pct: presente(i.cred_pis_cofins), cred_ipi_pct: presente(i.cred_ipi), nc_ipi_pct: presente(i.nc_ipi),
            ncm: i.ncm === '1' ? 'presente' : null, tabela_id: i.tabela, tabela_arquivo: t.arquivo, fornecedor_id: t.fornecedor, fornecedor: t.fornecedor,
            familia: t.familia || null, categoria: t.categoria,
        }
    })
    const c = conferirReferencias(refs, itens, ESCOPO)
    const codigos = (l: ReadonlyArray<{ codigo: string }>) => l.map((r) => r.codigo).sort()

    it('a fotografia é a medida: 549 códigos nas 12.116 regras; 1.096 itens em 9 tabelas; 973 no escopo (as 6 da Wolf, PVC)', () => {
        expect(c.codigos).toBe(549)
        expect(c.regras).toBe(12116)
        expect(itens.length).toBe(1096)
        expect(new Set(itens.map((i) => i.tabela_id)).size).toBe(9)
        expect(c.itensNoEscopo).toBe(973)
    })

    it('AS LISTAS: 490 com preço · 1 sem preço (o 2202) · 57 não achadas · 1 não resolvida (17561) — e somam os 549', () => {
        expect(c.comPreco.length).toBe(490)
        expect(codigos(c.semPreco)).toEqual(['2202'])
        expect(c.naoAchadas.length).toBe(57)
        expect(codigos(c.naoResolvidas)).toEqual(['17561'])
        expect(c.comPreco.length + c.semPreco.length + c.naoAchadas.length + c.naoResolvidas.length).toBe(549)
    })

    it('por como achou: 457 pelo código exato (456 com preço e o 2202), 34 pelo sufixo do fornecedor, 0 pela cor, 0 aproximado', () => {
        const achadas = [...c.comPreco, ...c.semPreco]
        expect(achadas.filter((r) => r.como === 'exato').length).toBe(457)
        expect(c.comPreco.filter((r) => r.como === 'exato').length).toBe(456)
        expect(achadas.filter((r) => r.como === 'sufixo_do_fornecedor').length).toBe(34)
        expect(achadas.filter((r) => r.como === 'cor').length).toBe(0)
        expect(achadas.filter((r) => r.como === 'aproximado_com_descricao').length).toBe(0)
    })

    it('o 2202 está cadastrado SEM PREÇO, na tabela de Reforço da Wolff', () => {
        expect(c.semPreco[0]).toMatchObject({ codigo: '2202', como: 'exato', regras: 30 })
        expect(c.semPreco[0].itens.map((i) => [i.codigo, i.fornecedor, i.categoria, i.temPreco])).toEqual([['2202', 'Wolf', 'REFORCO', false]])
    })

    it('os 58 sem resolução, código a código — todos da Wolf', () => {
        expect(codigos([...c.naoAchadas, ...c.naoResolvidas])).toEqual([
            '1027.1', '13791', '13799', '17561', '17571', '18741', '18749', '22321',
            '34851', '348518', '348519', '348520', '348521', '348530', '348531', '348532', '348533', '348536', '348537', '348538', '348539', '348540', '348541',
            '4661',
            '54561', '545618', '545619', '545620', '545621', '545630', '545631', '545632', '545633', '545636', '545637', '545638', '545639', '545640', '545641',
            '83841',
            '86451', '864518', '864519', '864520', '864521', '864530', '864531', '864532', '864533', '864536', '864537', '864539', '864540', '864541',
            '8833', '8834', '91251', '91259',
        ])
        expect([...c.naoAchadas, ...c.naoResolvidas].every((r) => sufixoDoFornecedor(r.codigo_wvetro) === 'WOLFF')).toBe(true)
    })

    it('O ESCOPO segura a cremona: 83841 (persiana, base 8384) fica sem candidata — o 8384 da Celsus está fora do escopo da Wolf', () => {
        const persiana = [...c.naoAchadas, ...c.naoResolvidas].find((r) => r.codigo === '83841')!
        expect(persiana.falta).toMatchObject({ motivo: 'NAO_ACHADA', candidatas: [] })
        expect(itens.some((i) => i.codigo === '8384' && i.fornecedor_id !== 'Wolf')).toBe(true)
    })

    it('A DESCRIÇÃO segura a maçaneta: 17561 (veneziana) fica NÃO RESOLVIDA, nomeando a 17569 (MAÇANETA CELSUS, cadastrada sob a Wolf)', () => {
        const veneziana = c.naoResolvidas.find((r) => r.codigo === '17561')!
        expect(veneziana.falta!.motivo).toBe('DESCRICAO_NAO_BATE')
        expect(veneziana.falta!.candidatas.map((x) => [x.item.codigo, x.item.fornecedor])).toEqual([['17569', 'Wolf']])
        expect(veneziana.falta!.candidatas[0].item.descricao).toContain('MAÇANETA CELSUS')
    })

    it('as 4 achadas pelo sufixo com outra descrição: 132114 e 13219 (passador de cadarço × passa fita inferior), 40581, 7266', () => {
        expect(codigos(comDescricaoDivergente(c))).toEqual(['132114', '13219', '40581', '7266'])
    })

    it('o peso: as 58 sem resolução somam 1.680 regras', () => {
        expect([...c.naoAchadas, ...c.naoResolvidas].reduce((s, r) => s + r.regras, 0)).toBe(1680)
    })
})
