/**
 * A CONTA DO MOTOR mora em `calcularNoMotorDoProduto` (`src/utils/motor-do-produto.ts`) e em lugar nenhum mais (dono do produto, 11/11/2026:
 * "nenhuma cópia sobrevivente"). Esta asserção é de FONTE, e assumida como tal: ela afirma que o `content.component` de Produtos chama o módulo
 * e não refaz a conta — pelo que ele LÊ e escreve, não só pelo nome de uma função (a lição da asserção do `ProductPrice`, que só procurava
 * chamadas e deixava passar conta à mão).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const tela = readFileSync(join(__dirname, '..', '..', 'page-parts', 'products', 'content.component.tsx'), 'utf-8')
const programa = tela.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('o doProductCalc chama o módulo do motor e não refaz a conta', () => {
    it('chama `calcularNoMotorDoProduto` e grava o que ele devolve', () => {
        expect(programa).toContain('const conta = calcularNoMotorDoProduto({')
        expect(programa).toContain('...conta.campos, ...conta.porProdutoDoServico(prev)')
    })
    it('nenhuma chamada de conta do motor na tela', () => {
        for (const f of ['calculatePricing(', 'divisorDaEstruturaPct(', 'custoMensalDeMaoDeObraDoProduto(', 'resolveIndirectLaborPct(']) expect(programa).not.toContain(f)
    })
    it('nem a conta à mão: IRPJ e CSLL sobre o lucro, o imposto do regime, os valores sobre o preço do motor', () => {
        expect(programa).not.toMatch(/productProfitPercent\s*\*\s*0\.(15|09)\b/)
        expect(programa).not.toMatch(/taxesPercent\s*\|\|\s*0/)
        expect(programa).not.toMatch(/engineResult\./)
        expect(programa).not.toMatch(/\.(priceUnit|cmvUnit|productiveLaborCost)\b/)
    })
    it('o tipo de cálculo efetivo sai da fonte única, nunca do ternário', () => {
        expect(programa).toContain('tipoDeCalculoEfetivo(productType, currentUser?.calcType)')
        // o ternário que segue o TENANT (o extraído); `construction: productType === 'REVENDA' ? … : 'INDUSTRIALIZACAO'` do salvar é outra regra
        expect(programa).not.toMatch(/productType === 'REVENDA'\s*\?\s*'REVENDA'\s*:\s*currentUser/)
    })
})
