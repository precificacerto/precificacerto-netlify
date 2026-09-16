/**
 * O cClassTrib DETERMINA a redução — e o que se afirma aqui são os números que
 * ficam GRAVADOS no produto.
 *
 * ── O que mudou de natureza, e por que este arquivo existe ────────────────────
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O fator de redução NÃO é escolha do usuário. Ele DECORRE do cClassTrib.
 *   > É como o NCM: ninguém digita a alíquota do IPI, classifica o produto e a
 *   > alíquota vem.
 *
 * `teste-que-nao-exercita.md`: a asserção tem de olhar o EFEITO, não o caminho.
 * O efeito aqui é o conjunto que vai para as seis colunas novas de `products` —
 * e é por isso que todo caso afirma `resultado.gravar`, nunca "a função foi
 * chamada" nem "o campo existe".
 *
 * ── TODOS OS DADOS SÃO DO ARQUIVO OFICIAL ────────────────────────────────────
 *
 * `cClassTrib 2026-06-22.xlsx`, Portal DF-e SVRS. Os códigos, os CST, os
 * percentuais e as datas abaixo são os que a tabela traz — não são fixtures
 * inventadas. Um caso montado à mão passaria com a derivação errada de volta.
 *
 * ── OS CASOS DISCRIMINAM ─────────────────────────────────────────────────────
 *
 * O `200025` é o caso que carrega o arquivo: IBS 60 e CBS 100, o ÚNICO dos 164
 * em que os dois divergem. Ele é o que distingue "duas colunas" de "uma coluna
 * copiada duas vezes" — com qualquer outro código os dois valores coincidem e a
 * asserção passaria verde com os campos colapsados.
 */
import {
  resolveClassificacaoFiscal,
  isVigenteEm,
  type CClassTribRow,
} from '@/utils/classificacao-fiscal'

const PUBLICACAO = '2026-06-22'

/** 200025 — ProUni. O único dos 164 com IBS ≠ CBS. */
const PROUNI: CClassTribRow = {
  cst: '200',
  codigo: '200025',
  nome: 'Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos',
  p_red_ibs: 60,
  p_red_cbs: 100,
  d_ini_vig: '2026-01-01',
  d_fim_vig: null,
  source_published_at: PUBLICACAO,
}

/** 000001 — tributação integral. Redução ZERO, que é apurada. */
const INTEGRAL: CClassTribRow = {
  cst: '000',
  codigo: '000001',
  nome: 'Situações tributadas integralmente pelo IBS e CBS.',
  p_red_ibs: 0,
  p_red_cbs: 0,
  d_ini_vig: '2026-01-01',
  d_fim_vig: null,
  source_published_at: PUBLICACAO,
}

/** 220001 — um dos três em que d_fim_vig é IGUAL a d_ini_vig. */
const FIM_IGUAL_AO_INICIO: CClassTribRow = {
  cst: '220',
  codigo: '220001',
  nome: 'Incorporação imobiliária submetida ao regime especial de tributação',
  p_red_ibs: 0,
  p_red_cbs: 0,
  d_ini_vig: '2026-01-01',
  d_fim_vig: '2026-01-01',
  source_published_at: PUBLICACAO,
}

const base = { publicacaoConsultada: PUBLICACAO, hoje: '2026-09-16' }

describe('o par existe na tabela — a redução vem do código', () => {
  it('200025: grava IBS 60 e CBS 100 — SEPARADOS, porque a tabela os separa', () => {
    const r = resolveClassificacaoFiscal({ ...base, cst: '200', codigo: '200025', porCodigo: [PROUNI] })
    expect(r.status).toBe('TABELA')
    expect(r.gravar).toEqual({
      cst_ibs_cbs: '200',
      cclass_trib: '200025',
      cclass_trib_origem: 'TABELA',
      cclass_trib_source_published_at: '2026-06-22',
      iva_reduction_ibs_pct: 60,
      iva_reduction_cbs_pct: 100,
    })
  })

  it('os dois campos DIVERGEM — é o que um campo só não conseguiria dizer', () => {
    const r = resolveClassificacaoFiscal({ ...base, cst: '200', codigo: '200025', porCodigo: [PROUNI] })
    // O contraste é o que dá dente ao caso acima: colapsar CBS em IBS daria 60 e 60.
    expect(r.gravar!.iva_reduction_ibs_pct).not.toBe(r.gravar!.iva_reduction_cbs_pct)
    expect(r.gravar!.iva_reduction_cbs_pct).not.toBe(60)
    expect(r.gravar!.iva_reduction_ibs_pct).not.toBe(100)
  })

  it('000001: grava ZERO nos dois — e zero é APURADO, não ausência', () => {
    const r = resolveClassificacaoFiscal({ ...base, cst: '000', codigo: '000001', porCodigo: [INTEGRAL] })
    expect(r.gravar!.iva_reduction_ibs_pct).toBe(0)
    expect(r.gravar!.iva_reduction_cbs_pct).toBe(0)
    // `ausente-vs-falso.md`: aqui o zero é afirmação do fisco ("sem redução"),
    // e tem de ser distinguível do `null` do caso MANUAL.
    expect(r.gravar!.iva_reduction_ibs_pct).not.toBeNull()
  })

  it('a publicação gravada é a DA LINHA — é o que torna a procedência verificável', () => {
    const outraPublicacao = { ...PROUNI, source_published_at: '2026-03-01' }
    const r = resolveClassificacaoFiscal({
      ...base, cst: '200', codigo: '200025', porCodigo: [outraPublicacao],
    })
    expect(r.gravar!.cclass_trib_source_published_at).toBe('2026-03-01')
    expect(r.gravar!.cclass_trib_source_published_at).not.toBe(PUBLICACAO)
  })
})

