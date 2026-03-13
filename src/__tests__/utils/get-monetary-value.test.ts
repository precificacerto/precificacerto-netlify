import { getMonetaryValue, revertMonetaryValue } from '@/utils/get-monetary-value'

describe('getMonetaryValue', () => {
  it('should be a function', () => {
    expect(getMonetaryValue).toBeInstanceOf(Function)
  })

  it('should return a string', () => {
    expect(getMonetaryValue(1)).toMatch(/^\d{1,3}(\.\d{3})*,\d{2}$/)
  })

  it('should return 10.000,00', () => {
    expect(getMonetaryValue(10000)).toMatch('10.000,00')
  })

  it('should return a string with the correct format', () => {
    expect(getMonetaryValue(1)).toMatch(/^\d{1,3}(\.\d{3})*,\d{2}$/)
  })
})

describe('revertMonetaryValue', () => {
  it('should be a function', () => {
    expect(revertMonetaryValue).toBeInstanceOf(Function)
  })

  it('should return a number', () => {
    expect(revertMonetaryValue('1,00')).toBe(1)
  })

  it('should return 10000', () => {
    expect(revertMonetaryValue('10.000,00')).toBe(10000)
  })

  it('should return 1000493.34', () => {
    expect(revertMonetaryValue('1.000.493,34')).toBe(1000493.34)
  })

  it('should return a number with the correct format', () => {
    expect(revertMonetaryValue('1,00')).toBe(1)
  })
})
