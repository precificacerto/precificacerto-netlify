#!/usr/bin/env python3
"""
As MUTAÇÕES do cálculo do custo do orçamento I.A. por item (`src/lib/atendimentos-ia/custo-do-orcamento.ts`, 09/11/2026). Cada uma estraga UMA
regra no arquivo de verdade, roda a suíte e DESFAZ (o arquivo volta byte a byte, também se o processo cair). Morta = a suíte vermelha. M0 é o
controle. Roda SOZINHO ou numa worktree (`docs/regras/mutacao-na-arvore-de-trabalho.md`): nada lê a árvore enquanto ele roda.

Uso:   python3 -B mutacoes-do-calculo.py            (todas)
       python3 -B mutacoes-do-calculo.py K1 K3      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
CALCULO = 'src/lib/atendimentos-ia/custo-do-orcamento.ts'
SUITE = 'src/utils/__tests__/atendimentos-ia-custo-do-orcamento.test.ts'

MUTACOES = [
    ('K1', 'o rateio por metro global, não por código', "const parte = doItem.get(c)! / consumoTotal.get(c)!",
     "const parte = [...doItem.values()].reduce((a, b) => a + b, 0) / [...consumoTotal.values()].reduce((a, b) => a + b, 0)"),
    ('K2', 'sem ICMS o fallback barateia', "if (bloco.cred_icms_pct === null) return { liquido: bruto, nao_apurado }", "if (bloco.cred_icms_pct === null) return { liquido: bruto * 0.8, nao_apurado }"),
    ('K19', 'IBS/CBS nulos travam (a decisão de 02/11 lida ao pé da letra)', "filter((c) => bloco[c] !== null && bloco[c] !== 0)", "filter((c) => bloco[c] !== 0)"),
    ('K20', 'a cascata parcial descartada (sem PIS/COFINS volta ao bruto)', "if (r.ate_o_icms !== undefined) return { liquido: r.ate_o_icms, nao_apurado }", "if (r.ate_o_icms !== undefined) return { liquido: bruto, nao_apurado }"),
    ('K21', 'a falta não nomeia qual crédito', "`faltou no bloco tributario: ${faltam.join(', ')}`", "'faltou no bloco tributario'"),
    ('K22', 'o percentual que ninguém informou vira 0 no item', "linhas.every((l) => l[p] === null) ? null : ", ""),
    ('K23', 'IBS/CBS acima de zero passam sem recusa', "    if (ivaAcimaDeZero.length) return { recusa: fraseDoIvaSemLugar(codigo, ivaAcimaDeZero) }\n", ""),
    ('K25', 'o par do IPI desconhecido não entra na falta', "    if (semIpi) faltam.push(PAR_DO_IPI_DESCONHECIDO)\n", ""),
    ('K26', 'a cascata cheia apaga a falta do IPI', "    if (!('faltam' in r)) return { liquido: r.custo_liquido, nao_apurado }", "    if (!('faltam' in r)) return { liquido: r.custo_liquido, nao_apurado: null }"),
    ('K24', 'a cascata parcial sem a falta', "if (r.ate_o_icms !== undefined) return { liquido: r.ate_o_icms, nao_apurado }", "if (r.ate_o_icms !== undefined) return { liquido: r.ate_o_icms, nao_apurado: null }"),
    ('K3', 'a fabricação entra no custo da precificação (a dupla contagem)', "totalItemsCost: itens.reduce((t, i) => t + i.custo_liquido_materiais, 0)", "totalItemsCost: itens.reduce((t, i) => t + i.custo_liquido_total, 0)"),
    ('K4', 'a fabricação sem o valor do minuto', "const fabricacao = minutos * (e.valor_minuto as number)", "const fabricacao = minutos"),
    ('K5', 'o total do item sem a fabricação', "custo_liquido_total: liquido + fabricacao", "custo_liquido_total: liquido"),
    ('K6', 'o valor do minuto invertido', "    return custoMensal / minutosDaEmpresa\n", "    return minutosDaEmpresa / custoMensal\n"),
    ('K7', 'o código sem preço não recusa', "recusas.push(fraseSemPreco(c))", "void 0"),
    ('K8', 'a tipologia sem tempo não recusa', "recusas.push(fraseSemTempo(it.referencia))", "void 0"),
    ('K9', 'o efetivo do item afirmado com crédito não apurado', "if (bruto <= 0 || linhas.some((l) => l.credito_nao_apurado !== null)) return nulos", "if (bruto <= 0) return nulos"),
    ('K10', 'o consumo em milímetros', "consumo_item: doItem.get(c)! / 1000", "consumo_item: doItem.get(c)!"),
    ('K11', 'o PIS/COFINS sobre o bruto no efetivo', "soma.cred_pis_cofins_pct += ((b - icms) *", "soma.cred_pis_cofins_pct += ((b) *"),
    ('K12', 'o bruto do material sem as barras do pedido', "custo_bruto_material: barras * bruto * parte", "custo_bruto_material: bruto * parte"),
    ('K13', 'a fração pelo bruto', "custo_liquido_fracao: custoLiquidoDaFracao(u.liquido, u.m.medida_barra_m)", "custo_liquido_fracao: custoLiquidoDaFracao(bruto, u.m.medida_barra_m)"),
    ('K14', 'o fallback com aproveitamento', "export const MODO_DO_FALLBACK = 'SEM' as const", "export const MODO_DO_FALLBACK = 'COM' as const"),
    ('K15', 'o código consumido sem barras não recusa', "        if (!Number.isInteger(n) || n <= 0) recusas.push(fraseSemBarras(c))\n", ""),
    ('K16', 'sem valor do minuto não recusa', "recusas.push(FRASE_SEM_VALOR_DO_MINUTO)", "void 0"),
    ('K17', 'o líquido do material pelo bruto', "custo_liquido_material: barras * u.liquido * parte", "custo_liquido_material: barras * bruto * parte"),
    ('K18', 'os minutos somados deixam de ser os do item', "productWorkloadMinutes: itens.reduce((t, i) => t + i.tempo_fabricacao_min, 0)", "productWorkloadMinutes: itens.length ? itens[0].tempo_fabricacao_min : 0"),
]


def suite_verde():
    r = subprocess.run(['npx', 'jest', SUITE, '--silent'], cwd=RAIZ, capture_output=True, text=True)
    return r.returncode == 0


def main():
    pedidas = set(sys.argv[1:])
    caminho = os.path.join(RAIZ, CALCULO)
    original = open(caminho, encoding='utf-8').read()
    vivas = 0
    try:
        if not pedidas or 'M0' in pedidas:
            verde = suite_verde()
            print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda")
            vivas += 0 if verde else 1
        for ident, descricao, velho, novo in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            if original.count(velho) != 1:
                raise SystemExit(f'{ident}: o trecho aparece {original.count(velho)} vez(es): {velho[:70]}')
            open(caminho, 'w', encoding='utf-8').write(original.replace(velho, novo))
            try:
                morta = not suite_verde()
            finally:
                open(caminho, 'w', encoding='utf-8').write(original)
            print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}")
            vivas += 0 if morta else 1
    finally:
        open(caminho, 'w', encoding='utf-8').write(original)
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
