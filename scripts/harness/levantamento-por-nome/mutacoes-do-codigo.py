#!/usr/bin/env python3
"""
HARNESS do LEVANTAMENTO POR NOME — as MUTAÇÕES DO CÓDIGO. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.
(As mutações da MIGRAÇÃO 20261025000003 estão em `mutacoes.py`, ao lado, contra um Postgres local.)

Cada mutação estraga UMA regra das quatro decisões do dono do produto (25/10/2026) em
`nome-do-levantamento.ts`, `levantamento-em-montagem.ts`, `conversa-da-ia.ts` ou `inbound.ts`, e roda
os portões. A mutação tem de DERRUBAR pelo menos um caso, e o caso exigido (5º elemento) tem de
aparecer na saída da falha (`teste-que-nao-exercita.md`).

O arquivo-alvo é mutado no lugar, com `.bak`, e conferido por sha256 no fim; o script recusa rodar com
o alvo sujo. NÃO COMMITE enquanto ele roda.

Tirar o filtro de tenant da LEITURA do user não é mutação aqui: a decisão pura confere o tenant de
novo, e a mutação seria equivalente. A conferência da decisão é a N20.

Uso:   python3 -B scripts/harness/levantamento-por-nome/mutacoes-do-codigo.py          (todas)
       python3 -B scripts/harness/levantamento-por-nome/mutacoes-do-codigo.py N3 N8   (só estas)
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

NM = 'src/lib/atendimentos-ia/nome-do-levantamento.ts'
LM = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
IN = 'src/pages/api/atendimentos-ia/inbound.ts'
PR = 'src/lib/atendimentos-ia/permissao-do-remetente.ts'
T = ['src/utils/__tests__/permissao-do-remetente.test.ts', 'src/utils/__tests__/nome-do-levantamento.test.ts', 'src/utils/__tests__/levantamento-em-montagem.test.ts',
     'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', 'src/utils/__tests__/atendimentos-ia-inbound.test.ts']
CONTROLE = 'N0'

M = [
 # decisão 1 — o nome: sem caixa e sem acento; parecido PERGUNTA, nunca decide
 ('N1', 'a normalização não tira o acento', NM, [(".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')", "")], 'casa do joao'),
 ('N2', 'a normalização não tira a caixa', NM, [(".toLowerCase()", "")], 'CASA DO JOÃO'),
 ('N3', 'o parecido vira IGUAL — decide por semelhança', NM, [("const igual = existentes.find((l) => l.nome_normalizado === forma)", "const igual = existentes.find((l) => l.nome_normalizado === forma || parecido(forma, l.nome_normalizado))")], 'Casa do João 2'),
 ('N4', 'o nome parcial não é parecido', NM, [("(contemPalavras(a, b) || contemPalavras(b, a))", "false")], 'PARCIAL'),
 ('N5', 'a distância de edição vale para nome curto', NM, [("Math.min(a.length, b.length) >= TAMANHO_MINIMO_PARA_DISTANCIA && ", "")], 'Lona'),
 ('N6', 'o nome que não está no texto é aceito', NM, [("return normalizarNome(texto).includes(normalizarNome(aparado)) ? aparado : null", "return aparado")], 'inventado'),
 ('N7', 'parecido sem "novo" cria em vez de perguntar', CV, [("} else if ('existentes' in comparacao && !novo) {", "} else if (false) {")], 'Casa do João 2'),
 ('N8', '"novo" com nome que já existe cria outro', CV, [("if (novo) { rastro.rota = 'NOME_EXISTE';", "if (false) { rastro.rota = 'NOME_EXISTE';")], 'JÁ existe'),
 # decisão 2 — só quem criou altera
 ('N9', 'os levantamentos de outro vendedor entram na comparação', CV, [(".eq('tenant_id', tenantId).eq('remetente_id', remetenteId)\n    if (soEmMontagem)", ".eq('tenant_id', tenantId)\n    if (soEmMontagem)")], 'OUTRO vendedor'),
 # decisão 3 — sobrescreve, e o rastro é atualizado_em
 ('N10', 'a alteração não grava atualizado_em', CV, [("update({ estado, atualizado_em: agora })", "update({ estado })")], 'ALTERAÇÃO do primeiro'),
 ('N11', 'com duas esquadrias, a alteração sem ordem cai na primeira', CV, [(": atuais.length === 1 ? atuais[0].ordem : null", ": atuais[0]?.ordem ?? null")], 'qual esquadria'),
 ('N12', 'a alteração não refaz: devolve o texto antigo', CV, [("const levantamento = await mensagemDoLevantamento(c.tenantId, tabela, { nome, itens: aplicada.itens })", "const levantamento = await mensagemDoLevantamento(c.tenantId, tabela, { nome, itens: alvo ? alvo.itens : aplicada.itens })")], 'refaz tudo'),
 # a montagem: o EM_MONTAGEM continua, e a LLM só vê esta mensagem
 ('N13', 'o levantamento em montagem é ignorado', CV, [("const [emMontagem] = await lerLevantamentos(c.tenantId, c.remetenteId, true)", "const [emMontagem] = [] as Levantamento[]")], 'a mensagem continua nele'),
 ('N14', 'a LLM não recebe a mensagem do vendedor', CV, [("messages: [{ role: 'user', content: mensagem }],", "messages: [{ role: 'user', content: '.' }],")], 'SÓ a mensagem desta vez'),
 ('N15', 'a proposta aceita esquadria sem ordem com duas e sem padrão', LM, [("        if (!alvo) { semEsquadria = true; continue }\n", "        if (!alvo) alvo = itens[0]\n")], 'SEM esquadria padrão'),
 # decisão 4 e o "sempre responde"
 ('N16', 'a entrada não conduz a conversa', IN, [("        await conduzirMensagem({", "        if (false) await conduzirMensagem({")], 'conduzida UMA vez'),
 ('N17', 'a entrada passa o texto errado', IN, [("telefone, texto, wuzapiToken:", "telefone, texto: '', wuzapiToken:")], 'o texto e o token'),
 # decisão 2, REVISTA — o admin da empresa também altera, com falha fechada
 ('N18', 'qualquer papel vira admin', PR, [("return e.user.role === PAPEL_DE_ADMIN ? { admin: true } : nao('NAO_E_ADMIN')", "return e.user.role ? { admin: true } : nao('NAO_E_ADMIN')")], 'super_admin'),
 ('N19', 'employees.user_id nulo não fecha', PR, [("    if (!e.employee.user_id) return nao('SEM_USER')\n    if (!e.user) return nao('USER_NAO_ACHADO')\n", "    if (!e.employee.user_id || !e.user) return { admin: true }\n")], 'user_id NULO'),
 ('N20', 'o tenant do user não é conferido', PR, [("    if (e.user.tenant_id !== tenantId) return nao('OUTRO_TENANT')\n", "")], 'OUTRO tenant'),
 ('N22', 'o não admin recebe a resposta que revela o outro dono', CV, [("if ('motivo' in rastro.admin) { rastro.rota = 'NAO_ENCONTRADO'; return await responder(fraseDeNaoEncontrei(lido), 'nao-encontrado') }", "if ('motivo' in rastro.admin && (await lerLevantamentosDaEmpresaPeloNome(c.tenantId, normalizarNome(lido))).length === 0) { rastro.rota = 'NAO_ENCONTRADO'; return await responder(fraseDeNaoEncontrei(lido), 'nao-encontrado') }")], 'a MESMA frase'),
 ('N23', 'com dois vendedores, o admin altera o mais recente', CV, [("if (doVendedor.length !== 1 && (daEmpresa.length > 1 || vendedorLido !== null)) {", "if (false) {"), ("const escolhido = doVendedor.length === 1 ? doVendedor[0] : daEmpresa[0]", "const escolhido = doVendedor.length === 1 ? doVendedor[0] : daEmpresa[daEmpresa.length - 1]")], 'DOIS vendedores'),
 ('N24', 'o vendedor dito não precisa estar no texto', CV, [("const vendedorLido = nomeDaMensagem(proposta.vendedor, c.texto)", "const vendedorLido = typeof proposta.vendedor === 'string' ? proposta.vendedor : null")], 'inventado'),
 ('N25', 'o admin monta o levantamento de outro (grava com pendência)', CV, [("if (pendencia && alvo && alvo.donoId !== c.remetenteId) {", "if (false) {")], 'INCOMPLETO'),
 ('N26', 'a alteração do admin passa o levantamento para o admin', CV, [("await gravarLevantamento(c.tenantId, alvo ? alvo.donoId : c.remetenteId,", "await gravarLevantamento(c.tenantId, c.remetenteId,")], 'continua do criador'),
 ('N27', 'o pedido de alteração é ignorado: cria em vez de procurar', CV, [("} else if (proposta.alteracao === true && !novo) {", "} else if (false) {")], 'não encontrei'),
 # 25/10/2026: R1, R2, decisão 3 (só grava o que mudou) e o DEFEITO 3
 ('N28', 'R1: o update do levantamento que não atinge linha passa calado', CV, [("        if ((data ?? []).length !== 1) throw new ErroAoGravar(`orcamentista_levantamento: o update atingiu", "        if (false) throw new ErroAoGravar(`orcamentista_levantamento: o update atingiu")], 'o mesmo para o update do levantamento'),
 ('N29', 'R1: o update da esquadria que não atinge linha passa calado', CV, [("        if ((tocados ?? []).length !== 1) throw", "        if (false) throw")], 'NÃO atinge linha é erro'),
 ('N30', 'R2: a mesma pergunta volta como se nada fosse', CV, [("if (nadaMudou && rastro.rota === 'MONTAGEM' && pendenciaAberta) {", "if (false) {")], 'NÃO devolve a mesma pergunta'),
 ('N31', 'R2: a alteração que não valeu passa calada', CV, [("if (nadaMudou && aplicada.propostos > 0)", "if (false)")], 'o que foi proposto e não vale aparece'),
 ('N32', 'decisão 3: grava mesmo sem mudança', CV, [("if (!(nadaMudou && alvo && alvo.estado === estado)) {", "if (true) {")], 'NÃO toca o banco'),
 ('N33', 'DEFEITO 3: sem chave, silêncio', CV, [("if (!chave) return await responder(FALHA_SEM_CHAVE, 'sem-chave')", "if (!chave) return fim('sem-chave')")], 'falta a chave'),
 ('N34', 'DEFEITO 3: erro da LLM, silêncio', CV, [("            return await responder(frase, resposta.tipo, resposta.detalhe)", "            return fim(resposta.tipo, resposta.detalhe)")], 'a frase da falha'),
 ('N35', 'DEFEITO 3: erro do banco, silêncio', CV, [("        return await responder(frase, 'erro', `motivo=", "        return fim('erro', `motivo=")], 'nada foi gravado'),
 ('N0', 'controle: nada muda', NM, [("export", "export")]),
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
