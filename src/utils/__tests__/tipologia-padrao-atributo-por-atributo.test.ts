/**
 * PORTÃO — A TIPOLOGIA PADRÃO ATRIBUTO POR ATRIBUTO (dono do produto, 11/11/2026, fechando a classe do apanhado): "silêncio não é dúvida: é a
 * forma natural". Cada atributo tem o seu natural e só o perde quando ELE é dito — dizer persiana responde a persiana, e só ela.
 *
 * As descrições são as do motor em uso (022fc55e, lidas em 11/11/2026, só leitura): o catálogo da plataforma, não dado de cliente.
 */
import {
    atributosDaDescricao, atributosDitos, oQueAEsquadriaE, tipologiaPadrao, fraseDaLinhaSemPadrao, naturalDaQuantidade, tipoCurto,
} from '@/lib/atendimentos-ia/tipologia-padrao'
import { tiposDitos } from '@/lib/atendimentos-ia/tipologias-candidatas'
import type { CandidatoDeTipologia } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'

const MOTOR: Array<[string, string, string]> = [
    ['DP-02', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'Correr'],
    ['DP-03', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | VENEZIANA | EUROPA 42', 'Correr'],
    ['DP-04', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA FIXA | EUROPA 42', 'Correr'],
    ['DP-05', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | PEITORIL FIXO | EUROPA 42', 'Correr'],
    ['DP-06', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA E PEITORIL FIXO | EUROPA 42', 'Correr'],
    ['DP-07', 'JANELA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-08', 'JANELA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | PEITORIL FIXO | EUROPA 42', 'Correr'],
    ['DP-09', 'JANELA DE CORRER 03 FOLHAS MÓVEIS | EUROPA 42', 'Correr'],
    ['DP-11', 'JANELA DE CORRER 03 FOLHAS MÓVEIS | 01 VENEZIANA VENTILADA - 01 VENEZIANA CEGA - 01 VIDRO |EUROPA 42', 'Correr'],
    ['DP-12', 'JANELA DE CORRER 03 FOLHAS MÓVEIS | 02 VIDROS - 01 TELA | EUROPA 42', 'Correr'],
    ['DP-16', 'JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-17', 'JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | 02 VIDROS - 01 TELA | EUROPA 42', 'Correr'],
    ['DP-22', 'JANELA DE CORRER 04 FOLHAS MÓVEIS | FECHAMENTO CENTRAL | EUROPA 42', 'Correr'],
    ['DP-39', 'PORTA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'Correr'],
    ['DP-40', 'PORTA DE CORRER 02 FOLHAS MÓVEIS | TRILHO PVC EMBUTIDO | EUROPA 42', 'Correr'],
    ['DP-41', 'PORTA DE CORRER 02 FOLHAS MÓVEIS | TRILHO ALUMÍNIO | EUROPA 42', 'Correr'],
    ['DP-45', 'PORTA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA FIXA | EUROPA 42', 'Correr'],
    ['DP-48', 'PORTA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-49', 'PORTA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | TRILHO PVC EMBUTIDO | EUROPA 42', 'Correr'],
    ['DP-50', 'PORTA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | TRILHO ALUMÍNIO | EUROPA 42', 'Correr'],
    ['DP-65', 'PORTA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-113', 'JANELA DE GIRO 01 FOLHA | EUROPA 60', 'Giro / Abrir'],
    ['DP-116', 'JANELA DE GIRO 01 FOLHA COM PERSIANA | EUROPA 60', 'Giro / Abrir'],
    ['DP-119', 'JANELA DE GIRO 02 FOLHAS | EUROPA 60', 'Giro / Abrir'],
    ['DP-122', 'JANELA OSCILO BATENTE 01 FOLHA | EUROPA 60', 'Oscilo-batente'],
    ['DP-126', 'JANELA OSCILO BATENTE 02 FOLHAS | EUROPA 60', 'Oscilo-batente'],
    ['DP-134', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | BANDEIRA FIXA | MODULAÇÃO TRAVESSA | EUROPA 60', 'Maxim-ar'],
    ['DP-152', 'PORTA DE GIRO 01 FOLHA | VENEZIANA | EUROPA 60', 'Giro / Abrir'],
    ['DP-158', 'PORTA DE GIRO 01 FOLHA | VIDRO | BANDEIRA FIXA | EUROPA 60', 'Giro / Abrir'],
    ['DP-165', 'PORTA OSCILO BATENTE 01 FOLHA | EUROPA 60', 'Oscilo-batente'],
    ['DP-166', 'PORTA OSCILO BATENTE 02 FOLHAS | EUROPA 60', 'Oscilo-batente'],
    ['DP-167', 'PORTA OSCILO BATENTE + GIRO 02 FOLHAS | EUROPA 60', 'Oscilo-batente'],
    ['DP-128', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | PERFIL MODULAÇÃO | EUROPA 60', 'Maxim-ar'],
    ['DP-129', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | BANDEIRA FIXA | PERFIL MODULAÇÃO | EUROPA 60', 'Maxim-ar'],
    ['DP-133', 'MAXIM-AR COM 01 MÓDULO HORIZONTAL E "V" MÓDULOS VERTICAIS | MODULAÇÃO TRAVESSA | EUROPA 60', 'Maxim-ar'],
    ['DP-137', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 02 MÓDULOS VERTICAIS | PERFIL MODULAÇÃO | EUROPA 60', 'Maxim-ar'],
    ['DP-143', 'FIXO COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | MODULAÇÃO TRAVESSA | EUROPA 60', 'Fixo'],
    ['DP-159', 'PORTA DE GIRO 02 FOLHAS | VIDRO | EUROPA 60', 'Giro / Abrir'],
    ['DP-168', 'PORTA DE GIRO PIVOTANTE 01 FOLHA | VIDRO | EUROPA 60', 'Pivotante'],
    ['DP-169', 'PORTA DE GIRO PIVOTANTE 01 FOLHA | LAMBRI | EUROPA 60', 'Pivotante'],
    ['DP-01', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', 'Maxim-ar'],
]
const linhaDe = (d: string) => `PVC WOLFF ${d.split('|').pop()!.trim()}`
const CANDIDATOS: CandidatoDeTipologia[] = MOTOR.map(([tipologia, descricao, tipo]) => ({
    tipologia, descricao, tipo, familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff', linha: linhaDe(descricao),
    larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: null as number | null, alt_max_mm: null as number | null,
}))
const item = (largura = 1500, altura = 1200) => ({ ordem: 1, tipologia: null, largura_mm: largura, altura_mm: altura }) as unknown as ItemDoLevantamento
const tiposDoMotor = ['Correr', 'Giro / Abrir', 'Oscilo-batente', 'Maxim-ar', 'Fixo', 'Pivotante']
// os tipos do trecho pelo MESMO leitor da conversa (`tiposDitos`), não por uma cópia no teste
const trecho = (texto: string, abertura: 'porta' | 'janela') => ({ texto, abertura, tipos: tiposDitos(texto, tiposDoMotor) })
const padrao = (texto: string, abertura: 'porta' | 'janela', candidatos = CANDIDATOS, i = item()) => tipologiaPadrao(i, abertura, [trecho(texto, abertura)], candidatos)

describe('O DEFEITO CENTRAL: dizer persiana responde a PERSIANA, e o resto continua no natural', () => {
    it('"janela de correr com persiana": as folhas continuam no natural (2) — DP-07, não pergunta', () => {
        expect(padrao('janela de correr com persiana 1500 x 1200', 'janela')).toEqual({ tipologia: 'DP-07' })
    })
    it('"porta de correr com persiana": DP-48 — nem trilho embutido nem de alumínio, que não foram ditos', () => {
        expect(padrao('porta de correr com persiana', 'porta')).toEqual({ tipologia: 'DP-48' })
    })
    it('persiana E 3 folhas ditas: DP-16 (cada atributo dito responde só a si)', () => {
        expect(padrao('janela de correr 3 folhas com persiana', 'janela')).toEqual({ tipologia: 'DP-16' })
        expect(padrao('porta de correr 3 folhas com persiana', 'porta')).toEqual({ tipologia: 'DP-65' })
    })
    it('persiana e peitoril: DP-08; bandeira só: DP-04; bandeira e peitoril: DP-06; peitoril só: DP-05', () => {
        expect(padrao('janela de correr com persiana e peitoril fixo', 'janela')).toEqual({ tipologia: 'DP-08' })
        expect(padrao('janela de correr com bandeira', 'janela')).toEqual({ tipologia: 'DP-04' })
        expect(padrao('janela de correr com bandeira e peitoril', 'janela')).toEqual({ tipologia: 'DP-06' })
        expect(padrao('janela de correr com peitoril', 'janela')).toEqual({ tipologia: 'DP-05' })
    })
    it('o trilho dito: DP-40 (embutido) e DP-41 (alumínio); veneziana dita: DP-03 — nunca a veneziana mista (DP-11), que tem o que não foi dito', () => {
        expect(padrao('porta de correr trilho embutido', 'porta')).toEqual({ tipologia: 'DP-40' })
        expect(padrao('porta de correr com trilho de alumínio', 'porta')).toEqual({ tipologia: 'DP-41' })
        expect(padrao('janela de correr com veneziana', 'janela')).toEqual({ tipologia: 'DP-03' })
        expect(padrao('janela de correr 3 folhas com tela', 'janela')).toEqual({ tipologia: 'DP-12' })
    })
})

describe('O TIPO É SEMPRE DITO; o que vem depois é natural', () => {
    it('correr: 2 folhas (DP-02, DP-39); a porta sem tipo é de correr; 3 folhas ditas: DP-09', () => {
        expect(padrao('janela de correr', 'janela')).toEqual({ tipologia: 'DP-02' })
        expect(padrao('1 porta 2,50 x 2,20', 'porta', CANDIDATOS, item(2500, 2200))).toEqual({ tipologia: 'DP-39' })
        expect(padrao('janela de correr três folhas', 'janela')).toEqual({ tipologia: 'DP-09' })
        expect(padrao('janela de correr com 2 caixilhos', 'janela')).toEqual({ tipologia: 'DP-02' })
    })
    it('maxim-ar: UM módulo, sem extra — DP-01 (a DP-128 traz "perfil de modulação", que não foi dito)', () => {
        expect(padrao('janela maxim ar 600 x 600', 'janela')).toEqual({ tipologia: 'DP-01' })
        expect(padrao('janela maxim-ar 1 módulo', 'janela')).toEqual({ tipologia: 'DP-01' })
    })
    it('maxim-ar: a candidata SEM extra que fixa outro número de módulos verticais (02, ou o "V" variável) não é o natural — sai, e a DP-01 fica sozinha', () => {
        // sintéticas (o motor 022fc55e não tem maxim-ar sem extra com 02 verticais): provam que o natural de UM módulo filtra, não só os extras
        const sinteticas = (descricao: string, linha: string): CandidatoDeTipologia => ({ ...CANDIDATOS.find((c) => c.tipologia === 'DP-01')!, tipologia: 'DP-X', descricao, linha })
        const com02 = [...CANDIDATOS, sinteticas('MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 02 MÓDULOS VERTICAIS | DESIGN', 'PVC WOLFF DESIGN')]
        const comV = [...CANDIDATOS, sinteticas('MAXIM-AR COM 01 MÓDULO HORIZONTAL E "V" MÓDULOS VERTICAIS | EUROPA 60', 'PVC WOLFF EUROPA 60')]
        expect(padrao('janela maxim ar 600 x 600', 'janela', com02)).toEqual({ tipologia: 'DP-01' })
        expect(padrao('janela maxim ar 600 x 600', 'janela', comV)).toEqual({ tipologia: 'DP-01' })
    })
    it('o último trecho da descrição é a LINHA, nunca atributo: uma linha cujo nome tem palavra de extra não tira a candidata do natural', () => {
        // sintética: a linha "TELA 60" leria "tela" como extra se o fim da descrição contasse
        const sint: CandidatoDeTipologia = { ...CANDIDATOS.find((c) => c.tipologia === 'DP-02')!, tipologia: 'DP-Y', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | TELA 60', linha: 'PVC TELA 60' }
        expect(atributosDaDescricao(sint).extras.size).toBe(0)
        expect(padrao('janela de correr', 'janela', [sint])).toEqual({ tipologia: 'DP-Y' })
    })
    it('pivotante: o natural é sem extra — DP-168 (vidro), nunca o lambri', () => {
        expect(padrao('porta pivotante', 'porta')).toEqual({ tipologia: 'DP-168' })
        expect(padrao('porta pivotante com lambri', 'porta')).toEqual({ tipologia: 'DP-169' })
    })
})

describe('A REGRA GERAL DA QUANTIDADE (dono do produto, 11/11/2026): CORRER = 2 folhas; TODO O RESTO = 1; mais de um só quando dito', () => {
    it('a regra é geral, não lista de tipos: correr 2; os outros cinco tipos do motor 1 — e um tipo NOVO também 1', () => {
        expect(naturalDaQuantidade('correr')).toBe(2)
        for (const t of ['Giro / Abrir', 'Oscilo-batente', 'Pivotante', 'Maxim-ar', 'Fixo']) expect(naturalDaQuantidade(tipoCurto(t)!)).toBe(1)
        expect(naturalDaQuantidade('basculante')).toBe(1)
    })
    it('janela de abrir (giro): UMA folha — DP-113; 2 folhas ditas: DP-119; com persiana: DP-116 (a folha continua 1)', () => {
        expect(padrao('janela de abrir', 'janela')).toEqual({ tipologia: 'DP-113' })
        expect(padrao('janela de giro', 'janela')).toEqual({ tipologia: 'DP-113' })
        expect(padrao('janela de abrir 2 folhas', 'janela')).toEqual({ tipologia: 'DP-119' })
        expect(padrao('janela de abrir com persiana', 'janela')).toEqual({ tipologia: 'DP-116' })
    })
    it('oscilo-batente: UMA folha — janela DP-122, porta DP-165; 2 folhas ditas: DP-126 e DP-166 (nunca a "+ giro", que não foi dita)', () => {
        expect(padrao('janela oscilo batente', 'janela')).toEqual({ tipologia: 'DP-122' })
        expect(padrao('porta oscilo batente', 'porta')).toEqual({ tipologia: 'DP-165' })
        expect(padrao('janela oscilo batente 2 folhas', 'janela')).toEqual({ tipologia: 'DP-126' })
        expect(padrao('porta oscilo batente 2 folhas', 'porta')).toEqual({ tipologia: 'DP-166' })
    })
    it('porta de abrir: UMA folha — e o motor não tem porta de giro de 1 folha sem extra (veneziana, lambri, pinázio, bandeira): SEM_CANDIDATA, nunca a de 2 folhas', () => {
        expect(padrao('porta de abrir', 'porta')).toEqual({ motivo: 'SEM_CANDIDATA' })
        expect(padrao('porta de abrir 2 folhas', 'porta')).toEqual({ tipologia: 'DP-159' })
        expect(padrao('porta de abrir com veneziana', 'porta')).toEqual({ tipologia: 'DP-152' })
    })
    it('MAXIM-AR COM BANDEIRA CONTINUA 1 MÓDULO: a bandeira é outro atributo e não apaga o natural do módulo', () => {
        // sintética, sem modulação: prova o módulo isolado da modulação (que, no motor real, não tem natural — ver abaixo)
        const comBandeira: CandidatoDeTipologia = { ...CANDIDATOS.find((c) => c.tipologia === 'DP-01')!, tipologia: 'DP-Z', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | BANDEIRA FIXA | DESIGN' }
        const com = [...CANDIDATOS, comBandeira]
        expect(padrao('janela maxim ar com bandeira', 'janela', com)).toEqual({ tipologia: 'DP-Z' })
        expect(padrao('janela maxim ar com bandeira 1 módulo', 'janela', com)).toEqual({ tipologia: 'DP-Z' })
        expect(padrao('janela maxim ar com bandeira 2 módulos', 'janela', com)).toEqual({ motivo: 'MODULOS_DITOS' })
        // e na folha: "1 módulo", com bandeira
        expect(oQueAEsquadriaE(CANDIDATOS.find((c) => c.tipologia === 'DP-129')!, 1)).toBe('maxim-ar, 1 módulo · sem persiana · com bandeira · sem peitoril')
    })
    it('no motor real, a maxim-ar com bandeira só existe com a modulação (perfil, DP-129; travessa, DP-134), que não foi dita e não tem natural: SEM_CANDIDATA — nunca uma das duas', () => {
        expect(padrao('janela maxim ar com bandeira', 'janela')).toEqual({ motivo: 'SEM_CANDIDATA' })
    })
})

describe('os motivos nomeados — onde NÃO há natural, nunca se adivinha', () => {
    it('duas candidatas na MESMA linha que nada medido distingue: SEM_NATURAL nomeando "descrição" — nunca LINHA, nunca a primeira', () => {
        const gemea: CandidatoDeTipologia = { ...CANDIDATOS.find((c) => c.tipologia === 'DP-113')!, tipologia: 'DP-113B' }
        expect(padrao('janela de abrir', 'janela', [...CANDIDATOS, gemea])).toEqual({ motivo: 'SEM_NATURAL', atributos: ['descrição'], candidatas: ['DP-113', 'DP-113B'] })
    })
    it('a janela sem tipo, dois tipos, um tipo que o motor não tem: sem padrão', () => {
        expect(padrao('janela 1200 x 1000', 'janela')).toEqual({ motivo: 'JANELA_SEM_TIPO' })
        expect(padrao('janela maxim ar de correr', 'janela')).toEqual({ motivo: 'TIPOS_DITOS' })
        expect(padrao('porta camarão', 'porta')).toEqual({ motivo: 'TIPO_FORA_DO_MOTOR' })
        expect(padrao('janela basculante', 'janela')).toEqual({ motivo: 'TIPO_FORA_DO_MOTOR' })
        // um tipo que existe, mas NÃO no motor desta empresa: a porta não vira de correr por isso
        const soCorrer = CANDIDATOS.filter((c) => c.tipo === 'Correr')
        const semGiro = (texto: string) => tipologiaPadrao(item(2500, 2200), 'porta', [{ texto, abertura: 'porta', tipos: new Set<string>() }], soCorrer)
        expect(semGiro('porta de abrir 2,50 x 2,20')).toEqual({ motivo: 'TIPO_FORA_DO_MOTOR' })
        expect(semGiro('porta pivotante')).toEqual({ motivo: 'TIPO_FORA_DO_MOTOR' })
        // sem tipo nenhum dito (e a bandeira fixa não é tipo), a porta é de correr
        expect(semGiro('porta com bandeira fixa 2,50 x 2,20')).toEqual({ tipologia: 'DP-45' })
    })
    it('o que é dito e não tem como entrar na tipologia (o motor da persiana, os panos): sem padrão, nunca em silêncio', () => {
        expect(padrao('janela de correr com persiana motorizada', 'janela')).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
        expect(padrao('porta de correr com persiana de 2 panos', 'porta')).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
    })
    it('maxim-ar: outro número de módulos dito, ou bandeira (só com modulação, que não tem natural) → sem padrão', () => {
        expect(padrao('janela maxim ar 2 módulos', 'janela')).toEqual({ motivo: 'MODULOS_DITOS' })
        expect(padrao('janela maxim ar com bandeira', 'janela')).toEqual({ motivo: 'SEM_CANDIDATA' })
        expect(padrao('janela maxim ar 2 folhas', 'janela')).toEqual({ motivo: 'SEM_CANDIDATA' })
    })
    it('o fixo: 1 módulo (a regra geral) — mas a única de 1 módulo vertical, a DP-143, traz a modulação de travessa, que não tem natural → SEM_CANDIDATA', () => {
        expect(padrao('janela de vidro fixo', 'janela')).toEqual({ motivo: 'SEM_CANDIDATA' })
    })
    it('"janela FIXA" (feminino) diz o tipo Fixo — defeito anterior ao #263: antes caía em JANELA_SEM_TIPO', () => {
        expect([...tiposDitos('janela fixa 1,00 x 1,00', tiposDoMotor)]).toEqual(['Fixo'])
        expect(padrao('janela fixa', 'janela')).toEqual({ motivo: 'SEM_CANDIDATA' })
        expect(padrao('janela fixa', 'janela')).not.toEqual({ motivo: 'JANELA_SEM_TIPO' })
        // e o feminino de "bandeira fixa" continua atributo, não tipo
        expect(padrao('janela de correr com bandeira fixa', 'janela')).toEqual({ tipologia: 'DP-04' })
    })
    it('"peitoril fixo" e "bandeira fixa" não são o tipo Fixo: o correr continua o tipo', () => {
        expect(padrao('janela de correr com bandeira fixa e peitoril fixo', 'janela')).toEqual({ tipologia: 'DP-06' })
        expect(padrao('janela de correr com bandeira e peitoril fixo', 'janela')).toEqual({ tipologia: 'DP-06' })
    })
    it('porta maxim-ar: a maxim-ar é o natural só da JANELA', () => {
        expect(padrao('porta maxim ar', 'porta')).toEqual({ motivo: 'SEM_CANDIDATA' })
    })
    it('a medida fora dos limites da única candidata: LIMITES, nunca a mais próxima', () => {
        const comLimite = CANDIDATOS.map((c) => (c.tipologia === 'DP-39' ? { ...c, alt_min_mm: 1736, alt_max_mm: 3036 } : c))
        expect(padrao('porta de correr', 'porta', comLimite, item(1500, 1500))).toEqual({ motivo: 'LIMITES' })
    })
    it('duas candidatas que só diferem pela LINHA: LINHA, com as linhas — falta nomeada, e a frase as cita', () => {
        const duasLinhas = [...CANDIDATOS, { ...CANDIDATOS.find((c) => c.tipologia === 'DP-02')!, tipologia: 'XX-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 60', linha: 'PVC WOLFF EUROPA 60' }]
        expect(padrao('janela de correr', 'janela', duasLinhas)).toEqual({ motivo: 'LINHA', candidatas: ['DP-02', 'XX-02'], linhas: ['PVC WOLFF EUROPA 42', 'PVC WOLFF EUROPA 60'] })
        expect(fraseDaLinhaSemPadrao(['PVC WOLFF EUROPA 42', 'PVC WOLFF EUROPA 60'])).toBe('Falta de configuração — a linha de produto padrão da empresa: esta esquadria existe nas linhas PVC WOLFF EUROPA 42 e PVC WOLFF EUROPA 60, e a base de conhecimento ainda não diz qual é a da casa. Cadastre a linha padrão na base de conhecimento.')
    })
    it('sem a abertura ou sem trecho dela: sem padrão', () => {
        expect(tipologiaPadrao(item(), null, [trecho('porta de correr', 'porta')], CANDIDATOS)).toEqual({ motivo: 'SEM_ABERTURA' })
        expect(tipologiaPadrao(item(), 'porta', [trecho('janela de correr', 'janela')], CANDIDATOS)).toEqual({ motivo: 'SEM_TRECHO' })
    })
})

describe('os atributos lidos da descrição e do que foi dito, pelas mesmas palavras', () => {
    it('da descrição: tipo, abertura, folhas, módulos e extras — a linha do fim não é atributo', () => {
        const de = (t: string) => { const c = CANDIDATOS.find((x) => x.tipologia === t)!; const a = atributosDaDescricao(c); return { ...a, extras: [...a.extras].sort() } }
        expect(de('DP-08')).toEqual({ abertura: 'janela', tipo: 'correr', folhas: 2, modulos: null, extras: ['peitoril', 'persiana'] })
        expect(de('DP-11')).toEqual({ abertura: 'janela', tipo: 'correr', folhas: 3, modulos: null, extras: ['veneziana', 'veneziana cega', 'veneziana ventilada'] })
        expect(de('DP-01')).toEqual({ abertura: null, tipo: 'maxim-ar', folhas: null, modulos: 1, extras: [] })
        expect(de('DP-133')).toEqual({ abertura: null, tipo: 'maxim-ar', folhas: null, modulos: 'variavel', extras: ['modulação de travessa'] })
        expect(de('DP-137')).toEqual({ abertura: null, tipo: 'maxim-ar', folhas: null, modulos: 2, extras: ['perfil de modulação'] })
        expect(de('DP-41')).toEqual({ abertura: 'porta', tipo: 'correr', folhas: 2, modulos: null, extras: ['trilho de alumínio'] })
    })
    it('do dito: os extras, as folhas (ou caixilhos), os módulos e o que não tem representação', () => {
        const d = atributosDitos('Porta de correr, 3 caixilhos, com persiana e trilho embutido')
        expect({ ...d, extras: [...d.extras].sort() }).toEqual({ folhas: 3, modulos: null, extras: ['persiana', 'trilho embutido'], semRepresentacao: false, tipoForaDoMotor: false })
        expect(atributosDitos('maxim-ar dois módulos').modulos).toBe(2)
        expect(atributosDitos('janela de correr branca, vidro comum 6 mm').extras.size).toBe(0)
    })
})

describe('O PADRÃO NA FOLHA: o que a esquadria é, escrito', () => {
    const de = (t: string, n: number | null = null) => oQueAEsquadriaE(CANDIDATOS.find((x) => x.tipologia === t)!, n)
    it('"correr, 2 folhas · sem persiana · sem bandeira · sem peitoril" e cada variação', () => {
        expect(de('DP-02')).toBe('correr, 2 folhas · sem persiana · sem bandeira · sem peitoril')
        expect(de('DP-07')).toBe('correr, 2 folhas · com persiana · sem bandeira · sem peitoril')
        expect(de('DP-06')).toBe('correr, 2 folhas · sem persiana · com bandeira · com peitoril')
        expect(de('DP-113')).toBe('abrir, 1 folha · sem persiana · sem bandeira · sem peitoril')
    })
    it('maxim-ar: o módulo pelo número que o cálculo usa (o "N" dito, ou o padrão da aba)', () => {
        expect(de('DP-01', 1)).toBe('maxim-ar, 1 módulo · sem persiana · sem bandeira · sem peitoril')
        expect(de('DP-01', 2)).toBe('maxim-ar, 2 módulos · sem persiana · sem bandeira · sem peitoril')
        expect(de('DP-137', 1)).toBe('maxim-ar, 2 módulos · sem persiana · sem bandeira · sem peitoril')
        // o número de módulos que não se sabe não é escrito
        expect(de('DP-01', null)).toBe('maxim-ar · sem persiana · sem bandeira · sem peitoril')
        expect(de('DP-133', 1)).toBe('maxim-ar · sem persiana · sem bandeira · sem peitoril')
    })
    it('sem tipo no motor, nada é escrito', () => {
        expect(oQueAEsquadriaE({ descricao: 'ALGO', tipo: null, linha: null }, null)).toBeNull()
    })
})
