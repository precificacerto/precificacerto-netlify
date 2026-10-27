/**
 * @jest-environment node
 *
 * PORTÃO — o MOTOR QUE A ETAPA SOBE (dono do produto, 27/10/2026; migração 20261027000010): o que é PURO. A lista de etapas é a
 * lista de motores; subir o arquivo numa etapa cria o motor da família (global) e aponta a etapa. As rotas estão em
 * `atendimentos-ia-motor-da-etapa-rotas.test.ts`; o que a função faz no banco, em `scripts/harness/etapa-sobe-o-motor/`.
 *
 *   (1) o LEITOR do arquivo do motor sozinho: as mesmas listas que a importação da tabela lê do mesmo arquivo — é UM leitor, não dois;
 *   (2) o PAYLOAD tem exatamente as chaves que a função exige (o teste lê a migração), e não leva `itens` nem `importado_por`;
 *   (3) a CONFERÊNCIA do que a função gravou contra o que foi mandado: divergência nunca é sucesso;
 *   (4) a recusa: aba que falta, planilha que não abre, extensão que a leitura não abre — com o nome do arquivo;
 *   (5) os dois corpos (pedido de envio e subida), o caminho no bucket e as frases;
 *   (6) o que liga o código à migração: a pasta do bucket e o limite de tempo.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'

import {
    ABAS_DA_IMPORTACAO, LIMITE_DA_GRAVACAO_S, LISTAS_DO_MOTOR_DA_ETAPA, conferirGravacaoDoMotor, lerArquivoDoMotor, lerArquivosDaImportacao, montarPayloadDoMotor,
    type ResultadoDoMotor,
} from '@/utils/atendimentos-ia-importacao'
import { ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import {
    avisoDoMotorGlobal, caminhoDoMotorDaFamilia, fraseDoMotorCriado, fraseDoMotorQueNaoFoiGravado, lerCorpoDaSubidaDoMotor, lerPedidoDeEnvioDoMotor, pastaDoMotorDaFamilia,
    rotaDoEnvioDoMotor, rotaDoMotorDaEtapa,
} from '@/utils/atendimentos-ia-motor-da-etapa'
import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'

type Celulas = Record<number, ExcelJS.CellValue>
const MIGRACAO = readFileSync(join(__dirname, '../../../supabase/migrations/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql'), 'utf8')

async function bytes(abas: Record<string, Array<Celulas | null>>): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => {
            if (!celulas) return
            for (const [col, valor] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(col)).value = valor
        })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}

const regra = (codigo: string, tipologias: string, extra: Celulas = {}): Celulas => ({
    1: codigo, 2: 'corte', 3: 'PVC', 4: 'BRANCO', 5: 'W1', 6: 'EUROPA 42', 7: 'MARCO', 8: 'H', 9: '90', 10: 'L-10', 11: 'L', 12: '2', 13: 999, 14: tipologias, 15: 'L>1000', ...extra,
})
const CAB_MOTOR: Celulas = { 1: 'CÓDIGO', 14: 'TIPOLOGIAS' }
const CAB_FORMULAS: Celulas = { 1: 'LINHA', 2: 'VARIÁVEL' }

/** O arquivo do motor: a aba das regras, a das fórmulas da linha e as nove por tipologia (a amostra do spec). */
async function motor(regras: Celulas[] = [regra('A1', 'JC2F, JC4F'), regra('B2', 'JC2F')], formulas: Celulas[] = [{ 1: 'PVC EUROPA 42', 2: 'HFOL', 3: 'altura', 4: '(H-10)', 7: 0.5 }]) {
    return bytes({
        [ABAS_DA_IMPORTACAO.motor]: [CAB_MOTOR, ...regras],
        [ABAS_DA_IMPORTACAO.formulasDaLinha]: [CAB_FORMULAS, ...formulas],
        ...abasDoSpec(),
    })
}

type Lido = Extract<ResultadoDoMotor, { ok: true }>
async function ler(b?: Uint8Array): Promise<Lido> {
    const r = await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: b ?? await motor() })
    if (r.ok === false) throw new Error(`recusado: ${(r as { erro: string }).erro}`)
    return r as Lido
}
const erroDe = (r: ResultadoDoMotor) => (r.ok === false ? (r as { erro: string }).erro : '')

