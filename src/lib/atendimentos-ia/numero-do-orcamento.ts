/**
 * O NÚMERO EXIBIDO do orçamento (dono do produto, 23/11/2026): "o número do levantamento com sufixo por família, e cada um com o seu número
 * próprio" e "o NÚMERO e a SIGLA DA FAMÍLIA EM 3 LETRAS". O orçamento do agente com família é `<número do levantamento>-<SIGLA>` (27-PVC);
 * o número próprio (sequencial da empresa) continua sendo a identidade (o código do produto, a chave). O orçamento de antes (sem família) e o
 * manual (sem levantamento) mostram o número próprio, como sempre. Puro.
 */
export type ParaONumero = { numero: number; levantamentoNumero: number | null; sigla: string | null }

export function numeroExibido(o: ParaONumero): string {
    if (o.levantamentoNumero !== null && Number.isInteger(o.levantamentoNumero) && o.sigla !== null && /^[A-Z]{3}$/.test(o.sigla)) {
        return `${o.levantamentoNumero}-${o.sigla}`
    }
    return String(o.numero)
}
