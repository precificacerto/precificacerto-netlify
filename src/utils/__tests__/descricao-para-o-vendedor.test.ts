/**
 * PORTÃO — A DESCRIÇÃO DA TIPOLOGIA COMO O VENDEDOR A LÊ (dono do produto, 24/11/2026; pedido 0023). As descrições são as do motor 259035a9
 * (medidas em produção em 24/11/2026): as catorze formas de "COM … MÓDULOS" e as que não são de módulos.
 */
import { descricaoParaOVendedor as ler, modulosDaDescricao, semALinha, variaveisDeModulo } from '@/lib/atendimentos-ia/descricao-para-o-vendedor'

const DP128 = 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | PERFIL MODULAÇÃO | EUROPA 60'
const DP142 = 'FIXO COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | PERFIL MODULAÇÃO | EUROPA 60'
const DP01 = 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN'
const DP02 = 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42'

describe('com um módulo não se escreve módulo', () => {
    it('a tabela do dono do produto: DP-128 com N=1 é "Maxim-ar"; DP-142 com N=1 é "Fixo"; com dois ou mais, o sentido aparece', () => {
        expect(ler(DP128, { N: 1 })).toBe('Maxim-ar')
        expect(ler(DP142, { N: 1 })).toBe('Fixo')
        expect(ler(DP128, { N: 2 })).toBe('Maxim-ar com 02 módulos horizontais')
        expect(ler('FIXO COM 01 MÓDULO HORIZONTAL E "V" MÓDULOS VERTICAIS | PERFIL MODULAÇÃO | EUROPA 60', { V: 2 })).toBe('Fixo com 02 módulos verticais')
    })
    it('nem a palavra "módulo", nem "horizontal", nem "vertical", nem a linha, nem o tipo de modulação aparecem com um módulo só', () => {
        for (const d of [DP128, DP142, DP01]) {
            const lida = ler(d, { N: 1 }) as string
            expect(lida).not.toMatch(/m[óo]dulo|horizonta|vertica|europa|design|modula[çc][ãa]o|\||"/i)
        }
    })
    it('os dois sentidos com dois ou mais: os dois aparecem, o horizontal primeiro; o número fixo da descrição vale como está', () => {
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS | EUROPA 60', { N: 3, V: 2 })).toBe('Maxim-ar com 03 módulos horizontais e 02 módulos verticais')
        expect(ler('FIXO COM "N" MÓDULOS HORIZONTAIS E 03 MÓDULOS VERTICAIS | EUROPA 60', { N: 1 })).toBe('Fixo com 03 módulos verticais')
        expect(ler('FIXO COM "N" MÓDULOS HORIZONTAIS E 04 MÓDULOS VERTICAIS | EUROPA 60', { N: 2 })).toBe('Fixo com 02 módulos horizontais e 04 módulos verticais')
        expect(ler('FIXO COM "N" MÓDULOS HZ E 02 MÓDULOS VT | EUROPA 60', { N: 1 })).toBe('Fixo com 02 módulos verticais')
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | EUROPA 60', { N: 12 })).toBe('Maxim-ar com 12 módulos horizontais')
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | EUROPA 60', { N: 1 })).toBe('Maxim-ar')
    })
    it('a variável SEM valor conhecido não vira um módulo nem some: a quantidade está por definir', () => {
        for (const valores of [null, {}, { N: null }, { N: 0 }, { N: -1 }, { N: 1.5 }, { V: 2 }]) expect(ler(DP128, valores)).toBe('Maxim-ar com módulos horizontais a definir')
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS', { N: 1 })).toBe('Maxim-ar com módulos verticais a definir')
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS', { V: 1 })).toBe('Maxim-ar com módulos horizontais a definir')
    })
})

describe('a descrição que não é de módulos', () => {
    it('sai como está, sem o que vem depois do "|", com a inicial maiúscula', () => {
        expect(ler(DP02)).toBe('Janela de correr 02 folhas móveis')
        expect(ler('PORTA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', { N: 2 })).toBe('Porta de correr 02 folhas móveis')
        expect(ler('JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | 02 VIDROS - 01 TELA | EUROPA 42')).toBe('Janela de correr 03 folhas móveis com persiana')
    })
    it('a forma que não se lê INTEIRA como módulos não é adivinhada: sai como está', () => {
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E BANDEIRA FIXA | EUROPA 60', { N: 1 })).toBe('Maxim-ar com "n" módulos horizontais e bandeira fixa')
        expect(modulosDaDescricao('FIXO COM 02 MÓDULOS HORIZONTAIS E 03 MÓDULOS HORIZONTAIS')).toBeNull()
        expect(modulosDaDescricao('FIXO COM MÓDULOS')).toBeNull()
    })
    it('sem descrição: nulo (quem chama decide o que escrever)', () => {
        for (const d of [null, undefined, '', '   ', ' | EUROPA 60']) expect(ler(d)).toBeNull()
    })
})

describe('as peças da leitura', () => {
    it('semALinha: só o que vem antes do primeiro "|"', () => {
        expect(semALinha(DP128)).toBe('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL')
        expect(semALinha('  FIXO   COM  X ')).toBe('FIXO COM X')
    })
    it('modulosDaDescricao: o nome, e a quantidade de cada sentido — fixa ou de variável', () => {
        expect(modulosDaDescricao(DP128)).toEqual({ nome: 'MAXIM-AR', horizontal: { variavel: 'N' }, vertical: { fixo: 1 } })
        expect(modulosDaDescricao('FIXO COM 01 MÓDULO HORIZONTAL E "V" MÓDULOS VERTICAIS')).toEqual({ nome: 'FIXO', horizontal: { fixo: 1 }, vertical: { variavel: 'V' } })
        expect(modulosDaDescricao('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS')).toEqual({ nome: 'MAXIM-AR', horizontal: { variavel: 'N' }, vertical: null })
        expect(modulosDaDescricao(DP02)).toBeNull()
        expect(modulosDaDescricao(null)).toBeNull()
    })
    it('variaveisDeModulo: as variáveis que dão a quantidade, horizontal antes de vertical; a fixa não é variável', () => {
        expect(variaveisDeModulo(DP128)).toEqual(['N'])
        expect(variaveisDeModulo('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS')).toEqual(['N', 'V'])
        expect(variaveisDeModulo('FIXO COM 01 MÓDULO HORIZONTAL E "V" MÓDULOS VERTICAIS')).toEqual(['V'])
        expect(variaveisDeModulo(DP02)).toEqual([])
    })
})