describe('(1) o leitor do arquivo do motor SOZINHO é o mesmo leitor da importação', () => {
    it('lê as regras, as tipologias derivadas, as fórmulas da linha e as nove abas — com os valores do arquivo', async () => {
        const r = await ler()
        expect(r.regras.map((x) => x.codigo)).toEqual(['A1', 'B2'])
        expect(r.regras[0].tipologias).toEqual(['JC2F', 'JC4F'])
        // a tipologia JC2F está nas duas regras, a JC4F em uma: o resumo é derivado, não copiado
        expect(r.tipologias.map((t) => [t.tipologia, t.n_regras]).sort()).toEqual([['JC2F', 2], ['JC4F', 1]])
        expect(r.formulas).toEqual([{ linha: 'EUROPA 42', linha_original: 'PVC EUROPA 42', variavel: 'HFOL', descricao: 'altura', formula: '(H-10)', formula_em_lh: null, pct_padrao: 0.5 }])
        expect(Object.keys(r.abas).sort()).toEqual(ABAS_DO_MOTOR.map((a) => a.payload).sort())
        expect(r.contagens).toEqual({ regras: 2, tipologias: 2, normalizados: 0 })
    })

    it('as listas do motor saem IGUAIS às que a importação da tabela lê do mesmo arquivo (um leitor, não dois)', async () => {
        const arquivo = await motor([regra('1027,1', 'JC2F'), regra('A1', 'JC4F, JC2F')])
        const sozinho = await ler(arquivo)
        const preco = await bytes({ [ABAS_DA_IMPORTACAO.preco]: [{ 2: 'CÓDIGO', 13: 'VALOR METRO 17%', 15: 'VALOR BARRA 17%' }, { 2: 'A1', 4: 'perfil', 13: 10, 15: 60 }] })
        const junto = await lerArquivosDaImportacao({ tabela: { nome: 'Tabela.xlsm', bytes: preco }, motor: { nome: 'Motor.xlsx', bytes: arquivo } })
        expect(junto.ok).toBe(true)
        const j = junto as Extract<typeof junto, { ok: true }>
        expect(sozinho.regras).toEqual(j.regras)
        expect(sozinho.tipologias).toEqual(j.tipologias)
        expect(sozinho.formulas).toEqual(j.formulas)
        expect(sozinho.abas).toEqual(j.abas)
        // o código "1027,1" virou "1027.1" e a troca foi contada: a normalização é a mesma
        expect(sozinho.regras[0].codigo).toBe('1027.1')
        expect(sozinho.contagens.normalizados).toBe(1)
    })

    it('SEM tabela de preço: nada de itens, de cruzamento nem de aviso de preço', async () => {
        const r = await ler()
        expect(r).not.toHaveProperty('itens')
        expect(r.contagens).not.toHaveProperty('cruzam')
        expect(r.avisos.some((a) => a.tipo === 'codigo_do_motor_sem_preco')).toBe(false)
    })
})

describe('(2) o payload é o que a função exige', () => {
    it('as chaves do payload são EXATAMENTE as listas e objetos que a função confere na migração', async () => {
        // 'itens' também aparece, mas para RECUSAR (o motor da família não leva preço): não é chave exigida
        const doSql = [...MIGRACAO.matchAll(/jsonb_typeof\(p_payload->'([a-z_]+)'\)/g)].map((m) => m[1]).filter((k) => k !== 'itens')
        const doTs = Object.keys(montarPayloadDoMotor(await ler()))
        expect(doSql.length).toBeGreaterThanOrEqual(14)
        expect([...new Set(doSql)].sort()).toEqual([...doTs].sort())
    })

    it('não leva itens de preço nem o autor (o autor vai em p_por, da sessão)', async () => {
        const p = montarPayloadDoMotor(await ler()) as Record<string, unknown>
        expect(p).not.toHaveProperty('itens')
        expect(p).not.toHaveProperty('importado_por')
        expect(p.contagens).toEqual({ regras: 2, tipologias: 2, normalizados: 0 })
    })

    it('as listas conferidas são as que a função DEVOLVE contadas, e são as doze (o mesmo conjunto da importação, sem itens)', () => {
        const devolvidas = MIGRACAO.slice(MIGRACAO.indexOf('RETURN jsonb_build_object(')).split('END')[0]
        for (const k of LISTAS_DO_MOTOR_DA_ETAPA) expect(devolvidas).toContain(`'${k}'`)
        expect(LISTAS_DO_MOTOR_DA_ETAPA).toHaveLength(12)
        expect(LISTAS_DO_MOTOR_DA_ETAPA).not.toContain('itens')
    })
})

