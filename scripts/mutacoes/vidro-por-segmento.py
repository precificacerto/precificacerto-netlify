import subprocess, sys, os
# MUTACOES do vidro por segmento + cor + espessura (23/11/2026). Roda SOZINHO na arvore (nada le a arvore enquanto roda).
# SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/vidro-por-segmento.test.ts', 'src/utils/__tests__/vidro-da-tabela.test.ts', 'src/utils/__tests__/atendimentos-ia-layout-unico.test.ts',
     'src/utils/__tests__/atendimentos-ia-importar-rota.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts']
VT = 'src/lib/atendimentos-ia/vidro-da-tabela.ts'
IM = 'src/utils/atendimentos-ia-importacao.ts'
RT = 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
M = [
 (VT, "export const temAtributos = (i: ItemDeVidro) => normal(i.segmento).trim() !== '' && normal(i.cor).trim() !== ''", "export const temAtributos = (i: ItemDeVidro) => normal(i.segmento).trim() !== ''"),
 (VT, "    const total = parenteses ? espessuraNormal(parenteses[1]) : composicao === null && solta ? espessuraNormal(solta[1]) : null", "    const total = composicao === null && solta ? espessuraNormal(solta[1]) : null"),
 (VT, "        if (e.total === null && e.composicao === null) return false\n", ""),
 (VT, "        if (dito.cor !== null && semEspacoSobrando(normal(i.cor)) !== dito.cor) return false\n", ""),
 (VT, "        if (dito.segmento !== null && semEspacoSobrando(normal(i.segmento)) !== dito.segmento) return false\n", ""),
 (VT, "dito.espessura !== e.total && dito.espessura !== e.composicao", "dito.espessura !== e.total"),
 (VT, "    for (const v of [...vocabulario].sort((a, b) => b.length - a.length)) {", "    for (const v of [...vocabulario].sort((a, b) => a.length - b.length)) {"),
 (VT, "const SINONIMOS_DO_SEGMENTO: ReadonlyArray<[string, string]> = [['COMUM', 'FLOAT']]", "const SINONIMOS_DO_SEGMENTO: ReadonlyArray<[string, string]> = []"),
 (VT, "    const cor = acharNoTexto(seg.resto, cores)", "    const cor = acharNoTexto(t, cores)"),
 (VT, "        if (temAtributos(i)) return false\n", ""),
 (VT, "    const candidatos = [...(algoPorAtributo ? candidatosPorAtributo(porAtributo, itens) : []), ...legado]", "    const candidatos = [...(algoPorAtributo ? candidatosPorAtributo(porAtributo, itens) : [])]"),
 (VT, "&& !algoPorAtributo) {", ") {"),
 (IM, "            cor: texto('cor'),", "            cor: null,"),
 (IM, "export const COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO = ['linha', 'codigo_wvetro', 'valor_kg', 'multiplo_compra'] as const", "export const COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO = ['linha', 'cor', 'codigo_wvetro', 'valor_kg', 'multiplo_compra'] as const"),
 (RT, "declarada !== null && declarada !== CATEGORIA_COM_VARIANTES && doArquivo.categorias.length > 1", "declarada !== null && doArquivo.categorias.length > 1"),
 (RT, "declarada !== null && declarada !== CATEGORIA_COM_VARIANTES && doArquivo.categorias.length > 1", "declarada !== null && declarada === CATEGORIA_COM_VARIANTES && doArquivo.categorias.length > 1"),
 (LC, "    if (semAColunaDaCor(primeira.error)) {", "    if (false) {"),
 (LC, "        colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, tabela_id`\n        primeira = await pagina(0)", "        primeira = await pagina(0)"),
]
M = [x for x in M if os.environ.get('SO', '') in x[1]]
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
