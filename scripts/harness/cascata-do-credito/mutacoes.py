#!/usr/bin/env python3
"""
As MUTAÇÕES da cascata do crédito (dono do produto, 09/11/2026 — `docs/regras/custo-liquido-por-fracao.md`): `recalcularBloco` e
`custoLiquidoDaFracao` em `src/utils/atendimentos-ia-bloco-tributario.ts`. Cada uma estraga UMA coisa no arquivo de verdade, roda as suítes e
DESFAZ (o arquivo volta byte a byte, também se o processo cair). Morta = alguma suíte vermelha. M0 é o controle.

Roda SOZINHO ou numa worktree (`docs/regras/mutacao-na-arvore-de-trabalho.md`): nada lê a árvore enquanto ele roda.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py C1 C7      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
BLOCO = 'src/utils/atendimentos-ia-bloco-tributario.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-bloco-tributario.test.ts', 'src/utils/__tests__/atendimentos-ia-layout-unico.test.ts',
          'src/utils/__tests__/atendimentos-ia-importar-rota.test.ts']

MUTACOES = [
    ('C1', BLOCO, 'o PIS/COFINS sobre o BRUTO, não sobre o saldo (a soma do #208 volta)', "    const pis = (saldo * b.cred_pis_cofins_pct) / 100\n", "    const pis = (custo * b.cred_pis_cofins_pct) / 100\n"),
    ('C2', BLOCO, 'o IPI creditável dentro da cascata (sobre o saldo)', "    const ipiCreditado = b.cred_ipi_pct === null ? 0 : (custo * b.cred_ipi_pct) / 100\n",
     "    const ipiCreditado = b.cred_ipi_pct === null ? 0 : (saldo * b.cred_ipi_pct) / 100\n"),
    ('C3', BLOCO, 'o IPI sem crédito não compõe o custo', "custo_liquido: custo - credito_valor + ipiSemCredito }", "custo_liquido: custo - credito_valor }"),
    ('C4', BLOCO, 'o IPI sem crédito abate em vez de compor', "custo_liquido: custo - credito_valor + ipiSemCredito }", "custo_liquido: custo - credito_valor - ipiSemCredito }"),
    ('C5', BLOCO, 'sem o PIS/COFINS a cascata não para no ICMS', "    if (b.cred_pis_cofins_pct === null) return { ok: false, faltam, ate_o_icms: saldo }\n", ""),
    ('C6', BLOCO, 'o saldo do ICMS errado na parada', "ate_o_icms: saldo }", "ate_o_icms: custo }"),
    ('C7', BLOCO, 'credito_pct nominal (a soma dos percentuais) em vez do efetivo', "credito_pct: custo === 0 ? 0 : (credito_valor / custo) * 100,",
     "credito_pct: b.cred_icms_pct + b.cred_pis_cofins_pct + (b.cred_ipi_pct ?? 0),"),
    ('C8', BLOCO, 'IBS e CBS acima de 0 passam calados', "        else if (v !== 0) faltam.push(", "        else if (false) faltam.push("),
    ('C9', BLOCO, 'IBS e CBS vazios passam (viram 0)', "        if (v === null) faltam.push(c)\n", "        if (false) faltam.push(c)\n"),
    ('C10', BLOCO, 'sem o ICMS a cascata começa assim mesmo', "    if (custo === null || b.cred_icms_pct === null) return { ok: false, faltam }\n", "    if (custo === null) return { ok: false, faltam }\n"),
    ('C11', BLOCO, 'o IPI pelo par deixa de ser exigido', "    if (b.cred_ipi_pct === null && b.nc_ipi_pct === null) faltam.push(", "    if (false) faltam.push("),
    ('C12', BLOCO, 'a fração divide por medida zero', "medidaDaUnidade <= 0) return null", "medidaDaUnidade < 0) return null"),
    ('C13', BLOCO, 'a fração multiplica em vez de dividir', "    return custoLiquidoDaUnidade / medidaDaUnidade\n", "    return custoLiquidoDaUnidade * medidaDaUnidade\n"),
    ('C14', BLOCO, 'a fração sem medida devolve o líquido inteiro', "    if (medidaDaUnidade === null || !Number.isFinite(medidaDaUnidade) || medidaDaUnidade <= 0) return null\n",
     "    if (medidaDaUnidade === null || !Number.isFinite(medidaDaUnidade) || medidaDaUnidade <= 0) return custoLiquidoDaUnidade\n"),
    ('C15', BLOCO, 'o ICMS sobre o saldo de si mesmo (base errada)', "    const icms = (custo * b.cred_icms_pct) / 100\n", "    const icms = (custo * b.cred_icms_pct) / 100 / 2\n"),
]
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((i, [(a, open(os.path.join(RAIZ, a), encoding='utf-8').read(), v, n)]) for i, a, _d, v, n in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda")
        vivas += 0 if verde else 1
    for ident, arquivo, descricao, velho, novo in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        caminho = os.path.join(RAIZ, arquivo)
        original = open(caminho, encoding='utf-8').read()
        if original.count(velho) != 1:
            raise SystemExit(f'{ident}: o trecho aparece {original.count(velho)} vez(es) em {arquivo} — a mutação precisa ser revista')
        try:
            open(caminho, 'w', encoding='utf-8').write(original.replace(velho, novo))
            morta = jest() != 0
        finally:
            open(caminho, 'w', encoding='utf-8').write(original)
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}")
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
