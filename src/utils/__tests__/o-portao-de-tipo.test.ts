/**
 * O PORTÃO DE TIPO — o leitor e o comparador de `scripts/tsc-linha-de-base.js`.
 *
 * O portão roda o `tsc` na CI e fica vermelho só com erro NOVO contra a linha de base
 * (`.claude/rules/portao-que-nao-alcanca.md`, aparição 7). O que este arquivo prova é o
 * INSTRUMENTO, não o `tsc`: `instrumento-que-nao-enxerga.md` manda construir de propósito o caso
 * que deveria aparecer e ver se o leitor o enxerga — porque um leitor cego conta zero, e zero
 * erro novo é exatamente o verde que o portão daria.
 *
 *   (a) cada forma de linha que o `tsc` produz é contada, com a chave `arquivo código`;
 *   (b) linha de continuação (indentada) não vira erro;
 *   (c) uma linha com "error TS" que o leitor NÃO sabe ler é devolvida como não reconhecida —
 *       o portão falha com ela, em vez de contar zero;
 *   (d) o comparador: chave nova e chave que cresce são VERMELHAS; chave que cai é aviso; a linha
 *       de erro não importa, só arquivo + código + quantidade.
 *
 * A prova do portão inteiro, com o `tsc` de verdade (tirar `modelo` de `ConfigDoOrcamentista`),
 * está no commit que o criou: ela leva minutos e mexe em código de produção, e não cabe num caso.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- o script é CommonJS, roda direto no node da CI */
interface Ocorrencia { chave: string; linha: string }
interface Variacao { chave: string; antes: number; agora: number }
const portao = require('../../../scripts/tsc-linha-de-base.js') as {
    lerSaida: (saida: string) => { ocorrencias: Ocorrencia[]; naoReconhecidas: string[] }
    contar: (o: Ocorrencia[]) => Record<string, number>
    comparar: (base: Record<string, number>, atual: Record<string, number>) => { novos: Variacao[]; caidos: Variacao[] }
}

describe('o leitor da saída do tsc', () => {
    it('(a) conta cada forma conhecida, com a chave arquivo + código', () => {
        const saida = [
            "src/utils/a.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
            'src/pages/super-admin/atendimentos-ia/contas/[tenantId].tsx(3,4): error TS2353: Object literal may only specify known properties.',
            'src/app/(grupo)/pagina.tsx(1,2): error TS2322: Type mismatch.',
            'src\\windows\\caminho.ts(7,1): error TS7006: Parameter implicitly has an any type.',
            'error TS5023: Unknown compiler option.',
            '\u001b[96msrc/cor.ts\u001b[0m(1,1): error TS2304: Cannot find name.',
            "src/utils/a.ts(99,1): error TS2345: Argument of type 'x' is not assignable.",
        ].join('\n')
        const { ocorrencias, naoReconhecidas } = portao.lerSaida(saida)
        expect(naoReconhecidas).toEqual([])
        expect(portao.contar(ocorrencias)).toEqual({
            'src/utils/a.ts TS2345': 2,
            'src/pages/super-admin/atendimentos-ia/contas/[tenantId].tsx TS2353': 1,
            'src/app/(grupo)/pagina.tsx TS2322': 1,
            'src/windows/caminho.ts TS7006': 1,
            '(sem arquivo) TS5023': 1,
            'src/cor.ts TS2304': 1,
        })
    })

    it('(b) a linha de continuação, indentada, não é erro', () => {
        const saida = [
            'src/b.ts(1,1): error TS2322: Type A is not assignable to type B.',
            "  Types of property 'x' are incompatible.",
            "    Type 'string' is not assignable to type 'number'.",
        ].join('\n')
        expect(portao.contar(portao.lerSaida(saida).ocorrencias)).toEqual({ 'src/b.ts TS2322': 1 })
    })

    it('(c) "error TS" num formato desconhecido volta como NÃO reconhecido — nunca como zero', () => {
        const { ocorrencias, naoReconhecidas } = portao.lerSaida('src/c.ts:4:2 - error TS2322: formato --pretty')
        expect(ocorrencias).toEqual([])
        expect(naoReconhecidas).toEqual(['src/c.ts:4:2 - error TS2322: formato --pretty'])
    })
})

describe('o comparador contra a linha de base', () => {
    const BASE = { 'src/a.ts TS2345': 2, 'src/b.ts TS2322': 1 }

    it('(d) a mesma contagem, em outras linhas, é VERDE', () => {
        expect(portao.comparar(BASE, { 'src/a.ts TS2345': 2, 'src/b.ts TS2322': 1 })).toEqual({ novos: [], caidos: [] })
    })

    it('(d) chave que não existia é VERMELHA', () => {
        expect(portao.comparar(BASE, { ...BASE, 'src/novo.ts TS2353': 1 }).novos).toEqual([{ chave: 'src/novo.ts TS2353', antes: 0, agora: 1 }])
    })

    it('(d) chave que cresce é VERMELHA — erro novo num arquivo que já tinha erro', () => {
        expect(portao.comparar(BASE, { ...BASE, 'src/a.ts TS2345': 3 }).novos).toEqual([{ chave: 'src/a.ts TS2345', antes: 2, agora: 3 }])
    })

    it('(d) chave que cai é AVISO, não vermelho', () => {
        const r = portao.comparar(BASE, { 'src/a.ts TS2345': 1 })
        expect(r.novos).toEqual([])
        expect(r.caidos).toEqual([
            { chave: 'src/a.ts TS2345', antes: 2, agora: 1 },
            { chave: 'src/b.ts TS2322', antes: 1, agora: 0 },
        ])
    })
})
