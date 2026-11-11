#!/usr/bin/env python3
"""
As MUTAÇÕES do TELEFONE NO FORMATO DO CANAL (dono do produto, 11/11/2026), a ordem de autoridade: (a) o MEDIDO — o webhook — vence; (b) o
PALPITE por DDD (até 30 mantém o nono, 31 em diante descarta) só se nunca falou; (c) o envio ACEITO vira medição. E as guardas do registro:
só o mesmo número, só se mudou, conferindo o anterior. M0 é o controle. Roda numa worktree (`mutacao-na-arvore-de-trabalho.md`) e confere
todo trecho antes (`mutacao-que-nao-se-aplica.md`).
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
PURO = 'src/utils/atendimentos-ia-telefone-do-autorizado.ts'
MEDIDO = 'src/lib/atendimentos-ia/telefone-medido.ts'
EMPRESA = 'src/lib/atendimentos-ia/orcamentista-da-empresa.ts'
ENTRADA = 'src/pages/api/atendimentos-ia/inbound.ts'
CADEIA = 'src/lib/atendimentos-ia/cadeia-do-sim.ts'
SUITES = [
    'src/utils/__tests__/atendimentos-ia-celula-do-orcamentista.test.ts',
    'src/utils/__tests__/atendimentos-ia-telefone-medido.test.ts',
    'src/utils/__tests__/atendimentos-ia-inbound.test.ts',
    'src/utils/__tests__/atendimentos-ia-cadeia-do-sim.test.ts',
    'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts',
]

MUTACOES = [
    ('P1', 'o palpite descarta o nono também em São Paulo', [(PURO, '    const descartaONono = assinante.length === 9 && Number(ddd) >= 31', '    const descartaONono = assinante.length === 9 && Number(ddd) >= 11')]),
    ('P2', 'a fronteira: o DDD 31 mantém o nono', [(PURO, '    const descartaONono = assinante.length === 9 && Number(ddd) >= 31', '    const descartaONono = assinante.length === 9 && Number(ddd) > 31')]),
    ('P3', 'o palpite tira um dígito do fixo', [(PURO, '    const descartaONono = assinante.length === 9 && Number(ddd) >= 31', '    const descartaONono = Number(ddd) >= 31')]),
    ('A1', 'o medido é ignorado: sempre o palpite', [(PURO, "    if (medido) return { telefone: medido, origem: 'medido' }", "    if (false) return { telefone: medido as string, origem: 'medido' }")]),
    ('A2', 'a escrita da autorização não lê o que o canal entregou', [(EMPRESA, 'formatoDoCanal((tel as { telefone: string }).telefone, await numerosEntreguesPeloCanal(tenantId))', 'formatoDoCanal((tel as { telefone: string }).telefone, [])')]),
    ('A3', 'os números entregues vêm de todo tenant', [(MEDIDO, "        db().from('orcamentista_conversa').select('telefone').eq('tenant_id', tenantId),", "        db().from('orcamentista_conversa').select('telefone'),")]),
    ('A4', 'a entrada não grava o medido', [(ENTRADA, "                if (casam[0].telefone !== telefone.replace(/\\D/g, '')) rastro.telefone =", "                if (false) rastro.telefone =")]),
    ('C1', 'o envio aceito não vira medição', [(CADEIA, '    const medido = envio.destino && envio.destino !== dono.telefone ?', '    const medido = false ?')]),
    ('R1', 'o registro grava OUTRO número', [(MEDIDO, "    if (!/^\\d{10,13}$/.test(so) || !telefonesCasam(so, anterior)) return 'nao_casa'", "    if (!/^\\d{10,13}$/.test(so)) return 'nao_casa'")]),
    ('R2', 'o registro sobrescreve o que mudou antes', [(MEDIDO, ".eq('tenant_id', tenantId).eq('id', remetenteId).eq('telefone', anterior).select('id')", ".eq('tenant_id', tenantId).eq('id', remetenteId).select('id')")]),
    ('R3', 'o log leva o telefone', [(MEDIDO, "            console.error(`[ORCAMENTISTA telefone] remetente=${remetenteId} origem=${origem} registro=${r}`)\n            return r\n        }\n        const r: RegistroDoMedido = Array", "            console.error(`[ORCAMENTISTA telefone] remetente=${remetenteId} origem=${origem} registro=${r}`)\n            return r\n        }\n        console.error(`telefone=${so}`)\n        const r: RegistroDoMedido = Array")]),
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


EQUIVALENTES: set = set()


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
