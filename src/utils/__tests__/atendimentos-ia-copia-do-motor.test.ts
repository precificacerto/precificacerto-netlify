/**
 * @jest-environment node
 *
 * PORTÃO — a migração que COPIA o motor da tabela da Wolff para a planilha
 * (`20261027000004_copiar_motor_da_wolff_para_a_planilha`, PR C).
 *
 * POR QUÊ (dono do produto, 27/10/2026): a tabela atual da Wolff é a DONA DO MOTOR — 12.116 regras, 137 fórmulas
 * de família, as abas e os 164 tempos ESTIMADO (digitados à mão, fora do arquivo) pendem do `tabela_id` dela.
 * "NADA pode arquivar, substituir ou apagar essa tabela antes de o PR C mover o motor para `orcamentista_motor`."
 * A cópia é `INSERT … SELECT`, com as provas de `EXCEPT` nos dois sentidos para cada uma das 14 tabelas, e SEM apagar
 * o antigo (isso é o PR F).
 *
 * O QUE ESTE PORTÃO NÃO ALCANÇA: o banco. O Jest lê o TEXTO da migração. Que ela copia de verdade, que a verificação
 * aborta e desfaz tudo, e que a trava segura a importação, está provado num Postgres 16 com o schema de produção e
 * 62.299 linhas (corpo do PR). Aqui se prova o que o texto promete e que as listas não divergem do código:
 *   (1) a migração trata as 14 tabelas do código, nem mais nem menos, e as trava em SHARE;
 *   (2) NÃO apaga nem atualiza dado: nenhum DELETE, UPDATE, DROP, TRUNCATE ou ALTER; o único INSERT de linha fixa é a
 *       planilha, e a cópia é dinâmica, por `INSERT INTO … SELECT`;
 *   (3) a prova é EXCEPT ALL — os dois sentidos, e NUNCA o EXCEPT que esconde duplicata;
 *   (4) as colunas da cópia e as da prova são as MESMAS e saem do catálogo, menos `id`, `tabela_id` e `motor_id`;
 *   (5) idempotente: id fixo, e a segunda aplicação não copia nem compara;
 *   (6) nasce PENDENTE, com o nome para aplicar fora do CLI, e diz a ordem obrigatória.
 */
import fs from 'fs'
import path from 'path'
import { TABELAS_DO_MOTOR } from '@/utils/atendimentos-ia-etapas'

const ARQUIVO = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261027000004_copiar_motor_da_wolff_para_a_planilha.sql')
const sql = () => fs.readFileSync(ARQUIVO, 'utf8')
const executavel = () => sql().split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Os literais de uma lista `ARRAY['A', 'B']` que vem depois de `marca` no texto. */
function listaDepois(texto: string, marca: string): string[] {
    const i = texto.indexOf(marca)
    if (i < 0) return []
    const m = /ARRAY\s*\[([^\]]*)\]/.exec(texto.slice(i))
    return m ? Array.from(m[1].matchAll(/'([^']*)'/g)).map((x) => x[1]) : []
}

describe('(0) o instrumento: a leitura da lista acha o que devia', () => {
    it('acha a lista depois da marca; marca ausente devolve vazio, e não a lista de outro lugar', () => {
        expect(listaDepois("v_x AS SELECT unnest(ARRAY['a', 'b']) ... ARRAY['c']", 'v_x')).toEqual(['a', 'b'])
        expect(listaDepois("ARRAY['c']", 'v_x')).toEqual([])
    })
})

describe('(1) as 14 tabelas, e a trava', () => {
    it('a lista da migração é a do código, na mesma ordem', () => {
        expect(listaDepois(sql(), 'CREATE TEMP TABLE v_tabelas_do_motor')).toEqual([...TABELAS_DO_MOTOR])
    })

    it('trava as 14 em SHARE antes de copiar: a importação (que apaga e regrava por tabela_id) espera', () => {
        expect(executavel()).toContain("EXECUTE format('LOCK TABLE public.%I IN SHARE MODE', t)")
        const posTrava = executavel().indexOf('LOCK TABLE')
        expect(posTrava).toBeGreaterThan(0)
        expect(posTrava).toBeLessThan(executavel().indexOf('INSERT INTO public.orcamentista_motor'))
        expect(posTrava).toBeLessThan(executavel().indexOf("EXECUTE format('INSERT INTO public.%I"))
    })
})

