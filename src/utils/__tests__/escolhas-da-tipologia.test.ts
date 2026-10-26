/**
 * PORTÃO — as ESCOLHAS DA TIPOLOGIA que a conversa captura (`src/lib/atendimentos-ia/escolhas-da-
 * tipologia.ts`): quais perguntar, em que ordem, como perguntar, e o que aceitar como resposta.
 *
 * AS REGRAS (dono do produto, 25/10/2026):
 *   - a IA recebe, da aba Variáveis da tipologia, as perguntas com as opções por extenso, e pergunta
 *     uma de cada vez, só as que faltam;
 *   - ela NUNCA escolhe sozinha quando a opção muda o preço; o Padrão vale só para o que não é
 *     perguntado;
 *   - começa por ARI, ARE e MAE — as três que impedem a DP-02 de fechar. O resto fica no Padrão.
 *
 * QUANDO uma variável é perguntada é a coluna Condição da aba Variáveis, avaliada com as escolhas já
 * feitas: verdadeira, pergunta; falsa, não pergunta (a variável não é usada); quando não dá para
 * avaliar — um nome que nenhuma aba define, como o ARR de "(ARR=1)" —, PERGUNTA: deixar de perguntar
 * por não saber seria escolher sozinho.
 *
 * Os dados são as abas da DP-02 (`abas-do-motor-wolff-DP-02.json`).
 */
export {}

/* eslint-disable @typescript-eslint/no-require-imports */
type Modulo = typeof import('@/lib/atendimentos-ia/escolhas-da-tipologia')
const E = () => require('@/lib/atendimentos-ia/escolhas-da-tipologia') as Modulo
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const A = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
const ABAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */

