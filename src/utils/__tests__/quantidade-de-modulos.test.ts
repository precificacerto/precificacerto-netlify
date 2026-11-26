/**
 * PORTÃO — A QUANTIDADE DE MÓDULOS É GRAVADA (dono do produto, 24/11/2026; pedido 0023): "o agente grava em escolhas todas as variáveis que
 * decidiu, N entre elas, inclusive quando usa o padrão". Medido em produção no levantamento 29: `escolhas` NULA nos itens de DP-128 e DP-142.
 * O motor (`fixtures/motor-das-tipologias-do-corte.json`) é o de produção: DP-128 e DP-142 têm N, a DP-144 tem V, todas com Padrão 1.
 */
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, type AbasDoMotor, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { lerEscolhasGravadas, MODULOS_QUANDO_NAO_DITO, modulosNaoDitos, paraOAgente, validarModulos, variavelDeModulos, variaveisDeQuantidadeDeModulos } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { descricaoParaOVendedor, variaveisDeModulo } from '@/lib/atendimentos-ia/descricao-para-o-vendedor'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MOTOR = require('./fixtures/motor-das-tipologias-do-corte.json') as { tabelas: Record<string, Array<Record<string, unknown>>> }
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela]).map((a) => [a.nome, abaDoBanco(a, MOTOR.tabelas[a.tabela])]))
const tipologia = (codigo: string): Tipologia => {
    const t = lerTipologia(abas, codigo)
    if ('recusas' in t) throw new Error(t.recusas[0].mensagem)
    return t.tipologia
}
const descricao = (codigo: string) => String(MOTOR.tabelas.orcamentista_motor_tipologia_detalhe.find((d) => d.tipologia === codigo)?.descricao)

describe('quais variáveis são a quantidade de módulos', () => {
    it('pela DESCRIÇÃO da aba, sem opções: N na DP-128 e na DP-142, V na DP-144; nenhuma na DP-02', () => {
        expect(variaveisDeQuantidadeDeModulos(tipologia('DP-128'))).toEqual(['N'])
        expect(variaveisDeQuantidadeDeModulos(tipologia('DP-142'))).toEqual(['N'])
        expect(variaveisDeQuantidadeDeModulos(tipologia('DP-144'))).toEqual(['V'])
        expect(variaveisDeQuantidadeDeModulos(tipologia('DP-02'))).toEqual([])
        // a variável de cada SENTIDO (25/11/2026, pedido 0026: "05 módulos verticais" é V = 5): a DP-128 só tem a dos horizontais; a DP-144, só a dos verticais
        expect([variavelDeModulos(tipologia('DP-128'), 'horizontais'), variavelDeModulos(tipologia('DP-128'), 'verticais')]).toEqual(['N', null])
        expect([variavelDeModulos(tipologia('DP-144'), 'horizontais'), variavelDeModulos(tipologia('DP-144'), 'verticais')]).toEqual([null, 'V'])
        expect(variavelDeModulos(tipologia('DP-02'), 'horizontais')).toBeNull()
        // a variável com a mesma descrição mas COM lista de opções é escolha, não quantidade livre: não é ela
        const comOpcoes = { variaveis: tipologia('DP-128').variaveis.map((v) => (v.variavel === 'N' ? { ...v, opcoes: '1 = 01 MÓDULO; 2 = 02 MÓDULOS' } : v)) }
        expect(variavelDeModulos(comOpcoes, 'horizontais')).toBeNull()
    })
    it('é a mesma variável que a descrição da tipologia traz entre aspas (as duas leituras concordam no motor de produção)', () => {
        for (const codigo of ['DP-128', 'DP-142', 'DP-144']) expect(variaveisDeQuantidadeDeModulos(tipologia(codigo))).toEqual(variaveisDeModulo(descricao(codigo)))
    })
    it('a sigla N com OUTRA descrição ("MÓDULOS BANDEIRA"), ou com opções, não é a quantidade de módulos', () => {
        const com = (v: Record<string, unknown>) => ({ variaveis: [{ variavel: 'N', descricao: 'QUANTIDADE DE MÓDULOS HORIZONTAIS', padrao: '1', condicao: 'sempre', opcoes: null, ...v }] }) as unknown as Tipologia
        expect(variaveisDeQuantidadeDeModulos(com({}))).toEqual(['N'])
        expect(variaveisDeQuantidadeDeModulos(com({ descricao: 'MÓDULOS BANDEIRA' }))).toEqual([])
        expect(variaveisDeQuantidadeDeModulos(com({ descricao: 'QUANTIDADE DE MÓDULOS HORIZONTAIS DA BANDEIRA' }))).toEqual([])
        expect(variaveisDeQuantidadeDeModulos(com({ opcoes: '1 = 01 MÓDULO; 2 = 02 MÓDULOS' }))).toEqual([])
        expect(variaveisDeQuantidadeDeModulos(com({ descricao: ' quantidade de módulos verticais ' }))).toEqual(['N'])
    })
    it('vale também na aba que o AGENTE recebe (sem a coluna Padrão): a etapa 1 não precisa do padrão do motor para gravar', () => {
        expect(variaveisDeQuantidadeDeModulos(paraOAgente(tipologia('DP-128')))).toEqual(['N'])
    })
})

