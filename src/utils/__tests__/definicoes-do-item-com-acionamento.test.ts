/**
 * @jest-environment node
 *
 * PORTÃO — PEDIDO 0054 (28/11/2026, produção quebrada): o arquivo do orçamento e a precificação caíam com "Cannot read properties of undefined (reading
 * 'map')" em todo item de tipologia com acionamento da persiana (AE: DP-17, DP-69). `definicoesDoItem` passava a definição do contexto — só a aba Variáveis
 * — como se fosse a Tipologia inteira a `escolhasDoCalculo`, que percorre as linhas de peça. As tipologias são as do gabarito WVetro 1207 (motor real).
 */
import fs from 'fs'
import path from 'path'
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { lerTipologia, type AbasDoMotor } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { naturezasPara, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import type { PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'

jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const S = () => require('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor')

const DIR = path.join(__dirname, 'fixtures', 'gabarito-wvetro-1207')
const MOTOR = JSON.parse(fs.readFileSync(path.join(DIR, 'motor.json'), 'utf8')) as { tabelas: Record<string, Array<Record<string, unknown>>> }
const INSUMOS = JSON.parse(fs.readFileSync(path.join(DIR, 'insumos-das-9-tipologias.json'), 'utf8')) as { insumos: Array<Record<string, unknown>> }
const GAB = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8')) as { politica: LinhaDaNatureza[] }
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela] || a.tabela === 'orcamentista_motor_insumo')
    .map((a) => [a.nome, abaDoBanco(a, a.tabela === 'orcamentista_motor_insumo' ? INSUMOS.insumos : MOTOR.tabelas[a.tabela])]))
const politica = { porVariavel: naturezasPara(GAB.politica, { familia: 'PVC', linha: null, formato: null }) } as PoliticaDaEmpresa

/** O que o contexto dos documentos entrega: SÓ a aba Variáveis (`VariaveisDaTipologia`), nunca a tipologia inteira. */
function soAsVariaveis(codigo: string) {
    const t = lerTipologia(abas, codigo)
    if ('recusas' in t) throw new Error(t.recusas[0].mensagem)
    return { variaveis: t.tipologia.variaveis }
}

describe('as definições do item com ACIONAMENTO da persiana (DP-17 e DP-69, os itens do orçamento 14)', () => {
    it.each(['DP-17', 'DP-69'])('%s: a definição só com as variáveis NÃO derruba (era o "reading \'map\'"), e o acionamento sai por extenso', (codigo) => {
        const def = soAsVariaveis(codigo)
        expect(def.variaveis.some((v) => v.variavel === 'AE')).toBe(true)
        const d = S().definicoesDoItem(def, { AE: 4 }, politica, codigo, 1200, 'Preto Liso')
        expect(Array.isArray(d)).toBe(true)
        expect(d.some((x: string) => /acionamento da persiana/i.test(x))).toBe(true)
    })
    it('sem o AE dito, a política/regra decide e a linha do acionamento sai igual — o item do orçamento 13 (DP-17, preto liso)', () => {
        const d = S().definicoesDoItem(soAsVariaveis('DP-17'), {}, politica, 'DP-17', 1200, 'Preto Liso')
        expect(d.some((x: string) => /acionamento da persiana/i.test(x))).toBe(true)
    })
    it('a tipologia sem AE segue o caminho de sempre (não chama o cálculo)', () => {
        const d = S().definicoesDoItem(soAsVariaveis('DP-144'), {}, politica, 'DP-144', 1600, 'Preto Liso')
        expect(Array.isArray(d)).toBe(true)
    })
})
