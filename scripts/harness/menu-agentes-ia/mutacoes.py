#!/usr/bin/env python3
"""
As MUTAÇÕES do menu de Agentes I.A. (dono do produto, 11/11/2026, Nível 2 — só o trecho novo): as três seções na ordem, a Conectividade I.A.
em OPERACIONAL e o redirecionamento da rota antiga, a lista e o arquivo dos Levantamentos I.A., e a estrutura dos Relatórios I.A. Cada uma estraga
UMA coisa no arquivo de verdade, roda as suítes e DESFAZ. M0 é o controle. Roda SOZINHO ou numa worktree (`mutacao-na-arvore-de-trabalho.md`), e
confere TODAS as mutações antes de rodar qualquer suíte (`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
NAV = 'src/components/layout/nav.component.tsx'
MOBILE = 'src/components/layout/mobile-more-drawer.component.tsx'
CONFIG = 'next.config.js'
LISTA = 'src/lib/atendimentos-ia/levantamentos-ia.ts'
ROTULOS = 'src/lib/atendimentos-ia/levantamentos-ia-tela.ts'
ROTA_LISTA = 'src/pages/api/atendimentos-ia/levantamentos/index.ts'
ROTA_ARQ = 'src/pages/api/atendimentos-ia/levantamentos/[id]/arquivo.ts'
TELA_LEV = 'src/pages/atendimentos-ia/levantamentos-ia/index.tsx'
TELA_REL = 'src/pages/atendimentos-ia/relatorios-ia/index.tsx'
CONV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-secao-do-orcamentista-tela.test.tsx', 'src/utils/__tests__/o-orcamentista-do-super-admin.test.tsx',
          'src/utils/__tests__/atendimentos-ia-levantamentos-ia-rotas.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamentos-e-relatorios-ia-tela.test.tsx',
          'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']

MUTACOES = [
    ('N1', 'Relatórios I.A. some do menu', [(NAV, "    { key: 'relatorios-ia', label: 'Relatórios I.A.', icon: 'bar-chart', href: ROUTES.ATENDIMENTOS_IA_RELATORIOS, section: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true, exigeSecaoDoOrcamentista: true },\n", '')]),
    ('N2', 'Levantamentos I.A. sem a exigência da seção ligada', [(NAV, "href: ROUTES.ATENDIMENTOS_IA_LEVANTAMENTOS, section: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true, exigeSecaoDoOrcamentista: true }", "href: ROUTES.ATENDIMENTOS_IA_LEVANTAMENTOS, section: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true }")]),
    ('N3', 'a Conectividade I.A. volta a Agentes I.A.', [(NAV, "href: ROUTES.CONECTIVIDADE_IA, section: 'operacional'", "href: ROUTES.CONECTIVIDADE_IA, section: 'atendimentos-ia'")]),
    ('N4', 'a Conectividade I.A. aponta a rota antiga', [(NAV, "href: ROUTES.CONECTIVIDADE_IA, section: 'operacional'", "href: ROUTES.ATENDIMENTOS_IA_ORCAMENTISTA, section: 'operacional'")]),
    ('N5', 'no celular, a Conectividade I.A. fica em Agentes I.A.', [(MOBILE, "href: ROUTES.CONECTIVIDADE_IA, icon: <RobotOutlined />, section: 'Operacional', sectionKey: 'operacional'", "href: ROUTES.CONECTIVIDADE_IA, icon: <RobotOutlined />, section: 'Agentes I.A.', sectionKey: 'atendimentos-ia'")]),
    ('N6', 'no celular, os Relatórios I.A. somem', [(MOBILE, "    { key: 'relatorios-ia', label: 'Relatórios I.A.', href: ROUTES.ATENDIMENTOS_IA_RELATORIOS, icon: <BarChartOutlined />, section: 'Agentes I.A.', sectionKey: 'atendimentos-ia', module: MODULES.ORCAMENTISTA, hideForSuperAdmin: true, exigeSecaoDoOrcamentista: true },\n", '')]),
    ('N7', 'o link salvo cai em outra página', [(CONFIG, "destination: '/conectividade-ia'", "destination: '/conectividade'")]),
    ('N8', 'o redirecionamento vira permanente', [(CONFIG, "destination: '/conectividade-ia', permanent: false", "destination: '/conectividade-ia', permanent: true")]),
    ('L1', 'a lista sem o tenant', [(LISTA, ".eq('tenant_id', tenantId).order('numero', { ascending: false })", ".order('numero', { ascending: false })")]),
    ('L2', 'a lista do mais antigo ao mais novo', [(LISTA, ".order('numero', { ascending: false })", ".order('numero', { ascending: true })")]),
    ('L3', 'a lista com permissão de editar', [(ROTA_LISTA, "chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)", "chamadorDoOrcamentista(req, res, 'editar', MODULO_DO_ORCAMENTISTA)")]),
    ('L4', 'o estado em montagem diz completo', [(ROTULOS, "EM_MONTAGEM: 'Em montagem'", "EM_MONTAGEM: 'Completo'")]),
    ('A1', 'o arquivo de outra empresa (o tenant da query)', [(ROTA_ARQ, 'arquivoDoLevantamentoGravado(caller.tenant_id, id)', 'arquivoDoLevantamentoGravado(String(req.query.tenant_id ?? caller.tenant_id), id)')]),
    ('A2', 'o não achado vira 422', [(ROTA_ARQ, "            if (folha.recusas.length === 1 && folha.recusas[0] === FRASE_NAO_ACHADO) return res.status(404).json({ error: FRASE_NAO_ACHADO })\n", '')]),
    ('A3', 'o id fora da forma é procurado', [(ROTA_ARQ, "    if (!UUID.test(id)) return res.status(404).json({ error: FRASE_NAO_ACHADO })\n", '')]),
    ('A4', 'o PDF sem o tipo', [(ROTA_ARQ, "res.setHeader('Content-Type', 'application/pdf')", "res.setHeader('Content-Type', 'application/octet-stream')")]),
    ('A5', 'o arquivo do levantamento de outra empresa (a função)', [(CONV, '    return (await gerarArquivoDoLevantamento({ tenantId, levantamentoId, itens, definicao, detalhe })).folha', "    return (await gerarArquivoDoLevantamento({ tenantId: 'tenant-de-outra', levantamentoId, itens, definicao, detalhe })).folha")]),
    ('A6', 'o arquivo grava alguma coisa', [(CONV, '        lerItens(tenantId, levantamentoId),\n    ])\n    const { definicao, detalhe } = definicaoEDetalhe(', "        lerItens(tenantId, levantamentoId),\n    ])\n    await supabaseAdmin.from('orcamentista_levantamento').update({ nome: 'x' }).eq('id', levantamentoId)\n    const { definicao, detalhe } = definicaoEDetalhe(")]),
    ('T1', 'o arquivo abre na mesma aba', [(TELA_LEV, 'target="_blank" rel="noopener noreferrer"', '')]),
    ('T2', 'o link do arquivo errado', [(TELA_LEV, 'export const urlDoArquivo = (id: string) => `/api/atendimentos-ia/levantamentos/${id}/arquivo`', 'export const urlDoArquivo = (id: string) => `/api/atendimentos-ia/levantamentos/${id}`')]),
    ('R1', 'as abas aparecem sem cliente escolhido', [(TELA_REL, '{escolhido === null ?', '{false ?')]),
    ('R2', 'a aba de corte some', [(TELA_REL, "    { key: 'corte', label: 'Relatório de corte' },\n", '')]),
]

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


EQUIVALENTES: set = set()


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
        vivas += 0 if verde else 1
    for ident, descricao, trocas in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        originais = {a: open(os.path.join(RAIZ, a), encoding='utf-8').read() for a, _de, _para in trocas}
        try:
            novos = dict(originais)
            for a, de, para in trocas:
                novos[a] = novos[a].replace(de, para)
            for a, t in novos.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
            morta = jest() != 0
        finally:
            for a, t in originais.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
        if ident in EQUIVALENTES:
            print(f"{'morta   ' if morta else 'equival.'} {ident}: {descricao}", flush=True)
            continue
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
