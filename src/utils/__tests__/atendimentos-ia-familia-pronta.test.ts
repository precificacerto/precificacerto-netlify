/**
 * PORTÃO — A FAMÍLIA SÓ CALCULA COM TODAS AS ETAPAS COM MOTOR (dono do produto, 29/10/2026): "para funcionar, a família funcionar, ela precisa ter
 * todos os motores. Caso não tenha um motor, ela não funciona." NÃO é constraint (montar aos poucos continua permitido): é a conferência no momento de
 * executar, que recusa NOMEANDO cada etapa sem motor, e o indicador `pronta` da leitura da família.
 *
 * DESDE 04/11/2026 ESTE PORTÃO ALCANÇA A CONVERSA: `lerMotoresDaConta` (`motor-da-familia.ts`) chama `conferirEtapasParaExecutar` antes de qualquer
 * leitura de motor, e a conferência por número que ele tinha saiu ("duas listas de frases de falta para a mesma coisa é como elas se tornam divergentes").
 * A chamada é provada no bloco (1e) de `levantamento-da-conversa.test.ts`, que recebe estas frases do leitor da conversa.
 *
 * A AÇÃO MANDA; O NÚMERO É SÓ ORDEM (dono do produto, 04/11/2026): a conferência também recusa a ação fora da lista, a ação SEM EXECUTOR (APANHAR,
 * CONFIRMAR e ENVIAR existem no catálogo e não têm código), a ação REPETIDA e o CÁLCULO SEM LEVANTAMENTO antes dele.
 */
import {
    ACOES_DA_ETAPA, ACOES_EXECUTADAS, EXECUTOR_DA_ACAO, FAMILIA_SEM_ETAPAS_NAO_CALCULA, conferirEtapasParaExecutar, etapasSemMotor, familiaPronta,
    fraseDaAcaoDesconhecida, fraseDaAcaoRepetida, fraseDaAcaoSemExecutor, fraseDaEtapaSemMotor, fraseDoCalculoSemLevantamento,
    type AcaoDaEtapa, type ContextoDaExecucao, type EtapaConferivel,
} from '@/utils/atendimentos-ia-etapas'

/** Uma etapa com a ação dita; sem ela, a 1 é o levantamento e as outras o cálculo (a De Paula). */
const etapa = (numero: number, rotulo: string, motor_id: string | null, acao: string = numero === 1 ? 'GERAR_LEVANTAMENTO' : 'CALCULAR_BARRAS'): EtapaConferivel =>
    ({ id: `e${numero}`, numero, etapa_catalogo_id: `c${numero}`, rotulo, acao, instrucao: '', abas: [], motor_id })

