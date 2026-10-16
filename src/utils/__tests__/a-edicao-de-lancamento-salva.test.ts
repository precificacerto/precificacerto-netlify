/**
 * PORTÃO — a edição de lançamento do Controle Financeiro volta a salvar.
 *
 * O DEFEITO: `controle-financeiro/index.tsx:684` mandava `updated_at` no payload, e
 * `cash_entries` **não tem essa coluna** — 41 colunas, medido em
 * `information_schema.columns` em 16/10/2026. O PostgREST recusa o UPDATE INTEIRO quando o
 * payload traz coluna desconhecida, então a edição não gravava NADA; e o `catch` de `:689`
 * respondia sempre `'Erro ao salvar edição.'`, a mesma frase para qualquer causa.
 *
 * RESSALVA DE MÉTODO, e ela importa: o que foi MEDIDO é a ausência da coluna. A recusa com
 * `PGRST204` é o comportamento documentado do PostgREST para coluna desconhecida — não foi
 * executada aqui, porque esta rodada é somente leitura no banco. O portão afirma o que
 * depende de nós: que o payload não carrega o campo.
 */

import {
    COLUNAS_QUE_NAO_EXISTEM,
    montarPayloadDaEdicao,
    textoDaFalhaDaEdicao,
    traduzirFalhaDaEdicao,
} from '@/utils/edicao-de-lancamento'
import fs from 'fs'
import path from 'path'

describe('o payload não carrega coluna que não existe', () => {
    const payload = montarPayloadDaEdicao({
        descricao: 'Aluguel',
        valor: 1234.56,
        vencimento: '2026-11-10',
        vencimentoAtual: '2026-10-10',
        pagamento: null,
    })

    // MUTAÇÃO: recolocar `updated_at` no payload.
    it('`updated_at` NÃO está no payload', () => {
        expect(Object.keys(payload)).not.toContain('updated_at')
    })

    it('e nenhuma das outras colunas inexistentes está', () => {
        for (const coluna of COLUNAS_QUE_NAO_EXISTEM) {
            expect(Object.keys(payload)).not.toContain(coluna)
        }
    })

    it('o payload tem EXATAMENTE as quatro colunas reais', () => {
        expect(Object.keys(payload).sort()).toEqual(['amount', 'description', 'due_date', 'paid_date'])
    })
})

describe('a edição salva descrição, valor e vencimento', () => {
    it('os três campos chegam com o valor editado', () => {
        const p = montarPayloadDaEdicao({
            descricao: 'Aluguel de novembro',
            valor: 2500,
            vencimento: '2026-11-10',
            vencimentoAtual: '2026-10-10',
            pagamento: null,
        })
        expect(p.description).toBe('Aluguel de novembro')
        expect(p.amount).toBe(2500)
        expect(p.due_date).toBe('2026-11-10')
    })

    it('vencimento em branco MANTÉM o gravado, não o apaga', () => {
        const p = montarPayloadDaEdicao({
            descricao: 'x', valor: 1, vencimento: null, vencimentoAtual: '2026-10-10', pagamento: null,
        })
        expect(p.due_date).toBe('2026-10-10')
    })

    it('pagamento em branco DESFAZ a baixa — `null` ali é intencional', () => {
        const p = montarPayloadDaEdicao({
            descricao: 'x', valor: 1, vencimento: '2026-10-10', vencimentoAtual: '2026-10-10', pagamento: null,
        })
        expect(p.paid_date).toBeNull()
        const q = montarPayloadDaEdicao({
            descricao: 'x', valor: 1, vencimento: '2026-10-10', vencimentoAtual: '2026-10-10', pagamento: '2026-10-15',
        })
        expect(q.paid_date).toBe('2026-10-15')
    })
})

describe('o catch deixa de dizer sempre a mesma frase', () => {
    const escrita = traduzirFalhaDaEdicao({ code: 'PGRST204', message: "Could not find the 'updated_at' column" })
    const rede = traduzirFalhaDaEdicao(Object.assign(new TypeError('Failed to fetch'), {}))
    const nada = traduzirFalhaDaEdicao({})

    // MUTAÇÃO: devolver sempre a mesma natureza.
    it('falha de ESCRITA e falha de REDE são distinguidas', () => {
        expect(escrita.natureza).toBe('ESCRITA')
        expect(rede.natureza).toBe('REDE')
        expect(escrita.natureza).not.toBe(rede.natureza)
    })

    // MUTAÇÃO: omitir o código da mensagem.
    it('o CÓDIGO do erro aparece no texto — é por ele que se procura', () => {
        expect(textoDaFalhaDaEdicao(escrita)).toContain('PGRST204')
        expect(textoDaFalhaDaEdicao(escrita)).toContain("Could not find the 'updated_at' column")
    })

    it('os três textos são DIFERENTES entre si', () => {
        const textos = [escrita, rede, nada].map(textoDaFalhaDaEdicao)
        expect(new Set(textos).size).toBe(3)
    })

    it('causa não identificada diz isso, em vez de chutar uma das duas', () => {
        expect(nada.natureza).toBe('DESCONHECIDA')
        expect(nada.codigo).toBeNull()
        expect(textoDaFalhaDaEdicao(nada)).toContain('não foi identificada')
    })

    it('o texto de rede afirma que NÃO salvou — a dúvida é o que fazia o usuário repetir', () => {
        expect(textoDaFalhaDaEdicao(rede)).toContain('NÃO foi salva')
    })
})

describe('a tela consome o módulo, em vez de montar o payload inline', () => {
    // Asserção de CAMINHO, declarada como tal: a página tem 1.700 linhas e não é montável
    // em jsdom. O defeito a barrar é exatamente a volta do campo inline, e não há efeito
    // numérico a medir (`teste-que-nao-exercita.md`, o caso-limite honesto).
    const BRUTO = fs.readFileSync(
        path.join(process.cwd(), 'src', 'pages', 'controle-financeiro', 'index.tsx'), 'utf-8',
    )
    /**
     * SEM COMENTÁRIOS, e isto não é para fugir do próprio comentário desta correção — é para
     * a asserção falar de CÓDIGO. Um `not.toContain` sobre o arquivo cru ficaria vermelho
     * por causa da prosa que explica o defeito, e passaria a ser corrigido afrouxando o
     * padrão, que é como um portão morre.
     */
    const PAGINA = BRUTO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    it('o payload da edição vem de `montarPayloadDaEdicao`', () => {
        expect(PAGINA).toContain('montarPayloadDaEdicao({')
        expect(PAGINA).toContain('.update(payload)')
    })

    it('nenhum `updated_at` sobrou no CÓDIGO', () => {
        expect(PAGINA).not.toContain('updated_at')
        // E a prosa que explica o defeito continua lá — se ela sumir, alguém apagou a razão
        // junto com a correção (`razao-longe-da-restricao.md`).
        expect(BRUTO).toContain('updated_at')
    })

    it('o catch usa o tradutor, e não a frase genérica', () => {
        expect(PAGINA).toContain('traduzirFalhaDaEdicao(erro)')
        expect(PAGINA).not.toContain("messageApi.error('Erro ao salvar edição.')")
    })
})
