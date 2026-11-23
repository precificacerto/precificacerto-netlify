/**
 * PORTÃO — O NÚMERO EXIBIDO (dono do produto, 23/11/2026): `<número do levantamento>-<SIGLA>`, a sigla de 3 letras maiúsculas; sem o
 * levantamento, sem a sigla ou com a sigla fora da forma, o número próprio do orçamento — nunca uma sigla deduzida ou cortada.
 */
import { numeroExibido } from '@/lib/atendimentos-ia/numero-do-orcamento'

describe('numeroExibido', () => {
    it('com o levantamento e a sigla: <levantamento>-<SIGLA>', () => {
        expect(numeroExibido({ numero: 12, levantamentoNumero: 27, sigla: 'PVC' })).toBe('27-PVC')
    })
    it.each([
        ['sem levantamento (o manual)', { numero: 12, levantamentoNumero: null, sigla: 'PVC' }],
        ['sem sigla (o de antes, sem família)', { numero: 12, levantamentoNumero: 27, sigla: null }],
        ['sigla de 2 letras', { numero: 12, levantamentoNumero: 27, sigla: 'PV' }],
        ['sigla de 4 letras', { numero: 12, levantamentoNumero: 27, sigla: 'PVCX' }],
        ['sigla minúscula', { numero: 12, levantamentoNumero: 27, sigla: 'pvc' }],
        ['número do levantamento não inteiro', { numero: 12, levantamentoNumero: 27.5, sigla: 'PVC' }],
    ])('%s: o número próprio', (_, o) => expect(numeroExibido(o)).toBe('12'))
})