function dp02() {
    const r = A().lerTipologia(ABAS, 'DP-02')
    if ('recusas' in r) throw new Error('abas recusadas: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r.tipologia
}
const pendentes = (escolhas: Record<string, number>) => E().escolhasPendentes(dp02(), escolhas).map((p) => p.variavel)

describe('(1) quais perguntar', () => {
    it('a primeira versão captura ARI, ARE e MAE — e só elas', () => {
        expect([...E().ESCOLHAS_CAPTURADAS]).toEqual(['ARI', 'ARE', 'MAE'])
    })

    it('sem nenhuma escolha: as três, na ordem da aba — MAE também, porque ainda não se sabe o ARE', () => {
        expect(pendentes({})).toEqual(['ARI', 'ARE', 'MAE'])
    })

    it('a Condição decide: com ARE = 2 (sem arremate externo), MAE NÃO é perguntada', () => {
        expect(pendentes({ ARI: 4, ARE: 2 })).toEqual([])
    })

    it('o contraste: com ARE = 1, MAE É perguntada', () => {
        expect(pendentes({ ARI: 4, ARE: 1 })).toEqual(['MAE'])
    })

    it('só as que FALTAM: o que já foi escolhido não volta', () => {
        expect(pendentes({ ARI: 4 })).toEqual(['ARE', 'MAE'])
    })

    it('Condição que não dá para avaliar ("(ARR=1)", ARR não existe em aba nenhuma) → PERGUNTA', () => {
        const ari = dp02().variaveis.find((v) => v.variavel === 'ARI')
        expect(ari?.condicao).toBe('(ARR=1)')
        expect(pendentes({})[0]).toBe('ARI')
    })

    it('uma variável que NÃO é capturada não é perguntada, mesmo aplicável: MAI com ARI = 3 fica no Padrão', () => {
        const mai = dp02().variaveis.find((v) => v.variavel === 'MAI')
        expect(mai?.condicao).toBe('(ARI=3)')
        expect(pendentes({ ARI: 3, ARE: 2 })).toEqual([])
    })

    it('a pendente traz a descrição e as opções por extenso, sem o valor entre colchetes', () => {
        const [ari] = E().escolhasPendentes(dp02(), {})
        expect(ari).toEqual({
            variavel: 'ARI',
            descricao: 'ARREMATE INTERNO',
            opcoes: [
                { valor: 1, rotulo: 'BZ0006 - ARREMATE 65MM' },
                { valor: 2, rotulo: 'BZ1770 - ARREMATE 70MM' },
                { valor: 3, rotulo: 'BZ0010 - ARREMATE 20MM' },
                { valor: 4, rotulo: 'SEM ARREMATE INTERNO' },
            ],
        })
    })
})

describe('(2) como perguntar — por extenso, em português, SEM código e SEM número (dono do produto, 25/10/2026)', () => {
    it('a pergunta da ARI, inteira', () => {
        const [ari] = E().escolhasPendentes(dp02(), {})
        expect(E().perguntaDaEscolha(ari)).toBe('Para arremate interno, as opções são: arremate de 65 mm; arremate de 70 mm; arremate de 20 mm; sem arremate interno. Qual você quer?')
    })

    it('a pergunta da MAE, inteira', () => {
        const [mae] = E().escolhasPendentes(dp02(), { ARI: 4, ARE: 1 })
        expect(E().perguntaDaEscolha(mae)).toBe('Para medida do arremate externo, as opções são: medida do vão (corte 45/45); vão + 50 mm (corte 90/90) - para ajuste em obra; vão + 100 mm (corte 90/90) - para ajuste em obra. Qual você quer?')
    })

    // Dono do produto, 26/10/2026: o que chega ao vendedor vai por extenso, sem código de fornecedor e sem número de opção.
    // Os rótulos são TODOS os distintos das opções de ARI, ARE e MAE das 161 tipologias da Wolff em produção (26/10/2026).
    it.each([
        ['BZ0006 - ARREMATE 65MM [33,00]', 'arremate de 65 mm'],
        ['BZ1770 - ARREMATE 70MM [50,00]', 'arremate de 70 mm'],
        ['BZ0010 - ARREMATE 20MM', 'arremate de 20 mm'],
        ['SEM ARREMATE INTERNO', 'sem arremate interno'],
        ['SEM ARREMATE EXTERNO', 'sem arremate externo'],
        ['MEDIDA DO VÃO (CORTE 45/45)', 'medida do vão (corte 45/45)'],
        ['MEDIDA DO VÃO (CORTE 45)', 'medida do vão (corte 45)'],
        ['VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]', 'vão + 50 mm (corte 90/90) - para ajuste em obra'],
        ['VÃO+100MM (CORTE 90/90) - PARA AJUSTE EM OBRA [100,00]', 'vão + 100 mm (corte 90/90) - para ajuste em obra'],
    ])('opcaoParaOVendedor: %s → %s', (rotulo, esperado) => {
        expect(E().opcaoParaOVendedor(rotulo)).toBe(esperado)
        expect(E().opcaoParaOVendedor(rotulo)).not.toMatch(/\b[A-Z]{1,5}\d{2,}\b|\[|\b\d+ = /)
    })

    it('escolhaPedida: a variável capturada da tipologia, pronta para perguntar; a que não é capturada, null', () => {
        expect(E().escolhaPedida(dp02(), 'ARE')).toEqual({ variavel: 'ARE', descricao: 'ARREMATE EXTERNO', opcoes: [{ valor: 1, rotulo: 'BZ0010 - ARREMATE 20MM' }, { valor: 2, rotulo: 'SEM ARREMATE EXTERNO' }] })
        expect(E().escolhaPedida(dp02(), 'MTE')).toBeNull()
        expect(E().escolhaPedida(dp02(), 'XYZ')).toBeNull()
    })

    it('para o PROMPT (uso interno), o código e os números — é o que a LLM precisa para registrar a escolha', () => {
        expect(E().escolhasParaOPrompt(dp02())).toEqual([
            'ARI = ARREMATE INTERNO: 1 = BZ0006 - ARREMATE 65MM; 2 = BZ1770 - ARREMATE 70MM; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO',
            'ARE = ARREMATE EXTERNO: 1 = BZ0010 - ARREMATE 20MM; 2 = SEM ARREMATE EXTERNO',
            'MAE = MEDIDA ARREMATE EXTERNO: 1 = MEDIDA DO VÃO (CORTE 45/45); 2 = VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA; 3 = VÃO+100MM (CORTE 90/90) - PARA AJUSTE EM OBRA',
        ])
    })
})

describe('(3) o que aceitar como resposta — a LLM propõe, o código valida', () => {
    const validar = (escolhas: Record<string, number>, proposta: unknown) => E().validarEscolha(dp02(), escolhas, proposta)

    it('uma opção válida de uma pendente é gravada, junto das que já havia', () => {
        expect(validar({ ARI: 4 }, { variavel: 'ARE', opcao: 1 })).toEqual({ gravar: { ARI: 4, ARE: 1 }, propostos: 1, descartados: 0 })
    })

    it.each([
        ['opção que não existe', { ARI: 4 }, { variavel: 'ARE', opcao: 9 }],
        ['opção como texto', { ARI: 4 }, { variavel: 'ARE', opcao: '1' }],
        ['opção fracionária', { ARI: 4 }, { variavel: 'ARE', opcao: 1.5 }],
        ['variável que não é capturada (MTE)', { ARI: 4 }, { variavel: 'MTE', opcao: 1 }],
        ['variável que não existe', { ARI: 4 }, { variavel: 'XYZ', opcao: 1 }],
        ['a DESCRIÇÃO no lugar do código (o que a LLM propunha sem o código no prompt — o defeito 1)', { ARI: 4 }, { variavel: 'ARREMATE INTERNO', opcao: 4 }],
    ])('%s → descartada', (_nome, escolhas, proposta) => {
        expect(validar(escolhas, proposta)).toEqual({ gravar: null, propostos: 1, descartados: 1 })
    })

    it('a escolha já feita é SOBRESCRITA (decisão 3: o vendedor troca o arremate depois)', () => {
        expect(validar({ ARI: 4 }, { variavel: 'ARI', opcao: 1 })).toEqual({ gravar: { ARI: 1 }, propostos: 1, descartados: 0 })
    })

    it('sem proposta: nada proposto, nada descartado', () => {
        expect(validar({}, undefined)).toEqual({ gravar: null, propostos: 0, descartados: 0 })
        expect(validar({}, null)).toEqual({ gravar: null, propostos: 0, descartados: 0 })
    })
})

describe('(4) o que está gravado e como se descreve', () => {
    it('lê do jsonb só as capturadas, e só número inteiro — o resto não vira escolha', () => {
        expect(E().lerEscolhasGravadas({ ARI: 4, ARE: '1', MAE: 2.5, XX: 3 })).toEqual({ ARI: 4 })
        expect(E().lerEscolhasGravadas(null)).toEqual({})
        expect(E().lerEscolhasGravadas([4, 1])).toEqual({})
    })

    it('o item preserva o null de uma capturada (o vendedor pediu as opções); o resto como em lerEscolhasGravadas', () => {
        expect(E().lerEscolhasDoItem({ ARI: null, ARE: 1, MAE: '2', XX: null })).toEqual({ ARI: null, ARE: 1 })
        expect(E().lerEscolhasGravadas({ ARI: null, ARE: 1 })).toEqual({ ARE: 1 })
    })

    it('o arremate SEM escolha nenhuma: o PADRÃO da aba, por extenso, dito como padrão', () => {
        expect(E().descreverArremate(dp02(), {})).toBe('arremate interno: BZ0006 - ARREMATE 65MM (padrão); arremate externo: BZ0010 - ARREMATE 20MM (padrão); '
            + 'medida arremate externo: MEDIDA DO VÃO (CORTE 45/45) (padrão)')
    })

    it('o que o vendedor pediu sai como pedido, o resto como padrão', () => {
        expect(E().descreverArremate(dp02(), { ARI: 4, MAE: 2 })).toBe('arremate interno: SEM ARREMATE INTERNO (como você pediu); arremate externo: BZ0010 - ARREMATE 20MM (padrão); '
            + 'medida arremate externo: VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA (como você pediu)')
    })

    it('a que não se aplica não aparece: sem arremate externo, a medida dele sai da linha', () => {
        expect(E().descreverArremate(dp02(), { ARE: 2 })).toBe('arremate interno: BZ0006 - ARREMATE 65MM (padrão); arremate externo: SEM ARREMATE EXTERNO (como você pediu)')
    })

    it('a frase de confirmação muda quando o vendedor escolheu alguma', () => {
        expect(E().temEscolhaDoVendedor({})).toBe(false)
        expect(E().temEscolhaDoVendedor({ ARE: 2 })).toBe(true)
    })

    it('o vocabulário interno sai do texto ao vendedor: &MAE e MAE viram a descrição', () => {
        const recusa = 'Linha 10 da aba Perfis (BZ0010/WOLFF), Medida: &MAE: a opção 1 da variável MAE ("MEDIDA DO VÃO (CORTE 45/45)") não tem medida entre colchetes. &MAE não tem valor, e nenhum é suposto.'
        const traduzida = E().traduzirVocabulario(recusa, dp02())
        expect(traduzida).toBe('Linha 10 da aba Perfis (BZ0010/WOLFF), Medida: “MEDIDA ARREMATE EXTERNO”: a opção 1 da variável “MEDIDA ARREMATE EXTERNO” ("MEDIDA DO VÃO (CORTE 45/45)") não tem medida entre colchetes. “MEDIDA ARREMATE EXTERNO” não tem valor, e nenhum é suposto.')
        expect(traduzida).not.toMatch(/\b(ARI|ARE|MAE|MAI)\b/)
    })
})
