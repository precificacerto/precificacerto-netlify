/**
 * PORTÃO — A DESCRIÇÃO DA TIPOLOGIA COMO O VENDEDOR A LÊ (dono do produto, 24/11/2026; pedido 0023). As descrições são as do motor 259035a9
 * (medidas em produção em 24/11/2026): as catorze formas de "COM … MÓDULOS" e as que não são de módulos.
 */
import { descricaoParaOVendedor as ler, modulosDaDescricao, nomeDaCandidata, nomesDasCandidatas, tipoDeModulacao, trechosDaDescricao, valoresDosModulos, variaveisDeModulo } from '@/lib/atendimentos-ia/descricao-para-o-vendedor'

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
    it('sai como está, sem a linha de perfil, com a inicial maiúscula; o que a esquadria TEM (o trecho do meio) fica', () => {
        expect(ler(DP02)).toBe('Janela de correr 02 folhas móveis')
        expect(ler('PORTA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', { N: 2 })).toBe('Porta de correr 02 folhas móveis')
        expect(ler('JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | 02 VIDROS - 01 TELA | EUROPA 42')).toBe('Janela de correr 03 folhas móveis com persiana | 02 Vidros - 01 tela')
        expect(ler('JANELA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA FIXA | EUROPA 42')).toBe('Janela de correr 02 folhas móveis | Bandeira fixa')
        expect(ler('PORTA DE CORRER 02 FOLHAS MÓVEIS | VENEZIANA | TRILHO PVC EMBUTIDO | EUROPA 42')).toBe('Porta de correr 02 folhas móveis | Veneziana | Trilho pvc embutido')
        // a maxim-ar com bandeira: um módulo não se escreve, a modulação e a linha saem, e a bandeira — que ela TEM — fica
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | BANDEIRA FIXA | PERFIL MODULAÇÃO | EUROPA 60', { N: 1 })).toBe('Maxim-ar | Bandeira fixa')
        expect(ler('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS | ALT IGUAIS | PERFIL COLUNA |EUROPA 60', { N: 2, V: 2 }))
            .toBe('Maxim-ar com 02 módulos horizontais e 02 módulos verticais | Alt iguais')
        // sem barra nenhuma não há linha a tirar
        expect(ler('PORTA PIVOTANTE')).toBe('Porta pivotante')
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
    it('trechosDaDescricao: o principal, o que a esquadria tem, a modulação e a linha (o último trecho)', () => {
        expect(trechosDaDescricao(DP128)).toEqual({ principal: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL', tem: [], modulacao: ['PERFIL MODULAÇÃO'], linha: 'EUROPA 60' })
        expect(trechosDaDescricao('A | BANDEIRA FIXA | MODULAÇÃO TRAVESSA | MOD COLUNA | PERFIL COLUNA | X  Y |EUROPA 42'))
            .toEqual({ principal: 'A', tem: ['BANDEIRA FIXA', 'X Y'], modulacao: ['MODULAÇÃO TRAVESSA', 'MOD COLUNA', 'PERFIL COLUNA'], linha: 'EUROPA 42' })
        expect(trechosDaDescricao('  FIXO   COM  X ')).toEqual({ principal: 'FIXO COM X', tem: [], modulacao: [], linha: null })
        // o trecho vazio entre duas barras não é coisa que a esquadria tenha
        expect(trechosDaDescricao('A |  | BANDEIRA FIXA | | EUROPA 42').tem).toEqual(['BANDEIRA FIXA'])
        expect(trechosDaDescricao(null)).toEqual({ principal: '', tem: [], modulacao: [], linha: null })
        expect(tipoDeModulacao(DP128)).toBe('PERFIL MODULAÇÃO')
        expect(tipoDeModulacao(DP02)).toBe('')
    })
    it('a tipologia que ainda não é um item: a variável aberta não se escreve (o limite), ou diz só o sentido (a opção de uma pergunta)', () => {
        expect(nomeDaCandidata(DP128)).toBe('Maxim-ar')
        expect(nomeDaCandidata(DP128, 'aberta')).toBe('Maxim-ar com módulos horizontais')
        expect(nomeDaCandidata('FIXO COM "N" MÓDULOS HORIZONTAIS E 03 MÓDULOS VERTICAIS | EUROPA 60')).toBe('Fixo com 03 módulos verticais')
        expect(nomeDaCandidata(null)).toBeNull()
    })
    it('nomesDasCandidatas: o tipo de modulação só entra quando é ele que separa duas — e só nelas', () => {
        const travessa = 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | MODULAÇÃO TRAVESSA | EUROPA 60'
        expect(nomesDasCandidatas([travessa, DP128, DP02])).toEqual(['Maxim-ar (modulação travessa)', 'Maxim-ar (perfil modulação)', 'Janela de correr 02 folhas móveis'])
        expect(nomesDasCandidatas([DP128, DP02])).toEqual(['Maxim-ar', 'Janela de correr 02 folhas móveis'])
        // iguais e sem modulação a dizer: ficam iguais (nada é inventado para separá-las)
        expect(nomesDasCandidatas([DP02, DP02])).toEqual(['Janela de correr 02 folhas móveis', 'Janela de correr 02 folhas móveis'])
        expect(nomesDasCandidatas([DP128, 'FIXO COM 01 MÓDULO HORIZONTAL E "V" MÓDULOS VERTICAIS | EUROPA 60'], 'aberta')).toEqual(['Maxim-ar com módulos horizontais', 'Fixo com módulos verticais'])
        expect(nomesDasCandidatas([null])).toEqual([''])
    })
    it('valoresDosModulos: o gravado no item; no item antigo, o Padrão do motor; sem um nem outro, a variável fica de fora', () => {
        const padrao = (v: string) => (v === 'N' ? ' 1 ' : null)
        expect(valoresDosModulos(DP128, { N: 3, AM: 1 }, padrao)).toEqual({ N: 3 })
        expect(valoresDosModulos(DP128, null, padrao)).toEqual({ N: 1 })
        for (const escolhas of [{}, { N: 0 }, { N: 1.5 }, { N: '2' }, [], 'x']) expect(valoresDosModulos(DP128, escolhas, padrao)).toEqual({ N: 1 })
        expect(valoresDosModulos(DP128, {})).toEqual({})
        for (const p of ['', 'x', '0', '1,5', '1.5', '2e1', null, undefined]) expect(valoresDosModulos(DP128, {}, () => p)).toEqual({})
        expect(valoresDosModulos('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS', { V: 2 }, padrao)).toEqual({ N: 1, V: 2 })
        expect(valoresDosModulos(DP02, { N: 2 }, padrao)).toEqual({})
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
