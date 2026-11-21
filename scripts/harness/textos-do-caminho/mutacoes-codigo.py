import subprocess, sys, os
# MUTACOES do codigo do item (4): os textos do caminho ativo e a descricao da etapa. Roda SOZINHO na arvore (mutacao-na-arvore-de-trabalho).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')) + '/'
T = ['src/utils/__tests__/textos-do-caminho.test.ts', 'src/utils/__tests__/tela-da-natureza.test.ts', 'src/utils/__tests__/tela-da-natureza-linhas.test.tsx',
     'src/utils/__tests__/atendimentos-ia-etapas-do-catalogo.test.tsx', 'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
L = 'src/lib/atendimentos-ia/textos-do-caminho.ts'
S = 'src/lib/atendimentos-ia/textos-do-caminho-servidor.ts'
MF = 'src/lib/atendimentos-ia/motor-da-familia.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
ET = 'src/utils/atendimentos-ia-etapas.ts'
EF = 'src/lib/atendimentos-ia/etapas-da-familia.ts'
M = [
 (L, "const ativas = daMontagem.size > 0 ? oferecidas.filter((f) => daMontagem.has(f.familia)) : oferecidas", "const ativas = oferecidas"),
 (L, "if (texto === undefined || jaFoi.has(id)) continue", "if (texto === undefined) continue"),
 (L, "if (daFamilia !== undefined) out.push", "if (daFamilia !== undefined && false) out.push"),
 (L, "const doCaminho = [...(lidos.caminho.get(f.familia) ?? new Map<string, string>()).entries()]", "const doCaminho = [...lidos.caminho.values()].flatMap((m) => [...m.entries()])"),
 (L, "    if (textos.length === 0) return []\n    return [CABECALHO_DOS_TEXTOS_DO_CAMINHO", "    return [CABECALHO_DOS_TEXTOS_DO_CAMINHO"),
 (L, "if (temFamilia === temFornecedor) erros.push", "if (!temFamilia && !temFornecedor) erros.push"),
 (L, "[...texto].length > LIMITE_DO_TEXTO_DO_CAMINHO) erros.push", "[...texto].length > LIMITE_DO_TEXTO_DO_CAMINHO + 1) erros.push"),
 (L, "for (const k of Object.keys(c)) if (!['familia', 'fornecedor_id', 'texto'].includes(k))", "for (const k of Object.keys(c)) if (false)"),
 (L, "if (lidos.estado === 'sem_migracao') return null", "if (lidos.estado === 'sem_migracao') return { familia: null, fornecedores: [] }"),
 (S, "if (textos.length === 0 && o.sempreOCaminho !== true) return { estado: 'vazio' }", "if (textos.length === 0) return { estado: 'vazio' }"),
 (S, "for (const e of dasEtapas) junta(", "for (const e of dasEtapas.slice(0, 0)) junta("),
 (S, "db().from('orcamentista_mp_categoria_fornecedor').select('mp_categoria_id, fornecedor_id').eq('tenant_id', tenantId)", "db().from('orcamentista_mp_categoria_fornecedor').select('mp_categoria_id, fornecedor_id')"),
 (S, ".filter((l) => escrito(l.texto))", ""),
 (MF, "    if (descricoes.length === 0) return []\n    return [CABECALHO_DA_DESCRICAO_DA_ETAPA", "    return [CABECALHO_DA_DESCRICAO_DA_ETAPA"),
 (MF, "descricaoDoLevantamento: descricaoDa(doLevantamento),", "descricaoDoLevantamento: doCalculo ? descricaoDa(doCalculo) : descricaoDa(doLevantamento),"),
 (MF, "    if (r.error && (r.error.code === '42703' || r.error.code === 'PGRST204')) {", "    if (false) {"),
 (CV, "        ...(c.textosDoCaminho.length ? ['', ...blocoDosTextosDoCaminho(c.textosDoCaminho)] : []),\n", ""),
 (CV, "        ...(c.descricoesDasEtapas.length ? ['', ...blocoDasDescricoesDasEtapas(c.descricoesDasEtapas, c.variasFamilias)] : []),\n", ""),
 (ET, "    if (n > LIMITE_DA_DESCRICAO_DA_ETAPA) return", "    if (n > LIMITE_DA_DESCRICAO_DA_ETAPA + 1) return"),
 (ET, "const aparada = typeof d === 'string' && d.trim() !== '' ? d.trim() : null", "const aparada = typeof d === 'string' ? d : null"),
 (EF, "...(semColuna ? {} : { descricao:", "...(false ? {} : { descricao:"),
 (EF, "const semColuna = comDescricao.error !== null && colunaAusente(comDescricao.error)", "const semColuna = false"),
]
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    if s.count(a) != 1: print('ABORTA', arq, a[:60], s.count(a)); sys.exit(3)
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T, '-t', '(46)|caminho|textos|descri|corpo|rota|tela|leitor|família|bloco'], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:80].replace('\n', ' '))
print(f'{mortas}/{len(M)}')
