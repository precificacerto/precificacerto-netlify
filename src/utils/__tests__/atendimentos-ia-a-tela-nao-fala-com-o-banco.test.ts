/**
 * PORTÃO 1 do bloco 2B.2 — A TELA DO ATENDIMENTOS I.A. NÃO FALA COM O BANCO.
 *
 * A TRAVA QUE DECIDE O DESENHO: as quatro tabelas do catálogo (`orcamentista_nicho`,
 * `_fornecedor`, `_tabela`, `_conta_tabela`) têm `REVOKE ALL` de `anon` e `authenticated`, sem
 * GRANT nenhum (`20261019000001`). Pelo cliente do navegador elas NÃO dão erro de um jeito que se
 * note: o PostgREST recusa por privilégio, a lista chega vazia, e a tela diz "ainda não tem
 * fornecedor cadastrado" — um zero que ninguém apurou (`ausente-vs-falso.md`). Só a ROTA, com
 * `service_role`, lê e escreve.
 *
 * Por isso o portão afirma pelo CÓDIGO, lendo os arquivos — não pela intenção de quem escreveu:
 *   (a) nenhum arquivo de página ou componente do Atendimentos I.A. importa o cliente do Supabase;
 *   (b) nenhum arquivo fora das rotas (`src/pages/api/`) e do repositório do servidor
 *       (`src/lib/atendimentos-ia/`) chama `.from('<uma das quatro>')`;
 *   (c) o leitor ALCANÇA a área: ela existe e tem página — sem isso, (a) passaria sobre zero
 *       arquivos (`teste-que-nao-exercita.md`);
 *   (d) o detector ENXERGA o que procura: cada forma conhecida de violação, escrita como
 *       fixture, é acusada; e o que é permitido não é (`instrumento-que-nao-enxerga.md`).
 *
 * A IMPORTAÇÃO (20/10/2026) entra na mesma trava: as cinco tabelas da `20261020000001` também têm
 * `REVOKE ALL` de `anon` e `authenticated`, e a função `importar_conteudo_da_tabela`
 * (`20261020000002`) só é executável por `service_role`. Pelo navegador, as tabelas chegariam
 * vazias e a função daria `permission denied` — por isso nenhuma das duas sai da rota.
 */
import * as fs from 'fs'
import * as path from 'path'

const RAIZ = path.resolve(__dirname, '..', '..', '..')
const SRC = path.join(RAIZ, 'src')

/** As pastas que SÃO o Atendimentos I.A. na tela — páginas e componentes. */
export const AREAS_DA_TELA = [
    path.join(SRC, 'pages', 'super-admin', 'atendimentos-ia'),
    path.join(SRC, 'page-parts', 'atendimentos-ia'),
]
/** Onde as quatro tabelas PODEM ser lidas: as rotas e o repositório do servidor. */
const PODE_LER_AS_TABELAS = [
    path.join(SRC, 'pages', 'api') + path.sep,
    path.join(SRC, 'lib', 'atendimentos-ia') + path.sep,
]

const AS_QUATRO = ['orcamentista_nicho', 'orcamentista_fornecedor', 'orcamentista_tabela', 'orcamentista_conta_tabela']
/** As cinco tabelas da importação (`20261020000001`) — a mesma trava das quatro. */
const AS_DA_IMPORTACAO = [
    'orcamentista_tabela_item', 'orcamentista_motor_regra', 'orcamentista_motor_tipologia',
    'orcamentista_motor_formula_familia', 'orcamentista_importacao',
]
/** As funções que só `service_role` executa. */
const AS_FUNCOES = ['importar_conteudo_da_tabela']

/** Importa o cliente do Supabase — por alias, por caminho relativo, ou o pacote direto. */
export function importaOClienteDoSupabase(texto: string): boolean {
    return /(?:from|require\()\s*['"`](?:@\/supabase\/client|[./]+(?:[\w-]+\/)*supabase\/client|@supabase\/supabase-js)['"`]/.test(texto)
}

/** Chama `.from('<uma das quatro>')`, com espaço ou quebra de linha entre o `(` e o nome. */
export function chamaUmaDasQuatro(texto: string): string | null {
    const m = texto.match(new RegExp(`\\.from\\(\\s*['"\`](${[...AS_QUATRO, ...AS_DA_IMPORTACAO].join('|')})['"\`]`))
    return m ? m[1] : null
}

/** Chama `.rpc('<uma das funções do servidor>')`. */
export function chamaUmaFuncaoDoServidor(texto: string): string | null {
    const m = texto.match(new RegExp(`\\.rpc\\(\\s*['"\`](${AS_FUNCOES.join('|')})['"\`]`))
    return m ? m[1] : null
}

function arquivos(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : arquivos(p)
        return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : []
    })
}
const rel = (p: string) => path.relative(RAIZ, p)

