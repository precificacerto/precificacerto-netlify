/**
 * @jest-environment node
 *
 * PORTÃO — NENHUMA FUNÇÃO DO BANCO APAGA SEM WHERE (tarefa 0011 do ciclo, 21/11/2026; a migração 20261115000001).
 *
 * Em produção, o papel `authenticator` (por onde o PostgREST entra, inclusive como `service_role`) carrega `session_preload_libraries=safeupdate`
 * (medido em `pg_roles.rolconfig`, 21/11/2026), e a extensão recusa `DELETE` sem `WHERE` com SQLSTATE 21000 — também dentro de função PL/pgSQL
 * chamada por `.rpc()`. Foi por isso que a importação do índice dos desenhos nunca gravou até 15/11/2026: a `20261111000001` apagava com
 * `DELETE FROM public.orcamentista_tipologia_desenho;`. O remédio é `WHERE true` (mesmo efeito).
 *
 * O portão lê, de cada função, o corpo da ÚLTIMA migração que a define (a que vale), e reprova o `DELETE FROM <tabela> [alias];` sem `WHERE`.
 * Sem a `20261115000001`, a última de `superadmin_importar_desenhos` volta a ser a `20261111000001`, e este teste fica vermelho.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const PASTA = join(__dirname, '../../../supabase/migrations')

/** O corpo de cada função, pela última migração (em ordem de nome) que a cria ou substitui. */
function corposQueValem(): Map<string, { arquivo: string; corpo: string }> {
    const corpos = new Map<string, { arquivo: string; corpo: string }>()
    for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort()) {
        const sql = readFileSync(join(PASTA, arquivo), 'utf-8')
        const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\([\s\S]*?\bAS\s+(\$\w*\$)([\s\S]*?)\2/gi
        for (const m of sql.matchAll(re)) corpos.set(m[1].toLowerCase(), { arquivo, corpo: m[3] })
    }
    return corpos
}

/** Os DELETE sem WHERE de um corpo, sem os comentários de linha. */
export function deletesSemWhere(corpo: string): string[] {
    const semComentario = corpo.replace(/--[^\n]*/g, '')
    return [...semComentario.matchAll(/\bDELETE\s+FROM\s+(?:ONLY\s+)?[\w."]+(?:\s+(?:AS\s+)?\w+)?\s*;/gi)].map((m) => m[0].replace(/\s+/g, ' '))
}

describe('o detector', () => {
    it('acha o DELETE sem WHERE, com e sem alias e quebra de linha; não acha o com WHERE nem o comentado', () => {
        expect(deletesSemWhere('BEGIN\n  DELETE FROM public.t;\nEND')).toEqual(['DELETE FROM public.t;'])
        expect(deletesSemWhere('DELETE FROM t AS x\n ;')).toEqual(['DELETE FROM t AS x ;'])
        expect(deletesSemWhere('delete from only t;')).toHaveLength(1)
        expect(deletesSemWhere('DELETE FROM public.t WHERE true;')).toEqual([])
        expect(deletesSemWhere('DELETE FROM t x USING u WHERE x.id = u.id;')).toEqual([])
        expect(deletesSemWhere('-- DELETE FROM t;\nSELECT 1;')).toEqual([])
    })
})

describe('as funções do banco', () => {
    const corpos = corposQueValem()
    it('lê as funções das migrações (o leitor não está cego)', () => {
        expect(corpos.size).toBeGreaterThan(50)
        expect(corpos.get('superadmin_importar_desenhos')?.arquivo).toBe('20261115000001_importar_desenhos_where_true.sql')
    })
    it('a última versão de cada função não tem DELETE sem WHERE (a extensão safeupdate de produção o recusa)', () => {
        const ruins = [...corpos].flatMap(([nome, { arquivo, corpo }]) => deletesSemWhere(corpo).map((d) => `${nome} (${arquivo}): ${d}`))
        expect(ruins).toEqual([])
    })
    it('a 20261111000001, se voltasse a valer, seria reprovada', () => {
        const antiga = readFileSync(join(PASTA, '20261111000001_desenhos_das_tipologias.sql'), 'utf-8')
        expect(deletesSemWhere(antiga)).toEqual(['DELETE FROM public.orcamentista_tipologia_desenho;'])
    })
})
