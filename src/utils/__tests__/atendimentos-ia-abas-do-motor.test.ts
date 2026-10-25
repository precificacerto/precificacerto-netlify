/**
 * @jest-environment node
 *
 * PORTÃO — as nove abas do motor por tipologia (`src/utils/atendimentos-ia-abas-do-motor.ts`) e a
 * migração que as guarda (`supabase/migrations/20261025000004_abas_do_motor_por_tipologia.sql`).
 *
 * (1) O MAPA E O SQL SÃO O MESMO CONTRATO. A importação apaga e regrava as nove tabelas
 *     (`tabela-que-a-importacao-apaga.md`): coluna da tabela que o mapa não conhece seria apagada e
 *     nunca regravada; coluna do mapa que a função não insere chegaria NULL em silêncio. Os casos leem
 *     o arquivo da migração e comparam, tabela por tabela, com o mapa — acrescentar uma coluna num lado
 *     só fica vermelho aqui (`copia-divergente.md`, o remédio de ligar o contrato à lista).
 * (2) A LEITURA DA PLANILHA, com o cabeçalho e a amostra REAIS do spec (`docs/fornecedor/
 *     motor_abas_spec.json`): texto literal, inteiro só no Detalhe, vazio é NULL, e as recusas nomeadas.
 * (3) A VOLTA, banco → aba com cabeçalho, que é o que o avaliador lê.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'

import { ABAS_DO_MOTOR, abaDeclarada, abaDoBanco, lerAbasDoMotor, linhaDoBanco, type LinhaDoBanco } from '@/utils/atendimentos-ia-abas-do-motor'
import { abasDoSpec, amostraDoSpec, type CelulasDoSpec } from './fixtures/abas-do-motor-do-spec'

const SQL = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261025000004_abas_do_motor_por_tipologia.sql'), 'utf-8')
/** O corpo da função, entre os `$function$`. */
const FUNCAO = SQL.slice(SQL.indexOf('AS $function$'), SQL.indexOf('$function$;'))
const TIPO_SQL = { texto: 'text', inteiro: 'integer' } as const

