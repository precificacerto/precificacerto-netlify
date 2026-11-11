#!/usr/bin/env python3
"""
As MUTAÇÕES do CÓDIGO dos desenhos (o plano do zip, o envio em lotes, a rota que assina, a tela). Cada uma estraga UMA coisa no arquivo de
verdade, roda as suítes e DESFAZ. Roda SOZINHO ou numa worktree (`mutacao-na-arvore-de-trabalho.md`); confere todas antes de rodar
(`mutacao-que-nao-se-aplica.md`). A migração tem a sua bateria em mutacoes.py.

Uso:   python3 -B mutacoes-do-codigo.py            (todas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
LIB = 'src/lib/atendimentos-ia/desenhos-das-tipologias.ts'
ENV = 'src/page-parts/atendimentos-ia/envio-dos-desenhos.ts'
ROTA = 'src/pages/api/super-admin/atendimentos-ia/desenhos/url-de-envio.ts'
IMP = 'src/pages/api/super-admin/atendimentos-ia/desenhos/importar.ts'
CONF = 'src/pages/api/super-admin/atendimentos-ia/desenhos/conferencia.ts'
REPO = 'src/lib/atendimentos-ia/repositorio.ts'
TELA = 'src/page-parts/atendimentos-ia/desenhos-do-catalogo.component.tsx'
T = 'src/utils/__tests__/'
SUITES = [T + s for s in ['desenhos-das-tipologias.test.ts', 'desenhos-das-tipologias-rota.test.ts', 'desenhos-do-catalogo-a-tela.test.tsx',
          'desenhos-importacao-e-conferencia-rotas.test.ts', 'desenhos-slug-sem-copia.test.ts']]

MUTACOES = [
    # o plano
    ('P1', 'o indice.csv de dentro sobe', [(LIB, "        if (INDICE_DO_ZIP.test(arquivo)) { ignorados.push({ arquivo: e.caminho, motivo: 'o índice de dentro do zip não sobe' }); continue }\n", '')]),
    ('P2', 'a pasta sai do nome do zip, não do grupo', [(LIB, '            const grupo = grupoNoCaminho(g)', '            const grupo = grupoNoCaminho(nomeDoZip.replace(/\\.zip$/i, ""))')]),
    ('P3', 'o arquivo de dois grupos sobe só para o primeiro', [(LIB, '        for (const g of [...grupos].sort()) {', '        for (const g of [...grupos].sort().slice(0, 1)) {')]),
    ('P4', 'o arquivo sem grupo sobe calado para lugar nenhum (some)', [(LIB, "        if (!grupos) { recusados.push({ arquivo: e.caminho, motivo: 'o índice não cita este arquivo: sem grupo, não sobe' }); continue }", '        if (!grupos) continue')]),
    ('P5', 'o nome repetido na pasta: o primeiro sobe', [(LIB, '        if (lista.length === 1) desenhos.push(lista[0])', '        if (lista.length >= 1) desenhos.push(lista[0])')]),
    ('P6', 'o nome de outro zip na mesma pasta passa', [(LIB, '            if (outro !== undefined) {', '            if (false) {')]),
    ('P7', 'o citado e ausente do zip não é nomeado', [(LIB, "    const faltamNoZip = [...gruposDoCaminho.keys()].filter((c) => !noZip.has(c))", "    const faltamNoZip = [...gruposDoCaminho.keys()].filter(() => false)")]),
    ('P8', 'o zip que o índice não cita passa', [(LIB, '    if (doZip.length === 0) return {', '    if (false) return {')]),
    ('P9', 'o nome no bucket perde a caixa', [(LIB, "    return { caminho: `${PASTA_DOS_DESENHOS}/${grupo}/${arquivo}` }", "    return { caminho: `${PASTA_DOS_DESENHOS}/${grupo}/${arquivo.toLowerCase()}` }")]),
    ('P10', 'o acento no nome passa', [(LIB, "const NOME_ACEITO = /^[A-Za-z0-9._\\- ()]+$/", "const NOME_ACEITO = /^.+$/")]),
    # o índice e o código
    ('I1', 'as aspas dobradas viram uma aspa só errada', [(LIB, "            if (ch === '\"' && t[i + 1] === '\"') { campo += '\"'; i++ }", "            if (ch === '\"' && t[i + 1] === '\"') { campo += '\"\"'; i++ }")]),
    ('I2', 'a coluna que falta passa', [(LIB, '    if (faltam.length) return {', '    if (false) return {')]),
    ('I3', 'o zero à esquerda fica no normalizado', [(LIB, "    return c.replace(/^DP-0*(\\d)/, 'DP-$1')", '    return c')]),
    ('I4', 'a colisão não é nomeada', [(LIB, '    return [...por].filter(([, crus]) => crus.size > 1)', '    return [...por].filter(() => false)')]),
    # O SLUG NUM LUGAR SÓ (dono do produto, 11/11/2026): a mutação que muda o slug de UM grupo tem de morrer
    ('S1', 'o slug de UM grupo muda (blindex-vidro-temperado vira blindex-e-vidro-temperado)', [(LIB, "    return grupo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')", "    return grupo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^blindex-vidro/, 'blindex-e-vidro')")]),
    ('S2', 'a importação calcula o slug por conta própria (a cópia divergente)', [(LIB, "            const c = caminhoDoDesenho(grupoNoCaminho(l.grupo), l.caminho_no_zip.split('/').pop() ?? '')", "            const c = caminhoDoDesenho(l.grupo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), l.caminho_no_zip.split('/').pop() ?? '')")]),
    # a importação
    ('M1', 'o vazio vira "" em vez de nulo', [(LIB, "const nuloSeVazio = (v: string): string | null => (v === '' ? null : v)", 'const nuloSeVazio = (v: string): string | null => v')]),
    ('M2', 'o liberado "Não" vira verdadeiro', [(LIB, "const LIBERADO: Readonly<Record<string, boolean>> = { Sim: true, 'Não': false }", "const LIBERADO: Readonly<Record<string, boolean>> = { Sim: true, 'Não': true }")]),
    ('M3', 'a linha sem arquivo some da lista', [(LIB, "        if (l.caminho_no_zip.trim() === '') semArquivo.push(", "        if (l.caminho_no_zip.trim() === '') void (")]),
    ('M4', 'o código cru é normalizado (funde DP-017 com DP-17)', [(LIB, 'grupo: nuloSeVazio(l.grupo), codigo: nuloSeVazio(l.codigo), codigo_dp: codigoDp,', 'grupo: nuloSeVazio(l.grupo), codigo: codigoDpNormalizado(l.codigo) ?? nuloSeVazio(l.codigo), codigo_dp: codigoDp,')]),
    ('M5', 'a linha recusada é pulada em vez de recusar tudo', [(LIB, '    if (recusas.length) return { recusas }\n    const colisoes', '    const colisoes')]),
    ('M6', 'a rota calcula o sha256 de outro texto (aparado)', [(IMP, "createHash('sha256').update(Buffer.from(corpo.texto, 'utf-8'))", "createHash('sha256').update(Buffer.from(corpo.texto.trim(), 'utf-8'))")]),
    ('M7', 'a permissão de encolher vai sempre verdadeira', [(IMP, 'permitirEncolher: corpo.permitir_encolher })', 'permitirEncolher: true })')]),
    ('M8', 'sem a migração vira 500', [(IMP, "        if (codigo !== null && SEM_A_FUNCAO.has(codigo)) return", "        if (false) return")]),
    # a conferência
    ('K1', 'a conferência perde o lado do Storage', [(LIB, '        semLinha: [...bucket].filter((o) => !tabela.has(o)).sort(),', '        semLinha: [],')]),
    ('K2', 'a conferência perde o lado da tabela', [(LIB, '        semObjeto: [...tabela].filter((c) => !bucket.has(c)).sort(),', '        semObjeto: [],')]),
    ('K3', 'a tabela lida só na primeira página', [(REPO, '        for (const l of linhas) caminhos.push(String(l.caminho_no_storage))\n        if (linhas.length < PAGINA) return caminhos', '        for (const l of linhas) caminhos.push(String(l.caminho_no_storage))\n        return caminhos')]),
    ('K4', 'sem a tabela vira "zero dos dois lados"', [(CONF, "        if (codigo !== null && SEM_A_TABELA.has(codigo)) return res.status(409)", "        if (codigo !== null && SEM_A_TABELA.has(codigo)) return res.status(200).json({ sem_objeto: [], sem_linha: [], caminhos: 0, objetos: 0 }) || res.status(409)")]),
    # o envio
    ('E1', 'o lote que falha na assinatura some', [(ENV, "                for (const arquivo of lote) r.falhas.push({ arquivo: nome(arquivo), motivo: `a assinatura do lote falhou: ${(e as Error).message}` })\n", '')]),
    ('E2', 'o "já existe" de uma corrida vira falha', [(ENV, '                    else if (JA_EXISTE.test(res.corpo)) r.jaExistiam.push(nome(a.arquivo))\n', '')]),
    ('E3', 'o envio com sobrescrita', [(ENV, "headers: { 'x-upsert': 'false' }", "headers: { 'x-upsert': 'true' }")]),
    ('E4', 'o não respondido pela rota some', [(ENV, "            for (const arquivo of lote) if (!respondidos.has(arquivo)) r.falhas.push({ arquivo: nome(arquivo), motivo: 'a rota não respondeu sobre este arquivo' })\n", '')]),
    # a rota
    ('R1', 'a rota assina o que já existe (duplica)', [(ROTA, '            if (jaNaPasta.has(arquivo)) { existentes.push(arquivo); continue }\n', '')]),
    ('R2', 'a lista da pasta lê só a primeira página', [(REPO, '        if (data.length < PAGINA) return nomes', '        return nomes')]),
    ('R3', 'a subpasta conta como objeto', [(REPO, '        for (const o of data) if (o.id !== null) nomes.add(o.name)', '        for (const o of data) nomes.add(o.name)')]),
    # a tela
    ('T1', 'a tela não nomeia a colisão do código', [(TELA, "description={colisoes.length > 0 ? `Achado no índice, não corrigido: ${colisoes.map((c) => c.frase).join('; ')}.` : undefined} />", 'description={undefined} />')]),
    ('T2', 'a tela esconde as falhas', [(TELA, '                                <ListaNomeada titulo="Falharam" itens={r.falhas} chave="falhas" />\n', '')]),
]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)

# E3 é EQUIVALENTE para estas suítes: o envio de verdade (fetch) não roda em teste — as suítes trocam as dependências. O "sem sobrescrita"
# é provado no bucket de mentira (o "Duplicate" da segunda rodada) e na rota (o existente não é assinado). Fica para quem procurar.
EQUIVALENTES: set = {'E3'}


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


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