describe('(2) não apaga, não atualiza, não altera estrutura', () => {
    it('nenhum DELETE, UPDATE, DROP, TRUNCATE, ALTER nem CREATE de tabela fora das temporárias', () => {
        // `ON COMMIT DROP` é a temporária que some no COMMIT, não um DROP de coisa nenhuma
        const sqlExec = executavel().replace(/ON COMMIT DROP/g, 'ON COMMIT')
        expect(sqlExec).not.toMatch(/\bDELETE\b/i)
        expect(sqlExec).not.toMatch(/\bUPDATE\b/i)
        expect(sqlExec).not.toMatch(/\bDROP\b/i)
        expect(sqlExec).not.toMatch(/\bTRUNCATE\b/i)
        expect(sqlExec).not.toMatch(/\bALTER\b/i)
        const criadas = Array.from(sqlExec.matchAll(/CREATE\s+(\w+\s+)?TABLE\s+(\w+)/gi)).map((m) => `${(m[1] ?? '').trim().toUpperCase()} ${m[2]}`)
        expect(criadas).toEqual(['TEMP v_tabelas_do_motor', 'TEMP v_param', 'TEMP v_estado', 'TEMP v_antes'])
        // as temporárias somem no COMMIT
        expect(executavel().match(/ON COMMIT DROP/g)?.length).toBe(4)
    })

    it('escreve em DOIS lugares só: a planilha (uma linha) e a cópia dinâmica das 14 — nunca em orcamentista_tabela', () => {
        const sqlExec = executavel()
        const inserts = Array.from(sqlExec.matchAll(/INSERT\s+INTO\s+([\w.%]+)/gi)).map((m) => m[1])
        expect(inserts.sort()).toEqual(['public.%I', 'public.orcamentista_motor', 'v_antes', 'v_antes'].sort())
        expect(sqlExec).not.toMatch(/INSERT\s+INTO\s+public\.orcamentista_tabela\b/i)
    })

    it('a cópia lê SÓ a tabela fonte (WHERE tabela_id) e grava com motor_id — o tabela_id da cópia fica nulo', () => {
        const copia = /INSERT INTO public\.%I \(motor_id, %s\) SELECT %L::uuid, %s FROM public\.%I WHERE tabela_id = %L::uuid/
        expect(executavel()).toMatch(copia)
    })
})

describe('(3) a prova é EXCEPT ALL, nos dois sentidos', () => {
    it('os dois sentidos, e nenhum EXCEPT sem ALL (o que esconde a duplicata)', () => {
        const sqlExec = executavel()
        expect(sqlExec.match(/EXCEPT ALL/g)?.length).toBe(2)
        expect(sqlExec).not.toMatch(/\bEXCEPT\b(?!\s+ALL)/)
        // um sentido é fonte − cópia, o outro cópia − fonte
        expect(sqlExec).toMatch(/WHERE tabela_id = %L::uuid EXCEPT ALL SELECT %s FROM public\.%I WHERE motor_id = %L::uuid/)
        expect(sqlExec).toMatch(/WHERE motor_id = %L::uuid EXCEPT ALL SELECT %s FROM public\.%I WHERE tabela_id = %L::uuid/)
    })

    it('as verificações que abortam: contagem, EXCEPT ALL, hash do conteúdo, fonte intacta, dono único, vizinhas', () => {
        for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(sql()).toContain(`verificacao ${n}:`)
        // toda recusa diz que nada foi alterado
        const recusas = sql().match(/RAISE EXCEPTION '[^']*'/g) ?? []
        expect(recusas.length).toBeGreaterThan(10)
        expect(recusas.filter((r) => !/Nada foi alterado/.test(r))).toEqual([])
    })

    it('o hash do conteúdo é independente da lista de colunas: jsonb sem as três colunas de dono', () => {
        const sqlExec = executavel()
        expect(sqlExec.match(/to_jsonb\(r\) - ''id'' - ''tabela_id'' - ''motor_id''/g)?.length).toBeGreaterThanOrEqual(4)
    })

    it('a fonte é medida antes e depois (hash completo, com id e tabela_id), e as vizinhas também', () => {
        expect(sql()).toContain('verificacao 5: a FONTE')
        for (const v of ['orcamentista_tabela', 'orcamentista_tabela_item', 'orcamentista_levantamento_item', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_materia_prima']) {
            expect(sql()).toContain(`'${v}'`)
        }
    })
})

describe('(4) as colunas: todas, menos as três de dono — lidas do catálogo', () => {
    it('a cópia e a prova excluem exatamente id, tabela_id e motor_id (e a lista é a mesma nos dois lugares)', () => {
        const exclusoes = Array.from(executavel().matchAll(/column_name NOT IN \(([^)]*)\)/g)).map((m) => m[1].replace(/\s/g, ''))
        expect(exclusoes).toHaveLength(2)
        for (const e of exclusoes) expect(e).toBe("'id','tabela_id','motor_id'")
    })

    it('nenhum nome de coluna do motor escrito à mão: coluna que a tabela ganhar entra na cópia sozinha', () => {
        const sqlExec = executavel()
        for (const coluna of ['tempo_fabricacao_min', 'atualizado_em', 'importado_em', 'pct_padrao', 'formula_em_lh', 'avisos']) expect(sqlExec).not.toContain(coluna)
    })
})

