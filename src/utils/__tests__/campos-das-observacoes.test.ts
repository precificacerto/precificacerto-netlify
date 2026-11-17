/**
 * PORTÃO — OS CAMPOS DAS OBSERVAÇÕES (dono do produto, 16/11/2026): "uma seção de observação com as variáveis [...]
 * como referência é o que consta nesse arquivo".
 *
 * A REFERÊNCIA é o bloco do orçamento 1154 da De Paula, extraído do PDF que ele subiu. O portão reproduz o bloco
 * INTEIRO a partir dos campos e o compara com o que está impresso lá — linha por linha, inclusive os centavos das
 * parcelas (14.962,63 e 14.962,62 sobre 29.925,25).
 */
import {
    fraseDaValidade, fraseDoPagamentoQueNaoFecha, lerCamposDasObservacoes, linhasDasCondicoesComerciais, linhasDasObservacoes, valoresDasParcelas,
    LIMITE_DA_LINHA, LIMITE_DE_PRAZOS, SEM_CAMPOS, type CamposDasObservacoes,
} from '@/lib/atendimentos-ia/campos-das-observacoes'

/** Os campos como a De Paula os gravaria, lidos do 1154. */
const DO_1154: CamposDasObservacoes = {
    prazosAbertura: 'Prazos de entrega após a medição final (salvo alterações em período de férias coletivas).',
    prazos: [
        { grupo: 'PVC', acabamento: 'BRANCO', dias: 45 },
        { grupo: 'PVC', acabamento: 'LAMINADO TOTAL', dias: 60 },
        { grupo: 'PVC', acabamento: 'LAMINADO SOMENTE EXTERNO', dias: 75 },
        { grupo: 'ALUMÍNIO', acabamento: 'CORES PADRÕES', dias: 45 },
        { grupo: 'ALUMÍNIO', acabamento: 'CORES ESPECIAIS', dias: 90 },
    ],
    validadeDias: 7,
    exclusoes: [
        'NÃO CONTEMPLA REMOÇÃO E DESCARTE DE ESQUADRIA EXISTENTE.',
        'NÃO INCLUSO NO ORÇAMENTO LOCAÇÃO DE PLATAFORMAS E GUINDASTES PARA INSTALAÇÃO DE VIDROS ESPECIAIS E PAINÉIS.',
    ],
    pagamento: [{ percentual: 50, rotulo: 'de Entrada' }, { percentual: 50, rotulo: 'na Entrega' }],
}
/** O total impresso no 1154. */
const TOTAL = 29925.25

describe('o bloco do 1154, montado dos campos', () => {
    it('sai LINHA POR LINHA como está no orçamento de referência', () => {
        expect(linhasDasObservacoes(DO_1154, { textoLivre: null })).toEqual([
            'Prazos de entrega após a medição final (salvo alterações em período de férias coletivas).',
            'PVC:',
            '• BRANCO: 45 DIAS',
            '• LAMINADO TOTAL: 60 DIAS',
            '• LAMINADO SOMENTE EXTERNO: 75 DIAS',
            'ALUMÍNIO:',
            '• CORES PADRÕES: 45 DIAS',
            '• CORES ESPECIAIS: 90 DIAS',
            'PROPOSTA VÁLIDA POR 7 DIAS A PARTIR DA EMISSÃO DA PRESENTE DATA.',
            'NÃO CONTEMPLA REMOÇÃO E DESCARTE DE ESQUADRIA EXISTENTE.',
            'NÃO INCLUSO NO ORÇAMENTO LOCAÇÃO DE PLATAFORMAS E GUINDASTES PARA INSTALAÇÃO DE VIDROS ESPECIAIS E PAINÉIS.',
        ])
        // a FORMA DE PAGAMENTO saiu das observações e é o bloco CONDIÇÕES COMERCIAIS (dono do produto, 17/11/2026), com as mesmas linhas do 1154
        expect(linhasDasCondicoesComerciais(DO_1154, TOTAL)).toEqual([
            'Forma de Pagamento:',
            '50% de Entrada - R$ 14.962,63',
            '50% na Entrega - R$ 14.962,62',
            'Total: R$ 29.925,25',
        ])
    })
    it('o CABEÇALHO do grupo sai uma vez por grupo, na ordem dos prazos — nunca repetido a cada linha', () => {
        const linhas = linhasDasObservacoes(DO_1154, { textoLivre: null })
        expect(linhas.filter((l) => l === 'PVC:')).toHaveLength(1)
        expect(linhas.filter((l) => l === 'ALUMÍNIO:')).toHaveLength(1)
    })
    it('o texto livre da empresa vai POR ÚLTIMO, uma linha por linha', () => {
        const linhas = linhasDasObservacoes(DO_1154, { textoLivre: 'Obra com acesso por elevador.\nFalar com o zelador.' })
        expect(linhas.slice(-2)).toEqual(['Obra com acesso por elevador.', 'Falar com o zelador.'])
    })
    it('sem campo nenhum e sem texto, NENHUMA linha: o bloco sai vazio, como antes de existirem', () => {
        expect(linhasDasObservacoes(SEM_CAMPOS, { textoLivre: null })).toEqual([])
        expect(linhasDasObservacoes(SEM_CAMPOS, { textoLivre: '   ' })).toEqual([])
    })
})

