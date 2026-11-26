/**
 * PORTÃO — as REGRAS DO WVETRO na concepção da tipologia (dono do produto, 17/11/2026: "a regra é a definição do WVetro, e o motor do
 * Precifica Certo deve ter isso na concepção da tipologia, como regra inviolável [...] cada tipologia tem suas variáveis"), no avaliador
 * (`src/lib/atendimentos-ia/avaliador-de-formulas.ts`):
 *   R1 a variável cuja Condição é falsa é INATIVA: vale 0, e o &VAR dela vale 0 (o caso do Orçamento 1182, DP-17: CMFI);
 *   R2 a opção tem condição ('Condição das opções'): a escolha numa opção que não vale é recusa; o padrão numa opção que não vale não é usado;
 *   R3 o insumo com 'Esp. vidro' só entra com a espessura na lista; sem espessura é FALTA (3349 = 5,6,8,24; 919 = 18,20,21);
 *   R4 o vidro, idem;
 *   R5 o corte do perfil sai em mm inteiros, com o decimal CORTADO (953,6 → 953), como o WVetro imprime.
 * A tipologia é SINTÉTICA, escrita aqui, com os nomes e as condições do motor (6) da Wolff — cada caso fica vermelho sem a sua regra.
 */
import {
    avaliarTipologia, condicoesDasOpcoesDe, lerTipologia, valorDaVariavel,
    type EntradaDoAvaliador, type ResultadoDaAvaliacao, type Tipologia, type VariavelDaTipologia,
} from '@/lib/atendimentos-ia/avaliador-de-formulas'

const v = (variavel: string, padrao: string | null, condicao: string, opcoes: string | null, condicao_opcoes: string | null = null): VariavelDaTipologia =>
    ({ variavel, descricao: variavel, padrao, condicao, opcoes, condicao_opcoes })

/** A janela do 1182 em miniatura: ARR → TI → ARI (com condição por opção), a cremona CMFI só entre 398,4 e 788,4 de (H−Y). */
function tipologia(extra: Partial<Tipologia> = {}): Tipologia {
    return {
        codigo: 'DP-XX',
        detalhe: { larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null },
        variaveis: [
            v('ARR', '1', 'sempre', '1 = SIM; 0 = NÃO'),
            v('Y', 'WOLFIH', 'sempre', null),
            v('TI', '1', '(ARR=1)', '1 = FACEAMENTO INTERNO; 2 = CENTRO DE VÃO'),
            v('ARI', '1', '(ARR=1)', '1 = BZ0006 [48,00]; 2 = BZ1770 [50,00]; 3 = BZ0010; 4 = SEM ARREMATE', '1: (TI=1); 2: (TI=1); 3: (TI=2)'),
            v('CMFI', '1', '(((H-Y)>=398.4) and ((H-Y)<=788.4))', '1 = 1737 - CREMONA 135MM; 2 = 18176 - CREMONA 300MM'),
        ],
        formulas: [{ variavel: 'HARI', formula: '(H+(&ARI*2))' }, { variavel: 'HFOL', formula: '(H-46.4)' }],
        perfis: [
            { perfil: 'BZ0006/WOLFF', descricao: 'GUARNIÇÃO', corte: '45/45', qtd: '2', medida: 'HARI', posicao: 'Altura', esp_vidro: null, condicao: '(ARI=1)' },
            { perfil: 'SF66/WOLFF', descricao: 'FOLHA', corte: '45S/45S', qtd: '2', medida: 'HFOL', posicao: 'Altura', esp_vidro: null, condicao: 'sempre' },
        ],
        validacoes: [],
        insumos: [
            { insumo: '1737', descricao: 'CREMONA 135MM', qtd: '1', condicao: '(CMFI=1)', esp_vidro: null },
            { insumo: '3349/WOLFF', descricao: 'BORRACHA 1,5MM', qtd: '(H*2)', condicao: 'sempre', esp_vidro: '5,6,8,24' },
            { insumo: '919/WOLFF', descricao: 'BORRACHA 3,5MM', qtd: '(H*2)', condicao: 'sempre', esp_vidro: '18,20,21' },
        ],
        vidros: [
            { vidro: 'VIDRO', largura: '500', altura: '(HFOL-100)', qtd: '1', fixacao: 'Fixo', condicao: 'sempre', esp_vidro: '5,6,8' },
            { vidro: 'VIDRO INSULADO', largura: '500', altura: '(HFOL-100)', qtd: '1', fixacao: 'Fixo', condicao: 'sempre', esp_vidro: '24' },
        ],
        ...extra,
    }
}
const entrada = (e: Partial<EntradaDoAvaliador> = {}): EntradaDoAvaliador => ({ tipologia: tipologia(), L_mm: 1000, H_mm: 1000, espessura_vidro_mm: 6, ...e })
function ok(r: ResultadoDaAvaliacao) {
    if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r
}
const recusas = (r: ResultadoDaAvaliacao) => ('recusas' in r ? r.recusas : [])

