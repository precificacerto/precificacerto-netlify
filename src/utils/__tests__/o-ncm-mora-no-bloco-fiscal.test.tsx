/**
 * O NCM mora no bloco Fiscal — e continua DENTRO do escopo do <Form>.
 *
 * A Parte A reagrupou a tela de produto em dois Cards, Identificação e Fiscal, e o campo
 * NCM mudou de bloco. O `<Form form={productForm}>` passou a abraçar os DOIS Cards, em vez
 * de viver dentro do primeiro. É uma mudança de ESCOPO, e escopo de Form quebra em silêncio.
 *
 * ── O QUE CADA PARTE AFIRMA, e por que as duas são necessárias ────────────────────────
 *
 * PARTE 1 afirma o EFEITO, com antd de verdade: um `Form.Item` FORA do `<Form>` some do
 * `getFieldsValue()`. O save faz exatamente `const values = productForm.getFieldsValue()` e
 * grava `values.ncm_code || null` — então o campo fora do escopo grava `null` sem erro
 * nenhum, sem exceção, sem log. O React emite um `console.warn` e a tela segue funcionando.
 * É o mecanismo do defeito, medido, não deduzido.
 *
 * PARTE 2 afirma o CAMINHO: onde o campo está no arquivo real. `teste-que-nao-exercita.md`
 * proíbe afirmar caminho **quando existe efeito mensurável e ele foi deixado de fora** — e
 * reconhece o caso-limite em que o defeito É a posição e não há número a medir. É este: o
 * efeito está medido na Parte 1, e o que a Parte 2 acrescenta é que ESTE arquivo satisfaz a
 * condição que a Parte 1 mostrou ser necessária. Uma sem a outra não fecha: a Parte 1
 * sozinha testa o antd, a Parte 2 sozinha seria "a prop está no arquivo".
 *
 * O EFEITO NUMÉRICO da outra metade — selecionar um NCM preenche a alíquota — está em
 * `o-ncm-determina-a-aliquota-de-pis-cofins.test.ts`, sobre a função pura que o componente
 * chama. Aqui fica só o gatilho que a dispara.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Form, Input } from 'antd'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 1 — o mecanismo, com antd de verdade
// ─────────────────────────────────────────────────────────────────────────────

function Harness({ dentro, onForm }: { dentro: boolean; onForm: (f: any) => void }) {
  const [form] = Form.useForm()
  onForm(form)
  // O MESMO Form.Item nos dois casos. A única variável é onde ele fica.
  const campoNcm = <Form.Item name="ncm_code"><Input /></Form.Item>
  return (
    <div>
      <Form form={form} layout="vertical">
        <Form.Item name="name"><Input /></Form.Item>
        {dentro ? campoNcm : null}
      </Form>
      {dentro ? null : campoNcm}
    </div>
  )
}

function montaEPreenche(dentro: boolean): Record<string, any> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let form: any
  // O warning "Can not find FormContext" é ESPERADO no caso `dentro: false` — é o único
  // sinal que o React dá, e ele não chega a lugar nenhum em produção.
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    act(() => { createRoot(host).render(<Harness dentro={dentro} onForm={(f) => { form = f }} />) })
    act(() => { form.setFieldsValue({ name: 'Bolo de cenoura', ncm_code: '19059090' }) })
  } catch { /* o render do caso fora-do-escopo pode agregar o warning */ }
  finally { warn.mockRestore() }
  // É exatamente o que o save faz: `const values = productForm.getFieldsValue()`
  return form.getFieldsValue()
}