describe('(5) idempotente: id fixo', () => {
    it('a planilha tem id FIXO (uuid válido, distinto da tabela fonte) e a tabela fonte é um uuid válido', () => {
        const m = /'(9a233c55-[0-9a-f-]+)'::uuid AS motor_id/.exec(sql())
        const t = /'([0-9a-f-]{36})'::uuid AS tabela_id/.exec(sql())
        expect(m?.[1]).toMatch(UUID)
        expect(t?.[1]).toMatch(UUID)
        expect(m?.[1]).not.toBe(t?.[1])
    })

    it('com a planilha já criada, só avisa: não copia nem compara de novo', () => {
        expect(sql()).toContain("RAISE NOTICE 'ja copiado: a planilha % existe; nada sera copiado nem comparado.'")
        expect(sql()).toContain("RAISE NOTICE 'ja copiado: nada foi copiado, nada foi comparado, nada foi alterado.'")
        expect(executavel()).toMatch(/IF NOT \(SELECT copiar FROM v_estado\) THEN\s+RETURN;/)
    })

    it('as guardas: tabela inexistente, sem arquivo do motor, sem tipologias, outra planilha no par, id fixo de outro par', () => {
        for (const frase of [
            'nao existe. Nada foi alterado', 'nao tem arquivo do motor', 'nao tem tipologias na Detalhe', 'ja ha outra planilha para o par', 'ja pertence a outro par',
            'dependencia ausente',
        ]) expect(sql()).toContain(frase)
    })
})

describe('(6) PENDENTE, com a ordem obrigatória dita', () => {
    it('nasce PENDENTE e com o nome para aplicar fora do CLI', () => {
        expect(sql()).toMatch(/PENDENTE\. N.O APLICADA/)
        expect(sql()).toContain('20261027000004_copiar_motor_da_wolff_para_a_planilha')
    })

    it('pressupõe a 20261027000002 e NÃO a 20261027000003', () => {
        expect(sql()).toContain('PRESSUPÕE a 20261027000002')
        expect(executavel()).not.toContain('superadmin_')
    })

    it('a planilha vem do que a tabela tem (família PVC, fornecedor, nome e caminho do motor), vigente, sem autor', () => {
        expect(executavel()).toMatch(/INSERT INTO public\.orcamentista_motor \(id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente\)\s+VALUES \(p\.motor_id, p\.familia, tb\.fornecedor_id, tb\.motor_nome, tb\.motor_path, true\)/)
    })

    it('registra a decisão do dono do produto e a ordem: PR C antes de qualquer mexida nas tabelas de preço', () => {
        const s = sql()
        expect(s).toMatch(/UMA TABELA = UMA CATEGORIA/)
        expect(s).toMatch(/fornecedor PRINCIPAL/)
        expect(s).toMatch(/735 itens/)
        expect(s).toMatch(/164 tempos ESTIMADO/)
        expect(s).toMatch(/DIGITADOS À MÃO/)
        expect(s).toMatch(/NADA pode arquivar, substituir ou apagar essa tabela antes/)
    })

    it('diz que o arquivo do motor é compartilhado e que a rota da tabela passou a pular o que a planilha usa', () => {
        expect(sql()).toMatch(/O ARQUIVO DO MOTOR É COMPARTILHADO/)
        expect(sql()).toContain('caminhosDaPlanilha')
    })
})