describe('(3) a conferência do que a função gravou', () => {
    const gravadoIgual = (p: ReturnType<typeof montarPayloadDoMotor>) => Object.fromEntries(LISTAS_DO_MOTOR_DA_ETAPA.map((k) => [k, (p as unknown as Record<string, unknown[]>)[k].length]))

    it('bate quando as doze contagens são as mandadas', async () => {
        const p = montarPayloadDoMotor(await ler())
        expect(conferirGravacaoDoMotor(p, gravadoIgual(p))).toBeNull()
    })

    it('uma aba a menos no banco é divergência, com os dois lados — e NOMEIA qual', async () => {
        const p = montarPayloadDoMotor(await ler())
        const g = { ...gravadoIgual(p), perfis: (gravadoIgual(p).perfis as number) - 1 }
        const d = conferirGravacaoDoMotor(p, g)
        expect(d).not.toBeNull()
        expect(d?.enviado.perfis).toBe(gravadoIgual(p).perfis)
        expect(d?.gravado.perfis).toBe(g.perfis)
    })

    it('contagem que a função não devolveu (ausente ou texto) é divergência, nunca acerto', async () => {
        const p = montarPayloadDoMotor(await ler())
        const { regras: _tira, ...semRegras } = gravadoIgual(p)
        expect(conferirGravacaoDoMotor(p, semRegras)).not.toBeNull()
        expect(conferirGravacaoDoMotor(p, { ...gravadoIgual(p), regras: String(gravadoIgual(p).regras) })).not.toBeNull()
    })

    it('os itens de preço NÃO entram na conferência: a função não os devolve e o motor não os leva', async () => {
        const p = montarPayloadDoMotor(await ler())
        expect(conferirGravacaoDoMotor(p, { ...gravadoIgual(p), itens: 99 })).toBeNull()
    })
})

describe('(4) a recusa diz o arquivo e o porquê', () => {
    it('sem a aba das regras: nomeia a aba e as que existem', async () => {
        const b = await bytes({ [ABAS_DA_IMPORTACAO.formulasDaLinha]: [CAB_FORMULAS], Outra: [{ 1: 'x' }] })
        const r = await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: b })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('Motor.xlsx')
        expect(erroDe(r)).toContain(`"${ABAS_DA_IMPORTACAO.motor}"`)
        expect(erroDe(r)).toContain('"Outra"')
    })

    it('sem as nove abas por tipologia: recusa o arquivo inteiro, com o nome dele', async () => {
        const b = await bytes({ [ABAS_DA_IMPORTACAO.motor]: [CAB_MOTOR, regra('A1', 'JC2F')], [ABAS_DA_IMPORTACAO.formulasDaLinha]: [CAB_FORMULAS] })
        const r = await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: b })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('Motor.xlsx')
        expect(erroDe(r)).toContain(ABAS_DO_MOTOR[0].nome)
    })

    it('bytes que não são planilha: recusa com o nome, sem lançar', async () => {
        const r = await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: new Uint8Array([1, 2, 3]) })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('Motor.xlsx')
        expect(erroDe(r)).toContain('não foi possível abrir a planilha')
    })

    it.each(['motor.xls', 'motor.csv', 'motor.pdf'])('%s não é importável: a recusa é a frase única do catálogo', async (nome) => {
        const r = await lerArquivoDoMotor({ nome, bytes: await motor() })
        expect(erroDe(r)).toBe(fraseDoArquivoNaoImportavel(nome))
    })
})

