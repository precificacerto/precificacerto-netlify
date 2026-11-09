#!/usr/bin/env python3
"""
As MUTAÇÕES do 1b, lado do servidor (dono do produto, 09/11/2026): o custo do orçamento pelo caminho completo
(`custo-do-orcamento-servidor.ts`), a gravação (`orcamento-calculado.ts`), a rota de calcular e a separação do cálculo do levantamento
(`levantamento-da-conversa.ts`). Cada uma estraga UMA coisa no arquivo de verdade, roda as suítes e DESFAZ (o arquivo volta byte a byte,
também se o processo cair). Morta = alguma suíte vermelha. M0 é o controle. Roda SOZINHO ou numa worktree
(`docs/regras/mutacao-na-arvore-de-trabalho.md`): nada lê a árvore enquanto ele roda.

Uso:   python3 -B mutacoes-do-codigo.py            (todas)
       python3 -B mutacoes-do-codigo.py S1 G3      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
SERV = 'src/lib/atendimentos-ia/custo-do-orcamento-servidor.ts'
GRAV = 'src/lib/atendimentos-ia/orcamento-calculado.ts'
ROTA = 'src/pages/api/atendimentos-ia/orcamentos/[id]/calcular.ts'
LEV = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
SUITES = ['src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/atendimentos-ia-orcamento-calculado.test.ts',
          'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']

MUTACOES = [
    ('S1', SERV, 'o tempo do item sem a quantidade', "minutos: m && 'minutosPorUnidade' in m ? m.minutosPorUnidade * m.quantidade : null,", "minutos: m && 'minutosPorUnidade' in m ? m.minutosPorUnidade : null,"),
    ('S2', SERV, 'a recusa da conversa é ignorada', "    if (mensagem.desfecho !== 'levantou') return { ok: false, recusas: [mensagem.texto] }\n", ""),
    ('S3', SERV, 'a família sem etapa de cálculo passa', "        if ('semCalculo' in calculo) { recusas.push(fraseDaFamiliaSemCalculo(g.familia.rotulo)); return }\n", "        if ('semCalculo' in calculo) return\n"),
    ('S4', SERV, 'o bloco da tabela não chega ao custo', "    const bloco = Object.fromEntries(PERCENTUAIS.map((p) => [p, numeroOuNulo((i as Record<string, unknown>)[p])])) as Percentuais", "    const bloco = Object.fromEntries(PERCENTUAIS.map((p) => [p, null])) as Percentuais"),
    ('S5', SERV, 'o valor do minuto ausente vira 0', "        const valor = fechada ? valorDoMinuto(fechada.custoMensal, fechada.minutosDaEmpresa) : null", "        const valor = fechada ? valorDoMinuto(fechada.custoMensal, fechada.minutosDaEmpresa) : 0"),
    ('S6', SERV, 'as barras do pedido trocadas pela primeira', "            barras_por_codigo: calculo.r.total.barras_por_codigo,", "            barras_por_codigo: Object.fromEntries(Object.keys(calculo.r.total.barras_por_codigo).map((c) => [c, 1])),"),
    ('G1', GRAV, 'o material não é gravado', "        const { error } = await db().from(TABELA_DO_MATERIAL).insert(linhas)\n        if (error) falhou(TABELA_DO_MATERIAL, error)\n", ""),
    ('G2', GRAV, 'o update do item sem o tenant', ".eq('tenant_id', tenantId).eq('orcamento_id', id).eq('id', idDoItem).select('id')", ".eq('orcamento_id', id).eq('id', idDoItem).select('id')"),
    ('G3', GRAV, 'o item não atingido passa calado', "        if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ITEM}:", "        if (false) throw new Error(`${TABELA_DO_ITEM}:"),
    ('G4', GRAV, 'os congelados do levantamento não chegam', "            ...(congelados ? {", "            ...(false ? {"),
    ('G5', GRAV, 'o total bruto sem a fabricação', "const valor_total_bruto = custo.itens.reduce((t, c) => t + c.custo_bruto_materiais + c.custo_fabricacao, 0)", "const valor_total_bruto = custo.itens.reduce((t, c) => t + c.custo_bruto_materiais, 0)"),
    ('G6', GRAV, 'as escolhas lidas sem o tenant (o item de outra empresa)', ".select('id, escolhas, familia').eq('tenant_id', tenantId).in('id', idsDosItens)", ".select('id, escolhas, familia').in('id', idsDosItens)"),
    ('G7', GRAV, 'o modo gravado sem a origem do fallback', "aproveitamento_origem: ORIGEM_DO_FALLBACK,", "aproveitamento_origem: 'base_de_conhecimento',"),
    ('G8', GRAV, 'a coluna ausente vira 500', "    if (colunaAusente(error) || (tabela === TABELA_DO_MATERIAL && tabelaAusente(error))) throw new ErroSemMigracaoDoCalculo()\n", ""),
    ('G9', GRAV, 'o orçamento sem itens é calculado', "    if (orc.itens.length === 0) throw new ErroDoCalculo(['as esquadrias do orçamento: ele não tem nenhum item'])\n", ""),
    ('G10', GRAV, 'o cálculo grava o valor de venda', "            valor_total_bruto, valor_total_liquido, atualizado_em: calculado_em,", "            valor_total_bruto, valor_total_liquido, valor_venda: valor_total_liquido, atualizado_em: calculado_em,"),
    ('R1', ROTA, 'calcular só com permissão de ver', "chamadorDoOrcamentista(req, res, 'editar', MODULO_DO_ORCAMENTISTA)", "chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)"),
    ('R2', ROTA, 'a recusa do cálculo vira 500', "        if (e instanceof ErroDoCalculo) return res.status(422).json({ error: FRASE_DO_CALCULO_RECUSADO, recusas: e.recusas })\n", ""),
    ('R3', ROTA, 'o id sem conferir a forma', "        if (!UUID.test(id)) throw new ErroNaoEncontrado()\n", ""),
    ('L1', LEV, 'a leitura do item sem o bloco tributário', "'codigo, descricao, unidade, medida_barra_m, valor_barra_interno, valor_metro_interno, cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, cred_ibs_pct, cred_cbs_pct'", "'codigo, descricao, unidade, medida_barra_m, valor_barra_interno, valor_metro_interno'"),
    ('L2', LEV, 'a recusa de antes de calcular some (o levantamento sem cor segue)', "    if (faltas.length) return recusa(faltas, faltou)\n\n    // os grupos", "    // os grupos"),
]


def verde():
    r = subprocess.run(['npx', 'jest', *SUITES, '--silent'], cwd=RAIZ, capture_output=True, text=True)
    return r.returncode == 0


def main():
    pedidas = set(sys.argv[1:])
    originais = {}
    vivas = 0
    try:
        if not pedidas or 'M0' in pedidas:
            ok = verde()
            print(f"{'verde   ' if ok else 'VERMELHO'} M0: CONTROLE: nada muda")
            vivas += 0 if ok else 1
        for ident, arquivo, descricao, velho, novo in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            caminho = os.path.join(RAIZ, arquivo)
            original = originais.setdefault(caminho, open(caminho, encoding='utf-8').read())
            if original.count(velho) != 1:
                raise SystemExit(f'{ident}: o trecho aparece {original.count(velho)} vez(es): {velho[:70]}')
            open(caminho, 'w', encoding='utf-8').write(original.replace(velho, novo))
            try:
                morta = not verde()
            finally:
                open(caminho, 'w', encoding='utf-8').write(original)
            print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}")
            vivas += 0 if morta else 1
    finally:
        for caminho, original in originais.items():
            open(caminho, 'w', encoding='utf-8').write(original)
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
