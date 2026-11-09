#!/usr/bin/env python3
"""
As MUTAÇÕES do código dos Orçamentos I.A. (09/11/2026): o módulo do servidor, as rotas, as telas e os rótulos do menu. Cada uma estraga UMA
coisa no arquivo de verdade, roda as suítes e DESFAZ (o arquivo volta byte a byte, também se o processo cair). Morta = alguma suíte vermelha.
M0 é o controle. Roda SOZINHO ou numa worktree (`docs/regras/mutacao-na-arvore-de-trabalho.md`): nada lê a árvore enquanto ele roda.

Uso:   python3 -B mutacoes-do-codigo.py            (todas)
       python3 -B mutacoes-do-codigo.py C1 C7      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
LIB = 'src/lib/atendimentos-ia/orcamentos-ia.ts'
LISTA = 'src/pages/api/atendimentos-ia/orcamentos/index.ts'
UM = 'src/pages/api/atendimentos-ia/orcamentos/[id].ts'
TELA = 'src/pages/atendimentos-ia/orcamentos-ia/index.tsx'
EDICAO = 'src/pages/atendimentos-ia/orcamentos-ia/[id].tsx'
NAV = 'src/components/layout/nav.component.tsx'
ROTULOS = 'src/constants/module-labels.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-orcamentos-ia.test.ts', 'src/utils/__tests__/atendimentos-ia-orcamentos-ia-tela.test.tsx',
          'src/utils/__tests__/atendimentos-ia-secao-do-orcamentista-tela.test.tsx', 'src/utils/__tests__/uma-fonte-de-rotulos-de-modulo.test.ts',
          'src/utils/__tests__/o-orcamentista-do-super-admin.test.tsx']

MUTACOES = [
    ('C1', LIB, 'a lista sem o tenant', "select(COLUNAS_DO_ORCAMENTO).eq('tenant_id', tenantId).order('numero', { ascending: false })", "select(COLUNAS_DO_ORCAMENTO).order('numero', { ascending: false })"),
    ('C2', LIB, 'o criado na tela nasce como do agente', "numero, origem: 'manual', levantamento_id: null,", "numero, origem: 'agente', levantamento_id: null,"),
    ('C3', LIB, 'o criado na tela sem autor', "obs: cabecalho.obs, criado_por: autor })", "obs: cabecalho.obs, criado_por: null })"),
    ('C4', LIB, 'o número pula um', "?.numero ?? 0) + 1", "?.numero ?? 0) + 2"),
    ('C5', LIB, 'a corrida no número não tenta de novo', "if (error.code === '23505' && tentativa < TENTATIVAS_DO_NUMERO) continue", "if (false) continue"),
    ('C6', LIB, 'a alteração sem a marca', "editado_manualmente_em: agora, editado_manualmente_por: autor, atualizado_em: agora", "atualizado_em: agora"),
    ('C7', LIB, 'o item de outro orçamento passa', "    if (estranhos.length) throw", "    if (false) throw"),
    ('C8', LIB, 'o item novo não vai para o fim', "            proxima += 1\n", ""),
    ('C9', LIB, 'o update do item sem o orçamento', ".eq('tenant_id', tenantId).eq('orcamento_id', id).eq('id', idDoItem)", ".eq('tenant_id', tenantId).eq('id', idDoItem)"),
    ('C10', LIB, 'texto vazio vira string vazia', "    if (t === '') return null\n", "    if (t === '') return t\n"),
    ('C11', LIB, 'zero passa como medida', "!Number.isInteger(n) || n < 1)", "!Number.isInteger(n) || n < 0)"),
    ('C12', LIB, 'a quantidade deixa de ser obrigatória', "    if (quantidade === null && !erros.some((e) => e.startsWith(r('quantidade')))) erros.push(`${r('quantidade')}: é obrigatória.`)\n", ""),
    ('C13', LIB, 'o PGRST205 não é tabela ausente', "e?.code === 'PGRST205' || e?.code === '42P01'", "e?.code === '42P01'"),
    ('C14', LISTA, 'criar só com permissão de ver', "req.method === 'GET' ? 'ver' : 'editar'", "'ver'"),
    ('C15', UM, 'alterar só com permissão de ver', "req.method === 'GET' ? 'ver' : 'editar'", "'ver'"),
    ('C16', UM, 'o id sem conferir a forma', "        if (!UUID.test(id)) throw new ErroNaoEncontrado()\n", ""),
    ('C17', TELA, 'a busca olha o acento', "semAcento(o.nome).includes(b)", "o.nome.toLowerCase().includes(b)"),
    ('C18', EDICAO, 'o item novo vai com id nulo', "...(id ? { id } : {}),", "id,"),
    ('C19', NAV, 'o item Orçamentos I.A. some do menu', "    { key: 'orcamentos-ia', label: 'Orçamentos I.A.', icon: 'file-text', href: ROUTES.ATENDIMENTOS_IA_ORCAMENTOS, section: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true, exigeSecaoDoOrcamentista: true },\n", ""),
    ('C20', NAV, 'o menu volta a dizer Orçamentista', "label: 'Conectividade I.A.', icon: 'robot'", "label: 'Orçamentista', icon: 'robot'"),
    ('C21', ROTULOS, 'a permissão volta a dizer Orçamentista', "  orcamentista: 'Conectividade I.A.',\n", "  orcamentista: 'Orçamentista',\n"),
    ('C22', TELA, 'sem a migração a tela diz erro genérico', "            if (r.status === 503) return setEstado({ tipo: 'sem-migracao', mensagem: String(corpo.error ?? '') })\n", ""),
    ('C23', NAV, 'o Orçamentos I.A. aparece sem a seção ligada', "href: ROUTES.ATENDIMENTOS_IA_ORCAMENTOS, section: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true, exigeSecaoDoOrcamentista: true }",
     "href: ROUTES.ATENDIMENTOS_IA_ORCAMENTOS, section: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true }"),
    ('C24', LIB, 'a validação depois de ler o orçamento', "    const cabecalho = validarCabecalho(corpo)\n    if (corpo.itens !== undefined", "    await lerOrcamento(tenantId, id)\n    const cabecalho = validarCabecalho(corpo)\n    if (corpo.itens !== undefined"),
]


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda")
        vivas += 0 if verde else 1
    for ident, arquivo, descricao, velho, novo in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        caminho = os.path.join(RAIZ, arquivo)
        original = open(caminho, encoding='utf-8').read()
        if original.count(velho) != 1:
            raise SystemExit(f'{ident}: o trecho aparece {original.count(velho)} vez(es) em {arquivo} — a mutação precisa ser revista')
        try:
            open(caminho, 'w', encoding='utf-8').write(original.replace(velho, novo))
            morta = jest() != 0
        finally:
            open(caminho, 'w', encoding='utf-8').write(original)
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}")
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
