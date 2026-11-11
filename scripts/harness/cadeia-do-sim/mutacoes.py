#!/usr/bin/env python3
"""
As MUTAÇÕES da CADEIA DO "SIM" ligada na conversa (11/11/2026): o destino (o DONO do levantamento, nunca quem disse "sim"), "sem preço não há
PDF", o texto ao vendedor, a etapa chamada depois do cálculo, a gravação como AGENTE (sem marca manual, arquivo 'agente') e o tenant da leitura
do dono. Os juízes são as suítes da conversa, da travessia, da etapa e do servidor. M0 é o controle. Roda numa worktree
(`mutacao-na-arvore-de-trabalho.md`) e confere todo trecho antes (`mutacao-que-nao-se-aplica.md`).
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
CONVERSA = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
CADEIA = 'src/lib/atendimentos-ia/cadeia-do-sim.ts'
TRAVESSIA = 'src/lib/atendimentos-ia/travessia-do-levantamento.ts'
ARQUIVO = 'src/lib/atendimentos-ia/arquivo-do-orcamento-servidor.ts'
GRAVADOR = 'src/lib/atendimentos-ia/orcamento-precificado.ts'
SUITES = [
    'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts',
    'src/utils/__tests__/atendimentos-ia-travessia-do-levantamento.test.ts',
    'src/utils/__tests__/atendimentos-ia-cadeia-do-sim.test.ts',
    'src/utils/__tests__/atendimentos-ia-preco-do-orcamento-servidor.test.ts',
    'src/utils/__tests__/atendimentos-ia-arquivo-do-orcamento-servidor.test.ts',
]

MUTACOES = [
    ('D1', 'o PDF vai a quem disse "sim", não ao dono do levantamento', [(CONVERSA, 'enviarAoPrimeiroQueAceitar(destinosDoWhatsApp(telefone, c.telefone),', 'enviarAoPrimeiroQueAceitar([c.telefone],')]),
    ('D9', 'o dono que NÃO é quem está na conversa recebe no número da conversa', [(CADEIA, '    return telefonesCasam(telefoneDaConversa, telefoneDoDono) ? [telefoneDaConversa] : normalizePhoneBR(telefoneDoDono)', '    return [telefoneDaConversa]')]),
    ('D10', 'o envio não para no primeiro número que aceitou', [(CADEIA, '        if (ultimo.ok) return ultimo\n', '')]),
    ('D2', 'sem preço formado, a etapa segue para o arquivo', [(CADEIA, "    if ('faltas' in p) {", "    if (false) {")]),
    ('D3', 'o texto da etapa não chega ao vendedor', [(CONVERSA, '            if (sim.paraOVendedor) return await responder(', '            if (false) return await responder(')]),
    ('D4', 'a etapa do preço não é chamada depois do cálculo', [(TRAVESSIA, '        const etapa = await etapaDoPreco(r.orcamento.id)', "        const etapa = { rastro: '', paraOVendedor: null as string | null }")]),
    ('D5', 'o arquivo do agente sai como manual', [(ARQUIVO, "gerado_origem: autor ? 'manual' : 'agente'", "gerado_origem: 'manual'")]),
    ('D6', 'o agente marca edição manual', [(GRAVADOR, '...(autor ? { editado_manualmente_em: agora.toISOString(), editado_manualmente_por: autor } : {})', "editado_manualmente_em: agora.toISOString(), editado_manualmente_por: autor ?? 'agente'")]),
    ('D7', 'o dono é lido sem o tenant do levantamento', [(CADEIA, ".select('remetente_id').eq('tenant_id', tenantId).eq('id', orc.levantamento_id)", ".select('remetente_id').eq('id', orc.levantamento_id)")]),
    ('D8', 'a falha do envio é lida como sucesso', [(CADEIA, '    if (!envio.ok) {', '    if (false) {')]),
]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


# D1 é EQUIVALENTE, medido em 11/11/2026: a conversa só confirma o levantamento do PRÓPRIO remetente (o "sim" de outro não atravessa — o caso
# "o levantamento de OUTRO remetente" da conversa prova), então quem diz "sim" é sempre o dono, e o número da conversa É o do dono. O destino de
# um dono diferente da conversa é a D9, que morre no portão de `destinosDoWhatsApp`.
EQUIVALENTES: set = {'D1'}


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
        vivas += 0 if verde else 1
    for ident, descricao, trocas in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        originais = {a: open(os.path.join(RAIZ, a), encoding='utf-8').read() for a, _de, _para in trocas}
        try:
            novos = dict(originais)
            for a, de, para in trocas:
                novos[a] = novos[a].replace(de, para)
            for a, t in novos.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
            morta = jest() != 0
        finally:
            for a, t in originais.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
        if ident in EQUIVALENTES:
            print(f"{'morta   ' if morta else 'equival.'} {ident}: {descricao}", flush=True)
            continue
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