describe('os valores das parcelas fecham no total, ao centavo', () => {
    it('50/50 sobre 29.925,25: a última leva o centavo que sobra', () => {
        expect(valoresDasParcelas(2992525, DO_1154.pagamento)).toEqual([1496263, 1496262])
        expect(valoresDasParcelas(2992525, DO_1154.pagamento).reduce((s, v) => s + v, 0)).toBe(2992525)
    })
    it('três parcelas de 33,33/33,33/33,34 e um total ímpar: a soma continua exata', () => {
        const tres = [{ percentual: 33.33, rotulo: 'a' }, { percentual: 33.33, rotulo: 'b' }, { percentual: 33.34, rotulo: 'c' }]
        const v = valoresDasParcelas(100003, tres)
        expect(v.reduce((s, x) => s + x, 0)).toBe(100003)
    })
    it('o total do bloco é o do orçamento, não a soma arredondada das parcelas', () => {
        const linhas = linhasDasCondicoesComerciais(DO_1154, 1000.01)
        expect(linhas[linhas.length - 1]).toBe('Total: R$ 1.000,01')
        expect(linhas).toContain('50% de Entrada - R$ 500,01')
        expect(linhas).toContain('50% na Entrega - R$ 500,00')
    })
    it('sem parcelas, não sai nem o rótulo nem o total — o bloco não inventa forma de pagamento', () => {
        expect(linhasDasCondicoesComerciais({ ...DO_1154, pagamento: [] }, TOTAL)).toEqual([])
        const linhas = linhasDasObservacoes({ ...DO_1154, pagamento: [] }, { textoLivre: null })
        expect(linhas.some((l) => l.includes('Pagamento'))).toBe(false)
        expect(linhas.some((l) => l.startsWith('Total:'))).toBe(false)
    })
})

describe('a frase da validade é montada do NÚMERO', () => {
    it('plural e singular', () => {
        expect(fraseDaValidade(7)).toBe('PROPOSTA VÁLIDA POR 7 DIAS A PARTIR DA EMISSÃO DA PRESENTE DATA.')
        expect(fraseDaValidade(1)).toBe('PROPOSTA VÁLIDA POR 1 DIA A PARTIR DA EMISSÃO DA PRESENTE DATA.')
    })
    it('sem validade, a linha não existe', () => {
        expect(linhasDasObservacoes({ ...SEM_CAMPOS, validadeDias: null }, { textoLivre: null })).toEqual([])
    })
    it('o prazo de UM dia também vai no singular', () => {
        expect(linhasDasObservacoes({ ...SEM_CAMPOS, prazos: [{ grupo: '', acabamento: 'URGENTE', dias: 1 }] }, { textoLivre: null }))
            .toEqual(['• URGENTE: 1 DIA'])
    })
})

