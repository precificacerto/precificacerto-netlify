"""Mutações da FRONTEIRA (dono do produto, 20/11/2026): a etapa 1 sem o Padrão do motor; na 2, o vendedor, a política da empresa, o padrão que não
acrescenta peça ou a principal — e a trava no avaliador.
Uso: python3 scripts/mutacoes/fronteira-das-escolhas.py <worktree>. Roda numa worktree, nunca na árvore de trabalho.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
F = 'src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
P = 'src/lib/atendimentos-ia/politica-da-empresa.ts'
E = 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
A = 'src/lib/atendimentos-ia/avaliador-de-formulas.ts'
L = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
AP = 'src/lib/atendimentos-ia/apanhado.ts'
M = [
    ('M1 a política não é lida', F, "        const t = traduzirPolitica(tipologia.codigo, v, politica)\n        if (t === null) continue", "        const t = null as ReturnType<typeof traduzirPolitica>\n        if (t === null) continue"),
    ('M2 o padrão sempre vale', F, "        if (!acrescenta || (doNome", "        if (true || !acrescenta || (doNome"),
    ('M3 o padrão nunca vale', F, "        if (!acrescenta || (doNome", "        if (false && (doNome"),
    ('M4 contido em vez de estritamente', F, "o !== padrao && estritamenteContido(", "o !== padrao && contido("),
    ('M5 a principal é a de mais', F, "conjuntos.every((x) => contido(c.linhas, x.linhas))", "conjuntos.every((x) => contido(x.linhas, c.linhas))"),
    ('M6 sem principal, o padrão', F, "        if (principal === null) {\n            const lista", "        if (principal === null) { escolhas[v.variavel] = padrao; continue }\n        if (principal === null) {\n            const lista"),
    ('M7 a condição que não se avalia não entra', F, "        if ('recusa' in r || r.valor === true) entram.add(i)", "        if (!('recusa' in r) && r.valor === true) entram.add(i)"),
    ('M8 a ressalva da travessa some', F, "(doNome && descricao !== null && doNome.test(semAcento(descricao)))", "false"),
    ('M9 usa=não vira o padrão', F, "        const sem = principalDe(v.variavel, opcoes)\n", "        const sem = numeroDoPadrao(v.padrao)\n"),
    ('M10 o vendedor não vence', F, "        if (escolhas[v.variavel] !== undefined || voltas.some", "        if (voltas.some"),
    ('M11 a política vira "contém"', P, "forma(o.rotulo).startsWith(forma(texto))", "forma(o.rotulo).includes(forma(texto).slice(0, 4))"),
    ('M12 o nicho não herda', P, "    const efetivo = efetivoDasEsquadrias(empresa, nicho)", "    const efetivo = efetivoDasEsquadrias(empresa, null)"),
    ('M13 mais de uma opção casa e vale', P, "return achadas.length === 1 ? { valor: achadas[0].valor, campo } : recusa(campo, texto, achadas.length)", "return achadas.length >= 1 ? { valor: achadas[0].valor, campo } : recusa(campo, texto, achadas.length)"),
    ('M14 a cor passa a ser lida da política', P, "    RL: { booleano: 'regiao_litoranea' },", "    RL: { booleano: 'regiao_litoranea' },\n    CORES: { valor: 'cores_perfil' },"),
    ('M15 o agente vê o Padrão', E, "    return { variaveis: t.variaveis.map((v): VariavelDoAgente => ({ ...v, padrao: null, tem_padrao: (v.padrao ?? '').trim() !== '' })) }", "    return t"),
    ('M16 a condição pergunta quando vale em alguma', E, "    return combinacoes.every((valores) => {", "    return combinacoes.some((valores) => {"),
    ('M17 a variável sem opções faz perguntar', E, "        if (!opcoes || opcoes.length === 0) return false\n", "        if (!opcoes || opcoes.length === 0) return true\n"),
    ('M18 a trava do avaliador some', A, "        if (ctx.entrada.semDecidirVariacao && ctx.opcoes.has(nome)) {", "        if (false) {"),
    ('M19 o cálculo sem a marca', L, "semDecidirVariacao: lidas[e.tipologia] !== undefined,", "semDecidirVariacao: false,"),
    ('M20 o cálculo sem a fronteira', L, "        return t ? escolhasDoCalculo(t, ditas[k], politica) : { escolhas: ditas[k], origem: {}, voltas: [] }", "        return { escolhas: ditas[k], origem: {}, voltas: [] }"),
    ('M21 a volta ao agente não recusa', L, "    if (voltas.length) { faltas.push(...voltas); codigos.push(`VOLTA_AO_AGENTE:${voltas.length}`) }\n", ""),
    ('M22 a folha mostra o padrão do motor', AP, "    tipologia = paraOAgente(tipologia)\n", ""),
    ('M23 a folha sem a política', AP, "        const t = traduzirPolitica(codigo, v, politica)\n        if (t && 'valor' in t) daPolitica[v.variavel] = t.valor", "        const t = null as ReturnType<typeof traduzirPolitica>\n        if (t && 'valor' in t) daPolitica[v.variavel] = t.valor"),
]
TESTES = [
    'src/utils/__tests__/fronteira-das-escolhas.test.ts',
    'src/utils/__tests__/escolhas-da-tipologia.test.ts',
    'src/utils/__tests__/apanhado.test.ts',
    'src/utils/__tests__/arquivo-do-levantamento.test.ts',
    'src/utils/__tests__/definicoes-do-item.test.ts',
    'src/utils/__tests__/levantamento-da-conversa.test.ts',
    'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts',
]
for nome, f, a, _ in M:
    n = (R / f).read_text().count(a)
    if n != 1:
        print(f'{nome}: o trecho aparece {n} vezes em {f}')
        sys.exit(3)
mortas = 0
for nome, f, a, b in M:
    p = R / f
    s = p.read_text()
    p.write_text(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', '--silent', *TESTES], cwd=R, capture_output=True, text=True, timeout=900)
        morta = r.returncode != 0
    finally:
        p.write_text(s)
    mortas += morta
    print(f"{nome}: {'MORTA' if morta else 'SOBREVIVEU'}", flush=True)
print(f'{mortas} de {len(M)} mortas')