describe('R1 — a variável INATIVA vale 0', () => {
    it('o caso do 1182: H = 1.400 deixa CMFI inativa, e a cremona 1737 NÃO entra (o padrão 1 não vale)', () => {
        const r = ok(avaliarTipologia(entrada({ H_mm: 1400 })))
        expect(r.insumos.map((x) => x.codigo)).not.toContain('1737')
        expect(valorDaVariavel(entrada({ H_mm: 1400 }), 'CMFI')).toBe(0)
    })

    it('com H dentro da faixa, CMFI está ativa e a cremona entra pelo padrão', () => {
        const r = ok(avaliarTipologia(entrada({ H_mm: 700 })))
        expect(r.insumos.filter((x) => x.codigo === '1737')).toEqual([expect.objectContaining({ codigo: '1737', descricao: 'CREMONA 135MM', quantidade: 1 })])
    })

    it('a ESCOLHA de uma variável inativa também não vale: 0', () => {
        expect(valorDaVariavel(entrada({ H_mm: 1400, escolhas: { CMFI: 2 } }), 'CMFI')).toBe(0)
    })

    it('a dependência: ARR = 0 deixa TI e ARI inativas, e o &ARI vale 0 (HARI = H) — a guarnição (ARI=1) não entra', () => {
        const e = entrada({ escolhas: { ARR: 0 } })
        expect(valorDaVariavel(e, 'TI')).toBe(0)
        expect(valorDaVariavel(e, 'ARI')).toBe(0)
        expect(valorDaVariavel(e, 'HARI')).toBe(1000)
        expect(ok(avaliarTipologia(e)).pecas.map((p) => p.codigo)).toEqual(['SF66/WOLFF'])
    })

    it('ativa, o &ARI é o colchete da opção: HARI = 1000 + 2×48', () => {
        expect(valorDaVariavel(entrada(), 'HARI')).toBe(1096)
    })

    it('a condição que cita um nome que não existe em aba nenhuma deixa a variável ATIVA (o ARR do fixture da DP-02)', () => {
        const t = tipologia({ variaveis: tipologia().variaveis.filter((x) => x.variavel !== 'ARR') })
        expect(valorDaVariavel({ ...entrada(), tipologia: t }, 'ARI')).toBe(1)
    })

    it('a condição que cita um nome que EXISTE, mas sem valor, continua recusando (não vira ativa em silêncio)', () => {
        const t = tipologia({ variaveis: [...tipologia().variaveis.filter((x) => x.variavel !== 'ARR'), v('ARR', null, 'sempre', '1 = SIM; 0 = NÃO')] })
        expect(recusas(avaliarTipologia({ ...entrada(), tipologia: t })).map((x) => x.motivo)).toContain('VARIAVEL_SEM_VALOR')
    })
})