describe('sem o vendedor dizer, é um módulo — e isso é gravado', () => {
    it('o item sem a quantidade gravada ganha UMA em cada variável de módulos; o que já está gravado não muda', () => {
        expect(MODULOS_QUANDO_NAO_DITO).toBe(1)
        const t = tipologia('DP-128')
        expect(modulosNaoDitos(t, null)).toEqual({ N: 1 })
        expect(modulosNaoDitos(t, {})).toEqual({ N: 1 })
        expect(modulosNaoDitos(t, { ARI: 4 })).toEqual({ N: 1 })
        expect(modulosNaoDitos(t, { N: 2 })).toEqual({})
        expect(modulosNaoDitos(t, { N: 1 })).toEqual({})
        // o que não é uma quantidade (nulo, zero, fração) não conta como gravado
        for (const naoGravado of [null, 0, -1, 1.5]) expect(modulosNaoDitos(t, { N: naoGravado as number | null })).toEqual({ N: 1 })
        expect(modulosNaoDitos(tipologia('DP-144'), null)).toEqual({ V: 1 })
        expect(modulosNaoDitos(tipologia('DP-02'), null)).toEqual({})
    })
    it('gravado, a descrição que o vendedor lê é a de um módulo: DP-128 é "Maxim-ar com um módulo", DP-142 é "Fixo com um módulo" (pedido 0035) — e sem gravar ela diria "a definir"', () => {
        expect(descricaoParaOVendedor(descricao('DP-128'), modulosNaoDitos(tipologia('DP-128'), null))).toBe('Maxim-ar com um módulo')
        expect(descricaoParaOVendedor(descricao('DP-142'), modulosNaoDitos(tipologia('DP-142'), null))).toBe('Fixo com um módulo')
        expect(descricaoParaOVendedor(descricao('DP-144'), modulosNaoDitos(tipologia('DP-144'), null))).toBe('Fixo com um módulo')
        expect(descricaoParaOVendedor(descricao('DP-128'), null)).toBe('Maxim-ar com módulos horizontais a definir')
    })
})

describe('a quantidade DITA pelo vendedor', () => {
    it('vale se a variável é de módulos NESTA tipologia e a quantidade é um inteiro maior que zero', () => {
        const t = tipologia('DP-128')
        expect(validarModulos(t, { variavel: 'N', opcao: 2 })).toEqual({ variavel: 'N', valor: 2 })
        expect(validarModulos(t, { variavel: 'N', opcao: 1 })).toEqual({ variavel: 'N', valor: 1 })
        expect(validarModulos(tipologia('DP-144'), { variavel: 'V', opcao: 3 })).toEqual({ variavel: 'V', valor: 3 })
    })
    it('o que não vale é descartado, nunca corrigido: outra variável, a variável de outra tipologia, zero, negativo, fração, texto', () => {
        const t = tipologia('DP-128')
        for (const proposta of [{ variavel: 'V', opcao: 2 }, { variavel: 'ARI', opcao: 2 }, { variavel: 'N', opcao: 0 }, { variavel: 'N', opcao: -2 }, { variavel: 'N', opcao: 1.5 }, { variavel: 'N', opcao: '2' }, { variavel: 'N' }, { opcao: 2 }, null, 'N=2']) {
            expect(validarModulos(t, proposta)).toBeNull()
        }
        expect(validarModulos(tipologia('DP-02'), { variavel: 'N', opcao: 2 })).toBeNull()
    })
})

describe('o cálculo usa a quantidade gravada', () => {
    it('a quantidade gravada sobrevive à leitura do cálculo só na tipologia que a tem, e só quando é maior que zero', () => {
        expect(lerEscolhasGravadas({ N: 2 }, tipologia('DP-128'))).toEqual({ N: 2 })
        expect(lerEscolhasGravadas({ V: 3 }, tipologia('DP-144'))).toEqual({ V: 3 })
        expect(lerEscolhasGravadas({ N: 2 }, tipologia('DP-02'))).toEqual({})
        expect(lerEscolhasGravadas({ N: 0 }, tipologia('DP-128'))).toEqual({})
        expect(lerEscolhasGravadas({ N: 2 }, null)).toEqual({})
    })
    const pecas = (codigo: string, escolhas: Record<string, number>) => {
        const r = avaliarTipologia({ tipologia: tipologia(codigo), L_mm: 1200, H_mm: 800, escolhas, espessura_vidro_mm: 4 })
        if ('recusas' in r) throw new Error(r.recusas.map((x) => x.mensagem).join('; '))
        return r.pecas.map((p) => `${p.codigo}|${p.posicao}|${Math.trunc(p.comprimento_mm)}x${p.quantidade}`).sort()
    }
    it.each([['DP-128', 'N'], ['DP-142', 'N'], ['DP-144', 'V']])('%s: gravar UM módulo NÃO muda nenhuma peça — é o mesmo corte de antes, quando nada era gravado (o preço não muda)', (codigo, variavel) => {
        expect(pecas(codigo, { [variavel]: 1 })).toEqual(pecas(codigo, {}))
        expect(pecas(codigo, {}).length).toBeGreaterThan(0)
    })
    it.each([['DP-128', 'N'], ['DP-142', 'N']])('%s: DOIS módulos ditos mudam o corte (a quantidade chega ao motor)', (codigo, variavel) => {
        expect(pecas(codigo, { [variavel]: 2, PM: 1 })).not.toEqual(pecas(codigo, { [variavel]: 1 }))
    })
})
