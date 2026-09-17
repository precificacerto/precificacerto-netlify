/**
 * A carga das duas tabelas oficiais — o arquivo de migração diz o que diz.
 *
 * ── Por que este teste existe, e o que ele NÃO é ─────────────────────────────
 *
 * A migração `20260916000001` carrega 182 linhas e o cabeçalho dela AFIRMA
 * números: 18 CST, 164 códigos, 3 com fim de vigência, 59 com redução, 1 com
 * IBS ≠ CBS. Esses mesmos números são o que a consulta de verificação vai
 * conferir no banco depois de aplicada.
 *
 * `portao-que-nao-alcanca.md` pergunta o que faz o portão ficar VERMELHO. Sem
 * este teste, nada: um `sed` no arquivo de 342 KB, uma linha perdida num rebase,
 * uma edição para "atualizar a tabela" — tudo passa verde, e o defeito só
 * aparece como apuração errada meses depois, se aparecer.
 *
 * NÃO é teste de estilo nem de presença. Cada asserção é sobre o DADO que vai
 * para o banco, e o par (60, 100) do `200025` é o que separa "duas colunas" de
 * "uma coluna escrita duas vezes".
 *
 * ── Sobre haver UMA cópia, e não duas ───────────────────────────────────────
 *
 * Os CSV extraídos do xlsx oficial NÃO estão versionados de propósito. Duas
 * cópias do mesmo dado no repositório é `copia-divergente.md`, e o remédio dela
 * não é conferir as duas — é apagar uma. A fonte é o arquivo oficial do Portal
 * DF-e SVRS; a migração é a única cópia aqui, e este teste afirma sobre ELA.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260916000001_cst_ibs_cbs_e_cclass_trib.sql'),
  'utf-8',
)

/**
 * Separa as tuplas de um `INSERT … VALUES` respeitando `''` como escape, que é o
 * que um `split(',')` ingênuo erraria: os textos legais trazem vírgulas,
 * parênteses e apóstrofos aos montes.
 */
function tuplas(sql: string, inicio: string, fim: string): string[][] {
  const a = sql.indexOf(inicio)
  const b = sql.indexOf(fim, a)
  expect(a).toBeGreaterThan(-1)
  expect(b).toBeGreaterThan(a)
  const corpo = sql.slice(sql.indexOf('VALUES', a) + 'VALUES'.length, b)

  const linhas: string[][] = []
  let campos: string[] = []
  let atual = ''
  let depth = 0
  let instr = false
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i]
    if (instr) {
      if (c === "'") {
        if (corpo[i + 1] === "'") { atual += "''"; i++; continue }
        instr = false
      }
      atual += c
      continue
    }
    if (c === "'") { instr = true; atual += c; continue }
    if (c === '(') {
      depth++
      if (depth === 1) { campos = []; atual = ''; continue }
    } else if (c === ')') {
      depth--
      if (depth === 0) { campos.push(atual.trim()); linhas.push(campos); atual = ''; continue }
    } else if (c === ',' && depth === 1) {
      campos.push(atual.trim()); atual = ''; continue
    }
    if (depth >= 1) atual += c
  }
  return linhas
}

const CST = tuplas(SQL, 'INSERT INTO cst_ibs_cbs', 'ON CONFLICT (cst) DO UPDATE')
const CC = tuplas(SQL, 'INSERT INTO cclass_trib', 'ON CONFLICT (cst, codigo) DO UPDATE')

// Posições, na ordem declarada no INSERT de cclass_trib.
const I_CST = 0, I_CODIGO = 1, I_P_RED_IBS = 9, I_P_RED_CBS = 10
const I_D_INI = 20, I_D_FIM = 21, I_PUBLICADO = 28
const lit = (v: string): string => v.replace(/^'|'$/g, '').replace(/''/g, "'")
const num = (v: string): number => Number(v)

describe('a carga traz o que o cabeçalho da migração afirma', () => {
  it('18 CST e 164 cClassTrib', () => {
    expect(CST.length).toBe(18)
    expect(CC.length).toBe(164)
  })

  it('todo cClassTrib aponta para um CST que a carga cria — a FK fecha', () => {
    const cstsCarregados = new Set(CST.map((t) => lit(t[0])))
    const cstsUsados = new Set(CC.map((t) => lit(t[I_CST])))
    expect(cstsCarregados.size).toBe(18)
    expect([...cstsUsados].filter((c) => !cstsCarregados.has(c))).toEqual([])
    // e nenhum CST fica órfão, sem código nenhum
    expect([...cstsCarregados].filter((c) => !cstsUsados.has(c))).toEqual([])
  })

  it('o par (cst, codigo) é único — é a chave primária', () => {
    const pares = CC.map((t) => `${lit(t[I_CST])}/${lit(t[I_CODIGO])}`)
    expect(new Set(pares).size).toBe(164)
  })
})

