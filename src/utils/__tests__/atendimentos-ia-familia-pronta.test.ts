/**
 * PORTÃO — A FAMÍLIA SÓ CALCULA COM TODAS AS ETAPAS COM MOTOR (dono do produto, 29/10/2026): "para funcionar, a família funcionar, ela precisa ter
 * todos os motores. Caso não tenha um motor, ela não funciona." NÃO é constraint (montar aos poucos continua permitido): é a conferência no momento de
 * executar, que recusa NOMEANDO cada etapa sem motor, e o indicador `pronta` da leitura da família.
 *
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * Nada executa as etapas hoje (a conversa ainda não as lê: é o PR D). Este portão prova a REGRA e a frase que a execução usará; quem passar a executar
 * as etapas tem de chamar `conferirEtapasParaExecutar` antes de começar — e o teste daquele PR é que prova a chamada.
 */
import {
    FAMILIA_SEM_ETAPAS_NAO_CALCULA, conferirEtapasParaExecutar, etapasSemMotor, familiaPronta, fraseDaEtapaSemMotor, type EtapaDaFamilia,
} from '@/utils/atendimentos-ia-etapas'

const etapa = (numero: number, rotulo: string, motor_id: string | null): EtapaDaFamilia =>
    ({ id: `e${numero}`, numero, rotulo, acao: 'APANHAR', instrucao: '', abas: [], motor_id })

describe('a família pronta', () => {
    it('a frase nomeia a etapa como o dono do produto escreveu', () => {
        expect(fraseDaEtapaSemMotor({ numero: 2, rotulo: 'Levantamento de esquadrias' })).toBe('a etapa 2 ("Levantamento de esquadrias") está sem motor: escolha um motor para ela')
    })

    it('todas com motor: pronta, e a execução passa', () => {
        const etapas = [etapa(1, 'Apanhado', 'm1'), etapa(2, 'Levantamento de esquadrias', 'm1'), etapa(3, 'Barras', 'm2')]
        expect(familiaPronta(etapas)).toBe(true)
        expect(etapasSemMotor(etapas)).toEqual([])
        expect(conferirEtapasParaExecutar(etapas)).toEqual({ ok: true })
    })

    it('UMA sem motor basta para não estar pronta; a recusa nomeia CADA uma, na ordem do número', () => {
        const etapas = [etapa(3, 'Barras', null), etapa(1, 'Apanhado', 'm1'), etapa(2, 'Levantamento de esquadrias', null)]
        expect(familiaPronta(etapas)).toBe(false)
        expect(etapasSemMotor(etapas)).toEqual([{ id: 'e2', numero: 2, rotulo: 'Levantamento de esquadrias' }, { id: 'e3', numero: 3, rotulo: 'Barras' }])
        expect(conferirEtapasParaExecutar(etapas)).toEqual({ ok: false, erros: [
            'a etapa 2 ("Levantamento de esquadrias") está sem motor: escolha um motor para ela',
            'a etapa 3 ("Barras") está sem motor: escolha um motor para ela',
        ] })
        expect(familiaPronta([etapa(1, 'A', 'm1'), etapa(2, 'B', null)])).toBe(false)
        expect(familiaPronta([etapa(1, 'A', null), etapa(2, 'B', 'm1')])).toBe(false)
    })

    it('família SEM etapa não está pronta: não há o que executar — recusa nomeada, nunca "pronta" por vacuidade', () => {
        expect(familiaPronta([])).toBe(false)
        expect(etapasSemMotor([])).toEqual([])
        expect(conferirEtapasParaExecutar([])).toEqual({ ok: false, erros: [FAMILIA_SEM_ETAPAS_NAO_CALCULA] })
        expect(FAMILIA_SEM_ETAPAS_NAO_CALCULA).toBe('a família não tem etapas: cadastre as etapas, cada uma com o seu motor')
    })
})
