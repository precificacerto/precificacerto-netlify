/**
 * PORTÃO — A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR (dono do produto, 12/11/2026). A resolução não mora aqui (`resolucao-de-referencia.test.ts`
 * prova a escada); este portão prova a agregação, o escopo, as listas, e A FOTOGRAFIA DE PRODUÇÃO de 12/11/2026 (motor 022fc55e, as 9 tabelas
 * com itens), lida só para leitura: os números de hoje presos, para que um motor ou uma tabela nova que os mude acenda este teste.
 *
 * O COMANDO ÚNICO (12/11/2026) mudou a escada (ponte → exato → código + cor → nome técnico, o guarda nos quatro) e a fotografia deixou de
 * prender as CONTAGENS ("não escreva teste que prenda número meu: meça no banco"): ela prende o que é regra — as listas somam os códigos, nada
 * é achado sem o guarda, o escopo segura a cremona e a descrição segura a maçaneta. Os números de hoje são medidos e vão ao relato do PR.
 *
 * A FOTOGRAFIA (fixtures/conferencia-de-referencias/) traz só o que a conferência lê: o código, o código WVetro, a descrição, a cor e as
 * contagens das regras; o código e a descrição de cada item, o fornecedor, a família, a categoria e, de cada campo de preço, crédito e NCM,
 * só se EXISTE (1) ou não (vazio) — nenhum valor de preço vai ao repositório. O fornecedor entra pelo NOME (o escopo do teste é "Wolf"). sha256
 * da extração: referencias.tsv 98e145e0…, itens.tsv 611631a6…, tabelas.tsv (com a família) no teste abaixo.
 */
import fs from 'fs'
import path from 'path'
import { agregarRegras, comDescricaoDivergente, conferirReferencias, type ItemParaConferir, type ReferenciaDoMotor } from '@/lib/atendimentos-ia/conferencia-de-referencias'
import { GRUPO_DE_COR, palavrasEmComum, palavrasSignificativas, semOSufixo, sufixoDoFornecedor, type CorDoFornecedor } from '@/lib/atendimentos-ia/resolucao-de-referencia'

/** As cores da Wolf como a migração 20261112000006 as grava (a aba CORES, dono do produto, 12/11/2026). */
const CORES_DA_WOLF: CorDoFornecedor[] = [
    ['1', 'BRANCO'], ['18', 'EXTERNO PRETO TEXTURADO'], ['19', 'EXTERNO GOLDEN OAK'], ['20', 'PRETO TEXTURADO'], ['21', 'AMADEIRADO GOLDEN OAK'], ['30', 'BRONZE'],
    ['31', 'GRAFITE'], ['32', 'EXTERNO BRONZE'], ['33', 'EXTERNO GRAFITE'], ['36', 'PRETO LISO'], ['37', 'AMADEIRADO NOGUEIRA'], ['38', 'EXTERNO PRETO LISO'],
    ['39', 'EXTERNO NOGUEIRA'], ['40', 'PIRITA'], ['41', 'EXTERNO PIRITA'],
].map(([codigo, nome]): CorDoFornecedor => ({ grupo: GRUPO_DE_COR.perfil, codigo, nome }))
    .concat([['1', 'BRANCO'], ['9', 'PRETO'], ['14', 'AMADEIRADO'], ['16', 'BRONZE']].map(([codigo, nome]): CorDoFornecedor => ({ grupo: GRUPO_DE_COR.insumo, codigo, nome })))

const ESCOPO = { fornecedor_id: 'Wolf', familias: ['PVC'] }
const item = (codigo: string, descricao: string, extra: Partial<ItemParaConferir> = {}): ItemParaConferir => ({
    codigo, descricao, custo: 10, valor_barra_interno: null, valor_metro_interno: null, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: null,
    nc_ipi_pct: null, ncm: '39162000', tabela_id: 't1', tabela_arquivo: 'Tabela.xlsx', fornecedor_id: 'Wolf', fornecedor: 'Wolf', familia: 'PVC', categoria: 'PERFIL', ...extra,
})
const ref = (codigo: string, codigo_wvetro: string | null, descricao: string, regras = 1, cor: string | null = null): ReferenciaDoMotor => ({ codigo, codigo_wvetro, descricao, cor, regras, tipologias: 1 })