describe('o que entra, e o que é recusado nomeando o campo', () => {
    const corpoDo1154 = {
        prazosAbertura: DO_1154.prazosAbertura,
        prazos: DO_1154.prazos,
        validadeDias: 7,
        exclusoes: DO_1154.exclusoes,
        pagamento: DO_1154.pagamento,
    }
    it('o corpo do 1154 entra inteiro, sem erro', () => {
        expect(lerCamposDasObservacoes(corpoDo1154)).toEqual({ campos: DO_1154, erros: [] })
    })
    it('as listas AUSENTES são listas vazias: a seção pode ser preenchida aos poucos', () => {
        expect(lerCamposDasObservacoes({})).toEqual({ campos: SEM_CAMPOS, erros: [] })
    })
    it('as PARCELAS têm de somar 100%: 50 + 40 é recusa que diz a soma', () => {
        const r = lerCamposDasObservacoes({ ...corpoDo1154, pagamento: [{ percentual: 50, rotulo: 'a' }, { percentual: 40, rotulo: 'b' }] })
        expect(r.erros).toEqual([{ campo: 'pagamento', mensagem: fraseDoPagamentoQueNaoFecha(90) }])
    })
    it('o dia que não é inteiro positivo é recusa que NOMEIA a linha', () => {
        const r = lerCamposDasObservacoes({ prazos: [{ grupo: 'PVC', acabamento: 'BRANCO', dias: 0 }] })
        expect(r.erros.map((e) => e.campo)).toEqual(['prazos[0].dias'])
        const meio = lerCamposDasObservacoes({ prazos: [{ grupo: 'PVC', acabamento: 'BRANCO', dias: 45 }, { grupo: 'PVC', acabamento: 'X', dias: 1.5 }] })
        expect(meio.erros.map((e) => e.campo)).toEqual(['prazos[1].dias'])
    })
    it('a linha vazia, a longa demais e a que não é texto são recusa nomeada — nunca entram em branco', () => {
        expect(lerCamposDasObservacoes({ exclusoes: ['  '] }).erros.map((e) => e.campo)).toEqual(['exclusoes[0]'])
        expect(lerCamposDasObservacoes({ exclusoes: ['a'.repeat(LIMITE_DA_LINHA + 1)] }).erros[0].mensagem).toContain(String(LIMITE_DA_LINHA))
        expect(lerCamposDasObservacoes({ exclusoes: [42] }).erros).toEqual([{ campo: 'exclusoes[0]', mensagem: 'tem de ser texto' }])
    })
    it('a lista grande demais e o que não é lista são recusa nomeada', () => {
        const muitos = Array.from({ length: LIMITE_DE_PRAZOS + 1 }, () => ({ grupo: 'PVC', acabamento: 'X', dias: 1 }))
        expect(lerCamposDasObservacoes({ prazos: muitos }).erros[0].mensagem).toContain(String(LIMITE_DE_PRAZOS))
        expect(lerCamposDasObservacoes({ prazos: 'PVC 45 dias' }).erros).toEqual([{ campo: 'prazos', mensagem: 'tem de ser uma lista' }])
    })
    it('o GRUPO é opcional (o prazo solto não precisa de cabeçalho); o ACABAMENTO não é', () => {
        expect(lerCamposDasObservacoes({ prazos: [{ acabamento: 'BRANCO', dias: 45 }] }).erros).toEqual([])
        expect(lerCamposDasObservacoes({ prazos: [{ grupo: 'PVC', dias: 45 }] }).erros.map((e) => e.campo)).toEqual(['prazos[0].acabamento'])
    })
    it('o percentual fora de 0..100 é recusa, e não vira parcela', () => {
        const r = lerCamposDasObservacoes({ pagamento: [{ percentual: 0, rotulo: 'a' }, { percentual: 120, rotulo: 'b' }] })
        expect(r.erros.map((e) => e.campo)).toEqual(['pagamento[0].percentual', 'pagamento[1].percentual'])
        expect(r.campos.pagamento).toEqual([])
    })
})

export {}
