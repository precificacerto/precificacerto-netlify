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
    FAMILIA_SEM_ETAPAS_NAO_CALCULA, conferirEtapasParaExecutar, etapasSemMotor, familiaPronta, fraseDaEtapaSemMotor, type ContextoDaExecucao, type EtapaDaFamilia,
} from '@/utils/atendimentos-ia-etapas'

const etapa = (numero: number, rotulo: string, motor_id: string | null): EtapaDaFamilia =>
    ({ id: `e${numero}`, numero, etapa_catalogo_id: `c${numero}`, rotulo, acao: 'APANHAR', instrucao: '', abas: [], motor_id })

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
            'Falta de configuração — motor: a etapa 2 ("Levantamento de esquadrias") está sem motor. Veja a configuração: escolha um motor para ela.',
            'Falta de configuração — motor: a etapa 3 ("Barras") está sem motor. Veja a configuração: escolha um motor para ela.',
        ] })
        expect(familiaPronta([etapa(1, 'A', 'm1'), etapa(2, 'B', null)])).toBe(false)
        expect(familiaPronta([etapa(1, 'A', null), etapa(2, 'B', 'm1')])).toBe(false)
    })

    it('família SEM etapa não está pronta: não há o que executar — recusa nomeada, nunca "pronta" por vacuidade', () => {
        expect(familiaPronta([])).toBe(false)
        expect(etapasSemMotor([])).toEqual([])
        expect(conferirEtapasParaExecutar([])).toEqual({ ok: false, erros: ['Falta de configuração — etapa: a família não tem etapas. Veja a configuração: cadastre as etapas, cada uma com o seu motor.'] })
        expect(FAMILIA_SEM_ETAPAS_NAO_CALCULA).toBe('a família não tem etapas: cadastre as etapas, cada uma com o seu motor')
    })
})

/**
 * A FALTA DE CONFIGURAÇÃO NAS QUATRO SEÇÕES (dono do produto, 31/10/2026, com o catálogo soberano): "é importante que ela reporte como um erro,
 * solicitando que veja a configuração." Remover do catálogo deixa a família sem tipo, a etapa sem motor, o Perfil sem fornecedor; cada falta é uma
 * frase, na ordem família → etapa → motor → fornecedor.
 */
describe('a falta de configuração é ERRO que nomeia o que falta e manda ver a configuração', () => {
    const ctx = (o: Partial<ContextoDaExecucao> = {}): ContextoDaExecucao => ({ nome: 'Esquadrias de PVC WOLF', familia: 'PVC', categoriasSemFornecedor: [], ...o })
    const todas = [etapa(1, 'Apanhado', 'm1'), etapa(2, 'Barras', 'm1')]

    it('tudo configurado: passa (o contexto não inventa falta)', () => {
        expect(conferirEtapasParaExecutar(todas, ctx())).toEqual({ ok: true })
    })

    it('a FAMÍLIA removida do catálogo: a matéria-prima ficou sem tipo — a frase diz qual e manda escolher', () => {
        expect(conferirEtapasParaExecutar([], ctx({ familia: null }))).toEqual({ ok: false, erros: [
            'Falta de configuração — família: "Esquadrias de PVC WOLF" está sem família do catálogo (ela foi removida do catálogo ou nunca foi escolhida). Veja a configuração: escolha a família na base de conhecimento da empresa.',
            'Falta de configuração — etapa: "Esquadrias de PVC WOLF" não tem etapas. Veja a configuração: cadastre as etapas, cada uma com o seu motor.',
        ] })
    })

    it('o FORNECEDOR é cobrado em TODAS as categorias da família: uma frase por categoria sem fornecedor, nomeando-a, na ordem', () => {
        // o estado medido na De Paula em 31/10/2026: cinco categorias sem fornecedor — cinco faltas, o esperado
        const cinco = [['PERSIANAS', 'Persianas'], ['REFORCO', 'Reforço'], ['FERRAGENS', 'Ferragens'], ['ACESSORIOS_VEDACAO', 'Acessórios e vedação'], ['INSTALACAO', 'Instalação']]
            .map(([chave, rotulo]) => ({ chave, rotulo }))
        const r = conferirEtapasParaExecutar(todas, ctx({ categoriasSemFornecedor: cinco }))
        expect(r).toEqual({ ok: false, erros: cinco.map((c) => `Falta de configuração — fornecedor: a categoria ${c.rotulo} de "Esquadrias de PVC WOLF" está sem fornecedor. Veja a configuração: escolha o fornecedor da categoria ${c.rotulo} na base de conhecimento da empresa.`) })
        expect(conferirEtapasParaExecutar(todas, ctx({ categoriasSemFornecedor: null }))).toEqual({ ok: true })
    })

    it('o MOTOR removido e o fornecedor junto: as duas faltas, na ordem — motor antes de fornecedor', () => {
        const r = conferirEtapasParaExecutar([etapa(1, 'Apanhado', null), etapa(2, 'Barras', 'm1')], ctx({ categoriasSemFornecedor: [{ chave: 'PERFIL', rotulo: 'Perfil' }] }))
        expect(r.ok === false && r.erros.map((e) => e.split(':')[0])).toEqual(['Falta de configuração — motor', 'Falta de configuração — fornecedor'])
        expect(r.ok === false && r.erros.every((e) => e.includes('Veja a configuração'))).toBe(true)
    })

    it('a família sem tipo não confere fornecedor (não há ramificação a conferir sem família)', () => {
        const r = conferirEtapasParaExecutar(todas, ctx({ familia: null, categoriasSemFornecedor: [{ chave: 'PERFIL', rotulo: 'Perfil' }] }))
        expect(r.ok === false && r.erros.map((e) => e.split(':')[0])).toEqual(['Falta de configuração — família'])
    })
})
