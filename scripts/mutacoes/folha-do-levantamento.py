#!/usr/bin/env python3
"""Mutações do gerador da folha do levantamento (src/lib/atendimentos-ia/folha-do-levantamento.ts).
Cada mutação troca um trecho; a suíte src/utils/__tests__/folha-do-levantamento.test.ts tem de ficar vermelha.
Uso: python3 -B scripts/mutacoes/folha-do-levantamento.py  (o arquivo volta ao original no fim, sempre)."""
import subprocess, sys
ARQ = 'src/lib/atendimentos-ia/folha-do-levantamento.ts'
SUITE = 'src/utils/__tests__/folha-do-levantamento.test.ts'
M = [
 ('D1 as folhas não saem da descrição', 'colunas: folhas ? Number(folhas[1]) : divisoesDoEixo(d, MODULOS_HORIZONTAIS, item.variaveis)', 'colunas: divisoesDoEixo(d, MODULOS_HORIZONTAIS, item.variaveis)'),
 ('D2 o valor zero da variável vale', 'return v && Number.isInteger(v.valor) && v.valor > 0 ? v.valor : null', 'return v && Number.isInteger(v.valor) && v.valor >= 0 ? v.valor : null'),
 ('D3 "N" sem resposta vira 2 (chute)', '    return valorDito(variaveis, m[2])\n', '    return valorDito(variaveis, m[2]) ?? 2\n'),
 ('D4 a faixa sem a descrição dizer que existe', "    if (!new RegExp(`\\\\b${palavra}\\\\b`).test(descricao)) return null\n", ''),
 ('D5 a faixa pela sigla AF, não pela descrição', 'new RegExp(`\\\\b${palavra}\\\\b`).test(forma(x.descricao)) && Number.isInteger', "x.variavel === 'AF' && Number.isInteger"),
 ('D6 a bandeira numa altura fixa', 'const topo = y + (desenho.bandeira_mm ?? 0) * escala', 'const topo = y + (desenho.bandeira_mm ? 5 : 0)'),
 ('D7 o contorno sem a proporção real', '    const h = desenho.altura_mm * escala\n', '    const h = caixa.h\n'),
 ('D8 as folhas atravessam a bandeira', 'divisoes.push([x + (w * i) / colunas, topo, x + (w * i) / colunas, base])', 'divisoes.push([x + (w * i) / colunas, y, x + (w * i) / colunas, y + h])'),
 ('C1 a soma dos ambientes não é conferida', 'if (soma !== i.quantidade) {', 'if (false) {'),
 # C2 era 'percentual nulo passa' ((n === null || typeof n === 'number')): EQUIVALENTE — Number.isFinite(null) é falso e recusa igual. Trocada pelas duas abaixo.
 ('C2 percentual acima de 100 passa', 'Number.isFinite(n) && n >= 0 && n <= 100', 'Number.isFinite(n) && n >= 0'),
 ('C2b percentual negativo passa', 'Number.isFinite(n) && n >= 0 && n <= 100', 'Number.isFinite(n) && n <= 100'),
 ('C3 o responsável pela RT obrigatório', "    if (!d.condicoes.vendedor?.trim()) recusas.push('Falta o vendedor do levantamento.')\n", "    if (!d.condicoes.vendedor?.trim()) recusas.push('Falta o vendedor do levantamento.')\n    if (!d.condicoes.rtResponsavel) recusas.push('Falta o responsável.')\n"),
 ('C4 o dinheiro não é conferido', 'if (texto && SIMBOLO_DE_DINHEIRO.test(texto))', 'if (false)'),
 ('C5 a faixa igual à altura passa', 'if (faixas >= i.altura_mm) {', 'if (faixas > i.altura_mm) {'),
 ('C6 o ambiente com quantidade zero passa', 'if (i.ambientes.some((a) => !inteiroPositivo(a.quantidade) || !a.ambiente.trim())) {', 'if (i.ambientes.some((a) => !a.ambiente.trim())) {'),
 ('C7 a data impossível passa', "    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null\n", ''),
 ('C8 o vendedor não é exigido', "    if (!d.condicoes.vendedor?.trim()) recusas.push('Falta o vendedor do levantamento.')\n", ''),
 ('P1 o fecho sempre numa folha nova', '    if (a.fecho <= livre) paginas[paginas.length - 1].fecho = true\n', '    if (false) paginas[paginas.length - 1].fecho = true\n'),
 ('P2 o cabeçalho das colunas não conta', 'const precisa = a.itens[i] + (atual.itens.length === 0 ? a.cabecalhoDasColunas : 0)', 'const precisa = a.itens[i]'),
 ('P3 o item passa do fim da folha', 'if (precisa <= livre) { atual.itens.push(i)', 'if (precisa <= livre + 10) { atual.itens.push(i)'),
 ('P4 o cliente não ocupa espaço', '    let livre = a.util - a.cliente\n', '    let livre = a.util\n'),
 ('P5 a folha vira antes de encher', 'if (precisa <= livre) { atual.itens.push(i)', 'if (precisa <= livre - 30) { atual.itens.push(i)'),
 ('P6 o item maior que a folha é aceito', "        if (sozinho > a.util) return { recusa: `O item ${i + 1} não cabe numa folha inteira.` }\n", ''),
 ('L1 a VARIÁVEIS leva as com padrão', 'const sem = i.variaveis.filter((v) => v.semPadrao)', 'const sem = i.variaveis.filter(() => true)'),
 ('L2 "mm" em toda variável', "${variavelEhMedida(v.descricao) ? ' mm' : ''}", " mm"),
 ('L3 o rodapé sem singular', "${d.itens.length === 1 ? 'item' : 'itens'}", "itens"),
 ('L4 o fuso UTC', "const FUSO = 'America/Sao_Paulo'", "const FUSO = 'UTC'"),
 ('L5 a página sem o total', 'doc.text(`Página ${pagina} de ${total}`', 'doc.text(`Página ${pagina}`'),
 ('L6 o cliente em toda folha', '        if (p.cliente) y = blocoDoCliente(doc, dados, y)\n', '        y = blocoDoCliente(doc, dados, y)\n'),
 ('L7 VARIÁVEIS depois do PERFIL', "        ...(variaveis !== null ? [{ tipo: 'uma' as const, rotulo: 'VARIÁVEIS', texto: variaveis }] : []),\n        { tipo: 'duas' as const, esquerda: [ROTULO_DO_PERFIL, i.perfilEAcessorio ?? ''], direita: [ROTULO_DO_VIDRO, i.vidro ?? ''] },\n", "        { tipo: 'duas' as const, esquerda: [ROTULO_DO_PERFIL, i.perfilEAcessorio ?? ''], direita: [ROTULO_DO_VIDRO, i.vidro ?? ''] },\n        ...(variaveis !== null ? [{ tipo: 'uma' as const, rotulo: 'VARIÁVEIS', texto: variaveis }] : []),\n"),
 ('L8 "mm" ao lado do valor', '[milhar(i.largura_mm), COLUNAS.larg]', '[`${milhar(i.largura_mm)} mm`, COLUNAS.larg]'),
 ('L9 os itens fora da ordem', '    const itens = [...d.itens].sort((a, b) => a.ordem - b.ordem)\n', '    const itens = [...d.itens]\n'),
 ('L10 o ambiente sem a quantidade', "(i.ambientes ?? []).map((a) => `${a.ambiente} (${a.quantidade})`)", "(i.ambientes ?? []).map((a) => a.ambiente)"),
 ('L11 a data de entrega por extenso', "    return `${m[3]}/${m[2]}/${m[1].slice(2)}`\n", "    return `${m[3]}/${m[2]}/${m[1]}`\n"),
 ('L12 o modo sem o rótulo', "c.comissaoModo ? `Modo: ${MODO[c.comissaoModo]}` : ''", "c.comissaoModo ? MODO[c.comissaoModo] : ''"),
]
orig = open(ARQ, encoding='utf-8').read()
vivas = []
try:
    for nome, de, para in M:
        if orig.count(de) != 1:
            print(f'NAO APLICOU {nome}: o trecho aparece {orig.count(de)} vez(es)'); vivas.append(nome); continue
        open(ARQ, 'w', encoding='utf-8').write(orig.replace(de, para))
        r = subprocess.run(['npx', 'jest', SUITE], capture_output=True, text=True)
        morta = r.returncode != 0
        print(f"{'morta' if morta else 'VIVA '}  {nome}")
        if not morta: vivas.append(nome)
finally:
    open(ARQ, 'w', encoding='utf-8').write(orig)
r = subprocess.run(['npx', 'jest', SUITE], capture_output=True, text=True)
print('controle (sem mutação):', 'verde' if r.returncode == 0 else 'VERMELHO')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or r.returncode != 0 else 0)
