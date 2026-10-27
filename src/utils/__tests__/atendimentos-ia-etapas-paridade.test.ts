/**
 * @jest-environment node
 *
 * PORTÃO — as ETAPAS e a PLANILHA do motor (migração 20261027000002): o que o código e o banco listam TEM
 * de ser a mesma lista.
 *
 * POR QUÊ (dono do produto, 27/10/2026): o motor deixou de ser um arquivo preso à tabela do fornecedor.
 *   - a PLANILHA (`orcamentista_motor`) é a fonte de dados, importada uma vez por (família, fornecedor de perfil);
 *   - a ETAPA (`orcamentista_familia_etapa`) é o que o consultor cadastra por família: número, rótulo LIVRE,
 *     AÇÃO de uma lista FECHADA, texto de instrução e quais abas ela carrega. "O rótulo é livre; a ação não é.
 *     Etapa sem ação da lista é erro, não etapa nova."
 * A lista fechada mora em DOIS lugares — na CHECK do banco e em `atendimentos-ia-etapas.ts` — e é esse o
 * defeito de `copia-divergente.md`: acrescentar uma ação num lado e esquecer o outro. Este portão lê a
 * MIGRAÇÃO e compara com o código, uma a uma.
 *
 * O que ele fica vermelho:
 *   (1) as cinco ações do código são EXATAMENTE as da CHECK da etapa, na mesma ordem;
 *   (2) as abas que uma etapa pode carregar são EXATAMENTE as da CHECK, e vêm das contagens do bloco Motor
 *       (nenhuma lista de abas escrita em outro lugar), sem os itens de preço — o preço é da tabela do fornecedor;
 *   (3) as 14 tabelas que ganham `motor_id` são as que o código do motor lê por `tabela_id`, nem mais nem menos;
 *   (4) a migração diz o que o dono do produto pediu: nada é apagado, a Detalhe sem `id` (a causa do #165) está
 *       registrada, e as tabelas nascem fechadas;
 *   (5) o instrumento: a leitura das listas da migração achou o que devia (fixtures com e sem o caso).
 */
import fs from 'fs'
import path from 'path'
import { ABAS_DA_ETAPA, ACOES_DA_ETAPA, ROTULO_DA_ACAO, TABELAS_DO_MOTOR, ehAcaoDaEtapa } from '@/utils/atendimentos-ia-etapas'
import { CONTAGENS_DO_MOTOR } from '@/utils/atendimentos-ia-motor'

const ARQUIVO = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261027000002_motor_por_familia_e_etapas.sql')
const sql = () => fs.readFileSync(ARQUIVO, 'utf8')

/** Os literais de uma lista `ARRAY['A', 'B']` que vem depois de `marca` no texto. Vazio se a marca não existe. */
export function listaDepois(texto: string, marca: string): string[] {
    const i = texto.indexOf(marca)
    if (i < 0) return []
    const m = /ARRAY\s*\[([^\]]*)\]/.exec(texto.slice(i))
    return m ? Array.from(m[1].matchAll(/'([^']*)'/g)).map((x) => x[1]) : []
}

describe('(5) o instrumento: a leitura das listas da migração', () => {
    it('acha a lista depois da marca, na ordem', () => {
        expect(listaDepois("CHECK (acao = ANY (ARRAY['A', 'B','C']))", 'CHECK (acao')).toEqual(['A', 'B', 'C'])
    })
    it('marca ausente: lista vazia — e não a lista de outro lugar', () => {
        expect(listaDepois("CHECK (outra = ANY (ARRAY['X']))", 'CHECK (acao')).toEqual([])
    })
    it('acha a lista certa quando há duas no texto', () => {
        const t = "marca1 ARRAY['um'] ... marca2 ARRAY['dois', 'tres']"
        expect(listaDepois(t, 'marca2')).toEqual(['dois', 'tres'])
    })
})

describe('(1) as ações da etapa: o código e a CHECK do banco', () => {
    it('as cinco, na mesma ordem', () => {
        expect(ACOES_DA_ETAPA).toEqual(['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'])
        expect(listaDepois(sql(), 'orcamentista_familia_etapa_acao_da_lista')).toEqual([...ACOES_DA_ETAPA])
    })

    it('toda ação tem rótulo para a tela, e só as da lista', () => {
        expect(Object.keys(ROTULO_DA_ACAO).sort()).toEqual([...ACOES_DA_ETAPA].sort())
    })

    it('a guarda: ação fora da lista não é ação', () => {
        expect(ehAcaoDaEtapa('CALCULAR_BARRAS')).toBe(true)
        for (const v of ['calcular_barras', 'ETAPA_NOVA', '', null, 3, undefined]) expect(ehAcaoDaEtapa(v)).toBe(false)
    })
})