describe('o código existe sob OUTRO CST — par incompatível, não inserção manual', () => {
  it('CST 000 com o código 200025 NÃO grava nada e diz onde o código mora', () => {
    const r = resolveClassificacaoFiscal({ ...base, cst: '000', codigo: '200025', porCodigo: [PROUNI] })
    expect(r.status).toBe('PAR_INCOMPATIVEL')
    expect(r.gravar).toBeNull()
    expect(r.status === 'PAR_INCOMPATIVEL' && r.cstDoCodigo).toEqual(['200'])
  })

  it('NÃO é tratado como MANUAL — o usuário errou o par, não inventou um código', () => {
    const r = resolveClassificacaoFiscal({ ...base, cst: '000', codigo: '200025', porCodigo: [PROUNI] })
    // Gravar isto como manual carimbaria "o usuário quis assim" num par que a
    // SEFAZ recusa, e a nota seria rejeitada com o dado parecendo intencional.
    expect(r.status).not.toBe('MANUAL')
    expect(r.status).not.toBe('TABELA')
  })
})

describe('o código não existe em CST nenhum — inserção manual, e ela passa', () => {
  const manual = { ...base, cst: '200', codigo: '200099', porCodigo: [] as CClassTribRow[] }

  it('grava o par com procedência MANUAL', () => {
    const r = resolveClassificacaoFiscal(manual)
    expect(r.status).toBe('MANUAL')
    expect(r.gravar!.cst_ibs_cbs).toBe('200')
    expect(r.gravar!.cclass_trib).toBe('200099')
    expect(r.gravar!.cclass_trib_origem).toBe('MANUAL')
  })

  it('as reduções saem NULL — não há de onde derivar, e zero afirmaria "sem redução"', () => {
    const r = resolveClassificacaoFiscal(manual)
    expect(r.gravar!.iva_reduction_ibs_pct).toBeNull()
    expect(r.gravar!.iva_reduction_cbs_pct).toBeNull()
    expect(r.gravar!.iva_reduction_ibs_pct).not.toBe(0)
  })

  it('a publicação consultada É gravada — ela afirma "não estava na tabela DESTA data"', () => {
    const r = resolveClassificacaoFiscal(manual)
    expect(r.gravar!.cclass_trib_source_published_at).toBe(PUBLICACAO)
  })

  it('a procedência distingue os dois caminhos — é o que a auditoria pergunta', () => {
    const daTabela = resolveClassificacaoFiscal({ ...base, cst: '200', codigo: '200025', porCodigo: [PROUNI] })
    const digitado = resolveClassificacaoFiscal(manual)
    expect(daTabela.gravar!.cclass_trib_origem).toBe('TABELA')
    expect(digitado.gravar!.cclass_trib_origem).toBe('MANUAL')
    expect(daTabela.gravar!.cclass_trib_origem).not.toBe(digitado.gravar!.cclass_trib_origem)
  })
})

describe('vigência — inclusiva nas duas pontas, e o 220001 é quem prova', () => {
  it('220001 é vigente EM 2026-01-01, com início e fim na mesma data', () => {
    expect(isVigenteEm(FIM_IGUAL_AO_INICIO, '2026-01-01')).toBe(true)
  })

  it('e NÃO é vigente no dia seguinte nem no anterior', () => {
    expect(isVigenteEm(FIM_IGUAL_AO_INICIO, '2026-01-02')).toBe(false)
    expect(isVigenteEm(FIM_IGUAL_AO_INICIO, '2025-12-31')).toBe(false)
  })

  it('sem fim de vigência, segue valendo indefinidamente — NULL não é uma data', () => {
    expect(isVigenteEm(PROUNI, '2026-09-16')).toBe(true)
    expect(isVigenteEm(PROUNI, '2099-01-01')).toBe(true)
    expect(isVigenteEm(PROUNI, '2025-12-31')).toBe(false)
  })

  it('o resultado carrega a vigência na data de referência, sem bloquear por ela', () => {
    // A rejeição por vigência é da EMISSÃO, na data da nota — não do cadastro.
    const r = resolveClassificacaoFiscal({
      ...base, cst: '220', codigo: '220001', porCodigo: [FIM_IGUAL_AO_INICIO], hoje: '2026-09-16',
    })
    expect(r.status).toBe('TABELA')
    expect(r.vigenteEm).toBe(false)
    expect(r.gravar).not.toBeNull()
  })
})
