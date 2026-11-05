#!/usr/bin/env python3
"""
O CASO DA MARIA CRISTINA (05/11/2026) — as MUTAÇÕES DO CÓDIGO. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.
(As mutações da MIGRAÇÃO 20261105000001 estão em `../varias-montagens/mutacoes.py`, contra um Postgres local.)

Cada mutação estraga UMA regra das decisões A e B do dono do produto em `conversa-da-ia.ts`, `pergunta-em-aberto.ts`,
`levantamento-da-conversa.ts`, `pre-definicao.ts`, `tipologia-padrao.ts` ou `levantamento-em-montagem.ts`, e roda a suíte da
conversa. A mutação tem de DERRUBAR pelo menos um caso, e o caso exigido (5º elemento) tem de aparecer na saída da falha
(`teste-que-nao-exercita.md`). O arquivo-alvo é mutado no lugar, com `.bak`, e conferido por sha256 no fim; o script
recusa rodar com o alvo sujo. NÃO COMMITE enquanto ele roda.

Uso:   python3 -B scripts/harness/levantamento-por-nome/mutacoes-maria.py          (todas)
       python3 -B scripts/harness/levantamento-por-nome/mutacoes-maria.py M3 M8    (só estas)
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
PA = 'src/lib/atendimentos-ia/pergunta-em-aberto.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
PD = 'src/lib/atendimentos-ia/pre-definicao.ts'
TP = 'src/lib/atendimentos-ia/tipologia-padrao.ts'
LM = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
T = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
CONTROLE = 'M0'

M = [
 # A — a montagem lê a mensagem
 ('M1', 'outro cliente NÃO sai da montagem (o caso real volta)', CV, [("const outroCliente = emMontagem !== undefined && nomeNaMensagem !== null &&", "const outroCliente = false && emMontagem !== undefined && nomeNaMensagem !== null &&")], 'O CASO REAL: com o "Jorge Koss" em montagem'),
 ('M2', '"novo" NÃO sai da montagem', CV, [("const pedeNovo = emMontagem !== undefined && proposta.novo === true", "const pedeNovo = false")], '"novo" sem nome sai da montagem'),
 ('M3', 'o nome é comparado COM caixa e acento (Maria ≠ maria)', CV, [("normalizarNome(nomeSemPrefixo(nomeNaMensagem)) !== normalizarNome(emMontagem.nome)", "nomeSemPrefixo(nomeNaMensagem) !== emMontagem.nome")], 'o MESMO nome do levantamento em montagem continua nele'),
 ('M4', 'o log não registra montagem=outro_cliente', CV, [("rastro.montagem = pedeNovo ? 'novo' : 'outro_cliente'", "rastro.montagem = pedeNovo ? 'novo' : '-'")], 'montagem=outro_cliente'),
 # A — a montagem expira em 24 h
 ('M5', 'a montagem nunca expira', PA, [("export const montagemExpirou = (atualizadoEm: unknown, criadoEm: unknown, agora: Date): boolean =>\n    perguntaExpirou(", "export const montagemExpirou = (atualizadoEm: unknown, criadoEm: unknown, agora: Date): boolean =>\n    false && perguntaExpirou(")], 'a montagem EXPIRA em 24 h sem toque'),
 ('M6', 'a montagem expira pelo criado_em, ignorando o toque', PA, [("perguntaExpirou(typeof atualizadoEm === 'string' && atualizadoEm !== '' ? atualizadoEm : criadoEm, agora)", "perguntaExpirou(criadoEm, agora)")], 'a montagem sem atualizado_em expira pelo criado_em'),
 ('M7', 'com várias montagens vivas, a mensagem cai na mais ANTIGA', CV, [(".sort((a, b) => toque(b) - toque(a))", "")], 'com DUAS montagens vivas do mesmo vendedor'),
 # B — a cor predominante
 ('M8', 'a predominante é gravada como cadastrada, não como está na lista', LC, [("if (naLista !== undefined) corPredominante = naLista", "if (naLista !== undefined) corPredominante = predominante")], '"BRANCO" cadastrado vira "Branco"'),
 ('M9', 'a predominante fora da lista é usada mesmo assim', LC, [("if (naLista !== undefined) corPredominante = naLista", "corPredominante = naLista ?? predominante")], 'a predominante que não está na lista é como se não houvesse'),
 ('M10', 'a predominante sobrescreve a cor DITA', CV, [("if (item.cor_perfil === null && corPredominante !== null) { item.cor_perfil = corPredominante;", "if (corPredominante !== null) { item.cor_perfil = corPredominante;")], 'a cor DITA vence a predominante'),
 ('M11', 'a predominante entra na esquadria que não diz nada', CV, [("            if (!dizAlgo(item)) continue\n", "")], 'o item vazio não ganha cor'),
 # B — a pergunta fixa pelo já dito
 ('M12', 'a pergunta fixa ignora o já dito (sempre "É janela ou porta?")', PD, [("if (jaDito.abertura && jaDito.tipo) return PERGUNTAS_COM_TUDO_DITO", "if (false) return PERGUNTAS_COM_TUDO_DITO"), ("if (jaDito.abertura) return PERGUNTAS_COM_ABERTURA_DITA", "if (false) return PERGUNTAS_COM_ABERTURA_DITA"), ("if (jaDito.tipo) return PERGUNTAS_COM_TIPO_DITO", "if (false) return PERGUNTAS_COM_TIPO_DITO")], '"janela maxim ar 60 x 60" sem tipologia'),
 ('M13', 'a conversa não passa o já dito às pendências', CV, [("return await falar(perguntaPara(pendencias, aplicada.itens.length, proposta, filtro.jaDito), 'perguntou')", "return await falar(perguntaPara(pendencias, aplicada.itens.length, proposta), 'perguntou')")], 'a pergunta é a de obra SEM o "janela ou porta"'),
 # B — a tipologia padrão no código
 ('M14', 'folhas ditas ≠ 2 não tiram o padrão', TP, [("if (folhas.some((n) => n !== 2)) return { motivo: 'FOLHAS_DITAS' }", "if (false) return { motivo: 'FOLHAS_DITAS' }")], 'o que tira o padrão'),
 ('M15', 'persiana/bandeira/trilho não tiram o padrão', TP, [("if (dela.some((t) => FORA_DO_PADRAO.test(semAcento(t.texto)))) return { motivo: 'FORA_DO_PADRAO' }", "if (false) return { motivo: 'FORA_DO_PADRAO' }")], 'o que tira o padrão'),
 ('M16', 'com duas lisas, escolhe a primeira', TP, [("if (lisas.length !== 1) return { motivo: 'CANDIDATAS' }", "if (lisas.length === 0) return { motivo: 'CANDIDATAS' }")], 'duas lisas (duas linhas) também não'),
 ('M17', 'fora dos limites ganha o padrão mesmo assim', TP, [("if (!cabeNosLimites(lisas[0], item)) return { motivo: 'LIMITES' }", "if (false) return { motivo: 'LIMITES' }")], 'o que tira o padrão'),
 ('M18', 'janela sem tipo ganha a de correr', TP, [("if (abertura === 'janela' && !correr) return { motivo: 'JANELA_SEM_TIPO' }", "if (false) return { motivo: 'JANELA_SEM_TIPO' }")], 'janela SEM o tipo não tem padrão'),
 ('M19', 'porta de abrir (tipo Giro) ganha a de correr', TP, [("if (tipos.size > 0 && (!correr || tipos.size > 1)) return { motivo: 'TIPO_NAO_E_CORRER' }", "if (false) return { motivo: 'TIPO_NAO_E_CORRER' }")], 'as funções: folhasDitas, FORA_DO_PADRAO e tipologiaPadrao'),
 ('M20', 'a conversa não aplica o padrão', CV, [("if ('tipologia' in padrao) { item.tipologia = padrao.tipologia; rastro.tipologiasPadrao += 1 }", "if (false) { item.tipologia = padrao.tipologia; rastro.tipologiasPadrao += 1 }")], 'porta de correr sem folhas ditas, sem nada fora do padrão'),
 # a esquadria com tipologia e sem número
 ('M21', 'a esquadria com tipologia cai na primeira sem tipologia, tocada ou não', LM, [("alvo = itens.find((i) => i.tipologia === null && !tocadas.has(i.ordem))", "alvo = itens.find((i) => i.tipologia === null)")], 'O CASO REAL FECHADO num turno'),
 # a maxim-ar padrão (DP-01, dono do produto, 05/11/2026)
 ('M22', 'a maxim-ar não tem padrão', TP, [("if (maximAr && abertura === 'janela' && tipos.size === 1) return padraoDaMaximAr(item, dela, candidatos)", "")], 'A MAXIM-AR PADRÃO'),
 ('M23', 'a maxim-ar com outro tipo no trecho ganha o padrão', TP, [("if (maximAr && abertura === 'janela' && tipos.size === 1)", "if (maximAr && abertura === 'janela')")], 'tipologiaPadrao com os motivos nomeados'),
 ('M24', 'bandeira/módulos/travessa não tiram o padrão da maxim-ar', TP, [("if (dela.some((t) => FORA_DA_MAXIM_AR.test(semAcento(t.texto)))) return { motivo: 'FORA_DO_PADRAO' }", "")], 'o que tira o padrão da maxim-ar'),
 ('M25', '2 folhas não tiram o padrão da maxim-ar', TP, [("if (folhas.some((n) => n > 1)) return { motivo: 'FOLHAS_DITAS' }", "")], 'o que tira o padrão da maxim-ar'),
 ('M26', 'sem a DP-01, a maxim-ar escolhe a primeira maxim-ar do motor', TP, [("const dp01 = candidatos.filter((c) => c.tipologia === PADRAO_DA_MAXIM_AR)
    if (dp01.length === 0) return { motivo: 'CANDIDATAS' }
    if (!dp01.some((c) => cabeNosLimites(c, item))) return { motivo: 'LIMITES' }
    return { tipologia: PADRAO_DA_MAXIM_AR }", "const dp01 = candidatos.filter((c) => /maxim/i.test(c.tipo ?? ''))
    if (dp01.length === 0) return { motivo: 'CANDIDATAS' }
    if (!dp01.some((c) => cabeNosLimites(c, item))) return { motivo: 'LIMITES' }
    return { tipologia: dp01[0].tipologia }")], 'nunca "a maxim-ar mais parecida"'),
 ('M27', 'a maxim-ar fora dos limites ganha o padrão', TP, [("if (!dp01.some((c) => cabeNosLimites(c, item))) return { motivo: 'LIMITES' }", "")], 'tipologiaPadrao com os motivos nomeados'),
 ('M28', 'a maxim-ar na palavra "porta" ganha o padrão', TP, [("if (maximAr && abertura === 'janela' && tipos.size === 1)", "if (maximAr && tipos.size === 1)")], 'tipologiaPadrao com os motivos nomeados'),
 ('M0', 'CONTROLE: nada muda', CV, []),
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
            if n != 1:
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
        linhas = [l for l in out.split('\n') if l.startswith('Tests:')]
        testes = linhas[0] if linhas else ''
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
        print(f'{veredito:12} {ident:4} {desc} | ' + ' | '.join(linhas), flush=True)
        if exige:
            print(f'       exige na saída: {exige!r} — ' + ('apareceu' if exige in out else 'NÃO apareceu'), flush=True)
        for f in caidos[:3]:
            print('      ', f[:170], flush=True)
        if ident == CONTROLE:
            if veredito != 'NAO DERRUBOU':
                print(f'FALHOU: o controle {CONTROLE} não saiu verde — a suíte está vermelha sem mutação nenhuma')
                sobreviveu.append(ident)
        elif veredito != 'VERMELHO':
            sobreviveu.append(ident)
    for a in alvos:
        if hash_de(a) != antes[a]:
            print(f'ALVO ALTERADO DEPOIS DAS MUTAÇÕES: {a} — restaure antes de commitar')
            return 2
    total = len([m for m in M if not pedidas or m[0] in pedidas])
    print(f'{total - len(sobreviveu)} de {total} como esperado; sobreviveram: {sobreviveu or "nenhuma"}')
    return 1 if sobreviveu else 0


if __name__ == '__main__':
    sys.exit(principal())
