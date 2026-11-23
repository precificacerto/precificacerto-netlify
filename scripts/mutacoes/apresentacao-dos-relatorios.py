import subprocess, sys, os
# MUTACOES dos tres ajustes de apresentacao dos Relatorios I.A. (22/11/2026). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/relatorios-em-pdf.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamentos-e-relatorios-ia-tela.test.tsx']
P = 'src/lib/atendimentos-ia/relatorios-em-pdf.ts'
F = 'src/page-parts/atendimentos-ia/folha-a4.component.tsx'
I = 'src/pages/atendimentos-ia/relatorios-ia/index.tsx'
M_ = 'src/page-parts/atendimentos-ia/relatorio-de-materiais.component.tsx'
M = [
 (P, "            this.y += h + respiro\n", "            this.y += h\n"),
 (P, "export const RESPIRO_ENTRE_PERFIS = 3", "export const RESPIRO_ENTRE_PERFIS = 0"),
 (P, "cat.chave === CATEGORIA_DOS_PERFIS ? RESPIRO_ENTRE_PERFIS : 0)", "RESPIRO_ENTRE_PERFIS)"),
 (P, "        f.tabela(COLUNAS_PDF_DOS_PERFIS, e.perfis.linhas.map(celulasDoPerfil), RESPIRO_ENTRE_PERFIS)", "        f.tabela(COLUNAS_PDF_DOS_PERFIS, e.perfis.linhas.map(celulasDoPerfil))"),
 (P, "for (const k of cat.codigos) { blocoDoCodigo(f, k); respirar(f) } }", "for (const k of cat.codigos) { blocoDoCodigo(f, k) } }"),
 (P, "        ], RESPIRO_ENTRE_PERFIS)", "        ])"),
 (F, "            setEstado({ tipo: 'pronta', url })", "            setEstado({ tipo: 'falhou', frase: FRASE_SEM_VISOR })"),
 (F, "src={`${estado.url}#view=FitH`}", "src={estado.url}"),
 (F, "if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)", "if (false) URL.revokeObjectURL(url as string)"),
 (F, "new Blob([bytes as BlobPart], { type: 'application/pdf' })", "new Blob([bytes as BlobPart])"),
 (F, "export const VISTA_PADRAO: VistaDoRelatorio = 'a4'", "export const VISTA_PADRAO: VistaDoRelatorio = 'tabela'"),
 (I, "                {estado.tipo === 'pronto' && aberto === null && (", "                {estado.tipo === 'pronto' && ("),
 (I, "onClick={() => setEscolhido(null)}", "onClick={() => undefined}"),
 (M_, "            {vista === 'a4' ? <FolhaA4 gerar={gerar} titulo=\"Relatório de materiais\" /> : (<>", "            {false ? <FolhaA4 gerar={gerar} titulo=\"Relatório de materiais\" /> : (<>"),
 (M_, "        return m.pdfDoRelatorioDeMateriais(pronto as NonNullable<typeof pronto>, { numero, cliente, geradoEm: new Date() })", "        return m.pdfDoRelatorioDeCorte({ categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] }, { numero, cliente, geradoEm: new Date() })"),
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
