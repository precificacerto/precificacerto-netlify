#!/usr/bin/env python3
"""
MUTAÇÕES do "nulo não é zero" de Produtos (dono do produto, 10/11/2026): toda mutação que faça o ICMS ou o PIS/COFINS não informados
virarem 0 — na leitura, na tela, na emissão do preço, no salvar ou na gravação — tem de MORRER nas suítes.

Roda numa WORKTREE própria (`mutacao-na-arvore-de-trabalho.md`); antes de rodar, todo trecho aparece exatamente uma vez
(`mutacao-que-nao-se-aplica.md`). Uso: python3 -I mutacoes.py [--so NOME]. Sai 1 se alguma sobreviver ou se o controle estiver vermelho.
"""
import os, shutil, subprocess, sys, tempfile

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../..'))
SUITES = ['src/utils/__tests__/tributo-nulo-nao-vira-zero.test.tsx', 'src/utils/__tests__/atendimentos-ia-precificacao-do-orcamento-tela.test.tsx',
          'src/utils/__tests__/o-servidor-forma-o-preco-da-tela.test.tsx']
PO = 'src/lib/atendimentos-ia/preco-do-orcamento.ts'
C = 'src/page-parts/products/content.component.tsx'
PP = 'src/page-parts/products/product-price.component.tsx'
T = 'src/utils/tributo-por-dentro-informado.ts'
CI = 'src/page-parts/products/content-industrialization.tsx'
# EQUIVALENTE, com a razão medida em 10/11/2026: o valor inicial só é lido sem a releitura quando há produto FORA do modo de edição, e nenhum
# chamador faz isso (produtos/criar.tsx:177 e a precificação do orçamento passam isEditingMode={false} SEM produto; produtos/[id].tsx:290
# passa produto com isEditingMode={true}, e o efeito da edição relê o campo com doBanco). Se um chamador novo abrir produto fora da edição,
# ela deixa de ser equivalente e tem de morrer.
EQUIVALENTES = {'L1 a carga do produto lê nulo como 0 (o valor inicial; a releitura da edição o sobrescreve)'}
MUT = [
    # ── a gravação e a leitura ──
    ('G1 a gravação volta a inventar o 0 no ICMS', C, "        extraFields.icms_pct = paraGravar(icmsPct)\n", "        extraFields.icms_pct = icmsPct || 0\n"),
    ('G2 a gravação volta a inventar o 0 no PIS/COFINS', C, "        extraFields.pis_cofins_pct = paraGravar(pisCofinsLRPct)\n", "        extraFields.pis_cofins_pct = pisCofinsLRPct || 0\n"),
    ('L1 a carga do produto lê nulo como 0 (o valor inicial; a releitura da edição o sobrescreve)', C, "  const initialIcms = doBanco((product as any)?.icms_pct)\n", "  const initialIcms = Number((product as any)?.icms_pct) || 0\n"),
    ('L2 a releitura na edição lê nulo como 0 (ICMS)', C, "      setIcmsPct(doBanco((product as any)?.icms_pct))\n", "      setIcmsPct(Number((product as any)?.icms_pct) || 0)\n"),
    ('L3 a releitura na edição lê nulo como 0 (PIS/COFINS)', C, "      setPisCofinsLRPct(doBanco((product as any)?.pis_cofins_pct))\n", "      setPisCofinsLRPct(Number((product as any)?.pis_cofins_pct) || 0)\n"),
    # ── o salvar ──
    ('S1 o salvar não recusa com a falta', C, "    if (faltasDosTributos.length) {\n      messageApi.error(", "    if (false) {\n      messageApi.error("),
    ('S2 o salvar não recebe as faltas (o repasse do produzido some)', CI, "        onFaltasDosTributosChange={onFaltasDosTributosChange}\n", ""),
    # ── a tela ──
    ('P1 o preço é emitido mesmo com a falta', PP, "    if (!semPreco && finalPriceWithTaxesPerUnit > 0) onFinalPriceWithTaxesChange?.({", "    if (finalPriceWithTaxesPerUnit > 0) onFinalPriceWithTaxesChange?.({"),
    # o `formado` veio a morar em `formarPrecoDoProduto` (o rebase sobre o #262/#263, 13/11/2026): a falta entra no aviso pelo `|| semPreco`
    ('P2 "não formado" não é avisado com a falta', PP, "    if (!formado || semPreco) onPrecoNaoFormado?.()", "    if (!formado) onPrecoNaoFormado?.()"),
    ('P3 a margem aparece com o tributo em zero', PP, "{semPreco ? '—' : `${mcPct.toLocaleString(", "{false ? '—' : `${mcPct.toLocaleString("),
    ('P4 a faixa que nomeia a falta some', PP, "      {semPreco && (\n        <div data-preco-nao-formado=\"\"", "      {false && (\n        <div data-preco-nao-formado=\"\""),
    ('P5 o resultado (preço por unidade) aparece com a falta', PP, "        {!semPreco && (<div style={{", "        {(<div style={{"),
    ('P6 o ProductPrice lê o ICMS nulo como 0 para decidir a falta', PP, "    icmsPct: icmsPctInformado,\n    pisCofinsPct: pisCofinsInformado,", "    icmsPct: icmsPctInformado ?? 0,\n    pisCofinsPct: pisCofinsInformado,"),
    ('P7 as faltas não são entregues a quem salva', PP, "    onFaltasDosTributosChange?.(chaveDasFaltas ? chaveDasFaltas.split('|') : [])", "    onFaltasDosTributosChange?.([])"),
    # ── a regra ──
    ('R1 o Presumido não exige', T, "args.taxableRegime === 'LUCRO_REAL' || args.taxableRegime === 'LUCRO_PRESUMIDO'", "args.taxableRegime === 'LUCRO_REAL'"),
    ('R2 o ICMS é exigido também onde a matriz diz que não existe', T, "    if (tributoExisteNoSegmento(args.segmento, 'ICMS') && !informado(args.icmsPct))", "    if (!informado(args.icmsPct))"),
    ('R3 NaN conta como informado', T, "typeof v === 'number' && Number.isFinite(v)", "typeof v === 'number'"),
    ('R4 o texto vazio do banco vira 0', T, "    if (v === null || v === undefined || v === '') return null\n", "    if (v === null || v === undefined) return null\n"),
    ('R5 o PIS/COFINS deixa de ser exigido', T, "    if (tributoExisteNoSegmento(args.segmento, 'PIS_COFINS') && !informado(args.pisCofinsPct)) faltas.push(FALTA_DO_PIS_COFINS)\n", ""),
    # o servidor do orçamento I.A. (o rebase sobre o #262/#263, 13/11/2026): sem a falta, ele formaria o preço com o ICMS da UF ausente em zero
    ('V1 o servidor forma o preço com o tributo nulo', PO, "    const venda = p.formado && !semTributo && p.finalPriceWithTaxes > 0", "    const venda = p.formado && p.finalPriceWithTaxes > 0"),
]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [(arq, open(os.path.join(R, arq), encoding='utf-8').read(), de, para)]) for nome, arq, de, para in MUT)

