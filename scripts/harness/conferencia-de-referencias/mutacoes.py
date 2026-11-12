#!/usr/bin/env python3
"""
As MUTAÇÕES da conferência de referências do motor (dono do produto, 12/11/2026, Nível 2): a escada (a ordem, o sufixo, a base com cor só com a
descrição, o palpite), o preço e o ausente, a agregação, as listas, a rota, a leitura paginada, a tela e o botão no catálogo. Cada uma estraga UMA
coisa, roda as suítes e DESFAZ. M0 é o controle. Roda SOZINHO ou numa worktree (`mutacao-na-arvore-de-trabalho.md`), e confere TODAS as mutações
antes de rodar qualquer suíte (`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
CR = 'src/lib/atendimentos-ia/conferencia-de-referencias.ts'
REPO = 'src/lib/atendimentos-ia/repositorio.ts'
ROTA = 'src/pages/api/super-admin/atendimentos-ia/motores/[id]/referencias.ts'
TELA = 'src/page-parts/atendimentos-ia/referencias-do-motor.component.tsx'
CAT = 'src/page-parts/atendimentos-ia/motores-do-catalogo.component.tsx'
T = 'src/utils/__tests__/'
SUITES = [T + s for s in ['conferencia-de-referencias.test.ts', 'conferencia-de-referencias-rota.test.ts', 'conferencia-de-referencias-a-tela.test.tsx',
          'atendimentos-ia-motores-do-catalogo-a-tela.test.tsx']]
ESCADA = "export const DEGRAUS: readonly Degrau[] = ['exato', 'sem_sufixo', 'base_e_cor', 'palpite_por_descricao']"
SUFIXO = "itens.filter((i) => sufixoDoFornecedor(i.codigo) === doMotor && semSufixo(i.codigo) === ref.codigo)"
NUM = "const temNumero = (x: number | null) => x !== null && Number.isFinite(x)"

MUTACOES = [
    # a escada
    ('D1', 'o degrau 2 (sem o sufixo) some', [(CR, ESCADA, "export const DEGRAUS: readonly Degrau[] = ['exato', 'base_e_cor', 'palpite_por_descricao']")]),
    ('D2', 'o palpite vem antes da base com cor', [(CR, ESCADA, "export const DEGRAUS: readonly Degrau[] = ['exato', 'sem_sufixo', 'palpite_por_descricao', 'base_e_cor']")]),
    ('D3', 'o degrau 2 ignora qual é o sufixo', [(CR, SUFIXO, "itens.filter((i) => sufixoDoFornecedor(i.codigo) !== null && semSufixo(i.codigo) === ref.codigo)")]),
    ('D4', 'o degrau 2 compara a BASE do WVetro (o erro do 8384)', [(CR, SUFIXO, "itens.filter((i) => semSufixo(i.codigo) === baseDoWvetro(ref.codigo_wvetro))")]),
    ('D5', 'a base com cor vale pelo prefixo sozinho', [(CR, "itens.filter((i) => semSufixo(i.codigo).startsWith(base) && descricaoNormalizada(i.descricao) === dRegra)", "itens.filter((i) => semSufixo(i.codigo).startsWith(base))")]),
    ('D6', 'o palpite entra em com preço', [(CR, "        else if (conferida.degrau === 'palpite_por_descricao') out.porPalpite.push(conferida)\n", "")]),
    ('D7', 'os degraus se somam (o de cima não para a escada)', [(CR, "if (achados.length > 0) { conferida = { ...ref, degrau, itens: achados.map((i) => achado(i, ref.descricao)) }; break }", "if (achados.length > 0) { conferida = { ...ref, degrau, itens: [...conferida.itens, ...achados.map((i) => achado(i, ref.descricao))] } }")]),
    ('D8', 'o sufixo passa a contar a caixa', [(CR, "    return m ? m[1].toUpperCase() : null", "    return m ? m[1] : null")]),
    ('D9', 'a descrição normalizada não tira o acento', [(CR, ".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase()", ".toUpperCase()")]),
    ('D10', 'o palpite tenta com a descrição vazia', [(CR, "    if (dRegra === '') return []\n", "")]),
    # o preço e o ausente
    ('P1', 'o valor da barra não conta como preço', [(CR, "temNumero(i.custo) || temNumero(i.valor_barra_interno) || temNumero(i.valor_metro_interno)", "temNumero(i.custo) || temNumero(i.valor_metro_interno)")]),
    ('P2', 'o zero vira ausente', [(CR, NUM, NUM + " && x !== 0")]),
    ('P3', 'o NaN vira preço', [(CR, NUM, "const temNumero = (x: number | null) => x !== null")]),
    ('P4', 'o NCM em branco fica', [(CR, "        ncm: i.ncm === null || i.ncm.trim() === '' ? null : i.ncm,", "        ncm: i.ncm,")]),
    # a agregação e as listas
    ('A1', 'as tipologias contam repetidas', [(CR, "        for (const t of r.tipologias ?? []) atual.tipologias.add(t)", "        for (const t of r.tipologias ?? []) atual.tipologias.add(`${t}#${atual.regras}`)")]),
    ('A2', 'as listas sem a ordem de peso', [(CR, "    for (const l of [out.comPreco, out.semPreco, out.naoAchadas, out.porPalpite]) l.sort(ordem)\n", "    void ordem\n")]),
    ('A3', 'a divergência inclui o código exato', [(CR, "filter((r) => r.degrau === 'sem_sufixo' && r.itens.some((i) => i.descricaoDiverge))", "filter((r) => r.itens.some((i) => i.descricaoDiverge))")]),
    ('A4', 'o sem preço some (vai para com preço)', [(CR, "        else if (conferida.itens.some((i) => i.temPreco)) out.comPreco.push(conferida)\n        else out.semPreco.push(conferida)", "        else out.comPreco.push(conferida)")]),
    # a leitura e a rota
    ('L1', 'a leitura para na primeira página', [(REPO, "            if (linhas.length < PAGINA) return out\n        }\n    }\n    const regras = await todas(", "            return out\n        }\n    }\n    const regras = await todas(")]),
    ('L2', 'o fornecedor do item sai nulo', [(REPO, "                fornecedor: t ? nomeDo.get(t.fornecedor_id) ?? null : null, categoria: t?.categoria_chave ?? null,", "                fornecedor: null, categoria: t?.categoria_chave ?? null,")]),
    ('L3', 'o motor que não existe vira lista vazia', [(ROTA, "        if (lido === null) return res.status(404).json({ error: 'Motor não encontrado.' })\n", "        if (lido === null) return res.status(200).json({ achadas_com_preco: [], achadas_sem_preco: [], nao_achadas: [], por_palpite: [] })\n")]),
    ('L4', 'a rota não leva a lista das divergentes', [(ROTA, "            sem_sufixo_com_outra_descricao: comDescricaoDivergente(conferencia),\n", "            sem_sufixo_com_outra_descricao: [],\n")]),
    ('L5', 'a rota aceita qualquer método', [(ROTA, "    if (req.method !== 'GET') return metodoNaoPermitido(res, ['GET'])\n", "")]),
    ('L6', 'a rota não confere o id', [(ROTA, "    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'O motor tem de ser um id.' })\n", "")]),
    # a tela e o catálogo
    ('T1', 'o ausente vira 0%', [(TELA, "const pct = (v: number | null) => (v === null ? NAO_INFORMADO : `${v.toLocaleString('pt-BR')}%`)", "const pct = (v: number | null) => `${(v ?? 0).toLocaleString('pt-BR')}%`")]),
    ('T2', 'o preço ausente vira R$ 0,00', [(TELA, "const reais = (v: number | null) => (v === null ? NAO_INFORMADO : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))", "const reais = (v: number | null) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })")]),
    ('T3', 'o título perde a contagem', [(TELA, "label: <span data-titulo={chave}>{titulo}: <strong>{dados[chave].length.toLocaleString('pt-BR')}</strong></span>,", "label: <span data-titulo={chave}>{titulo}</span>,")]),
    ('T4', 'a falha vira listas vazias', [(TELA, "            setErro((e as Error).message)\n", "            setDados({ motor: { id: motorId, nome: null, arquivado: false }, itens_nas_tabelas: 0, codigos: 0, regras: 0, achadas_com_preco: [], achadas_sem_preco: [], nao_achadas: [], por_palpite: [], sem_sufixo_com_outra_descricao: [] }); void e\n")]),
    ('T5', 'o degrau some da linha', [(TELA, "                { title: 'Achada por', dataIndex: 'degrau', render: (v: string | null) => (v === null ? '—' : <Tag color={v === 'palpite_por_descricao' ? 'orange' : undefined}>{ROTULO_DO_DEGRAU[v] ?? v}</Tag>) },\n", "")]),
    ('C1', 'o motor arquivado perde o botão', [(CAT, "<Space size={4} wrap style={{ justifyContent: 'flex-end' }}>{botaoDeReferencias(m)}{botaoDeRemover(m)}</Space>", "botaoDeRemover(m)")]),
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
