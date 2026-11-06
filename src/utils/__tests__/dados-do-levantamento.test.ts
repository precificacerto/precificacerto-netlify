/**
 * OS DADOS DO LEVANTAMENTO que a coleta captura (`dados-do-levantamento.ts`, dono do produto, 06/11/2026): só vale o que foi DITO na mensagem;
 * os percentuais vêm do cadastro do vendedor quando não ditos; o que falta é perguntado; o responsável pela RT nunca vem do cadastro.
 * E os ambientes que viajam com o item (`aplicarProposta`, `agruparIguais`): o dito substitui, a fusão soma por nome.
 */
import {
    ambientesDitos, condicoesComOCadastro, dataDita, descricaoDoHomonimo, emailDito, fraseDoVendedorInativo, fraseDosHomonimos, fraseDosHomonimosIndistinguiveis, homonimosDistinguiveis, nomeCasa, lerDadosDaMensagem, modoDito, percentualDito, perguntaDasCondicoes, telefoneDito, textoDito,
    type CondicoesDoLevantamento,
} from '@/lib/atendimentos-ia/dados-do-levantamento'
import { agruparIguais, itemVazio, type ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'

const NADA: CondicoesDoLevantamento = { comissao_percentual: null, comissao_modo: null, reserva_tecnica_percentual: null, reserva_tecnica_responsavel: null, lucro_projetado_percentual: null }
const CADASTRO = { comissao_percentual: 5, comissao_modo: 'PROPORCIONAL' as const, reserva_tecnica_percentual: 1, lucro_projetado_percentual: 10 }

describe('(I) só vale o que foi DITO na mensagem', () => {
    it('texto livre: toda palavra do valor está na mensagem (sem caixa e sem acento); a palavra que a IA completou derruba; acima do limite cai', () => {
        expect(textoDito('Rua das Flores, 10', 'fica na rua das flores 10', 300)).toBe('Rua das Flores, 10')
        expect(textoDito('Edificação térrea', 'edificacao terrea', 120)).toBe('Edificação térrea')
        expect(textoDito('Rua das Flores, 10, Centro', 'rua das flores 10', 300)).toBeNull()
        expect(textoDito('  ', 'qualquer', 120)).toBeNull()
        expect(textoDito('abc', 'abc', 2)).toBeNull()
        expect(textoDito(12, '12', 10)).toBeNull()
    })

    it('telefone: os dígitos dele em sequência nos dígitos da mensagem; menos de 8 dígitos não é telefone', () => {
        expect(telefoneDito('(51) 99999-1234', 'fone 51 99999 1234')).toBe('(51) 99999-1234')
        expect(telefoneDito('(51) 99999-1234', 'fone 51 99999 1235')).toBeNull()
        expect(telefoneDito('1234', 'ramal 1234')).toBeNull()
    })

    it('e-mail: com um @ e sem espaço, e escrito na mensagem', () => {
        expect(emailDito('Ana@Exemplo.com', 'mande para ana@exemplo.com')).toBe('ana@exemplo.com')
        expect(emailDito('ana@exemplo.com', 'mande para ana arroba exemplo')).toBeNull()
        expect(emailDito('ana exemplo.com', 'ana exemplo.com')).toBeNull()
    })

    it('data de entrega: AAAA-MM-DD válida, com o dia e o mês ditos como número; a data impossível e a não dita caem', () => {
        expect(dataDita('2026-11-27', 'entrega 27/11/26')).toBe('2026-11-27')
        expect(dataDita('2027-02-04', 'para 4/2')).toBe('2027-02-04')
        expect(dataDita('2027-02-04', 'para 04.02.27')).toBe('2027-02-04')
        expect(dataDita('2026-11-27', 'entrega no fim do mês')).toBeNull()
        expect(dataDita('2027-02-31', 'entrega 31/02')).toBeNull()
        expect(dataDita('27/11/26', 'entrega 27/11/26')).toBeNull()
        expect(dataDita('2026-11-27', 'entrega 11/27')).toBeNull()
    })

    it('percentual: de 0 a 100 e o número dito ("5", "1,5", "1.5"); o inventado, o negativo e o acima de 100 caem', () => {
        expect(percentualDito(5, 'comissão 5%')).toBe(5)
        expect(percentualDito(1.5, 'RT de 1,5')).toBe(1.5)
        expect(percentualDito(1.5, 'RT de 1.5')).toBe(1.5)
        expect(percentualDito(0, 'sem RT, 0')).toBe(0)
        expect(percentualDito(8, 'comissão 5%')).toBeNull()
        expect(percentualDito(-1, '-1')).toBeNull()
        expect(percentualDito(150, '150')).toBeNull()
        expect(percentualDito('5', '5')).toBeNull()
    })

    it('o modo: só com a palavra na mensagem', () => {
        expect(modoDito('PROPORCIONAL', 'comissão proporcional')).toBe('PROPORCIONAL')
        expect(modoDito('CONGELADA', 'congelado')).toBe('CONGELADA')
        expect(modoDito('CONGELADA', 'comissão 5')).toBeNull()
        expect(modoDito('PROPORCIONAL', 'comissão 5')).toBeNull()
        expect(modoDito('OUTRO', 'outro')).toBeNull()
    })

    it('ambientes: todos ditos, com quantidade inteira dita; o nome repetido (sem caixa) derruba a lista inteira; vazia não existe', () => {
        expect(ambientesDitos([{ ambiente: 'Quarto', quantidade: 2 }, { ambiente: 'Sala', quantidade: 1 }], '2 no quarto e 1 na sala')).toEqual([{ ambiente: 'Quarto', quantidade: 2 }, { ambiente: 'Sala', quantidade: 1 }])
        expect(ambientesDitos([{ ambiente: 'Cozinha', quantidade: 1 }, { ambiente: 'cozinha', quantidade: 1 }], '1 cozinha e 1 cozinha')).toBeNull()
        expect(ambientesDitos([{ ambiente: 'Quarto', quantidade: 3 }], '2 no quarto')).toBeNull()
        expect(ambientesDitos([{ ambiente: 'Varanda', quantidade: 1 }], '1 no quarto')).toBeNull()
        expect(ambientesDitos([{ ambiente: 'Quarto', quantidade: 0 }], '0 no quarto')).toBeNull()
        expect(ambientesDitos([], 'nada')).toBeNull()
    })

    it('lerDadosDaMensagem: separa o cliente, as condições e o vendedor, e devolve a proposta com o ambiente e a obs do item já validados', () => {
        const r = lerDadosDaMensagem({
            itens: [{ tipologia: 'DP-02', ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'cuidado com o gesso' }, { tipologia: 'DP-01', obs: 'inventada' }],
            dados_do_cliente: { telefone: '51 99999-0000', endereco: 'Rua Nova, 5' },
            condicoes: { comissao_percentual: 6, lucro_projetado_percentual: 30, reserva_tecnica_responsavel: 'Arq. Bia' },
            vendedor_do_levantamento: 'Beltrana Souza',
        }, 'DP-02 na sala, 1; cuidado com o gesso; fone 51 99999-0000; comissão 6; RT arq. Bia; é da Beltrana Souza')
        expect(r.cliente).toEqual({ telefone: '51 99999-0000' })
        expect(r.condicoes).toEqual({ comissao_percentual: 6, reserva_tecnica_responsavel: 'Arq. Bia' })
        expect(r.vendedor).toBe('Beltrana Souza')
        const itens = r.proposta.itens as Array<Record<string, unknown>>
        expect(itens[0]).toEqual({ tipologia: 'DP-02', ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'cuidado com o gesso' })
        expect(itens[1]).toEqual({ tipologia: 'DP-01' })
        // propostos: telefone, endereço, comissão, lucro, responsável, vendedor, ambientes, obs, obs = 9; descartados: endereço, lucro, a obs inventada = 3
        expect([r.propostos, r.descartados]).toEqual([9, 3])
    })
})

describe('(II) as condições comerciais: o cadastro é o padrão, o dito substitui, o que falta é perguntado', () => {
    it('nada gravado, cadastro completo: tudo do cadastro, e isso é o que se CONGELA; o responsável pela RT nunca vem dele', () => {
        const r = condicoesComOCadastro(NADA, CADASTRO)
        expect(r.condicoes).toEqual({ ...CADASTRO, reserva_tecnica_responsavel: null })
        expect(r.doCadastro).toEqual(CADASTRO)
        expect(r.faltam).toEqual([])
    })

    it('o gravado (o dito, ou o já congelado) vence o cadastro; zero é valor, não falta', () => {
        const r = condicoesComOCadastro({ ...NADA, comissao_percentual: 0, lucro_projetado_percentual: 20 }, CADASTRO)
        expect(r.condicoes).toEqual(expect.objectContaining({ comissao_percentual: 0, lucro_projetado_percentual: 20, reserva_tecnica_percentual: 1 }))
        expect(r.doCadastro).toEqual({ comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 1 })
    })

    it('cadastro nulo (ou ausente) e nada dito: falta cada uma, nomeada — nunca zero', () => {
        expect(condicoesComOCadastro(NADA, null).faltam).toEqual(['a comissão (%)', 'o modo da comissão (proporcional ou congelada)', 'a reserva técnica (%)', 'o lucro projetado da proposta (%)'])
        const parcial = condicoesComOCadastro(NADA, { ...CADASTRO, lucro_projetado_percentual: null })
        expect(parcial.faltam).toEqual(['o lucro projetado da proposta (%)'])
        expect(parcial.condicoes.lucro_projetado_percentual).toBeNull()
    })

    it('a pergunta nomeia o que falta e o vendedor', () => {
        expect(perguntaDasCondicoes(['a comissão (%)'], 'Fulano')).toBe('Para fechar o levantamento, falta a comissão (%) do vendedor Fulano. Qual é?')
        expect(perguntaDasCondicoes(['a comissão (%)', 'a reserva técnica (%)'], null)).toBe('Para fechar o levantamento, faltam a comissão (%) e a reserva técnica (%). Qual é?')
    })
})

describe('(III) os ambientes no item da montagem: o dito substitui, a fusão soma por nome, nada se perde', () => {
    const completo = (ordem: number, extra: Partial<ItemDoLevantamento> = {}): ItemDoLevantamento => ({
        ...itemVazio(ordem), tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: '4 mm', familia: 'PVC', motor_id: 'm', ...extra,
    })

    it('duas GRAVADAS que ficam iguais se fundem: os ambientes somam por nome (sem caixa) e as obs diferentes se juntam', () => {
        const r = agruparIguais([
            completo(1, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'a' }),
            completo(2, { ambientes: [{ ambiente: 'sala', quantidade: 1 }, { ambiente: 'Quarto', quantidade: 1 }], obs: 'b' }),
        ], { gravadas: new Set([1, 2]), quantidadePadrao: new Set() })
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0]).toEqual(expect.objectContaining({ quantidade: 2, ambientes: [{ ambiente: 'Sala', quantidade: 2 }, { ambiente: 'Quarto', quantidade: 1 }], obs: 'a · b' }))
    })

    it('a esquadria da mensagem igual a uma gravada leva os ambientes DITOS para ela (o dito substitui); sem ambientes ditos, os gravados ficam', () => {
        const gravada = completo(1, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }] })
        const r = agruparIguais([gravada, completo(2, { ambientes: [{ ambiente: 'Quarto', quantidade: 1 }] })], { gravadas: new Set([1]), quantidadePadrao: new Set([2]) })
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0].ambientes).toEqual([{ ambiente: 'Quarto', quantidade: 1 }])
        const s = agruparIguais([completo(1, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }] }), completo(2)], { gravadas: new Set([1]), quantidadePadrao: new Set([2]) })
        expect(s.itens[0].ambientes).toEqual([{ ambiente: 'Sala', quantidade: 1 }])
    })

    it('duas linhas iguais DA MESMA mensagem somam também os ambientes', () => {
        const r = agruparIguais([completo(1, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }] }), completo(2, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }] })])
        expect(r.itens[0]).toEqual(expect.objectContaining({ quantidade: 2, ambientes: [{ ambiente: 'Sala', quantidade: 2 }] }))
    })
})

