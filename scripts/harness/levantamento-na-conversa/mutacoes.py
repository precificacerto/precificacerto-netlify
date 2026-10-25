#!/usr/bin/env python3
"""
HARNESS do LEVANTAMENTO NA CONVERSA — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA regra em `levantamento-da-conversa.ts`, `conversa-da-ia.ts` ou
`pre-definicao.ts` e roda os portões — `levantamento-da-conversa.test.ts`,
`levantamento-em-montagem.test.ts` e `atendimentos-ia-levantamento-por-nome.test.ts` (desde o
levantamento por nome, 25/10/2026, que tirou `atendimentos-ia-conversa-da-ia.test.ts`). A mutação tem de DERRUBAR pelo menos um caso, e o caso
exigido (5º elemento) tem de aparecer na saída da falha (`teste-que-nao-exercita.md`).

O arquivo-alvo é mutado no lugar, com `.bak`, e conferido por sha256 no fim; o script recusa rodar com
o alvo sujo. NÃO COMMITE enquanto ele roda.

Uso:   python3 -B scripts/harness/levantamento-na-conversa/mutacoes.py          (todas)
       python3 -B scripts/harness/levantamento-na-conversa/mutacoes.py L3 L8   (só estas)
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
PD = 'src/lib/atendimentos-ia/pre-definicao.ts'
MO = 'src/utils/mao-de-obra-pelo-caminho-da-tela.ts'
T = ['src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/levantamento-em-montagem.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
CONTROLE = 'L0'

M = [
 ('L1', 'a tipologia aceita qualquer texto', PD, [("return typeof v === 'string' && tipologias.includes(v) ? v : undefined", "return textoValido(v) ? (v as string).trim() : undefined")], 'não é tipologia'),
 ('L2', 'a tipologia comparada sem caixa', PD, [("typeof v === 'string' && tipologias.includes(v) ? v", "typeof v === 'string' && tipologias.some((t) => t.toLowerCase() === (v as string).toLowerCase()) ? (tipologias.find((t) => t.toLowerCase() === (v as string).toLowerCase()) as string)")], '"dp-02" não é DP-02'),
 ('L3', 'sem lista, a LLM é chamada assim mesmo', CV, [("if ('frase' in tabela) return await responder(", "if (false) return await responder(")], 'SEM LISTA de tipologias'),
 ('L4', 'a lista não vai ao prompt', CV, [("...(c.candidatos.length ? c.candidatos.map(linhaDoCandidato) : ['(nenhuma)']),", "'(nenhuma)',")], 'vão ao prompt'),
 ('L5', 'o levantamento não é enviado quando fica completo', CV, [("return await responder(`${confirmacao}${levantamento.texto}`, levantamento.desfecho)", "return fim(levantamento.desfecho)")], 'os dois totais'),
 ('L6', 'com duas tabelas, vale a primeira', LC, [("if (tabelas.length > 1) return {", "if (false) return {")], 'MAIS DE UMA TABELA'),
 ('L7', 'as abas da Wolff valem para qualquer tabela', LC, [("const abas = ABAS_IMPORTADAS[tabela.tabelaId]?.[t]", "const abas = ABAS_IMPORTADAS[TABELA_WOLFF]?.[t]")], 'OUTRA TABELA'),
 ('L8', 'as regras só da primeira página', LC, [("        if (pagina.length === 0) break\n", "        break\n")], 'página a página'),
 ('L9', 'tempo ausente vira zero', LC, [("if (!linha || typeof linha.tempo_fabricacao_min !== 'number') return null", "if (!linha || typeof linha.tempo_fabricacao_min !== 'number') return { minutos: 0, origem: null }")], 'nunca zero'),
 ('L10', 'a espessura pega o número que casa, mesmo com outro no texto', LC, [("    if (numeros.length !== 1) return null\n", "")], '4+4'),
 ('L11', 'com duas serras, vale a primeira', LC, [("if (valores.length === 1) return { ok: true, serra_mm: valores[0] }", "if (valores.length >= 1) return { ok: true, serra_mm: valores[0] }")], 'DUAS SERRAS'),
 ('L12', 'a recusa cala as faltas além da oitava', LC, [("const resto = faltas.length > MAXIMO_DE_FALTAS ? [`• e mais ${faltas.length - MAXIMO_DE_FALTAS} falta(s) do mesmo levantamento.`] : []", "const resto: string[] = []")], 'nenhuma calada'),
 ('L13', 'a recusa sai com o prefixo técnico da esquadria', LC, [("r.recusas.map((x) => maiuscula(traduzir(uma ? semPrefixoDaEsquadria(x.mensagem) : x.mensagem)))", "r.recusas.map((x) => maiuscula(traduzir(x.mensagem)))")], 'sem o prefixo de esquadria'),
 ('L14', 'o total ausente não diz o que falta', LC, [("    linhas.push(barra === null\n", "    linhas.push(false\n")], 'PREÇO AUSENTE'),
 ('L15', 'a lista que não existe vira lista vazia', LC, [("    if (erroDaLista) return {", "    if (false) return {")], 'LISTA AINDA NÃO EXISTE'),
 ('L16', 'a despesa da mão de obra é sempre a da industrialização', MO, [("segmentoDaDespesa: tipo === 'SERVICO' ? 'SERVICO' : 'INDUSTRIALIZACAO',", "segmentoDaDespesa: 'INDUSTRIALIZACAO',")], 'o segmento decide'),
 ('L17', 'a despesa da mão de obra é sempre a do serviço (soma administrativa e fixa)', MO, [("segmentoDaDespesa: tipo === 'SERVICO' ? 'SERVICO' : 'INDUSTRIALIZACAO',", "segmentoDaDespesa: 'SERVICO',")], 'NÃO entram'),
 ('L18', 'carga horária ausente vira mão de obra zero', MO, [("    if (carga.isUnset) faltas.push(FALTA_CARGA_HORARIA)\n", "")], 'nunca zero'),
 ('L19', 'só a primeira falta da mão de obra sai', LC, [("return { ok: false, falta: m.faltas.join('; ') }", "return { ok: false, falta: m.faltas[0] ?? '' }")], 'sem tenant_settings'),
 ('L20', 'os totais de material não são arredondados antes da diferença', LC, [("const barra = t.total_por_barra_inteira === null ? null : centavos(t.total_por_barra_inteira)", "const barra = t.total_por_barra_inteira"),
                                                                       ("const consumo = t.total_por_consumo_real === null ? null : centavos(t.total_por_consumo_real)", "const consumo = t.total_por_consumo_real")], 'o texto inteiro'),
 ('L21', 'o total com mão de obra esquece a mão de obra', LC, [("formatarReais(centavos(material + maoDeObraTotal))", "formatarReais(centavos(material))")], 'o texto inteiro'),
 ('L22', 'a mão de obra não multiplica pela quantidade', LC, [("total: centavos(m.valor * quantidade),", "total: m.valor,")], 'a quantidade multiplica'),
 ('L23', 'o levantamento volta à cor fixa BRANCO', LC, [("        cor: cores[0],\n        esquadrias:", "        cor: 'BRANCO',\n        esquadrias:")], 'PRETO TEXTURADO'),
 ('L24', 'a cor do perfil aceita qualquer texto', PD, [("            return typeof v === 'string' && cores.includes(v) ? v : undefined", "            return textoValido(v) ? (v as string).trim() : undefined")], 'não é BRANCO'),
 ('L25', 'as cores não vão ao prompt', CV, [("${c.cores.length ? c.cores.join(', ') : '(nenhuma)'}", "(nenhuma)")], 'vão ao prompt'),
 ('L26', 'sem lista de cores, a conversa pergunta a cor assim mesmo', CV, [("pendencia.campo === 'cor_perfil' && cores.length === 0)", "pendencia.campo === 'cor_perfil' && false)")], 'SEM LISTA DE CORES'),
 ('L27', 'as cores são lidas de todas as empresas', LC, [(".from('orcamentista_mp_categoria').select('config').eq('tenant_id', tenantId).eq('categoria_chave', 'PERFIL')", ".from('orcamentista_mp_categoria').select('config').eq('categoria_chave', 'PERFIL')")], 'outro tenant'),
 ('L28', 'sem cor, o levantamento segue', LC, [("    lev.itens.forEach((e, i) => { if (corDe(e) === null) faltas.push(`A esquadria ${i + 1} está sem a cor do perfil.`) })\n", "")], 'SEM COR'),
 ('L29', 'a mão de obra total soma só as que existem', LC, [("const todasCalculadas = maos.length > 0 && maos.every((m) => !('falta' in m))", "const todasCalculadas = maos.some((m) => !('falta' in m))")], 'de UMA esquadria ausente'),
 ('L30', 'cores diferentes no mesmo levantamento passam', LC, [("    if (cores.length > 1) {\n", "    if (false) {\n")], 'CORES DIFERENTES'),
 # 25/10/2026: o que o preço cobre (DEFEITO 2), e a falta que nomeia a cor (R3)
 ('L31', 'a falta de preço não diz a cor', LC, [("`${r.falta_para_o_total.filter((f) => f.total === total).map((f) => `${f.codigo} (${f.perfil})`).join(', ')} em ${d.cor}`", "r.falta_para_o_total.filter((f) => f.total === total).map((f) => `${f.codigo} (${f.perfil})`).join(', ')")], 'PREÇO AUSENTE'),
 ('L32', 'a resposta com preço não diz o que ele cobre', LC, [("    linhas.push('', O_QUE_O_PRECO_COBRE)\n", "")], 'o texto inteiro'),
 ('L33', 'o perfil volta a se chamar Material', LC, [("        : `Perfis por barra inteira: ${formatarReais(barra)}.`)", "        : `Material por barra inteira: ${formatarReais(barra)}.`)")], 'o texto inteiro'),
 ('L0', 'controle: nada muda', LC, [("export", "export")]),
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
    for ident, desc, arq, trocas, *exige in M:
        exige = exige[0] if exige else None
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
            p = subprocess.run(['npx', 'jest', *T, '--silent'], capture_output=True, text=True)
        finally:
            shutil.move(arq + '.bak', arq)
        out = p.stdout + p.stderr
        linhas = [l for l in out.split('\n') if l.startswith('Tests:') or l.startswith('Test Suites:')]
        testes = next((l for l in linhas if l.startswith('Tests:')), '')
        falhos = re.search(r'(\d+) failed', testes)
        caidos = sorted(set(l.strip() for l in out.split('\n') if l.strip().startswith('●') and '›' in l))
        if falhos and int(falhos.group(1)) > 0 and exige and exige not in out:
            veredito = 'NAO DERRUBOU O EXIGIDO'
        elif falhos and int(falhos.group(1)) > 0:
            veredito = 'VERMELHO'
        elif p.returncode:
            veredito = 'NAO CARREGOU'
        else:
            veredito = 'NAO DERRUBOU'
        print(f'{veredito:12} {ident:4} {desc} | ' + ' | '.join(linhas))
        if exige:
            print(f'       exige na saída: {exige!r} — ' + ('apareceu' if exige in out else 'NÃO apareceu'))
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
