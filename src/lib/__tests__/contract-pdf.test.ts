import { buildContractDoc, buildContractPdfBuffer } from '@/lib/contract-pdf'

describe('contract-pdf', () => {
  it('gera um PDF válido (assinatura %PDF) com os dados preenchidos', () => {
    const buf = buildContractPdfBuffer({
      name: 'Empresa Exemplo LTDA',
      cpfCnpj: '12.345.678/0001-90',
      email: 'cliente@exemplo.com',
      phone: '(51) 99999-8888',
      signatureDate: new Date(2026, 6, 22), // 22/07/2026
    })
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.slice(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('não lança e usa linha em branco quando CPF/CNPJ não é informado', () => {
    expect(() =>
      buildContractPdfBuffer({
        name: 'Cliente Sem Documento',
        email: 'sem.doc@exemplo.com',
        // cpfCnpj e phone ausentes → linha em branco
        signatureDate: new Date(2026, 6, 22),
      })
    ).not.toThrow()
  })

  it('quebra o contrato em múltiplas páginas (documento longo)', () => {
    const doc = buildContractDoc({
      name: 'Empresa Longa LTDA',
      cpfCnpj: '00.000.000/0001-00',
      email: 'a@b.com',
      phone: '(11) 90000-0000',
      signatureDate: new Date(2026, 6, 22),
    })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})