describe('O VENDEDOR DITO: as palavras do nome, e o que separa dois ativos — o nome completo e a data do cadastro, nunca o cargo', () => {
    // o Germano Teixeira ativo da De Paula (medido em 06/11/2026) e um segundo Germano, fictício
    const TEIXEIRA = { nome: 'Germano Teixeira', cadastradoEm: '2026-08-11T20:17:40.984559+00:00' }
    const LIMA = { nome: 'Germano Lima', cadastradoEm: '2026-09-02T13:00:00+00:00' }

    it('casa quando TODA palavra dita está no nome, sem caixa e sem acento; parte de palavra não casa', () => {
        expect(nomeCasa('Germano', 'Germano Teixeira', normalizarNome)).toBe(true)
        expect(nomeCasa('germano TEIXEIRA', 'Germano Teixeira', normalizarNome)).toBe(true)
        expect(nomeCasa('Teixeira', 'Germano Teixeira', normalizarNome)).toBe(true)
        expect(nomeCasa('José', 'Jose da Silva', normalizarNome)).toBe(true)
        expect(nomeCasa('Germano Silva', 'Germano Teixeira', normalizarNome)).toBe(false)
        expect(nomeCasa('Germ', 'Germano Teixeira', normalizarNome)).toBe(false)
        expect(nomeCasa('', 'Germano Teixeira', normalizarNome)).toBe(false)
        expect(nomeCasa('  ', 'Germano Teixeira', normalizarNome)).toBe(false)
    })

    it('a descrição é o nome completo e o dia; a pergunta numera na ordem dada e cita o que foi dito', () => {
        expect(descricaoDoHomonimo(TEIXEIRA)).toBe('Germano Teixeira, cadastrado em 11/08/2026')
        expect(descricaoDoHomonimo({ nome: 'Germano   Teixeira ', cadastradoEm: '' })).toBe('Germano Teixeira, cadastrado em sem data')
        expect(fraseDosHomonimos('Germano', [TEIXEIRA, LIMA])).toBe(
            'Há 2 funcionários ativos que casam com “Germano” no cadastro da empresa: 1) Germano Teixeira, cadastrado em 11/08/2026; 2) Germano Lima, cadastrado em 02/09/2026. Qual deles é o vendedor deste levantamento?')
    })

    it('a data é a do fuso da empresa: 23h30 de São Paulo é o dia seguinte em UTC, e o dia que vale é o de São Paulo', () => {
        expect(descricaoDoHomonimo({ nome: 'X', cadastradoEm: '2026-07-09T02:30:00+00:00' })).toBe('X, cadastrado em 08/07/2026')
    })

    it('distinguíveis quando o nome ou o dia difere de todos; mesmo nome (sem caixa nem acento) e mesmo dia, nunca — a hora não separa', () => {
        expect(homonimosDistinguiveis([TEIXEIRA, LIMA], normalizarNome)).toBe(true)
        // nomes diferentes cadastrados no MESMO dia: o nome completo separa
        expect(homonimosDistinguiveis([TEIXEIRA, { ...LIMA, cadastradoEm: TEIXEIRA.cadastradoEm }], normalizarNome)).toBe(true)
        expect(homonimosDistinguiveis([TEIXEIRA, { ...TEIXEIRA, cadastradoEm: '2026-08-12T20:00:00+00:00' }], normalizarNome)).toBe(true)
        expect(homonimosDistinguiveis([TEIXEIRA, { ...TEIXEIRA, cadastradoEm: '2026-08-11T22:00:00+00:00' }], normalizarNome)).toBe(false)
        expect(homonimosDistinguiveis([TEIXEIRA, { ...TEIXEIRA, nome: 'GERMANO  teixeira' }], normalizarNome)).toBe(false)
        expect(homonimosDistinguiveis([LIMA, TEIXEIRA, { ...TEIXEIRA }], normalizarNome)).toBe(false)
    })

    it('as recusas nomeiam o dito e quantos, e não escolhem', () => {
        expect(fraseDosHomonimosIndistinguiveis('Germano Teixeira', 2)).toBe(
            'Há 2 funcionários ativos que casam com “Germano Teixeira” no cadastro da empresa, com o mesmo nome e cadastrados no mesmo dia: nada no cadastro os distingue. Não escolho entre eles: corrija o cadastro ou diga outro vendedor.')
        expect(fraseDoVendedorInativo('Germano', [{ nome: 'Germano Teixeira' }])).toBe(
            'O funcionário “Germano Teixeira” está inativo no cadastro da empresa e não pode ser o vendedor de um levantamento novo. Diga outro vendedor.')
        expect(fraseDoVendedorInativo('Germano', [{ nome: 'a' }, { nome: 'b' }])).toBe(
            'Os 2 funcionários que casam com “Germano” estão inativos no cadastro da empresa e não podem ser o vendedor de um levantamento novo. Diga outro vendedor.')
    })
})
