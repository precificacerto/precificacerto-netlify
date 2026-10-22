/**
 * @jest-environment node
 *
 * PORTÃO — a máscara do que vai para o log (`src/utils/atendimentos-ia-mascara-do-log.ts`), usada
 * pelo rastro do QR do orçamentista (`[QR-ORCAMENTISTA]`, via `paraOLog`).
 *
 * Os casos de `mascarar` moravam no portão da rota TEMPORÁRIA de captura do webhook, removida em
 * 22/10/2026. Medido antes da remoção: sem aquele arquivo, trocar `\d{8,}` por `\d{9,}` na máscara
 * ficava VERDE em todos os outros testes — a máscara, que continua em uso, ficaria sem portão. Os
 * casos da função pura vieram para cá; os da rota saíram com ela.
 */
import { mascarar, paraOLog } from '@/utils/atendimentos-ia-mascara-do-log'

const TELEFONE = '5551999887766'
const TOKEN_DA_INSTANCIA = 'a1b2c3d4e5f6tokendainstancia_lzq8'

describe('(1) mascarar — sequências de 8 ou mais dígitos', () => {
    it('8+ dígitos viram 4 primeiros + x + 2 últimos, com o mesmo comprimento', () => {
        expect(mascarar(TELEFONE)).toBe('5551xxxxxxx66')
        expect(mascarar(TELEFONE)).toHaveLength(TELEFONE.length)
        expect(mascarar(`{"Sender":"${TELEFONE}@s.whatsapp.net"}`)).toBe('{"Sender":"5551xxxxxxx66@s.whatsapp.net"}')
    })

    it('a fronteira: 7 dígitos ficam como estão; 8 são mascarados', () => {
        expect(mascarar('a 1234567 b')).toBe('a 1234567 b')
        expect(mascarar('a 12345678 b')).toBe('a 1234xx78 b')
    })

    it('mais de uma sequência no mesmo texto: todas', () => {
        expect(mascarar('de 5551999887766 para 5554988776655')).toBe('de 5551xxxxxxx66 para 5554xxxxxxx55')
    })
})

describe('(2) mascarar — o valor do campo token', () => {
    it('formato de form: token=<valor> → token=<mascarado>, e o resto do form fica', () => {
        const linha = mascarar(`jsonData=%7B%7D&token=${TOKEN_DA_INSTANCIA}&outro=1`)
        expect(linha).not.toContain(TOKEN_DA_INSTANCIA)
        expect(linha).toBe('jsonData=%7B%7D&token=<mascarado>&outro=1')
    })

    it('formato json: "token": "<valor>" → "token": "<mascarado>"', () => {
        const linha = mascarar(JSON.stringify({ type: 'Message', token: TOKEN_DA_INSTANCIA }))
        expect(linha).not.toContain(TOKEN_DA_INSTANCIA)
        expect(linha).toBe('{"type":"Message","token":"<mascarado>"}')
    })

    it('em qualquer caixa', () => {
        expect(mascarar(`TOKEN=${TOKEN_DA_INSTANCIA}`)).toBe('TOKEN=<mascarado>')
        expect(mascarar(`{"Token": "${TOKEN_DA_INSTANCIA}"}`)).toBe('{"Token": "<mascarado>"}')
    })
})

describe('(3) paraOLog — os segredos que o chamador conhece saem pelo valor literal', () => {
    it('um segredo num campo de OUTRO nome, ou numa mensagem de erro, sai mesmo assim', () => {
        const linha = paraOLog(`erro: usuário ${TOKEN_DA_INSTANCIA} não encontrado`, [TOKEN_DA_INSTANCIA])
        expect(linha).toBe('erro: usuário <segredo> não encontrado')
    })

    it('vários segredos, e nulos ignorados', () => {
        expect(paraOLog('a=SEGREDO_UM b=SEGREDO_DOIS', ['SEGREDO_UM', null, undefined, 'SEGREDO_DOIS'])).toBe('a=<segredo> b=<segredo>')
    })

    it('segredo com menos de 4 caracteres NÃO é aplicado — trocaria pedaços comuns do texto', () => {
        expect(paraOLog('abc abcd', ['abc'])).toBe('abc abcd')
    })

    it('depois dos segredos, a máscara de dígitos e de token também se aplica', () => {
        expect(paraOLog(`tel ${TELEFONE} token=xyz`, [])).toBe('tel 5551xxxxxxx66 token=<mascarado>')
    })
})
