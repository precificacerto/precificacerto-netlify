#!/usr/bin/env python3
"""
HARNESS da tela dos três níveis — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA coisa num arquivo da tela (ou do servidor do GET /arvore) e roda os três
portões de jest. A mutação tem de DERRUBAR pelo menos um CASO. Uma mutação que passa verde é um
caso que não exercita o que promete (`teste-que-nao-exercita.md`).

Diferente dos harness de SQL desta pasta, o jest lê o arquivo do lugar: a mutação é escrita NO
ARQUIVO DO REPOSITÓRIO, com cópia `.bak`, e restaurada em `finally`. Por isso:
  - o script RECUSA rodar se algum dos arquivos-alvo tiver mudança não commitada;
  - no fim, confere que cada arquivo-alvo voltou byte a byte ao que era (sai com 2 se não voltou);
  - NÃO COMMITE enquanto ele roda: a árvore está mutada de propósito.

Critério de VERMELHO: a linha `Tests:` do jest traz `N failed` com N > 0. Suíte que não carrega
NÃO conta — ela dá exit ≠ 0 sem derrubar caso nenhum (`portao-que-nao-alcanca.md`, aparição 6),
e sai como `NAO CARREGOU`.

Uso:   python3 -B scripts/harness/tela-tres-niveis/mutacoes.py          (todas)
       python3 -B scripts/harness/tela-tres-niveis/mutacoes.py M45 M47  (só estas)
Saída: uma linha por mutação — VERMELHO, NAO DERRUBOU ou NAO CARREGOU — com os casos que caíram.
Sai com 1 se alguma mutação real não derrubar, ou se o controle M34 não sair verde.
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

D = 'src/page-parts/atendimentos-ia/base-de-conhecimento/'
A = D + 'arvore.ts'
C = D + 'materias-primas.component.tsx'
B = D + 'base-de-conhecimento.component.tsx'
S = 'src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts'
T = 'src/utils/__tests__/base-de-conhecimento-tres-niveis-a-tela.test.tsx'
T2 = 'src/utils/__tests__/base-de-conhecimento-a-tela.test.tsx'
T3 = 'src/utils/__tests__/base-de-conhecimento-tres-niveis-rotas.test.ts'
CONTROLE = 'M34'

# (id, o que estraga, arquivo, [(trecho, troca), ...]) — o trecho tem de aparecer UMA vez
M = [
 ('M1', 'materias_primas PARCIAL (só as que têm categoria mudada)', A, [("if (materias.length) corpo.materias_primas = materias", "if (materias.length) corpo.materias_primas = materias.filter((m) => 'categorias' in m)")]),
 ('M2', 'sem matéria-prima, manda materias_primas: [] em vez de omitir', A, [("if (materias.length) corpo.materias_primas = materias", "corpo.materias_primas = materias")]),
 ('M3', 'remoção não vai em remover', A, [("    if (estado.removidas.length) corpo.remover = estado.removidas.map((r) => r.id)\n", "")]),
 ('M4', 'não barra remover e gravar a mesma', A, [("            else if (removidas.has(nome.toLowerCase())) erros.push({ campo, mensagem: fraseRemoverEGravar(nome) })\n", "")]),
 ('M5', 'a barreira compara sem ignorar caixa', A, [("const removidas = new Set(estado.removidas.map((r) => r.nome.trim().toLowerCase()))", "const removidas = new Set(estado.removidas.map((r) => r.nome.trim()))"), ("else if (removidas.has(nome.toLowerCase()))", "else if (removidas.has(nome))")]),
 ('M6', '`ordem` no corpo da matéria-prima', A, [("        return categorias.length ? { nome, categorias } : { nome }", "        return { ...(categorias.length ? { nome, categorias } : { nome }), ordem: estado.materias.indexOf(m) + 1 }")]),
 ('M7', '`ordem` no item da lista', A, [("        return { [chave]: k, ...resto }", "        return { [chave]: k, ...resto, ordem: itens.indexOf(it) + 1 }")]),
 ('M8', 'null colapsa em false', A, [("        if (!igual(tipo, n.valor, gravado ? gravado[c] : null)) corpo[c] = n.valor", "        if (!igual(tipo, n.valor, gravado ? gravado[c] : null)) corpo[c] = n.valor ?? false")]),
 ('M9', 'chave não tocada vai no corpo (ausente vira valor)', A, [("        if (!igual(tipo, n.valor, gravado ? gravado[c] : null)) corpo[c] = n.valor", "        corpo[c] = n.valor")]),
 ('M10', 'lista vazia [] do banco vira null', A, [("            return { valor: Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x !== '') : null, erro: null }", "            return { valor: Array.isArray(v) && v.length ? v.map((x) => String(x).trim()).filter((x) => x !== '') : null, erro: null }")]),
 ('M11', 'booleano novo nasce false (valor inventado)', A, [("    if (tipo === 'lista_texto') return Array.isArray(gravado) ? gravado : null\n", "    if (tipo === 'lista_texto') return Array.isArray(gravado) ? gravado : null\n    if (tipo === 'booleano') return gravado ?? false\n")]),
 ('M12', 'booleano de DOIS estados (sem "não informado")', C, [("options={(['sim', 'nao', 'nao_informado'] as const).map(", "options={(['sim', 'nao'] as const).map(")]),
 ('M13', 'NULL exibido como "não"', C, [("value={paraTresEstados(valor)}", "value={paraTresEstados(valor ?? false)}")]),
 ('M14', 'sem o name único do grupo de rádio', C, [("<Radio.Group optionType=\"button\" name={nome}", "<Radio.Group optionType=\"button\"")]),
 ('M15', 'categorias na ordem da RESPOSTA, não do catálogo', A, [("export const categoriasEmOrdem = (c: ArvoreLida['catalogo']) => [...c.categorias].sort((a, b) => a.ordem - b.ordem)", "export const categoriasEmOrdem = (c: ArvoreLida['catalogo']) => [...c.categorias]")]),
 ('M16', 'campos fora da ordem do catálogo', A, [("    c.campos.filter((x) => x.categoria_chave === chave).sort((a, b) => a.ordem - b.ordem)", "    c.campos.filter((x) => x.categoria_chave === chave)")]),
 ('M17', 'título da categoria sem o número do catálogo', C, [("{`${doCatalogo?.ordem ?? '?'} · ${doCatalogo?.rotulo ?? c.chave}`}", "{`${doCatalogo?.rotulo ?? c.chave}`}")]),
 ('M18', 'campo com tipo fora do switch some (lista à mão por tipo)', C, [("        case 'numero':\n            return (", "            return (")]),
 ('M19', 'ferragem: uma linha por TIPOLOGIA (interna e externa juntas)', A, [("    return [...(gravados ?? [])].sort(porOrdem).map((g) => ({", "    return [...(gravados ?? [])].sort(porOrdem).filter((g, i, xs) => lista !== 'ferragens' || xs.findIndex((y) => y.tipologia === g.tipologia) === i).map((g) => ({")]),
 ('M20', 'referência da ferragem gravada editável', C, [("{it.gravado ? <Typography.Text>{String(it.gravado.referencia)}</Typography.Text> : texto(it, 'referencia', 'Referência')}", "{texto(it, 'referencia', 'Referência')}")]),
 ('M21', 'erro da função trocado por frase genérica (na categoria)', C, [("{erro && <div data-erro-da-arvore style={{ marginBottom: 12 }}><Alert type=\"error\" showIcon message={erro} /></div>}", "{erro && <div data-erro-da-arvore style={{ marginBottom: 12 }}><Alert type=\"error\" showIcon message=\"Falha ao gravar a categoria.\" /></div>}")]),
 ('M22', 'erro sem caminho trocado por frase genérica (no topo)', C, [("{erroDaRota && !onde && <div data-erro-da-arvore style={{ marginBottom: 12 }}><Alert type=\"error\" showIcon message={erroDaRota.message} /></div>}", "{erroDaRota && !onde && <div data-erro-da-arvore style={{ marginBottom: 12 }}><Alert type=\"error\" showIcon message=\"Falha ao gravar.\" /></div>}")]),
 ('M23', 'erro não localizado: tudo no topo', A, [("    const m = /^materia-prima (.+?), categoria ([A-Z_]+)[,:]/.exec(mensagem)", "    const m = null as RegExpExecArray | null")]),
 ('M24', 'depois do salvar NÃO redesenha pelo depois (fica o local)', B, [("                setArvore(nova)\n                setFormArvore(formularioDaArvore(nova))\n", "")]),
 ('M25', 'depois do salvar relê pelo GET em vez do depois', B, [("                const nova = arvoreDoDepois(depois, arvore)", "                void depois\n                const nova = await chamarRota<ArvoreLida>(ROTAS_DA_BASE.arvore(tenantId))")]),
 ('M26', 'o redesenho perde o nome do fornecedor', A, [("nome_do_fornecedor: nomes.get(String(f.fornecedor_id)) ?? null", "nome_do_fornecedor: null")]),
 ('M27', 'tornar principal não põe primeiro', C, [("ids: [id, ...x.fornecedores.ids.filter((y) => y !== id)], principal: id", "ids: x.fornecedores.ids, principal: id")]),
 ('M28', '"+ fornecedor" oferece também os já escolhidos', C, [("options={arvore.fornecedores_do_nicho.filter((f) => !ids.includes(f.id)).map(", "options={arvore.fornecedores_do_nicho.map(")]),
 ('M29', 'usa SIM sem referência passa', A, [("        if (resultante.usa === true && (resultante.referencia === null || resultante.referencia === undefined)) erros.push(`${rotulo} · ${ROTULO_DO_PRODUTO[p]}: ${USA_SEM_REFERENCIA}`)\n", "")]),
 ('M30', 'nome da matéria-prima GRAVADA editável', C, [("                {m.id\n                    ? <Typography.Title level={5} style={{ margin: 0 }}>{m.nome}</Typography.Title>\n                    : <Input", "                {false\n                    ? <Typography.Title level={5} style={{ margin: 0 }}>{m.nome}</Typography.Title>\n                    : <Input")]),
 ('M31', 'Desfazer devolve no fim da lista', A, [("    materias.splice(antes === -1 ? materias.length : antes, 0, volta)", "    materias.splice(materias.length, 0, volta)")]),
 ('M32', 'a árvore fora do botão único (não entra nas chamadas)', B, [("...(planoArvore?.corpo ? [{ rota: 'arvore' as const, corpo: { arvore: planoArvore.corpo }, blocos: ['materias' as const] }] : [])", "...([] as Chamada[])")]),
 ('M33', 'a contagem não soma a árvore', B, [("const pendentes = (plano?.total ?? 0) + (planoArvore?.pendencias ?? 0)", "const pendentes = (plano?.total ?? 0)")]),
 ('M35', 'sem o AVISO da linha fora da tabela', C, [("            {estado === 'fora_da_tabela' && origem.estado === 'lista' && (", "            {false && origem.estado === 'lista' && (")]),
 ('M36', 'sem a coluna Par em inox', C, [("<th style={celula}>Par em inox</th>", ""), ("                            <td style={celula} data-coluna=\"par_inox_referencia\">{texto(it, 'par_inox_referencia', 'Par em inox')}</td>\n", "")]),
 ('M37', 'sem a coluna Referência do vidro', C, [("<th style={celula}>Vidro</th><th style={celula}>Referência</th>", "<th style={celula}>Vidro</th>"), ("                            <td style={celula} data-coluna=\"referencia\">\n                                <Input allowClear aria-label=\"Referência do vidro\" value={typeof it.valores.referencia === 'string' ? it.valores.referencia : ''} onChange={(e) => trocar(it.local, 'referencia', e.target.value)} />\n                            </td>\n", "")]),
 ('M38', 'par em inox fora do corpo (a coluna aparece, o campo não vai)', A, [(", cor: 'texto', par_inox_referencia: 'texto' } },", ", cor: 'texto' } },")]),
 ('M39', 'sem tabela em uso: lista vazia em silêncio', C, [("        : origem.estado === 'sem_tabela' ? fraseSemTabelaEmUso(origem.fornecedor)", "        : origem.estado === 'sem_tabela' ? null")]),
 ('M40', 'sem principal: nada dito', C, [("    const frase = origem.estado === 'sem_principal' ? SEM_PRINCIPAL_DO_PERFIL", "    const frase = origem.estado === 'sem_principal' ? null")]),
 ('M41', 'as linhas do ÚLTIMO fornecedor, não do principal', A, [("    const principal = c.fornecedores.principal\n", "    const principal = c.fornecedores.ids[c.fornecedores.ids.length - 1] ?? null\n")]),
 ('M42', 'servidor: só a fórmula de família, sem a regra', S, [("regra: await linhasDaFonte(TABELAS_COM_LINHA.regra, tabelaIds) }", "regra: [] as string[] }")]),
 ('M43', 'servidor: lê tudo e tira os distintos no JS (o corte do PostgREST esconde linha)', S, [("        let q = db().from(tabela).select('linha').in('tabela_id', tabelaIds).not('linha', 'is', null)\n", "        const todas = await ler<Array<{ linha: string | null }>>(tabela, db().from(tabela).select('linha').in('tabela_id', tabelaIds))\n        for (const t of todas) if (t.linha) vistas.add(t.linha)\n        if (i >= 0) break\n        let q = db().from(tabela).select('linha').in('tabela_id', tabelaIds).not('linha', 'is', null)\n")]),
 ('M44', 'servidor: tabelas em uso de QUALQUER conta', S, [("db().from('orcamentista_conta_tabela').select('tabela_id').eq('tenant_id', tenantId))", "db().from('orcamentista_conta_tabela').select('tabela_id'))")]),
 ('M45', 'estado 1 com aviso: linha COM fórmula tratada como só-regra', A, [("    if (origem.comFormula.includes(linha)) return 'com_formula'\n", "")]),
 ('M46', 'sem o AVISO PRÓPRIO da linha só com regra (DESIGN)', C, [("            {estado === 'sem_formula' && origem.estado === 'lista' && (", "            {false && origem.estado === 'lista' && (")]),
 ('M47', 'estados 2 e 3 juntos: só-regra recebe o aviso de fora da tabela', A, [("    return origem.linhas.includes(linha) ? 'sem_formula' : 'fora_da_tabela'", "    return 'fora_da_tabela'")]),
 ('M48', 'servidor: as duas fontes misturadas (regra vira fórmula)', S, [("    return { formula: await linhasDaFonte(TABELAS_COM_LINHA.formula, tabelaIds),", "    return { formula: await linhasDaFonte(TABELAS_COM_LINHA.regra, tabelaIds),")]),
 ('M49', 'a lista só com a fórmula (DESIGN some do combobox)', A, [("    const linhas = [...new Set([...fontes.formula, ...fontes.regra])]", "    const linhas = [...new Set([...fontes.formula])]")]),
 ('M50', 'aviso 2 com o texto do aviso 3', C, [("message={fraseLinhaSemFormula(digitada, origem.fornecedor)}", "message={fraseLinhaForaDaTabela(digitada, origem.fornecedor)}")]),
 ('M34', 'controle: nada muda', C, [("import", "import")]),
]


def hash_de(arq):
    return hashlib.sha256(open(arq, 'rb').read()).hexdigest()


def principal():
    alvos = sorted({m[2] for m in M})
    sujos = subprocess.run(['git', 'status', '--porcelain', '--', *alvos], capture_output=True, text=True).stdout.strip()
    if sujos:
        print('RECUSADO: arquivos-alvo com mudança não commitada — a mutação seria sobre outra coisa:\n' + sujos)
        return 1
    antes = {a: hash_de(a) for a in alvos}
    pedidas = set(sys.argv[1:])
    sobreviveu = []
    for ident, desc, arq, trocas in M:
        if pedidas and ident not in pedidas:
            continue
        orig = open(arq, encoding='utf-8').read()
        novo = orig
        for velho, troca in trocas:
            n = novo.count(velho)
            if n != 1 and velho != troca:
                print(f'{ident:4} TRECHO APARECE {n} VEZES (o código mudou; ajuste a mutação): {velho[:70]!r}')
                novo = None
                break
            novo = novo.replace(velho, troca)
        if novo is None:
            sobreviveu.append(ident)
            continue
        shutil.copy(arq, arq + '.bak')
        open(arq, 'w', encoding='utf-8').write(novo)
        try:
            p = subprocess.run(['npx', 'jest', T, T2, T3, '--silent'], capture_output=True, text=True)
        finally:
            shutil.move(arq + '.bak', arq)
        out = p.stdout + p.stderr
        linhas = [l for l in out.split('\n') if l.startswith('Tests:') or l.startswith('Test Suites:')]
        testes = next((l for l in linhas if l.startswith('Tests:')), '')
        falhos = re.search(r'(\d+) failed', testes)
        caidos = sorted(set(l.strip() for l in out.split('\n') if l.strip().startswith('●') and '›' in l))
        if falhos and int(falhos.group(1)) > 0:
            veredito = 'VERMELHO'
        elif p.returncode:
            veredito = 'NAO CARREGOU'
        else:
            veredito = 'NAO DERRUBOU'
        print(f'{veredito:12} {ident:4} {desc} | ' + ' | '.join(linhas))
        for f in caidos[:4]:
            print('      ', f[:170])
        if ident == CONTROLE:
            if veredito != 'NAO DERRUBOU':
                print(f'FALHOU: o controle {CONTROLE} não saiu verde — a suíte está vermelha sem mutação nenhuma')
                sobreviveu.append(ident)
        elif veredito != 'VERMELHO':
            sobreviveu.append(ident)
    for a in alvos:
        if hash_de(a) != antes[a]:
            print(f'FALHOU: {a} não voltou ao que era')
            return 2
    print(('todas as mutações reais derrubaram pelo menos um caso; controle verde' if not sobreviveu
           else 'NÃO DERRUBARAM: ' + ', '.join(sobreviveu)))
    return 1 if sobreviveu else 0


if __name__ == '__main__':
    sys.exit(principal())