describe('(2) as abas que uma etapa carrega', () => {
    it('são as da CHECK, na mesma ordem', () => {
        expect(listaDepois(sql(), 'orcamentista_familia_etapa_abas_da_planilha')).toEqual([...ABAS_DA_ETAPA])
    })

    it('vêm das contagens do bloco Motor — sem os itens de preço, que são da tabela do fornecedor', () => {
        expect(ABAS_DA_ETAPA).toEqual(CONTAGENS_DO_MOTOR.map((c) => c.chave).filter((c) => c !== 'itens_de_preco'))
        expect(ABAS_DA_ETAPA).not.toContain('itens_de_preco')
        expect(ABAS_DA_ETAPA.length).toBe(12)
    })
})

describe('(3) as 14 tabelas que passam a ter dono duplo (tabela do fornecedor OU planilha)', () => {
    it('a migração trata exatamente as que o código declara', () => {
        expect(listaDepois(sql(), 'v_tabelas_do_motor')).toEqual([...TABELAS_DO_MOTOR])
    })

    it('são 14: as 13 do motor e a das importações', () => {
        expect(TABELAS_DO_MOTOR.length).toBe(14)
        expect(new Set(TABELAS_DO_MOTOR).size).toBe(14)
        expect(TABELAS_DO_MOTOR).toContain('orcamentista_importacao')
        // o preço NÃO é do motor: fica com a tabela do fornecedor
        expect(TABELAS_DO_MOTOR).not.toContain('orcamentista_tabela_item')
    })

    it('o código do motor lê por `tabela_id` só tabelas desta lista (nenhuma do motor ficou de fora)', () => {
        const lidas = new Set<string>(CONTAGENS_DO_MOTOR.map((c) => c.tabela).filter((t) => t !== 'orcamentista_tabela_item'))
        for (const t of lidas) expect(TABELAS_DO_MOTOR).toContain(t)
    })
})

describe('(4) a migração diz o que o dono do produto pediu', () => {
    it('nada é apagado: nenhum DELETE, UPDATE ou DROP de dado, nem de tabela ou coluna', () => {
        const executavel = sql().split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
        expect(executavel).not.toMatch(/\bDELETE\s+FROM\b/i)
        expect(executavel).not.toMatch(/\bUPDATE\s+[a-z_.]+\s+SET\b/i)
        expect(executavel).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX|POLICY|FUNCTION)\b/i)
        expect(executavel).not.toMatch(/\bTRUNCATE\b/i)
    })

    it('a única remoção de constraint é a chave primária da Detalhe e dos tempos, e está registrada', () => {
        const executavel = sql().split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
        expect(executavel.match(/DROP\s+CONSTRAINT/gi)?.length).toBe(1)
        expect(sql()).toMatch(/#165/)
        expect(sql()).toMatch(/Detalhe sem `id`/)
    })

    it('nasce PENDENTE, com o nome para aplicar fora do CLI', () => {
        expect(sql()).toMatch(/PENDENTE\. N.O APLICADA/)
        expect(sql()).toContain('20261027000002_motor_por_familia_e_etapas')
    })

    it('as três tabelas novas nascem fechadas: RLS e REVOKE para anon e authenticated', () => {
        for (const t of ['orcamentista_motor', 'orcamentista_familia_etapa', 'orcamentista_familia_ramificacao']) {
            expect(sql()).toContain(`'${t}'`)
        }
        expect(sql()).toMatch(/REVOKE ALL ON public\.%I FROM anon, authenticated/)
        expect(sql()).toMatch(/ENABLE ROW LEVEL SECURITY/)
    })

    it('registra que `valor_barra_12` e `valor_barra_interno` são ICMS e não desconto, e que o desconto não é do motor', () => {
        expect(sql()).toMatch(/valor_barra_12/)
        expect(sql()).toMatch(/ICMS/)
    })

    it('registra a dívida de Acessórios e Borrachas juntas', () => {
        expect(sql()).toMatch(/Borrachas/)
    })
})