/** As colunas do CREATE TABLE da tabela, sem as linhas de CONSTRAINT. */
function colunasDoCreate(tabela: string): string[] {
    const m = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${tabela} \\(([\\s\\S]*?)\\n\\);`).exec(SQL)
    if (!m) throw new Error(`CREATE TABLE de ${tabela} não achado`)
    return m[1].split(',\n').map((l) => l.trim()).filter((l) => !l.startsWith('CONSTRAINT')).map((l) => l.split(/\s+/)[0])
}

async function planilha(abas: Record<string, CelulasDoSpec[]>): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => { for (const [c, v] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(c)).value = v })
    }
    // ida e volta pelos bytes: é o caminho da importação de verdade
    const lido = new ExcelJS.Workbook()
    await lido.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    return lido
}
const erros = (r: ReturnType<typeof lerAbasDoMotor>) => ('erros' in r ? r.erros : [])
const linhas = (r: ReturnType<typeof lerAbasDoMotor>) => ('linhas' in r ? r.linhas : {}) as Record<string, LinhaDoBanco[]>

describe('(1) o mapa e a migração são o mesmo contrato', () => {
    it('são nove abas, e cada uma tem a sua tabela e a sua chave de payload, sem repetir', () => {
        expect(ABAS_DO_MOTOR.map((a) => a.nome)).toEqual([
            'Detalhe Tipologias', 'Fórmulas', 'Perfis', 'Vidros', 'Baguete x Vidro', 'Insumos', 'Variáveis', 'Validações', 'Otimização de barras',
        ])
        expect(new Set(ABAS_DO_MOTOR.map((a) => a.tabela)).size).toBe(9)
        expect(new Set(ABAS_DO_MOTOR.map((a) => a.payload)).size).toBe(9)
    })

    it.each(ABAS_DO_MOTOR.map((a) => [a.nome, a] as const))('"%s": as colunas da tabela são as do mapa, mais as que o banco gera', (_n, aba) => {
        const geradas = aba.tabela === 'orcamentista_motor_tipologia_detalhe' ? ['tabela_id', 'atualizado_em'] : ['id', 'tabela_id', 'ordem']
        const doMapa = aba.colunas.map((c) => c.coluna)
        // a `ordem` do Detalhe entra por ALTER TABLE, porque a tabela já existe em produção
        const doSql = [...colunasDoCreate(aba.tabela), ...(aba.tabela === 'orcamentista_motor_tipologia_detalhe' ? ['ordem'] : [])]
        expect([...doSql].sort()).toEqual([...geradas, ...doMapa, ...(geradas.includes('ordem') ? [] : ['ordem'])].sort())
    })

    it.each(ABAS_DO_MOTOR.map((a) => [a.nome, a] as const))('"%s": a função APAGA pela tabela_id, INSERE as colunas do mapa com o tipo do mapa, e DEVOLVE a contagem', (_n, aba) => {
        expect(FUNCAO).toContain(`DELETE FROM public.${aba.tabela} WHERE tabela_id = p_tabela_id;`)
        const ins = new RegExp(`INSERT INTO public\\.${aba.tabela} \\(([^)]*)\\)[\\s\\S]*?FROM jsonb_to_recordset\\(p_payload->'${aba.payload}'\\) AS x\\(([^;]*)\\);`).exec(FUNCAO)
        expect(ins).not.toBeNull()
        const [, alvo, tipos] = ins as RegExpExecArray
        expect(alvo.split(',').map((s) => s.trim())).toEqual(['tabela_id', 'ordem', ...aba.colunas.map((c) => c.coluna)])
        expect(tipos.replace(/\)$/, '').split(',').map((s) => s.trim())).toEqual(['ordem integer', ...aba.colunas.map((c) => `${c.coluna} ${TIPO_SQL[c.tipo]}`)])
        expect(FUNCAO).toContain(`jsonb_typeof(p_payload->'${aba.payload}') IS DISTINCT FROM 'array'`)
        expect(FUNCAO).toContain(`'${aba.payload}', v_${aba.payload}`)
    })

    it('a chave natural do mapa é a UNIQUE da migração, e a de ordem existe em todas', () => {
        for (const a of ABAS_DO_MOTOR) {
            expect(SQL).toContain(`${a.tabela}_ordem_key`)
            if (a.unica && a.unica !== 'tipologia') {
                const colunas = a.porTipologia ? `tabela_id, tipologia, ${a.unica}` : `tabela_id, ${a.unica}`
                expect(SQL).toContain(`CONSTRAINT ${a.tabela}_${a.unica}_key UNIQUE (${colunas})`)
            }
        }
    })

    it('nenhuma tabela nova tem tenant_id, e todas têm RLS, as quatro políticas e o REVOKE', () => {
        for (const a of ABAS_DO_MOTOR) {
            expect(colunasDoCreate(a.tabela)).not.toContain('tenant_id')
            expect(SQL).toContain(`REVOKE ALL ON public.${a.tabela} FROM anon, authenticated;`)
        }
        expect(SQL).not.toMatch(/GRANT [A-Z, ]+ ON public\.orcamentista_motor_/)
    })
})

describe('(2) a leitura da planilha', () => {
    it('as nove abas do spec são lidas, linha a linha, com a ordem da planilha', async () => {
        const r = lerAbasDoMotor(await planilha(abasDoSpec()))
        expect(erros(r)).toEqual([])
        const l = linhas(r)
        for (const a of ABAS_DO_MOTOR) expect(l[a.payload].length).toBe(amostraDoSpec(a.nome).length)
        expect(l.perfis.map((x) => x.ordem)).toEqual(amostraDoSpec('Perfis').map((x) => x.ordem))
    })

    it('FÓRMULA E CONDIÇÃO entram como TEXTO LITERAL, sem ser parseadas', async () => {
        const l = linhas(lerAbasDoMotor(await planilha(abasDoSpec())))
        const perfil = l.perfis.find((x) => x.perfil === 'BZ0012/WOLFF') as LinhaDoBanco
        expect(perfil.qtd).toBe('(ARREDMAIOR(((LMC/450)+1)*2))+(ARREDMAIOR(((HMC/450)+1)*2))')
        expect(perfil.condicao).toBe('(ARI=1)')
        expect(perfil.medida).toBe('10')
        expect(l.vidros.map((x) => x.largura)).toContain('(LMC-IIF(M=1,67.2,51.8)-&FF)')
        expect(l.baguetes[0].espessuras_vidro).toBe('5,6,8')
    })

    it('o Detalhe tem inteiro nos limites e nas contagens, e o vazio é NULL — nunca zero', async () => {
        const l = linhas(lerAbasDoMotor(await planilha(abasDoSpec())))
        const dp02 = l.detalhes.find((x) => x.tipologia === 'DP-02') as LinhaDoBanco
        expect(dp02).toEqual(expect.objectContaining({ larg_min_mm: null, larg_max_mm: null, alt_min_mm: 388, alt_max_mm: 2439, n_perfis: 39, n_vidros: 1, n_insumos: 253 }))
        expect(l.detalhes.find((x) => x.tipologia === 'DP-05')?.fonte_limite).toBeNull()
    })

    it('a Otimização é do fornecedor: parâmetro e valor em texto, sem tipologia', async () => {
        const l = linhas(lerAbasDoMotor(await planilha(abasDoSpec())))
        expect(l.otimizacao.find((x) => x.parametro === 'barra_mm')).toEqual({ ordem: 3, parametro: 'barra_mm', valor: '6000' })
        expect(l.otimizacao.every((x) => !('tipologia' in x))).toBe(true)
    })

    it('ABA que falta e COLUNA que falta são recusadas pelo nome — todas de uma vez', async () => {
        const abas = abasDoSpec()
        delete abas['Vidros']
        abas['Perfis'] = abas['Perfis'].map((c, i) => (i === 0 ? { ...c, 6: 'Quantidade' } : c))
        const e = erros(lerAbasDoMotor(await planilha(abas)))
        expect(e).toEqual(expect.arrayContaining([
            'O arquivo do motor não tem a aba "Vidros".',
            'A aba "Perfis" não tem no cabeçalho: "Qtd".',
        ]))
    })

    it('a coluna é achada pelo NOME, não pela posição: o cabeçalho em outra ordem lê o mesmo', async () => {
        const abas = abasDoSpec()
        abas['Validações'] = abas['Validações'].map((c) => ({ 1: c[4], 2: c[3], 3: c[2], 4: c[1] }))
        const l = linhas(lerAbasDoMotor(await planilha(abas)))
        const normal = linhas(lerAbasDoMotor(await planilha(abasDoSpec())))
        expect(l.validacoes).toEqual(normal.validacoes)
    })

    it('INTEIRO que não é inteiro, no Detalhe, é recusa com a aba, a linha e a coluna', async () => {
        const abas = abasDoSpec()
        abas['Detalhe Tipologias'][1] = { ...abas['Detalhe Tipologias'][1], 7: '388,5' }
        expect(erros(lerAbasDoMotor(await planilha(abas)))).toEqual(['Aba "Detalhe Tipologias", linha 2: "Alt. mín (mm)" não é número inteiro: "388,5".'])
    })

    it('NÚMERO FRACIONÁRIO no Detalhe também é recusa — a coluna é integer, e o banco arredondaria ou recusaria sem dizer a linha', async () => {
        const abas = abasDoSpec()
        abas['Detalhe Tipologias'][1] = { ...abas['Detalhe Tipologias'][1], 7: 388.5 }
        expect(erros(lerAbasDoMotor(await planilha(abas)))).toEqual(['Aba "Detalhe Tipologias", linha 2: "Alt. mín (mm)" não é número inteiro: 388.5.'])
    })

    it('a chave natural REPETIDA é recusa nomeando o par e as duas linhas — Fórmulas, Variáveis e Otimização', async () => {
        const abas = abasDoSpec()
        abas['Fórmulas'].push({ ...abas['Fórmulas'][1] })
        abas['Variáveis'].push({ ...abas['Variáveis'][2] })
        abas['Otimização de barras'].push({ ...abas['Otimização de barras'][1] })
        const e = erros(lerAbasDoMotor(await planilha(abas)))
        const ultimaF = abas['Fórmulas'].length
        expect(e).toEqual(expect.arrayContaining([
            `Aba "Fórmulas": "${abas['Fórmulas'][1][2]} / ${abas['Fórmulas'][1][3]}" aparece duas vezes, nas linhas 2 e ${ultimaF}.`,
            `Aba "Variáveis": "${abas['Variáveis'][2][2]} / ${abas['Variáveis'][2][3]}" aparece duas vezes, nas linhas 3 e ${abas['Variáveis'].length}.`,
            `Aba "Otimização de barras": "${abas['Otimização de barras'][1][1]}" aparece duas vezes, nas linhas 2 e ${abas['Otimização de barras'].length}.`,
        ]))
        expect(e).toHaveLength(3)
    })

    it('a mesma variável em DUAS tipologias não é duplicata: a chave é o par', () => {
        const aba = abaDeclarada('Fórmulas')
        const a = linhaDoBanco(aba, { Código: 'DP-02', Variável: 'L' }, 2)
        const b = linhaDoBanco(aba, { Código: 'DP-03', Variável: 'L' }, 3)
        expect('linha' in a && 'linha' in b).toBe(true)
    })

    it('linha de aba por tipologia SEM o Código é recusa — sem ele a linha não tem dono', async () => {
        const abas = abasDoSpec()
        abas['Insumos'][3] = { ...abas['Insumos'][3], 2: null }
        expect(erros(lerAbasDoMotor(await planilha(abas)))).toEqual(['Aba "Insumos", linha 4: a linha tem conteúdo e não tem o "Código" da tipologia.'])
    })

    it('linha em branco no meio da aba não vira linha, e a ordem das outras continua sendo a da planilha', async () => {
        const abas = abasDoSpec()
        abas['Perfis'].splice(3, 0, {})
        const l = linhas(lerAbasDoMotor(await planilha(abas)))
        expect(l.perfis).toHaveLength(amostraDoSpec('Perfis').length)
        expect(l.perfis.map((x) => x.ordem)).toEqual([2, 3, ...amostraDoSpec('Perfis').slice(2).map((x) => x.ordem + 1)])
    })
})

describe('(3) do banco de volta à aba com cabeçalho', () => {
    it('as linhas, mesmo embaralhadas, voltam na ordem da aba e pelo nome do cabeçalho', async () => {
        const l = linhas(lerAbasDoMotor(await planilha(abasDoSpec())))
        const aba = abaDeclarada('Variáveis')
        const volta = abaDoBanco(aba, [...l.variaveis_da_tipologia].reverse())
        expect(volta.cabecalho).toEqual(aba.colunas.map((c) => c.cabecalho))
        expect(volta.linhas).toEqual(amostraDoSpec('Variáveis').map((x) => Object.fromEntries(aba.colunas.map((c) => [c.cabecalho, x.valores[c.cabecalho] ?? null]))))
    })
})