describe('PARTE 1 — o escopo do <Form> decide se o campo chega ao save', () => {
  it('DENTRO do <Form>: getFieldsValue() traz o ncm_code', () => {
    const values = montaEPreenche(true)
    expect(values.ncm_code).toBe('19059090')
    expect(values.ncm_code || null).toBe('19059090')
  })

  it('FORA do <Form>: o ncm_code SOME, e o save gravaria null sem erro nenhum', () => {
    const values = montaEPreenche(false)
    expect(values.ncm_code).toBeUndefined()
    // a linha do save é `ncm_code: values.ncm_code || null` — o `|| null` transforma o
    // campo perdido numa afirmação: "este produto não tem NCM".
    expect(values.ncm_code || null).toBeNull()
  })

  it('o resto do formulário continua intacto nos dois casos — por isso ninguém percebe', () => {
    expect(montaEPreenche(true).name).toBe('Bolo de cenoura')
    expect(montaEPreenche(false).name).toBe('Bolo de cenoura')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 2 — o arquivo real satisfaz a condição que a Parte 1 mostrou ser necessária
// ─────────────────────────────────────────────────────────────────────────────

const ARQUIVO = join(process.cwd(), 'src/page-parts/products/content.component.tsx')
const src = readFileSync(ARQUIVO, 'utf-8')

const idx = (agulha: string): number => {
  const i = src.indexOf(agulha)
  expect(i).toBeGreaterThan(-1)
  return i
}

describe('PARTE 2 — a tela de produto: Identificação e Fiscal, um <Form> só', () => {
  it('existe UM <Form form={productForm}> e UM </Form> — se houver dois, esta prova não vale', () => {
    expect(src.split('<Form form={productForm}').length - 1).toBe(1)
    expect(src.split('\n      </Form>').length - 1).toBe(1)
  })

  it('o <Form> abraça o Card FISCAL — abre antes dele e fecha depois', () => {
    const abreForm = idx('<Form form={productForm}')
    const abreFiscal = idx('FISCAL — o que a NOTA exige do produto')
    const fechaForm = idx('\n      </Form>')
    expect(abreForm).toBeLessThan(abreFiscal)
    expect(abreFiscal).toBeLessThan(fechaForm)
  })

  it('o campo NCM está DENTRO do Card fiscal e DENTRO do <Form> — é a condição da Parte 1', () => {
    const abreForm = idx('<Form form={productForm}')
    const abreFiscal = idx('FISCAL — o que a NOTA exige do produto')
    const ncm = idx('name="ncm_code"')
    const fechaForm = idx('\n      </Form>')
    expect(ncm).toBeGreaterThan(abreFiscal)   // mudou de bloco: saiu da Identificação
    expect(ncm).toBeGreaterThan(abreForm)     // e não saiu do escopo do Form
    expect(ncm).toBeLessThan(fechaForm)
  })

  it('o bloco de sugestões foi JUNTO, e ficou ao lado do campo que preenche', () => {
    const ncm = idx('name="ncm_code"')
    const sugestoes = idx('{(ncmSugLoading || ncmSuggestions.length > 0) && (')
    const contexto = idx('Contexto da Venda (para cálculo de impostos)')
    expect(sugestoes).toBeGreaterThan(ncm)
    expect(sugestoes).toBeLessThan(contexto)
  })

  it('o Card de Identificação NÃO tem mais o NCM — o reagrupamento aconteceu de fato', () => {
    const abreIdentificacao = idx('<Form form={productForm}')
    const abreFiscal = idx('FISCAL — o que a NOTA exige do produto')
    const identificacao = src.slice(abreIdentificacao, abreFiscal)
    expect(identificacao).not.toContain('name="ncm_code"')
    expect(identificacao).not.toContain('ncmSugLoading')
    // e continua tendo o que É identificação
    expect(identificacao).toContain('name="name"')
    expect(identificacao).toContain('name="section_id"')
  })
})

describe('PARTE 2 — os dois gatilhos vieram junto', () => {
  const blocoFiscal = (): string =>
    src.slice(idx('FISCAL — o que a NOTA exige do produto'), idx('\n      </Form>'))

  it('o onSelect do campo NCM ainda dispara fetchNcmRatesForLR — é o gatilho do AutoComplete', () => {
    const campo = src.slice(idx('name="ncm_code"'), idx('name="ncm_code"') + 1400)
    expect(campo).toContain('onSelect={(value: string) => {')
    expect(campo).toContain('fetchNcmRatesForLR(value)')
    // e o gatilho está dentro do Card fiscal, junto do campo
    expect(blocoFiscal()).toContain('fetchNcmRatesForLR(value)')
  })

  it('a sugestão clicada ainda chama handleSelectNcmSuggestion — que também preenche a alíquota', () => {
    expect(blocoFiscal()).toContain('onClick={() => handleSelectNcmSuggestion(s.code)}')
    // o handler continua no topo do componente, fora do JSX, e continua chamando a busca
    const handler = src.slice(
      idx('const handleSelectNcmSuggestion = useCallback'),
      idx('const handleSelectNcmSuggestion = useCallback') + 400,
    )
    expect(handler).toContain("productForm.setFieldsValue({ ncm_code: code })")
    expect(handler).toContain('fetchNcmRatesForLR(code)')
  })

  it('o save continua lendo do productForm e gravando o código', () => {
    expect(src).toContain('const values = productForm.getFieldsValue()')
    expect(src).toContain('ncm_code: values.ncm_code || null,')
  })

  it('a alíquota que a busca resolve continua indo para o payload', () => {
    expect(src).toContain('extraFields.pis_cofins_pct = pisCofinsLRPct || 0')
    // e quem calcula o número é a função pura, cujo efeito está medido no outro arquivo
    expect(src).toContain("import { resolvePisCofinsPctFromNcm } from '@/utils/ncm-pis-cofins'")
  })
})

describe('PARTE 2 — o lugar preparado para o que a NF-e ainda exige', () => {
  it('os três campos que faltam estão marcados, e NÃO foram criados', () => {
    const bloco = src.slice(idx('LUGAR PREPARADO'), idx('LUGAR PREPARADO') + 500)
    expect(bloco).toContain('Origem da mercadoria')
    expect(bloco).toContain('CST / CSOSN')
    expect(bloco).toContain('cClassTrib')
    // marcado é comentário; criado seria Form.Item. Inventar a lista dos 156 códigos é o que
    // `ausente-vs-falso.md` proíbe — a tabela não existe ainda.
    expect(src).not.toContain('name="origem_mercadoria"')
    expect(src).not.toContain('name="cst"')
    expect(src).not.toContain('name="cclass_trib"')
  })
})