describe('os percentuais de redução — e o 200025, que carrega o desenho', () => {
  const doCodigo = (codigo: string): string[] => {
    const t = CC.find((x) => lit(x[I_CODIGO]) === codigo)
    expect(t).toBeDefined()
    return t as string[]
  }

  it('200025 (ProUni) tem IBS 60 e CBS 100 — os dois DIVERGEM', () => {
    const t = doCodigo('200025')
    expect(num(t[I_P_RED_IBS])).toBe(60)
    expect(num(t[I_P_RED_CBS])).toBe(100)
    expect(num(t[I_P_RED_IBS])).not.toBe(num(t[I_P_RED_CBS]))
  })

  it('e ele é o ÚNICO dos 164 em que divergem — por isso um caso só basta', () => {
    const divergentes = CC.filter((t) => num(t[I_P_RED_IBS]) !== num(t[I_P_RED_CBS]))
    expect(divergentes.map((t) => lit(t[I_CODIGO]))).toEqual(['200025'])
  })

  it('59 linhas com redução maior que zero', () => {
    const comReducao = CC.filter((t) => num(t[I_P_RED_IBS]) > 0 || num(t[I_P_RED_CBS]) > 0)
    expect(comReducao.length).toBe(59)
  })

  it('os valores distintos de redução são as SETE faixas do Select original', () => {
    const valores = new Set<number>()
    for (const t of CC) {
      if (num(t[I_P_RED_IBS]) > 0) valores.add(num(t[I_P_RED_IBS]))
      if (num(t[I_P_RED_CBS]) > 0) valores.add(num(t[I_P_RED_CBS]))
    }
    // É o achado registrado em `razao-longe-da-restricao.md`: a lista fechada não
    // era leitura da lei, era transcrição desta tabela.
    expect([...valores].sort((a, b) => a - b)).toEqual([30, 40, 50, 60, 70, 80, 100])
  })
})

describe('vigência e publicação — separadas, como a regra manda', () => {
  it('exatamente 3 códigos têm fim de vigência, e são os do CST 220', () => {
    const comFim = CC.filter((t) => t[I_D_FIM] !== 'NULL')
    expect(comFim.map((t) => lit(t[I_CODIGO])).sort()).toEqual(['220001', '220002', '220003'])
    expect(new Set(comFim.map((t) => lit(t[I_CST])))).toEqual(new Set(['220']))
  })

  it('nesses três o FIM é igual ao INÍCIO — carregado como o arquivo oficial traz', () => {
    for (const t of CC.filter((x) => x[I_D_FIM] !== 'NULL')) {
      expect(lit(t[I_D_FIM])).toBe(lit(t[I_D_INI]))
    }
  })

  it('os outros 161 têm fim NULL — e NULL não é uma data distante', () => {
    expect(CC.filter((t) => t[I_D_FIM] === 'NULL').length).toBe(161)
  })

  it('uma publicação só, e ela NÃO se confunde com a vigência', () => {
    const publicacoes = new Set(CC.map((t) => lit(t[I_PUBLICADO])))
    const inicios = new Set(CC.map((t) => lit(t[I_D_INI])))
    expect([...publicacoes]).toEqual(['2026-06-22'])
    expect([...inicios]).toEqual(['2026-01-01'])
    // as duas datas são diferentes, e é isso que impede que alguém use uma pela outra
    expect([...publicacoes][0]).not.toBe([...inicios][0])
  })
})

describe('o ind_gRed é do CST, e liga em três', () => {
  it('011, 200 e 515 — e mais nenhum', () => {
    // posição 4 no INSERT de cst_ibs_cbs: cst, descricao, ind_gibscbs,
    // ind_gibscbs_mono, ind_gred
    const comRed = CST.filter((t) => t[4] === 'true').map((t) => lit(t[0]))
    expect(comRed.sort()).toEqual(['011', '200', '515'])
  })
})