describe('R2 — a opção tem condição', () => {
    it('lê "n: (cond); n: (cond)" e recusa o que não se lê', () => {
        expect([...(condicoesDasOpcoesDe('1: (TI=1); 2: (TI=1); 3: (TI=2)') as Map<number, string>)]).toEqual([[1, '(TI=1)'], [2, '(TI=1)'], [3, '(TI=2)']])
        expect(condicoesDasOpcoesDe('1 (TI=1)')).toBeNull()
        expect(condicoesDasOpcoesDe('1: (TI=1); 1: (TI=2)')).toBeNull()
        const t = tipologia({ variaveis: [...tipologia().variaveis.slice(0, 3), v('ARI', '1', '(ARR=1)', '1 = A; 2 = B', 'um: (TI=1)')] })
        expect(recusas(avaliarTipologia({ ...entrada(), tipologia: t }))).toEqual([expect.objectContaining({ motivo: 'OPCOES_NAO_PARSEIAM', variavel: 'ARI' })])
    })

    it('a escolha numa opção que NÃO vale é recusada, nomeando as que valem', () => {
        const r = recusas(avaliarTipologia(entrada({ escolhas: { TI: 2, ARI: 1 } })))
        expect(r).toEqual([expect.objectContaining({ motivo: 'ESCOLHA_FORA_DAS_OPCOES', variavel: 'ARI' })])
        expect(r[0].mensagem).toContain('as opções que valem são 3, 4')
    })

    it('o PADRÃO numa opção que não vale não é usado: a variável pede a escolha', () => {
        const r = recusas(avaliarTipologia(entrada({ escolhas: { TI: 2 } })))
        expect(r[0]).toEqual(expect.objectContaining({ motivo: 'VARIAVEL_SEM_VALOR', variavel: 'ARI' }))
        expect(r[0].mensagem).toContain('o padrão 1 não vale neste item: escolha entre 3, 4')
    })

    it('a opção que não aparece na coluna vale sempre (4 = SEM ARREMATE), e a que vale entra', () => {
        expect(valorDaVariavel(entrada({ escolhas: { TI: 2, ARI: 4 } }), 'ARI')).toBe(4)
        expect(valorDaVariavel(entrada({ escolhas: { TI: 2, ARI: 3 } }), 'ARI')).toBe(3)
    })

    it('sem a coluna, toda opção vale, como antes', () => {
        const t = tipologia({ variaveis: tipologia().variaveis.map((x): VariavelDaTipologia => ({ ...x, condicao_opcoes: null })) })
        expect(valorDaVariavel({ ...entrada({ escolhas: { TI: 2, ARI: 1 } }), tipologia: t }, 'ARI')).toBe(1)
    })
})

describe('R3 e R4 — a espessura do vidro no insumo e no vidro', () => {
    it('vidro de 6 mm: entra a 3349 e o vidro simples; ficam fora a 919 e o insulado', () => {
        const r = ok(avaliarTipologia(entrada({ espessura_vidro_mm: 6 })))
        expect(r.insumos.map((x) => x.codigo)).toEqual(['3349/WOLFF'])
        expect(r.vidros.map((x) => x.vidro)).toEqual(['VIDRO'])
        expect(r.faltas).toEqual([])
    })

    it('vidro de 24 mm: a 3349 (5,6,8,24) e o insulado; a 919 não', () => {
        const r = ok(avaliarTipologia(entrada({ espessura_vidro_mm: 24 })))
        expect(r.insumos.map((x) => x.codigo)).toEqual(['3349/WOLFF'])
        expect(r.vidros.map((x) => x.vidro)).toEqual(['VIDRO INSULADO'])
    })

    it('vidro de 20 mm: só a 919, e nenhum vidro', () => {
        const r = ok(avaliarTipologia(entrada({ espessura_vidro_mm: 20 })))
        expect(r.insumos.map((x) => x.codigo)).toEqual(['919/WOLFF'])
        expect(r.vidros).toEqual([])
    })

    it('sem espessura: as linhas com lista viram FALTA nomeada, nunca entram juntas', () => {
        const r = ok(avaliarTipologia(entrada({ espessura_vidro_mm: null })))
        expect(r.insumos.map((x) => x.codigo)).toEqual([])
        expect(r.faltas.map((f) => `${f.aba}:${f.codigo}`)).toEqual(['Insumos:3349/WOLFF', 'Insumos:919/WOLFF', 'Vidros:VIDRO', 'Vidros:VIDRO INSULADO'])
        expect(r.faltas[0].mensagem).toContain('depende da espessura do vidro (5,6,8,24 mm)')
    })

    it('a lista que não se lê é falta, nomeando-a', () => {
        const t = tipologia({ insumos: [{ insumo: 'X', descricao: null, qtd: '1', condicao: 'sempre', esp_vidro: '5 e 6' }] })
        expect(ok(avaliarTipologia({ ...entrada(), tipologia: t })).faltas).toEqual([expect.objectContaining({ aba: 'Insumos', codigo: 'X' })])
    })
})