def rodar_suites(arvore):
    r = subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=arvore, capture_output=True, text=True)
    return r.returncode == 0

def main():
    so = sys.argv[sys.argv.index('--so') + 1] if '--so' in sys.argv else None
    wt = tempfile.mkdtemp(prefix='mut-tributo-nulo-')
    shutil.rmtree(wt)
    subprocess.run(['git', 'worktree', 'add', '--detach', wt, 'HEAD'], cwd=R, check=True, capture_output=True)
    try:
        # a worktree recebe o estado ATUAL dos arquivos mutados e das suítes (mesmo os não commitados), e o node_modules por link
        for f in {C, PP, T, PO, *SUITES, 'src/page-parts/products/content-industrialization.tsx', 'src/page-parts/products/content-resale.tsx'}:
            os.makedirs(os.path.dirname(os.path.join(wt, f)), exist_ok=True)
            shutil.copyfile(os.path.join(R, f), os.path.join(wt, f))
        os.symlink(os.path.join(R, 'node_modules'), os.path.join(wt, 'node_modules'))
        if not rodar_suites(wt):
            print('CONTROLE VERMELHO: as suítes falham sem mutação'); return 1
        print('controle verde', flush=True)
        vivas = []
        for nome, arq, de, para in MUT:
            if so and not nome.startswith(so): continue
            caminho = os.path.join(wt, arq)
            original = open(caminho, encoding='utf-8').read()
            open(caminho, 'w', encoding='utf-8').write(original.replace(de, para))
            try:
                viva = rodar_suites(wt)
            finally:
                open(caminho, 'w', encoding='utf-8').write(original)
            print(f"  {'VIVA ' if viva and nome not in EQUIVALENTES else ('equivalente' if viva else 'morta')}: {nome}", flush=True)
            if viva and nome not in EQUIVALENTES: vivas.append(nome)
        total = len([m for m in MUT if not so or m[0].startswith(so)])
        equiv = len([m for m in MUT if m[0] in EQUIVALENTES and (not so or m[0].startswith(so))])
        print(f'{total - len(vivas) - equiv} de {total} mortas, {equiv} equivalente(s) declarada(s)')
        return 1 if vivas else 0
    finally:
        subprocess.run(['git', 'worktree', 'remove', '--force', wt], cwd=R, capture_output=True)

sys.exit(main())
