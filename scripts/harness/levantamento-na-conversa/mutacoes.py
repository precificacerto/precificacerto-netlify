#!/usr/bin/env python3
"""
HARNESS do LEVANTAMENTO NA CONVERSA — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA regra em `levantamento-da-conversa.ts`, `conversa-da-ia.ts` ou
`pre-definicao.ts` e roda os dois portões — `levantamento-da-conversa.test.ts` e
`atendimentos-ia-conversa-da-ia.test.ts`. A mutação tem de DERRUBAR pelo menos um caso, e o caso
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
T = ['src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/atendimentos-ia-conversa-da-ia.test.ts']
CONTROLE = 'L0'

M = [
 ('L1', 'a tipologia aceita qualquer texto', PD, [("return typeof v === 'string' && tipologias.includes(v) ? v : undefined", "return textoValido(v) ? (v as string).trim() : undefined")], 'NÃO é tipologia'),
 ('L2', 'a tipologia comparada sem caixa', PD, [("typeof v === 'string' && tipologias.includes(v) ? v", "typeof v === 'string' && tipologias.some((t) => t.toLowerCase() === (v as string).toLowerCase()) ? (tipologias.find((t) => t.toLowerCase() === (v as string).toLowerCase()) as string)")], 'EXATA'),
 ('L3', 'sem lista, a LLM é chamada assim mesmo', CV, [("if ('frase' in tabela && estadoAtual.tipologia === null) {", "if (false) {")], 'NÃO chama a LLM'),
 ('L4', 'a lista não vai ao prompt', CV, [("...(candidatos.length ? candidatos.map(linhaDoCandidato) : ['(nenhuma)']),", "'(nenhuma)',")], 'a lista vai ao prompt'),
 ('L5', 'o levantamento não é enviado depois do fechamento', CV, [("return fim('fechou', `levantamento=${await enviarLevantamento(c, tabela, gravada)}`)", "return fim('fechou')")], 'seguido do LEVANTAMENTO'),
 ('L6', 'com duas tabelas, vale a primeira', LC, [("if (tabelas.length > 1) return {", "if (false) return {")], 'MAIS DE UMA TABELA'),
 ('L7', 'as abas da Wolff valem para qualquer tabela', LC, [("const abas = ABAS_IMPORTADAS[tabela.tabelaId]?.[e.tipologia]", "const abas = ABAS_IMPORTADAS[TABELA_WOLFF]?.[e.tipologia]")], 'OUTRA TABELA'),
 ('L8', 'as regras só da primeira página', LC, [("        if (pagina.length === 0) break\n", "        break\n")], 'página a página'),
 ('L9', 'tempo ausente vira zero', LC, [("if (!linha || typeof linha.tempo_fabricacao_min !== 'number') return null", "if (!linha || typeof linha.tempo_fabricacao_min !== 'number') return { minutos: 0, origem: null }")], 'nunca zero'),
 ('L10', 'a espessura pega o número que casa, mesmo com outro no texto', LC, [("    if (numeros.length !== 1) return null\n", "")], '4+4'),
 ('L11', 'com duas serras, vale a primeira', LC, [("if (valores.length === 1) return { ok: true, serra_mm: valores[0] }", "if (valores.length >= 1) return { ok: true, serra_mm: valores[0] }")], 'DUAS SERRAS'),
 ('L12', 'a recusa cala as faltas além da oitava', LC, [("const resto = faltas.length > MAXIMO_DE_FALTAS ? [`• e mais ${faltas.length - MAXIMO_DE_FALTAS} falta(s) do mesmo levantamento.`] : []", "const resto: string[] = []")], 'nenhuma calada'),
 ('L13', 'a recusa sai com o prefixo técnico da esquadria', LC, [("r.recusas.map((x) => maiuscula(semPrefixoDaEsquadria(x.mensagem)))", "r.recusas.map((x) => x.mensagem)")], 'sem o prefixo de esquadria'),
 ('L14', 'o total ausente não diz o que falta', LC, [("    linhas.push(t.total_por_barra_inteira === null\n", "    linhas.push(false\n")], 'PREÇO AUSENTE'),
 ('L15', 'a lista que não existe vira lista vazia', LC, [("    if (erroDaLista) return {", "    if (false) return {")], 'LISTA AINDA NÃO EXISTE'),
 ('L16', 'a despesa da mão de obra é sempre a da industrialização', LC, [("segmentoDaDespesa: segmento === 'SERVICO' ? 'SERVICO' : 'INDUSTRIALIZACAO',", "segmentoDaDespesa: 'INDUSTRIALIZACAO',")], 'o segmento decide'),
 ('L17', 'a despesa da mão de obra é sempre a do serviço (soma administrativa e fixa)', LC, [("segmentoDaDespesa: segmento === 'SERVICO' ? 'SERVICO' : 'INDUSTRIALIZACAO',", "segmentoDaDespesa: 'SERVICO',")], 'NÃO entram'),
 ('L18', 'carga horária ausente vira mão de obra zero', LC, [("    if (carga.isUnset) faltas.push('a carga horária mensal da empresa não está configurada')\n", "")], 'nunca zero'),
 ('L19', 'só a primeira falta da mão de obra sai', LC, [("return { ok: false, falta: faltas.join('; ') }", "return { ok: false, falta: faltas[0] ?? '' }")], 'sem tenant_settings'),
 ('L20', 'os totais de material não são arredondados antes da diferença', LC, [("const barra = t.total_por_barra_inteira === null ? null : centavos(t.total_por_barra_inteira)", "const barra = t.total_por_barra_inteira")], 'o texto inteiro'),
 ('L21', 'o total com mão de obra esquece a mão de obra', LC, [("formatarReais(centavos(material + calculada.total))", "formatarReais(centavos(material))")], 'o texto inteiro'),
 ('L22', 'a mão de obra não multiplica pela quantidade', LC, [("total: centavos(motor.productiveLaborCost * quantidade),", "total: motor.productiveLaborCost,")], 'a quantidade multiplica'),
 ('L23', 'o levantamento volta à cor fixa BRANCO', LC, [("        cor,\n        esquadrias:", "        cor: 'BRANCO',\n        esquadrias:")], 'PRETO TEXTURADO'),
 ('L24', 'a cor do perfil aceita qualquer texto', PD, [("            return typeof v === 'string' && cores.includes(v) ? v : undefined", "            return textoValido(v) ? (v as string).trim() : undefined")], 'não é BRANCO'),
 ('L25', 'as cores não vão ao prompt', CV, [("${cores.length ? cores.join(', ') : '(nenhuma)'}", "(nenhuma)")], 'a lista de cores vai ao prompt'),
 ('L26', 'sem lista de cores, a conversa pergunta a cor assim mesmo', CV, [("const semCores = proximo === 'cor_perfil' && cores.length === 0", "const semCores = false")], 'SEM LISTA DE CORES'),
 ('L27', 'as cores são lidas de todas as empresas', LC, [(".from('orcamentista_mp_categoria').select('config').eq('tenant_id', tenantId).eq('categoria_chave', 'PERFIL')", ".from('orcamentista_mp_categoria').select('config').eq('categoria_chave', 'PERFIL')")], 'outro tenant'),
 ('L28', 'sem cor, o levantamento segue', LC, [("    if (cor === null) return recusa(['Falta: a cor do perfil.'])\n", "")], 'SEM COR'),
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