describe('a família pronta', () => {
    it('a frase nomeia a etapa como o dono do produto escreveu', () => {
        expect(fraseDaEtapaSemMotor({ numero: 2, rotulo: 'Levantamento de esquadrias' })).toBe('a etapa 2 ("Levantamento de esquadrias") está sem motor: escolha um motor para ela')
    })

    it('todas com motor: pronta, e a execução passa', () => {
        const etapas = [etapa(1, 'Apanhado e levantamento', 'm1'), etapa(2, 'Barras', 'm2')]
        expect(familiaPronta(etapas)).toBe(true)
        expect(etapasSemMotor(etapas)).toEqual([])
        expect(conferirEtapasParaExecutar(etapas)).toEqual({ ok: true })
    })

    it('UMA sem motor basta para não estar pronta; a recusa nomeia CADA uma, na ordem do número', () => {
        const etapas = [etapa(2, 'Barras', null), etapa(1, 'Levantamento de esquadrias', null)]
        expect(familiaPronta(etapas)).toBe(false)
        expect(etapasSemMotor(etapas)).toEqual([{ id: 'e1', numero: 1, rotulo: 'Levantamento de esquadrias' }, { id: 'e2', numero: 2, rotulo: 'Barras' }])
        expect(conferirEtapasParaExecutar(etapas)).toEqual({ ok: false, erros: [
            'Falta de configuração — motor: a etapa 1 ("Levantamento de esquadrias") está sem motor. Veja a configuração: escolha um motor para ela.',
            'Falta de configuração — motor: a etapa 2 ("Barras") está sem motor. Veja a configuração: escolha um motor para ela.',
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

/**
 * A AÇÃO MANDA; O NÚMERO É SÓ ORDEM (dono do produto, 04/11/2026): "Nunca mais leia a etapa por número para decidir o papel [...] Se o papel vier pelo
 * número, trocar a ordem no catálogo troca os motores em silêncio". E: "APANHAR, CONFIRMAR e ENVIAR existem no catálogo e não têm código. Etapa com uma
 * delas vira erro nomeado [...] nunca ignorada em silêncio". E: "a etapa de cálculo precisa de uma etapa de levantamento antes dela".
 */
describe('a ação da etapa: executor, lista, repetição e ordem (04/11/2026)', () => {
    const lev = (n: number, motor = 'm1') => etapa(n, 'Apanhado e levantamento de esquadrias', motor, 'GERAR_LEVANTAMENTO')
    const calc = (n: number, motor = 'm1') => etapa(n, 'Relação de barras', motor, 'CALCULAR_BARRAS')
    const so = (r: ReturnType<typeof conferirEtapasParaExecutar>): string[] => (r.ok === false ? r.erros : [])

    it('o mapa dos executores: só GERAR_LEVANTAMENTO e CALCULAR_BARRAS têm código; APANHAR, CONFIRMAR e ENVIAR não — e a lista é a das cinco ações', () => {
        expect(Object.keys(EXECUTOR_DA_ACAO).sort()).toEqual([...ACOES_DA_ETAPA].sort())
        expect(EXECUTOR_DA_ACAO).toEqual({ APANHAR: null, CONFIRMAR: null, GERAR_LEVANTAMENTO: 'levantamento', CALCULAR_BARRAS: 'calculo', ENVIAR: null })
        expect(ACOES_EXECUTADAS).toEqual(['GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS'])
    })

    it('a ORDEM não decide o papel: o levantamento na 2 e o cálculo na 5 passam; só o cálculo antes do levantamento é falta', () => {
        expect(conferirEtapasParaExecutar([lev(2), calc(5)])).toEqual({ ok: true })
        expect(conferirEtapasParaExecutar([calc(2), lev(5)])).toEqual({ ok: false, erros: [
            'Falta de configuração — etapa: a etapa 2 ("Relação de barras") de cálculo precisa de uma etapa de levantamento antes dela. Veja a configuração: ponha antes dela uma etapa com a ação "Gerar o levantamento".',
        ] })
        expect(fraseDoCalculoSemLevantamento({ numero: 2, rotulo: 'Relação de barras' })).toBe(so(conferirEtapasParaExecutar([calc(2), lev(5)]))[0])
    })

    it('a família SÓ com a etapa de levantamento passa (ela só levanta); SÓ com a de cálculo é falta: não se inventa fonte de esquadrias', () => {
        expect(conferirEtapasParaExecutar([lev(1)])).toEqual({ ok: true })
        expect(so(conferirEtapasParaExecutar([calc(1)]))).toEqual([fraseDoCalculoSemLevantamento({ numero: 1, rotulo: 'Relação de barras' })])
    })

    it.each(['APANHAR', 'CONFIRMAR', 'ENVIAR'] as AcaoDaEtapa[])('a ação %s não tem executor: a etapa com ela é falta nomeada, nunca ignorada', (acao) => {
        const r = conferirEtapasParaExecutar([lev(1), calc(2), etapa(3, 'Envio', 'm1', acao)])
        expect(r).toEqual({ ok: false, erros: [fraseDaAcaoSemExecutor({ numero: 3, rotulo: 'Envio' }, acao)] })
        expect(so(r)[0]).toContain('que o sistema ainda não executa')
        expect(so(r)[0]).toContain('"Gerar o levantamento" ou "Calcular as barras e os materiais"')
    })

    it('a ação fora da lista é falta nomeada (nunca um lançamento): o texto gravado aparece na frase', () => {
        const r = conferirEtapasParaExecutar([lev(1), etapa(2, 'Estranha', 'm1', 'XPTO')])
        expect(r).toEqual({ ok: false, erros: [fraseDaAcaoDesconhecida({ numero: 2, rotulo: 'Estranha' }, 'XPTO')] })
        expect(so(r)[0]).toContain('tem a ação "XPTO", que não é da lista')
    })

    it('a ação REPETIDA é falta, nomeando as etapas: dois levantamentos não dizem qual motor dá a lista', () => {
        const r = conferirEtapasParaExecutar([lev(1), lev(3, 'm2'), calc(2)])
        expect(r).toEqual({ ok: false, erros: [fraseDaAcaoRepetida('GERAR_LEVANTAMENTO', [1, 3])] })
        expect(so(r)[0]).toContain('está nas etapas 1 e 3; cada ação entra uma vez só')
        expect(so(conferirEtapasParaExecutar([lev(1), calc(2), calc(3), calc(4)]))).toEqual([fraseDaAcaoRepetida('CALCULAR_BARRAS', [2, 3, 4])])
        expect(fraseDaAcaoRepetida('CALCULAR_BARRAS', [2, 3, 4])).toContain('nas etapas 2, 3 e 4')
    })

    it('as faltas saem todas, na ordem motor → ação fora da lista → sem executor → repetida → cálculo antes do levantamento', () => {
        const r = conferirEtapasParaExecutar([calc(1, null as unknown as string), etapa(2, 'X', 'm1', 'XPTO'), etapa(3, 'Envio', 'm1', 'ENVIAR'), etapa(4, 'Envio 2', 'm1', 'ENVIAR')])
        expect(so(r).map((e) => e.split(':')[0])).toEqual(['Falta de configuração — motor', 'Falta de configuração — etapa', 'Falta de configuração — etapa', 'Falta de configuração — etapa', 'Falta de configuração — etapa', 'Falta de configuração — etapa'])
        expect(so(r)[1]).toContain('"XPTO"')
        expect(so(r)[2]).toContain('"Enviar ao vendedor"')
        expect(so(r)[4]).toContain('nas etapas 3 e 4')
        expect(so(r)[5]).toContain('de cálculo precisa de uma etapa de levantamento antes dela')
    })
})