describe('(1) a conferência sobre a resolução única', () => {
    it('o ESCOPO primeiro: o item de outro fornecedor, ou de outra família, não conta — nem como candidata', () => {
        const persiana = ref('8384/WOLFF', '8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO', 1, 'BRANCO')
        const c = conferirReferencias([persiana], [
            item('8384', 'CREMONA ZAMAK 1 PONTO OCULTA EP BR', { fornecedor_id: 'Celsus', fornecedor: 'CELSUS' }),
            item('8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO', { familia: 'ALUMINIO' }),
        ], ESCOPO, CORES_DA_WOLF)
        expect(c.itensNoEscopo).toBe(0)
        expect(c.naoAchadas.map((r) => r.codigo)).toEqual(['8384/WOLFF'])
        // a tabela sem família ("qualquer linha") serve
        expect(conferirReferencias([persiana], [item('8384/WOLFF', 'PERSIANA PVC', { familia: null })], ESCOPO).comPreco.length).toBe(1)
    })

    it('as listas: com preço, sem preço, não achadas, não resolvidas — cada uma com o como, o item ou a falta', () => {
        const c = conferirReferencias([
            ref('9471', 'BR60/WOLFF', 'BR60 - MARCO GIRO - BRANCO'), ref('2202', '2202/WOLFF', 'REFORÇO EMENDA 12MM'),
            ref('4661', '4661/WOLFF', 'TERMINAL', 1, 'BRANCO'), ref('17561', '1756/WOLFF', 'VENEZIANA TROPICAL', 1, 'BRANCO'),
        ], [item('9471', 'BR60 - MARCO GIRO - BRANCO'), item('2202', 'REFORÇO EMENDA 12MM', { custo: null }), item('17561', 'MAÇANETA CELSUS')], ESCOPO, CORES_DA_WOLF)
        // o `codigo` da regra é a PONTE do motor (o código da aba "Motor por barra" para o par WVetro × cor): o primeiro degrau
        expect(c.comPreco.map((r) => [r.codigo, r.como, r.itens[0].codigo])).toEqual([['9471', 'ponte', '9471']])
        expect(c.semPreco.map((r) => [r.codigo, r.como])).toEqual([['2202', 'ponte']])
        expect(c.naoAchadas.map((r) => [r.codigo, r.falta!.motivo, r.falta!.candidatas.length])).toEqual([['4661', 'NAO_ACHADA', 0]])
        expect(c.naoResolvidas.map((r) => [r.codigo, r.falta!.motivo, r.falta!.candidatas.map((x) => x.item.codigo)])).toEqual([['17561', 'DESCRICAO_NAO_CONCORDA', ['17561']]])
    })

    it('com preço é custo, valor da barra OU valor do metro; zero é preço (ausente não é zero); NaN não é preço', () => {
        const r = ref('A', null, 'MARCO JANELA')
        const de = (x: Partial<ItemParaConferir>) => conferirReferencias([r], [item('A', 'MARCO JANELA', { custo: null, ...x })], ESCOPO)
        expect(de({}).semPreco.length).toBe(1)
        expect(de({ valor_barra_interno: 5 }).comPreco.length).toBe(1)
        expect(de({ valor_metro_interno: 5 }).comPreco.length).toBe(1)
        expect(de({ custo: 0 }).comPreco.length).toBe(1)
        expect(de({ custo: Number.NaN }).semPreco.length).toBe(1)
    })

    it('o item diz o crédito, o NCM e de onde vem; null fica null (nunca zero); o NCM em branco é ausente', () => {
        const c = conferirReferencias([ref('A', null, 'MARCO JANELA')], [item('A', 'MARCO JANELA', { cred_ipi_pct: 0, ncm: '  ', tabela_arquivo: 'X.xlsx', categoria: 'REFORCO' })], ESCOPO)
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
        const c = conferirReferencias([ref('B', null, 'MARCO', 2, 'BRANCO'), ref('A', null, 'MARCO', 2, 'BRANCO'), ref('C', null, 'MARCO', 9, 'BRANCO')], [], ESCOPO, CORES_DA_WOLF)
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
    const c = conferirReferencias(refs, itens, ESCOPO, CORES_DA_WOLF)
    const achadas = [...c.comPreco, ...c.semPreco]

    it('a fotografia é a medida: 549 códigos nas 12.116 regras; 1.096 itens em 9 tabelas; 973 no escopo (as 6 da Wolf, PVC)', () => {
        expect(c.codigos).toBe(549)
        expect(c.regras).toBe(12116)
        expect(itens.length).toBe(1096)
        expect(new Set(itens.map((i) => i.tabela_id)).size).toBe(9)
        expect(c.itensNoEscopo).toBe(973)
    })

    it('as quatro listas somam os 549, e nenhum código aparece em duas', () => {
        const todas = [...c.comPreco, ...c.semPreco, ...c.naoAchadas, ...c.naoResolvidas]
        expect(todas.length).toBe(549)
        expect(new Set(todas.map((r) => r.codigo)).size).toBe(549)
    })

    it('NADA É ACHADO SEM O GUARDA: todo achado tem pelo menos uma palavra significativa em comum com a descrição do motor', () => {
        const semGuarda = achadas.filter((r) => {
            const nome = semOSufixo(r.codigo_wvetro ?? r.codigo, sufixoDoFornecedor(r.codigo_wvetro ?? r.codigo))
            return palavrasEmComum(palavrasSignificativas(r.descricao, CORES_DA_WOLF, nome), palavrasSignificativas(r.itens[0].descricao, CORES_DA_WOLF, nome)) === 0
        })
        expect(semGuarda.map((r) => r.codigo)).toEqual([])
    })

    it('todo achado está no escopo da Wolf, e todo sem resolução nomeia o motivo e a frase', () => {
        expect(achadas.every((r) => r.itens[0].fornecedor === 'Wolf')).toBe(true)
        expect([...c.naoAchadas, ...c.naoResolvidas].every((r) => r.falta !== null && r.falta.frase.length > 0)).toBe(true)
        expect(c.naoAchadas.every((r) => r.falta!.motivo === 'NAO_ACHADA' && r.falta!.candidatas.length === 0)).toBe(true)
    })

    it('O ESCOPO segura a cremona: 83841 (persiana, base 8384) não é achado pelo 8384 da Celsus', () => {
        const persiana = [...achadas, ...c.naoAchadas, ...c.naoResolvidas].find((r) => r.codigo === '83841')!
        expect(persiana.itens.map((i) => i.codigo)).not.toContain('8384')
        expect((persiana.falta?.candidatas ?? []).map((x) => x.item.fornecedor)).not.toContain('CELSUS METALÚRGICA LTDA')
        expect(itens.some((i) => i.codigo === '8384' && i.fornecedor_id !== 'Wolf')).toBe(true)
    })

    it('a maçaneta não volta: 17561 (veneziana) não leva a 17569 (MAÇANETA CELSUS, cadastrada sob a Wolf) — o "aproximado" saiu da escada, e nada a alcança', () => {
        const veneziana = [...achadas, ...c.naoAchadas, ...c.naoResolvidas].find((r) => r.codigo === '17561')!
        expect(veneziana.itens.map((i) => i.codigo)).not.toContain('17569')
        expect(veneziana.falta!.motivo).toBe('NAO_ACHADA')
        expect(itens.some((i) => i.codigo === '17569' && i.descricao!.includes('MAÇANETA CELSUS'))).toBe(true)
    })
})
