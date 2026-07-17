import {
  isValidEmailFormat,
  getEmailDomain,
  phoneDigits,
  isValidBrazilianMobile,
  maskPhoneBR,
} from '../contact-validation'

describe('isValidEmailFormat', () => {
  it('aceita e-mails bem formados', () => {
    expect(isValidEmailFormat('cristiano@gmail.com')).toBe(true)
    expect(isValidEmailFormat('a.b-c+d@sub.dominio.com.br')).toBe(true)
  })
  it('rejeita formatos inválidos', () => {
    expect(isValidEmailFormat('sem-arroba')).toBe(false)
    expect(isValidEmailFormat('a@b')).toBe(false)
    expect(isValidEmailFormat('a@@b.com')).toBe(false)
    expect(isValidEmailFormat('espaco @dominio.com')).toBe(false)
    expect(isValidEmailFormat('')).toBe(false)
  })
})

describe('getEmailDomain', () => {
  it('extrai o domínio em minúsculas', () => {
    expect(getEmailDomain('Foo@GMAIL.com')).toBe('gmail.com')
    expect(getEmailDomain('x@Sub.Dominio.com.br')).toBe('sub.dominio.com.br')
  })
})

describe('isValidBrazilianMobile', () => {
  it('aceita celulares BR válidos (11 dígitos, DDD, nono 9)', () => {
    expect(isValidBrazilianMobile('11912345678')).toBe(true)
    expect(isValidBrazilianMobile('(11) 91234-5678')).toBe(true)
    expect(isValidBrazilianMobile('47 99999-9999')).toBe(true)
  })
  it('rejeita fixos, DDD inválido, tamanho errado', () => {
    expect(isValidBrazilianMobile('1132345678')).toBe(false) // 10 dígitos (fixo)
    expect(isValidBrazilianMobile('11812345678')).toBe(false) // 3º dígito não é 9
    expect(isValidBrazilianMobile('09912345678')).toBe(false) // DDD < 11
    expect(isValidBrazilianMobile('119123456789')).toBe(false) // 12 dígitos
    expect(isValidBrazilianMobile('')).toBe(false)
  })
})

describe('phoneDigits', () => {
  it('mantém apenas dígitos', () => {
    expect(phoneDigits('(11) 91234-5678')).toBe('11912345678')
    expect(phoneDigits('abc')).toBe('')
  })
})

describe('maskPhoneBR', () => {
  it('formata progressivamente', () => {
    expect(maskPhoneBR('11')).toBe('(11')
    expect(maskPhoneBR('1191234')).toBe('(11) 91234')
    expect(maskPhoneBR('11912345678')).toBe('(11) 91234-5678')
  })
  it('trunca em 11 dígitos e ignora não-dígitos', () => {
    expect(maskPhoneBR('11912345678999')).toBe('(11) 91234-5678')
    expect(maskPhoneBR('')).toBe('')
  })
})
