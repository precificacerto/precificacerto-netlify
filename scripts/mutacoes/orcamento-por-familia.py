import subprocess, sys, os
# MUTACOES do orcamento por familia (PR3, 23/11/2026). Roda SOZINHO na arvore (nada le a arvore enquanto roda).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/numero-do-orcamento.test.ts', 'src/utils/__tests__/atendimentos-ia-travessia-do-levantamento.test.ts', 'src/utils/__tests__/atendimentos-ia-cadeia-do-sim.test.ts',
     'src/utils/__tests__/resgate-do-orcamento.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts',
     'src/utils/__tests__/atendimentos-ia-arquivo-do-orcamento.test.ts', 'src/utils/__tests__/atendimentos-ia-orcamentos-ia.test.ts',
     'src/utils/__tests__/atendimentos-ia-orcamentos-ia-tela.test.tsx', 'src/utils/__tests__/atendimentos-ia-familias-do-catalogo.test.tsx',
     'src/utils/__tests__/atendimentos-ia-levantamentos-e-relatorios-ia-tela.test.tsx', 'src/utils/__tests__/atendimentos-ia-precificacao-do-orcamento-tela.test.tsx',
     'src/utils/__tests__/atendimentos-ia-orcamento-precificado.test.ts']
NO = 'src/lib/atendimentos-ia/numero-do-orcamento.ts'
NS = 'src/lib/atendimentos-ia/numero-do-orcamento-servidor.ts'
TP = 'src/lib/atendimentos-ia/travessia-do-levantamento-plano.ts'
TL = 'src/lib/atendimentos-ia/travessia-do-levantamento.ts'
CA = 'src/utils/atendimentos-ia-catalogo.ts'
CD = 'src/lib/atendimentos-ia/cadeia-do-sim.ts'
RO = 'src/lib/atendimentos-ia/resgate-do-orcamento.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
AO = 'src/lib/atendimentos-ia/arquivo-do-orcamento.ts'
LI = 'src/pages/atendimentos-ia/orcamentos-ia/index.tsx'
RE = 'src/pages/atendimentos-ia/relatorios-ia/index.tsx'
M = [
 # o numero exibido
 (NO, "&& o.sigla !== null && /^[A-Z]{3}$/.test(o.sigla)) {", "&& o.sigla !== null) {"),
 (NO, "o.levantamentoNumero !== null && Number.isInteger(o.levantamentoNumero) &&", "o.levantamentoNumero !== null &&"),
 (NO, "        return `${o.levantamentoNumero}-${o.sigla}`", "        return String(o.numero)"),
 (NS, "sigla: texto(o.familia) ? siglaDa.get(texto(o.familia) as string) ?? null : null,", "sigla: null,"),
 (NS, "if (s !== null) m.set(x.chave, s)", "m.set(x.chave, 'PVC')"),
 (AO, "campo(doc, 'Número:', d.numeroExibido,", "campo(doc, 'Número:', String(d.numero),"),
 (AO, "nomeDoArquivo: nomeDoArquivo(d.numeroExibido, d.cliente.nome)", "nomeDoArquivo: nomeDoArquivo(d.numero, d.cliente.nome)"),
 (CD, "    if (!deps.numeroExibido) return String(numero)\n    try {\n        return await deps.numeroExibido(tenantId, orcamentoId)\n    } catch {\n        return String(numero)\n    }",
      "    if (!deps.numeroExibido) return String(numero)\n    return await deps.numeroExibido(tenantId, orcamentoId)"),
 (CD, "nomeDoArquivo(n, orcamento.nome)", "nomeDoArquivo(orcamento.numero, orcamento.nome)"),
 (TL, "        const familiaDoOrcamento = g.existente ? g.existente.familia : g.familia\n", "        const familiaDoOrcamento = null as string | null\n"),
 (TL, "    const n = exibido(r.orcamento.numero)\n", "    const n = String(r.orcamento.numero)\n"),
 (LI, "render: (_: unknown, o: LinhaDoOrcamento) => o.numero_exibido ?? o.numero }", "render: (_: unknown, o: LinhaDoOrcamento) => o.numero }"),
 (LI, " || semAcento(o.numero_exibido ?? '') === b.replace(/^#/, ''))", ")"),
 (RE, "{`Orçamento ${aberto.numero_exibido ?? aberto.numero} — ${aberto.nome}`}", "{`Orçamento ${aberto.numero} — ${aberto.nome}`}"),
 # a separacao por familia e o orcamento de cada uma
 (TP, "    if (semFamilia.length) return { recusas: [fraseDoItemSemFamilia(semFamilia)] }\n", ""),
 (TP, "    const dela = existentes.find((o) => o.familia === familia)\n    if (dela) return dela\n", ""),
 (TP, "    if (familiasDoLevantamento.length === 1) return deAntes\n", ""),
 (TL, "            if (`${e2.message} ${e2.details ?? ''}`.includes(INDICES_DA_TRAVESSIA[0])) throw new ErroDaTravessia([fraseDoIndiceDeAntes(familia)])\n", ""),
 (TL, "itens: daFamilia === null ? lido.plano.itens : (sep.grupos.find((g) => g.familia === daFamilia)?.itens ?? []) }", "itens: lido.plano.itens }"),
 (TL, "    if (daFamilia === null && sep.grupos.length > 1) throw", "    if (false) throw"),
 # a sigla da familia
 (CA, "    if (!/^[A-Z]{3}$/.test(sigla)) return { ok: false, erro: FRASE_DA_SIGLA_FORA_DA_FORMA }\n", ""),
 (CA, "    if (sigla === '') return { ok: false, erro: FRASE_SEM_SIGLA }\n", ""),
 # o resgate de um orcamento por familia
 (RO, "        if (tem !== 0 && tem !== n) return null\n", ""),
 (RO, "        const o = ordenados.filter((x) => x.levantamentoId === id)[k]", "        const o = ordenados.filter((x) => x.levantamentoId === id)[0]"),
 (RO, "familias: familia ? [rotulos.get(familia) ?? familia] : familiasDoLevantamento(levantamentoId),", "familias: familiasDoLevantamento(levantamentoId),"),
 (RO, "return `${k + 1}) ${o.nome}, nº ${o.numeroExibido}${", "return `${k + 1}) ${o.nome}, nº ${o.numero}${"),
 (CV, "                    if (orcamentos.length === 1) return await mandarOrcamento(orcamentos[0], true)", "                    if (orcamentos.length > 0) return await mandarOrcamento(orcamentos[0], true)"),
 (CV, "        const orcamentos = orcamentosDaLista(p.levantamentos, await lerOrcamentosDosLevantamentos(tenantId, citados))",
      "        const lidos0 = await lerOrcamentosDosLevantamentos(tenantId, citados)\n        const orcamentos = p.levantamentos.map((id) => lidos0.find((o) => o.levantamentoId === id)).filter((o): o is OpcaoDoOrcamento => !!o)"),
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