describe('R5 — o corte do perfil sem decimal', () => {
    it('HFOL = 953,6 sai 953 (cortado, não arredondado)', () => {
        const r = ok(avaliarTipologia(entrada({ H_mm: 1000 })))
        expect(r.pecas.find((p) => p.codigo === 'SF66/WOLFF')?.comprimento_mm).toBe(953)
    })

    it('a medida entre 0 e 1 mm é recusada (cortada, não há peça)', () => {
        const t = tipologia({ perfis: [{ perfil: 'P', descricao: 'P', corte: '90/90', qtd: '1', medida: '0.6', posicao: 'Largura', esp_vidro: null, condicao: 'sempre' }] })
        expect(recusas(avaliarTipologia({ ...entrada(), tipologia: t }))).toEqual([expect.objectContaining({ motivo: 'COMPRIMENTO_NAO_POSITIVO', perfil: 'P' })])
    })
})

describe('a leitura das colunas novas (lerTipologia)', () => {
    const aba = (cabecalho: string[], linhas: Array<Record<string, unknown>>) => ({ cabecalho, linhas })
    const base = {
        'Detalhe Tipologias': aba(['Código', 'Larg. mín (mm)', 'Larg. máx (mm)', 'Alt. mín (mm)', 'Alt. máx (mm)'], [{ 'Código': 'T' }]),
        'Fórmulas': aba(['Código', 'Variável', 'Fórmula'], []),
        'Perfis': aba(['Código', 'Perfil', 'Descrição', 'Corte', 'Qtd', 'Medida', 'Posição', 'Esp. vidro', 'Condição'], []),
        'Validações': aba(['Código', 'Condição válida', 'Mensagem'], []),
    }
    it('lê "Condição das opções" e "Esp. vidro" quando vêm', () => {
        const r = lerTipologia({
            ...base,
            'Variáveis': aba(['Código', 'Var.', 'Descrição', 'Padrão', 'Condição', 'Opções', 'Condição das opções'],
                [{ 'Código': 'T', 'Var.': 'ARI', 'Padrão': '1', 'Condição': 'sempre', 'Opções': '1 = A', 'Condição das opções': '1: (TI=1)' }]),
            'Insumos': aba(['Código', 'Insumo', 'Descrição', 'Qtd (fórmula)', 'Condição', 'Esp. vidro'], [{ 'Código': 'T', 'Insumo': '3349', 'Qtd (fórmula)': '1', 'Esp. vidro': '5,6' }]),
            'Vidros': aba(['Código', 'Vidro', 'Largura', 'Altura', 'Qtd', 'Fixação', 'Condição', 'Esp. vidro'], [{ 'Código': 'T', 'Vidro': 'V', 'Largura': '1', 'Altura': '1', 'Qtd': '1', 'Esp. vidro': '24' }]),
        }, 'T')
        if ('recusas' in r) throw new Error('recusado')
        expect(r.tipologia.variaveis[0].condicao_opcoes).toBe('1: (TI=1)')
        expect(r.tipologia.insumos?.[0].esp_vidro).toBe('5,6')
        expect(r.tipologia.vidros?.[0].esp_vidro).toBe('24')
    })

    it('sem as colunas (o motor de antes), elas valem nulo — nunca recusa', () => {
        const r = lerTipologia({
            ...base,
            'Variáveis': aba(['Código', 'Var.', 'Descrição', 'Padrão', 'Condição', 'Opções'], [{ 'Código': 'T', 'Var.': 'ARI', 'Padrão': '1', 'Opções': '1 = A' }]),
            'Insumos': aba(['Código', 'Insumo', 'Descrição', 'Qtd (fórmula)', 'Condição'], [{ 'Código': 'T', 'Insumo': '3349', 'Qtd (fórmula)': '1' }]),
        }, 'T')
        if ('recusas' in r) throw new Error('recusado')
        expect(r.tipologia.variaveis[0].condicao_opcoes).toBeNull()
        expect(r.tipologia.insumos?.[0].esp_vidro).toBeNull()
    })
})