describe('(5) os corpos, o caminho e as frases', () => {
    it('o pedido de envio: nome aparado; vazio e extensão que não abre são recusados no pedido', () => {
        expect(lerPedidoDeEnvioDoMotor({ nome: '  Motor Novo.xlsx ' })).toEqual({ ok: true, corpo: { nome: 'Motor Novo.xlsx' } })
        expect(lerPedidoDeEnvioDoMotor({ nome: 'Motor.xlsm' }).ok).toBe(true)
        for (const corpo of [null, {}, { nome: '   ' }, { nome: 5 }, 'x']) expect(lerPedidoDeEnvioDoMotor(corpo)).toEqual({ ok: false, erro: 'Arquivo sem nome.' })
        expect(lerPedidoDeEnvioDoMotor({ nome: 'motor.xls' })).toEqual({ ok: false, erro: fraseDoArquivoNaoImportavel('motor.xls') })
    })

    it('o caminho: a pasta da família primeiro, o id único, o nome SEM acento e sem caractere que o bucket recusa', () => {
        expect(caminhoDoMotorDaFamilia('PVC', 'Motor Várias Linhas (2).xlsx', 'u1')).toBe('familia/PVC/motor/u1-Motor-Varias-Linhas-2-.xlsx')
        expect(caminhoDoMotorDaFamilia('PVC', 'x.xlsx', 'u1').startsWith(pastaDoMotorDaFamilia('PVC'))).toBe(true)
        expect(pastaDoMotorDaFamilia('PVC')).toBe('familia/PVC/motor/')
    })

    it('o corpo da subida: o caminho TEM de estar na pasta da família da URL', () => {
        const ok = 'familia/PVC/motor/u1-x.xlsx'
        expect(lerCorpoDaSubidaDoMotor({ path: ok, nome: ' x.xlsx ' }, 'PVC')).toEqual({ ok: true, corpo: { path: ok, nome: 'x.xlsx' } })
        for (const path of ['familia/ALUMINIO/motor/u1-x.xlsx', 'f1/motor/u1-x.xlsx', 'familia/PVC/motor/../../x.xlsx', 'familia/PVC/x.xlsx', '/familia/PVC/motor/x.xlsx']) {
            expect(lerCorpoDaSubidaDoMotor({ path, nome: 'x.xlsx' }, 'PVC')).toEqual({ ok: false, erro: 'O arquivo não está na pasta de motor desta família.' })
        }
    })

    it('o corpo da subida: path e nome obrigatórios, extensão que abre, e nenhum campo a mais (o autor é o da sessão)', () => {
        expect(lerCorpoDaSubidaDoMotor({ path: 'familia/PVC/motor/u-x.xlsx' }, 'PVC').ok).toBe(false)
        expect(lerCorpoDaSubidaDoMotor({ nome: 'x.xlsx' }, 'PVC').ok).toBe(false)
        expect(lerCorpoDaSubidaDoMotor({ path: 'familia/PVC/motor/u-x.xls', nome: 'x.xls' }, 'PVC')).toEqual({ ok: false, erro: fraseDoArquivoNaoImportavel('x.xls') })
        const comAutor = lerCorpoDaSubidaDoMotor({ path: 'familia/PVC/motor/u-x.xlsx', nome: 'x.xlsx', por: 'u' }, 'PVC')
        expect(comAutor).toEqual({ ok: false, erro: 'Campo desconhecido no corpo: por (só path e nome).' })
        expect(lerCorpoDaSubidaDoMotor(null, 'PVC').ok).toBe(false)
    })

    it('as rotas são as da família, com a chave e o id codificados', () => {
        expect(rotaDoEnvioDoMotor('PVC')).toBe('/api/super-admin/atendimentos-ia/familias/PVC/motor-url-de-envio')
        expect(rotaDoMotorDaEtapa('PVC', 'e-1')).toBe('/api/super-admin/atendimentos-ia/familias/PVC/etapas/e-1/motor')
        expect(rotaDoEnvioDoMotor('A B')).toContain('A%20B')
    })

    it('a frase da falha diz o motivo pelo código e NUNCA o texto do banco; em todas, "nada foi gravado"', () => {
        for (const c of ['57014', '55P03', '23505', null]) expect(fraseDoMotorQueNaoFoiGravado(c)).toContain('Nada foi gravado')
        expect(fraseDoMotorQueNaoFoiGravado('57014')).toContain(`${LIMITE_DA_GRAVACAO_S} s`)
        expect(fraseDoMotorQueNaoFoiGravado('55P03')).toContain('travada')
        expect(fraseDoMotorQueNaoFoiGravado('23505')).toContain('código 23505')
    })

    it('a frase do motor criado: tipologias e regras com o plural certo, e a lembrança de que nasce sem tempo', () => {
        expect(fraseDoMotorCriado({ regras: 1, tipologias: 1, detalhes: 1 })).toContain('1 tipologia e 1 regra.')
        const f = fraseDoMotorCriado({ regras: 12116, tipologias: 157, detalhes: 164 })
        expect(f).toContain('164 tipologias e 12.116 regras')
        expect(f).toContain('sem tempo')
    })

    it('o aviso do motor GLOBAL: diz que vale para todas as contas e nomeia quais, em ordem', () => {
        expect(avisoDoMotorGlobal([])).toContain('TODAS as contas desta família')
        expect(avisoDoMotorGlobal([])).not.toContain('Contas que usam')
        expect(avisoDoMotorGlobal(['Zeta', 'Álamo'])).toContain('Contas que usam esta família: Álamo, Zeta.')
    })
})

describe('(6) o que liga o código à migração', () => {
    it('a pasta do bucket: a função confere o MESMO prefixo que a rota assina', () => {
        expect(MIGRACAO).toContain("v_prefixo := 'familia/' || v_familia || '/motor/';")
        expect(pastaDoMotorDaFamilia('X')).toBe('familia/X/motor/')
    })

    it('o limite de tempo da função é o da frase e o da importação da tabela: 35 s', () => {
        expect(MIGRACAO).toContain(`SET statement_timeout = '${LIMITE_DA_GRAVACAO_S}s'`)
    })
})
