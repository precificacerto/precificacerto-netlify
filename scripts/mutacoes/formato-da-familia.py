import subprocess, sys, os
# MUTACOES do formato da familia (23/11/2026): leitor do corpo, opcoes, rota, leitura do modelo da conta, formulario e tela. Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/base-de-conhecimento-formato-da-familia.test.tsx', 'src/utils/__tests__/base-de-conhecimento-tres-niveis-rotas.test.ts']
L = 'src/lib/atendimentos-ia/base-de-conhecimento.ts'
S = 'src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts'
P = 'src/pages/api/super-admin/base-de-conhecimento/formato-da-materia-prima.ts'
A = 'src/page-parts/atendimentos-ia/base-de-conhecimento/arvore.ts'
C = 'src/page-parts/atendimentos-ia/base-de-conhecimento/materias-primas.component.tsx'
M = [
 (L, "    const formato = typeof b.formato === 'string' ? b.formato.trim().toUpperCase() : null", "    const formato = typeof b.formato === 'string' ? b.formato : null"),
 (L, "    if (!formato || !(FORMATOS_DA_FAMILIA as readonly string[]).includes(formato)) erros.push(", "    if (!formato) erros.push("),
 (L, "const erros: ErroNomeado[] = Object.keys(b).filter((k) => k !== 'materia_prima' && k !== 'formato').map(", "const erros: ErroNomeado[] = Object.keys(b).filter((k) => k !== 'materia_prima' && k !== 'formato' && k !== 'por').map("),
 (L, "    if (!principal) return FORMATOS_DA_FAMILIA.map((f) => ({ value: f, label: NOME_DO_FORMATO[f] }))", "    if (!principal) return opcoesDoFormato('FABRICACAO')"),
 (L, "        { value: principal, label: `Principal (${NOME_DO_FORMATO[principal]})` },\n        { value: secundario, label: `Secundário (${NOME_DO_FORMATO[secundario]})` },",
     "        { value: 'FABRICACAO', label: `Principal (${NOME_DO_FORMATO[principal]})` },\n        { value: 'REVENDA', label: `Secundário (${NOME_DO_FORMATO[secundario]})` },"),
 (L, "includes(modeloDaConta) ? (modeloDaConta as FormatoDaFamilia) : null", "includes(String(modeloDaConta).toUpperCase()) ? (String(modeloDaConta).toUpperCase() as FormatoDaFamilia) : null"),
 (P, "p_formato: corpo.formato,", "p_formato: req.body?.formato,"),
 (P, "'superadmin_definir_formato_da_materia_prima'", "'superadmin_definir_familia_da_materia_prima'"),
 (S, ".select('modelo').eq('tenant_id', tenantId).maybeSingle())", ".select('modelo').maybeSingle())"),
 (S, "        modelo_da_conta: daConta?.modelo ?? null,\n", ""),
 (A, "...('formato' in m ? { formato: (m.formato as string | null) ?? null } : {}),", "formato: (m.formato as string | null) ?? null,"),
 (A, "    if (antes && 'formato' in antes) return { formato: antes.formato ?? null }\n", ""),
 (A, "    if (m.formato !== undefined) return { formato: (m.formato as string | null) ?? null }\n", ""),
 (C, "    if (m.id === null || !doFormato || m.formato === undefined) return null", "    if (m.id === null || !doFormato) return null"),
 (C, "disabled={doFormato.travado || gravando}", "disabled={gravando}"),
 (C, "{m.formato === null && <div style", "{!m.formato && false && <div style"),
 (C, "erro: erroDoFormato && erroDoFormato.materiaPrimaId === m.id ? erroDoFormato.mensagem : null", "erro: erroDoFormato ? erroDoFormato.mensagem : null"),
 (C, "options={opcoesDoFormato(arvore.modelo_da_conta)}", "options={opcoesDoFormato('FABRICACAO')}"),
 (C, "try { await doFormato.aoMudar(m.id, v) }", "try { await doFormato.aoMudar(m.id, 'REVENDA') }"),
]
for arq, a, b in M:
    n = open(R + arq).read().count(a)
    if n != 1: print('ABORTA', arq, a[:70], n); sys.exit(3)
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:90].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