export {}

describe('R2 na conversa — escolhasPendentes só oferece as opções que valem', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const E = () => require('@/lib/atendimentos-ia/escolhas-da-tipologia') as typeof import('@/lib/atendimentos-ia/escolhas-da-tipologia')
    it('com TI = 2, o ARI oferece 3 e 4; com TI = 1, 1, 2 e 4', () => {
        const t = { variaveis: tipologia().variaveis }
        expect(E().escolhasPendentes(t, { ARR: 1, TI: 2 }).find((p) => p.variavel === 'ARI')?.opcoes.map((o) => o.valor)).toEqual([3, 4])
        expect(E().escolhasPendentes(t, { ARR: 1, TI: 1 }).find((p) => p.variavel === 'ARI')?.opcoes.map((o) => o.valor)).toEqual([1, 2, 4])
    })
    it('sem TI escolhido (a condição não se avalia), nenhuma opção some', () => {
        expect(E().escolhasPendentes({ variaveis: tipologia().variaveis }, { ARR: 1 }).find((p) => p.variavel === 'ARI')?.opcoes.map((o) => o.valor)).toEqual([1, 2, 3, 4])
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
/**
 * A OPÇÃO PADRÃO QUE NÃO VALE (dono do produto, 26/11/2026; pedido 0030 — o orçamento 28-PVC, item 8: a DP-73, 5.150 × 2.550, com RL = 1 pela política
 * "acessórios para região litorânea = SIM"; a condição da opção 1 é `(H-Y+52)<=2437.8`, falsa com 2.550, e o cálculo parou com "A escolha RL = 1 não
 * vale neste item: as opções que valem são 2"). A DP-73 em miniatura, com os nomes do motor: as duas cremonas, a do litoral (21495, RL=1) e a
 * Celsus (15396, RL=2).
 */
describe('0030 — a opção que veio por PADRÃO e não vale dá lugar à que vale; a dita pelo vendedor continua recusa', () => {
    const DP73 = (rl: VariavelDaTipologia = v('RL', '2', 'sempre', '1 = SIM; 2 = NÃO', '1: (H-Y+52)<=2437.8')): Tipologia => ({
        codigo: 'DP-73',
        detalhe: { larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null },
        variaveis: [v('Y', '58', 'sempre', null), rl],
        formulas: [],
        perfis: [{ perfil: 'SF66/WOLFF', descricao: 'FOLHA', corte: '45/45', qtd: '2', medida: '(H-46.4)', posicao: 'Altura', esp_vidro: null, condicao: 'sempre' }],
        validacoes: [],
        insumos: [
            { insumo: '21495', descricao: 'CREMONA DE CORRER E15 1600 INOX 304', qtd: '1', condicao: '(RL=1)', esp_vidro: null },
            { insumo: '15396', descricao: 'CREMONA CELSUS MD2 E15 1600', qtd: '1', condicao: '(RL=2)', esp_vidro: null },
        ],
        vidros: [],
    })
    const caso = (e: Partial<EntradaDoAvaliador> = {}): EntradaDoAvaliador => ({ tipologia: DP73(), L_mm: 5150, H_mm: 2550, espessura_vidro_mm: null, escolhas: { RL: 1 }, semDecidirVariacao: true, ...e })
    it('O CASO EXATO: RL = 1 pela POLÍTICA, com 2.550 de altura — o cálculo segue com RL = 2: a 15396 entra, a 21495 não, sem falta, e a troca é devolvida', () => {
        const r = ok(avaliarTipologia(caso({ escolhasPorPadrao: ['RL'] })))
        expect(r.insumos.map((x) => x.codigo)).toEqual(['15396'])
        expect(r.faltas).toEqual([])
        expect(r.trocas).toEqual([{ variavel: 'RL', de: 1, para: 2, motivo: 'unica_valida_padrao_invalido' }])
    })
    it('o contrário: RL = 1 DITO pelo vendedor no mesmo item — a falta de antes, nomeando a opção que vale (as duas linhas do motor que dependem da RL)', () => {
        const r = ok(avaliarTipologia(caso()))
        expect(r.trocas).toEqual([])
        expect(r.faltas.map((f) => `${f.codigo}: ${f.mensagem}`)).toEqual([
            '21495: Linha 1 da aba Insumos (21495): A escolha RL = 1 não vale neste item: as opções que valem são 2.',
            '15396: Linha 2 da aba Insumos (15396): A escolha RL = 1 não vale neste item: as opções que valem são 2.',
        ])
        // a lista vazia também é "dito"
        expect(ok(avaliarTipologia(caso({ escolhasPorPadrao: [] }))).faltas).toHaveLength(2)
    })
    it('a opção padrão que VALE fica como está, e nada é trocado (2.400 de altura: a opção 1 vale)', () => {
        const r = ok(avaliarTipologia(caso({ H_mm: 2400, escolhasPorPadrao: ['RL'] })))
        expect(r.insumos.map((x) => x.codigo)).toEqual(['21495'])
        expect(r.trocas).toEqual([])
    })
    it('com DUAS ou mais que valem, a primeira na ordem das opções — e o motivo diz que não era a única', () => {
        const t = DP73(v('RL', '2', 'sempre', '1 = SIM; 2 = NÃO; 3 = TALVEZ', '1: (H-Y+52)<=2437.8'))
        const r = ok(avaliarTipologia(caso({ tipologia: t, escolhasPorPadrao: ['RL'] })))
        expect(r.trocas).toEqual([{ variavel: 'RL', de: 1, para: 2, motivo: 'primeira_valida_padrao_invalido' }])
        // a ordem é a das OPÇÕES, não a numérica
        const invertida = DP73(v('RL', '2', 'sempre', '1 = SIM; 3 = TALVEZ; 2 = NÃO', '1: (H-Y+52)<=2437.8'))
        expect(ok(avaliarTipologia(caso({ tipologia: invertida, escolhasPorPadrao: ['RL'] }))).trocas[0].para).toBe(3)
    })
    it('nenhuma opção vale: recusa como antes, mesmo por padrão (não há o que pôr no lugar)', () => {
        const t = DP73(v('RL', '2', 'sempre', '1 = SIM; 2 = NÃO', '1: (H>9000); 2: (H>9000)'))
        const r = ok(avaliarTipologia(caso({ tipologia: t, escolhasPorPadrao: ['RL'] })))
        expect(r.trocas).toEqual([])
        expect(r.faltas[0].mensagem).toBe('Linha 1 da aba Insumos (21495): A escolha RL = 1 não vale neste item: nenhuma opção vale.')
    })
    it('vale para qualquer variável com condição nas opções, não só a RL; e só a variável listada é trocada', () => {
        const comXX = (dp: Tipologia): Tipologia => ({ ...dp, variaveis: [...dp.variaveis, v('XX', '1', 'sempre', '1 = A; 2 = B', '1: (H<100)')],
            insumos: [...(dp.insumos ?? []), { insumo: '777', descricao: 'PECA DA XX', qtd: '1', condicao: '(XX=2)', esp_vidro: null }] })
        const r = ok(avaliarTipologia(caso({ tipologia: comXX(DP73()), escolhas: { RL: 2, XX: 1 }, escolhasPorPadrao: ['XX'] })))
        expect(r.trocas).toEqual([{ variavel: 'XX', de: 1, para: 2, motivo: 'unica_valida_padrao_invalido' }])
        expect(r.insumos.map((x) => x.codigo)).toEqual(['15396', '777'])
        // a RL, dita, não é trocada: as linhas dela são falta
        const dita = ok(avaliarTipologia(caso({ tipologia: comXX(DP73()), escolhas: { RL: 1, XX: 1 }, escolhasPorPadrao: ['XX'] })))
        expect(dita.trocas.map((t) => t.variavel)).toEqual(['XX'])
        expect(dita.faltas.map((f) => f.codigo)).toEqual(['21495', '15396'])
    })
})
