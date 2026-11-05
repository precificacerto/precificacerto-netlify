/**
 * PORTA NÃO É JANELA, OS LIMITES DO MOTOR E O AGRUPAMENTO (dono do produto, 03/11/2026) — as funções puras, uma a uma.
 * `teste-que-nao-exercita`: cada asserção cai sem a função certa. Os números são os do motor da De Paula medidos em produção
 * (DP-02 altura 388 a 2.439, largura sem limite; DP-100 altura 1.736 a 3.036).
 */
import {
    PEDIDO_DE_CONFIRMAR_A_MEDIDA, aberturaCompativel, aberturaDaDescricao, aberturaDita, aberturaDoItem, cabeNosLimites, filtrarPorAbertura,
    descricaoNoPrompt, fraseDaAberturaRecusada, fraseDeNenhumaTipologiaCabe, limitesNoPrompt, numeroOuNulo, palavrasDeAbertura, type CandidatoParaAProposta,
} from '@/lib/atendimentos-ia/tipologias-candidatas'
import { CRITERIOS_DO_AGRUPAMENTO, agruparIguais, itemCompleto, itemVazio, type ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'

const DP02: CandidatoParaAProposta = { tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: 388, alt_max_mm: 2439 }
const DP100: CandidatoParaAProposta = { tipologia: 'DP-100', descricao: 'PORTA DE CORRER 06 FOLHAS MÓVEIS | EUROPA 42', larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: 1736, alt_max_mm: 3036 }
const DP01: CandidatoParaAProposta = { tipologia: 'DP-01', descricao: 'MAXIM-AR COM "N" MÓDULOS', larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: null as number | null, alt_max_mm: null as number | null }
const FIXO: CandidatoParaAProposta = { tipologia: 'DP-50', descricao: 'FIXO | EUROPA 42', larg_min_mm: 300, larg_max_mm: null as number | null, alt_min_mm: null as number | null, alt_max_mm: 2000 }

describe('a palavra do vendedor: porta, porta-janela, porta janela, janela', () => {
    it.each([
        ['Janela de correr 1,50x1,20', ['janela']],
        ['uma PORTA 2500 x 2400', ['porta']],
        ['Porta-janela 2,50x2,40', ['porta']],
        ['porta janela 2,50x2,40', ['porta']],
        ['PORTAS JANELAS da sala', ['porta']],
        ['Janela de correr 1,50x1,20 e porta janela 2,50x2,40', ['janela', 'porta']],
        ['janela e porta', ['janela', 'porta']],
        ['Esquadria de correr 1500 x 1200', []],
        ['portaria e janelão', []],
    ])('"%s" → %j', (texto, esperadas) => {
        expect([...palavrasDeAbertura(texto)].sort()).toEqual([...esperadas].sort())
    })

    it('a abertura DITA pela mensagem é a única palavra; as duas ou nenhuma é null', () => {
        expect(aberturaDita('Janela de correr 1500 x 1200')).toBe('janela')
        expect(aberturaDita('porta janela 2500 x 2400')).toBe('porta')
        expect(aberturaDita('Janela de correr 1,50x1,20 e porta janela 2,50x2,40')).toBeNull()
        expect(aberturaDita('Esquadria de correr')).toBeNull()
    })
})

describe('a abertura que a DESCRIÇÃO declara: a primeira palavra', () => {
    it.each([
        ['JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'janela'],
        ['PORTA DE CORRER 06 FOLHAS MÓVEIS', 'porta'],
        ['  Porta de abrir', 'porta'],
        ['MAXIM-AR COM "N" MÓDULOS', null],
        ['FIXO | EUROPA 42', null],
        ['PORTAL DE ENTRADA', null],
        ['', null],
        [null, null],
    ])('%j → %j', (descricao, esperada) => {
        expect(aberturaDaDescricao(descricao)).toBe(esperada)
    })

    it('compatível: sem abertura dita tudo serve; a que não declara serve às duas; a declarada só à igual', () => {
        expect(aberturaCompativel(DP02.descricao, null)).toBe(true)
        expect(aberturaCompativel(DP01.descricao, 'porta')).toBe(true)
        expect(aberturaCompativel(FIXO.descricao, 'janela')).toBe(true)
        expect(aberturaCompativel(DP02.descricao, 'janela')).toBe(true)
        expect(aberturaCompativel(DP02.descricao, 'porta')).toBe(false)
        expect(aberturaCompativel(DP100.descricao, 'janela')).toBe(false)
    })

    it('a lista filtrada: "porta" tira a JANELA e deixa a porta, o maxim-ar e o fixo; null deixa todas', () => {
        const todas = [DP02, DP100, DP01, FIXO]
        expect(filtrarPorAbertura(todas, 'porta').map((c) => c.tipologia)).toEqual(['DP-100', 'DP-01', 'DP-50'])
        expect(filtrarPorAbertura(todas, 'janela').map((c) => c.tipologia)).toEqual(['DP-02', 'DP-01', 'DP-50'])
        expect(filtrarPorAbertura(todas, null)).toEqual(todas)
    })

    it('o campo `abertura` do item só vale se o vendedor escreveu a palavra; senão vale a da mensagem', () => {
        const ditas = new Set(['porta', 'janela'] as const)
        expect(aberturaDoItem('porta', ditas, null)).toBe('porta')
        expect(aberturaDoItem('janela', ditas, 'porta')).toBe('janela')
        expect(aberturaDoItem('porta', new Set(), null)).toBeNull()
        expect(aberturaDoItem('porta', new Set(['janela'] as const), 'janela')).toBe('janela')
        expect(aberturaDoItem('basculante', ditas, 'porta')).toBe('porta')
        expect(aberturaDoItem(undefined, ditas, null)).toBeNull()
    })
})

describe('os limites: NULL nunca descarta, e só a medida dita é conferida', () => {
    it.each([
        ['dentro', DP02, { largura_mm: 1500, altura_mm: 1200 }, true],
        ['altura acima do máximo', DP02, { largura_mm: 1500, altura_mm: 2500 }, false],
        ['altura abaixo do mínimo', DP02, { largura_mm: 1500, altura_mm: 300 }, false],
        ['exatamente no máximo', DP02, { largura_mm: 1500, altura_mm: 2439 }, true],
        ['exatamente no mínimo', DP02, { largura_mm: 1500, altura_mm: 388 }, true],
        ['largura sem limite no arquivo: 5.000 passa', DP02, { largura_mm: 5000, altura_mm: 1000 }, true],
        ['sem limite nenhum: tudo passa', DP01, { largura_mm: 1, altura_mm: 99999 }, true],
        ['a medida ainda não dita não é conferida', DP02, { largura_mm: null, altura_mm: null }, true],
        ['só o mínimo de largura: 200 cai', FIXO, { largura_mm: 200, altura_mm: null }, false],
        ['só o máximo de altura: 2.001 cai', FIXO, { largura_mm: 400, altura_mm: 2001 }, false],
    ])('%s', (_caso, limites, medidas, cabe) => {
        expect(cabeNosLimites(limites, medidas)).toBe(cabe)
    })

    it('numeroOuNulo: número finito fica; string, NaN, Infinity, null e undefined viram null — nunca zero', () => {
        expect(numeroOuNulo(388)).toBe(388)
        expect(numeroOuNulo(0)).toBe(0)
        for (const v of ['388', NaN, Infinity, null, undefined, {}]) expect(numeroOuNulo(v)).toBeNull()
    })

    it('os limites na linha do prompt, COMPACTOS (05/11/2026): a faixa, os unilaterais ≥/≤, e NADA quando o arquivo não traz — nunca zero', () => {
        expect(limitesNoPrompt(DP02)).toBe('A 388-2439')
        expect(limitesNoPrompt(DP01)).toBe('')
        expect(limitesNoPrompt(FIXO)).toBe('L ≥300 A ≤2000')
        expect(limitesNoPrompt(DP100)).toBe('A 1736-3036')
        expect(limitesNoPrompt({ larg_min_mm: 905, larg_max_mm: 1384, alt_min_mm: 464, alt_max_mm: 2054 })).toBe('L 905-1384 A 464-2054')
        expect(limitesNoPrompt({ larg_min_mm: null, larg_max_mm: 1384, alt_min_mm: 0, alt_max_mm: null })).toBe('L ≤1384 A ≥0')
    })

    it('a descrição no prompt perde o ÚLTIMO segmento só quando ele é a linha de produto da Detalhe; o resto fica como está', () => {
        expect(descricaoNoPrompt('JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'PVC WOLFF EUROPA 42')).toBe('JANELA DE CORRER 02 FOLHAS MÓVEIS')
        expect(descricaoNoPrompt('MAXIM-AR COM "N" MÓDULOS | PERFIL MODULAÇÃO | EUROPA 60', 'PVC WOLFF EUROPA 60')).toBe('MAXIM-AR COM "N" MÓDULOS | PERFIL MODULAÇÃO')
        // sem acento e sem caixa: "Europa 42" casa com "EUROPA 42"
        expect(descricaoNoPrompt('JANELA | Europa 42', 'pvc wolff EUROPA 42')).toBe('JANELA')
        // o segmento que NÃO está na linha fica; sem linha na Detalhe nada sai; sem "|" nada sai; a descrição nula continua nula
        expect(descricaoNoPrompt('JANELA DE CORRER 02 FOLHAS | LINHA SUL', 'PVC WOLFF EUROPA 42')).toBe('JANELA DE CORRER 02 FOLHAS | LINHA SUL')
        expect(descricaoNoPrompt('JANELA DE CORRER 02 FOLHAS | LINHA SUL', null)).toBe('JANELA DE CORRER 02 FOLHAS | LINHA SUL')
        expect(descricaoNoPrompt('EUROPA 42', 'PVC WOLFF EUROPA 42')).toBe('EUROPA 42')
        expect(descricaoNoPrompt('JANELA |', 'PVC WOLFF EUROPA 42')).toBe('JANELA |')
        expect(descricaoNoPrompt(null, 'PVC WOLFF EUROPA 42')).toBeNull()
    })
})

describe('as frases: nunca "a mais próxima"', () => {
    it('nenhuma cabe: a medida do item e a faixa das que sobraram, por medida — a sem limite não conta, e isso é dito', () => {
        const frase = fraseDeNenhumaTipologiaCabe({ largura_mm: 2500, altura_mm: 2400 }, [DP02, DP01], 'porta')
        expect(frase).toBe(`Nenhuma tipologia de porta cabe em 2.500 x 2.400 mm: as alturas vão de 388 mm a 2.439 mm (a tipologia sem limite no arquivo não conta). ${PEDIDO_DE_CONFIRMAR_A_MEDIDA}`)
        expect(frase).not.toMatch(/pr[óo]xima/i)
    })

    it('a faixa junta todas as que sobraram: do menor mínimo ao maior máximo, e a largura entra quando alguma a limita', () => {
        expect(fraseDeNenhumaTipologiaCabe({ largura_mm: 100, altura_mm: 5000 }, [DP02, DP100, FIXO], null))
            .toBe(`Nenhuma tipologia do motor cabe em 100 x 5.000 mm: as larguras começam em 300 mm e as alturas vão de 388 mm a 3.036 mm (a tipologia sem limite no arquivo não conta). ${PEDIDO_DE_CONFIRMAR_A_MEDIDA}`)
    })

    it('só uma medida dita: a frase nomeia só ela; só a altura das que sobraram é citada', () => {
        expect(fraseDeNenhumaTipologiaCabe({ largura_mm: null, altura_mm: 3000 }, [DP02], 'janela'))
            .toBe(`Nenhuma tipologia de janela cabe em 3.000 mm de altura: as alturas vão de 388 mm a 2.439 mm (a tipologia sem limite no arquivo não conta). ${PEDIDO_DE_CONFIRMAR_A_MEDIDA}`)
    })

    it('nenhuma das que sobraram tem limite na medida dita: a frase diz isso em vez de inventar faixa', () => {
        expect(fraseDeNenhumaTipologiaCabe({ largura_mm: 2500, altura_mm: null }, [DP02, DP01], null))
            .toBe(`Nenhuma tipologia do motor cabe em 2.500 mm de largura: nenhuma delas tem limite no arquivo. ${PEDIDO_DE_CONFIRMAR_A_MEDIDA}`)
    })

    it('a abertura recusada: diz o que entendeu, que descartou, e pergunta em linguagem de obra — sem código', () => {
        expect(fraseDaAberturaRecusada('porta')).toMatch(/^Entendi que é uma PORTA, e a tipologia que coube era de janela: descartei\./)
        expect(fraseDaAberturaRecusada('janela')).toMatch(/^Entendi que é uma JANELA, e a tipologia que coube era de porta: descartei\./)
        for (const a of ['porta', 'janela'] as const) {
            expect(fraseDaAberturaRecusada(a)).not.toMatch(/DP-\d|tipologia qual|qual a tipologia/i)
            expect(fraseDaAberturaRecusada(a)).toMatch(/como el[ae] abre/)
        }
    })
})

describe('o agrupamento: tipologia + medidas + cor + vidro + família + motor + escolhas; só o item completo', () => {
    const completo = (ordem: number, extra: Partial<ItemDoLevantamento> = {}): ItemDoLevantamento => ({
        ...itemVazio(ordem), tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm', familia: 'PVC', motor_id: 'm1', ...extra,
    })

    it('os critérios são os sete ditos — o ambiente entra aqui quando existir, e hoje não existe', () => {
        expect([...CRITERIOS_DO_AGRUPAMENTO]).toEqual(['tipologia', 'largura_mm', 'altura_mm', 'cor_perfil', 'vidro', 'familia', 'motor_id'])
        expect(CRITERIOS_DO_AGRUPAMENTO).not.toContain('ambiente')
    })

    it('completo é tudo dito menos a quantidade, e com a família resolvida', () => {
        expect(itemCompleto(completo(1))).toBe(true)
        expect(itemCompleto(completo(1, { quantidade: null }))).toBe(true)
        expect(itemCompleto(completo(1, { vidro: null }))).toBe(false)
        expect(itemCompleto(completo(1, { familia: null }))).toBe(false)
        expect(itemCompleto(itemVazio(1))).toBe(false)
    })

    it('dois iguais viram um com 2 unidades; três iguais, 3; a quantidade não dita conta 1; a numeração volta a 1..N', () => {
        const r = agruparIguais([completo(1), completo(2, { quantidade: null }), completo(3, { vidro: 'Laminado 8mm' }), completo(4, { quantidade: 2 })])
        expect(r.fundidos).toBe(2)
        expect(r.itens.map((i) => [i.ordem, i.quantidade, i.vidro])).toEqual([[1, 4, 'Temperado 5mm'], [2, 1, 'Laminado 8mm']])
    })

    it.each([
        ['a cor', { cor_perfil: 'PRETO' }],
        ['o vidro', { vidro: 'Laminado 8mm' }],
        ['a largura', { largura_mm: 1201 }],
        ['a altura', { altura_mm: 999 }],
        ['a tipologia', { tipologia: 'DP-03' }],
        ['a família', { familia: 'ALUMINIO' }],
        ['o motor', { motor_id: 'm2' }],
        ['as escolhas', { escolhas: { ARI: 4 } }],
    ])('diferem só em %s: continuam dois', (_c, extra) => {
        const r = agruparIguais([completo(1), completo(2, extra)])
        expect(r.fundidos).toBe(0)
        expect(r.itens).toHaveLength(2)
    })

    it('as escolhas iguais em outra ordem são as mesmas escolhas', () => {
        const r = agruparIguais([completo(1, { escolhas: { ARI: 4, MAE: 2 } }), completo(2, { escolhas: { MAE: 2, ARI: 4 } })])
        expect(r.fundidos).toBe(1)
        expect(r.itens[0].quantidade).toBe(2)
    })

    it('o incompleto não se funde, nem com outro incompleto igual a ele', () => {
        const r = agruparIguais([completo(1, { vidro: null }), completo(2, { vidro: null })])
        expect(r.fundidos).toBe(0)
        expect(r.itens.map((i) => i.ordem)).toEqual([1, 2])
    })

    it('é uma cópia: os itens recebidos não mudam', () => {
        const itens = [completo(1), completo(2)]
        agruparIguais(itens)
        expect(itens.map((i) => [i.ordem, i.quantidade])).toEqual([[1, 1], [2, 1]])
    })
})