describe('PORTÃO 1 — a tela do Atendimentos I.A. não fala com o banco', () => {
    const daTela = AREAS_DA_TELA.flatMap(arquivos)

    // Bloco 2C.1 (19/10/2026): as duas telas de "Contas ligadas" entram na lista. Sem elas aqui,
    // (a) e (b) continuariam verdes sobre uma área que não as lê.
    it('(c) o leitor alcança a área: as páginas de fornecedores e de contas ligadas, e o componente das tabelas em uso', () => {
        expect(daTela.map(rel)).toEqual(expect.arrayContaining([
            'src/pages/super-admin/atendimentos-ia/fornecedores/index.tsx',
            'src/pages/super-admin/atendimentos-ia/fornecedores/[id].tsx',
            'src/pages/super-admin/atendimentos-ia/contas/index.tsx',
            'src/pages/super-admin/atendimentos-ia/contas/[tenantId].tsx',
            // "Tabelas em uso" (depois do 2C.1): o componente que escolhe fornecedor e tabela.
            'src/page-parts/atendimentos-ia/tabelas-em-uso.component.tsx',
            // A importação (20/10/2026): a tela da tabela.
            'src/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao.tsx',
        ]))
    })

    it('(a) nenhum arquivo de página ou componente do Atendimentos I.A. importa o cliente do Supabase', () => {
        const culpados = daTela.filter((f) => importaOClienteDoSupabase(fs.readFileSync(f, 'utf8'))).map(rel)
        expect(culpados).toEqual([])
    })

    it('(b) nenhum arquivo fora das rotas e do repositório chama .from() de uma das quatro tabelas', () => {
        const culpados = arquivos(SRC)
            .filter((f) => !PODE_LER_AS_TABELAS.some((p) => f.startsWith(p)))
            .map((f) => ({ f: rel(f), t: chamaUmaDasQuatro(fs.readFileSync(f, 'utf8')) }))
            .filter((x) => x.t !== null)
        expect(culpados).toEqual([])
    })

    it('(b2) nenhum arquivo fora das rotas e do repositório chama a função da importação por .rpc()', () => {
        const culpados = arquivos(SRC)
            .filter((f) => !PODE_LER_AS_TABELAS.some((p) => f.startsWith(p)))
            .map((f) => ({ f: rel(f), t: chamaUmaFuncaoDoServidor(fs.readFileSync(f, 'utf8')) }))
            .filter((x) => x.t !== null)
        expect(culpados).toEqual([])
    })

    it('(c2) o leitor alcança a importação: o repositório chama a função, e a rota existe', () => {
        expect(chamaUmaFuncaoDoServidor(fs.readFileSync(path.join(SRC, 'lib', 'atendimentos-ia', 'repositorio.ts'), 'utf8'))).toBe('importar_conteudo_da_tabela')
        expect(fs.existsSync(path.join(SRC, 'pages', 'api', 'super-admin', 'atendimentos-ia', 'tabelas', '[id]', 'importar.ts'))).toBe(true)
    })

    describe('(d) o detector enxerga o que procura', () => {
        it.each([
            [`import { supabase } from '@/supabase/client'`],
            [`import { supabase } from "../../../supabase/client"`],
            [`import { createClient } from '@supabase/supabase-js'`],
            [`const { supabase } = require('@/supabase/client')`],
        ])('acusa a importação: %s', (fixture) => {
            expect(importaOClienteDoSupabase(fixture)).toBe(true)
        })

        it.each([
            [`await supabase.from('orcamentista_fornecedor').select('*')`, 'orcamentista_fornecedor'],
            [`await (supabase as any).from("orcamentista_nicho").select('*')`, 'orcamentista_nicho'],
            ['await supabase\n  .from(\n    `orcamentista_conta_tabela`\n  ).select()', 'orcamentista_conta_tabela'],
            [`const { data } = await sb.from( 'orcamentista_tabela' ).delete()`, 'orcamentista_tabela'],
            [`await supabase.from('orcamentista_tabela_item').select('*')`, 'orcamentista_tabela_item'],
            [`await supabase.from('orcamentista_importacao').select('*')`, 'orcamentista_importacao'],
            [`await supabase.from("orcamentista_motor_regra").select('*')`, 'orcamentista_motor_regra'],
        ])('acusa a chamada: %s', (fixture, tabela) => {
            expect(chamaUmaDasQuatro(fixture)).toBe(tabela)
        })

        it.each([
            [`await supabase.rpc('importar_conteudo_da_tabela', { p_tabela_id: id })`],
            ['await supabase\n  .rpc(\n    "importar_conteudo_da_tabela", {})'],
        ])('acusa a chamada da função: %s', (fixture) => {
            expect(chamaUmaFuncaoDoServidor(fixture)).toBe('importar_conteudo_da_tabela')
        })

        it.each([
            [`await fetch('/api/super-admin/atendimentos-ia/fornecedores')`],
            [`import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'`],
            [`await supabase.from('orcamentista_config').select('*')`],
        ])('NÃO acusa o que é permitido: %s', (fixture) => {
            expect(importaOClienteDoSupabase(fixture)).toBe(false)
            expect(chamaUmaDasQuatro(fixture)).toBeNull()
        })
    })
})
