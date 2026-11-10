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
 ('P1 o rodapé sempre numa folha nova', '    if (fim <= livre) paginas[paginas.length - 1].rodape = true\n', '    if (false) paginas[paginas.length - 1].rodape = true\n'),
 ('P2 o cabeçalho das colunas não conta', 'const precisa = a.itens[i] + (atual.itens.length === 0 ? a.cabecalhoDasColunas : 0)', 'const precisa = a.itens[i]'),
 ('P3 o item passa do fim da folha', 'if (precisa <= livre) { atual.itens.push(i)', 'if (precisa <= livre + 10) { atual.itens.push(i)'),
 ('P4 o cliente não ocupa espaço', '    let livre = a.util - a.cliente\n', '    let livre = a.util\n'),
 ('P5 a folha vira antes de encher', 'if (precisa <= livre) { atual.itens.push(i)', 'if (precisa <= livre - 30) { atual.itens.push(i)'),
 ('P6 o item maior que a folha é aceito', "        if (sozinho > a.util) return { recusa: `O item ${i + 1} não cabe numa folha inteira.` }\n", ''),
 ('L1 a VARIÁVEIS leva as com padrão', 'const sem = i.variaveis.filter((v) => v.semPadrao)', 'const sem = i.variaveis.filter(() => true)'),
 ('L2 "mm" em toda variável', "${variavelEhMedida(v.descricao) ? ' mm' : ''}", " mm"),
 ('L3 a linha de identificação sem singular', "${d.itens.length === 1 ? 'item' : 'itens'}", "itens"),
 ('L4 o fuso UTC', "const FUSO = 'America/Sao_Paulo'", "const FUSO = 'UTC'"),
 ('L5 a página sem o total', 'doc.text(`Página ${pagina} de ${total}`', 'doc.text(`Página ${pagina}`'),
 ('L6 o cliente em toda folha', '        if (p.cliente) y = blocoDoCliente(doc, dados, y)\n', '        y = blocoDoCliente(doc, dados, y)\n'),
 ('L7 VARIÁVEIS depois do PERFIL', "        ...(variaveis !== null ? [{ tipo: 'uma' as const, rotulo: 'VARIÁVEIS', texto: variaveis }] : []),\n        { tipo: 'duas' as const, esquerda: [ROTULO_DO_PERFIL, i.perfilEAcessorio ?? ''], direita: [ROTULO_DO_VIDRO, i.vidro ?? ''] },\n", "        { tipo: 'duas' as const, esquerda: [ROTULO_DO_PERFIL, i.perfilEAcessorio ?? ''], direita: [ROTULO_DO_VIDRO, i.vidro ?? ''] },\n        ...(variaveis !== null ? [{ tipo: 'uma' as const, rotulo: 'VARIÁVEIS', texto: variaveis }] : []),\n"),
 ('L8 "mm" ao lado do valor', '[milhar(i.largura_mm), COLUNAS.larg]', '[`${milhar(i.largura_mm)} mm`, COLUNAS.larg]'),
 ('L9 os itens fora da ordem', '    const itens = [...d.itens].sort((a, b) => a.ordem - b.ordem)\n', '    const itens = [...d.itens]\n'),
 ('L10 o ambiente sem a quantidade', "(i.ambientes ?? []).map((a) => `${a.ambiente} (${a.quantidade})`)", "(i.ambientes ?? []).map((a) => a.ambiente)"),
 ('L11 a data de entrega por extenso', "    return `${m[3]}/${m[2]}/${m[1].slice(2)}`\n", "    return `${m[3]}/${m[2]}/${m[1]}`\n"),
 ('L12 o modo sem o rótulo', "c.comissaoModo ? `Modo: ${MODO[c.comissaoModo]}` : ''", "c.comissaoModo ? MODO[c.comissaoModo] : ''"),
 ('N1 a figura só na altura da faixa', '    ({ x: x + FOLGA_DO_DESENHO, y: y + FOLGA_DO_DESENHO, w: COLUNAS.fig - 2 * FOLGA_DO_DESENHO, h: alturaDoCorpo - 2 * FOLGA_DO_DESENHO })', '    ({ x: x + FOLGA_DO_DESENHO, y: y + FOLGA_DO_DESENHO, w: COLUNAS.fig - 2 * FOLGA_DO_DESENHO, h: ALTURA_DA_FAIXA - 2 * FOLGA_DO_DESENHO })'),
 ('N2 o desenho com a caixa da faixa', '    const tracos = tracosDoDesenho(desenhoDaTipologia(i), caixaDaFigura(x, y, altura))', '    const tracos = tracosDoDesenho(desenhoDaTipologia(i), caixaDaFigura(x, y, ALTURA_DA_FAIXA))'),
 ('N3 a linha do vendedor não cresce (corta)', '    Math.max(1, linhasDaCelula(doc, rotuloDaCelula, texto, largura).length) * ALTURA_DA_LINHA_DO_ITEM', '    ALTURA_DA_LINHA_DO_ITEM'),
 ('N4 a faixa com outra altura', 'export const ALTURA_DA_FAIXA = 46 * PX_DO_MOCKUP', 'export const ALTURA_DA_FAIXA = 60 * PX_DO_MOCKUP'),
 ('N5 a linha auxiliar com outra altura', 'export const ALTURA_DA_LINHA_DO_ITEM = 16 * PX_DO_MOCKUP', 'export const ALTURA_DA_LINHA_DO_ITEM = 20 * PX_DO_MOCKUP'),
 ('N6 a coluna Fig. com outra largura', 'const LARGURA_DA_FIG = 58 * PX_DO_MOCKUP', 'const LARGURA_DA_FIG = 34'),
 ('N7 o cinza na PRIMEIRA barra', '    const k = comCaixa.lastIndexOf(\'|\')', '    const k = comCaixa.indexOf(\'|\')'),
 ('N8 o nome sem a caixa ajustada', "t.toLocaleLowerCase('pt-BR').replace(/\\p{L}/u, (l) => l.toLocaleUpperCase('pt-BR'))", 't'),
 ('N9 o nome em três linhas', 'export const LINHAS_DO_NOME = 2', 'export const LINHAS_DO_NOME = 3'),
 ('N10 o nome cortado sem reticências', "        t.push({ texto: '…', cinza: ate > principal.length })\n", ''),
 ('N11 a paginação sem o crescimento da linha', 'const alturaDoItem = (doc: Doc, i: ItemDaFolha) => alturaDoCorpoDoItem(doc, i) + ESPACO_ENTRE_ITENS', 'const alturaDoItem = (doc: Doc, i: ItemDaFolha) => ALTURA_DA_FAIXA + linhasDoItem(i).length * ALTURA_DA_LINHA_DO_ITEM + ESPACO_ENTRE_ITENS'),
 ('N12 a linha do motor de volta em linha própria', "    doc.setTextColor(PRETO)\n    cx += COLUNAS.item\n", "    if (i.linha) doc.text(`Linha: ${i.linha}`, cx + 1.5, y + ALTURA_DA_FAIXA - 1)\n    doc.setTextColor(PRETO)\n    cx += COLUNAS.item\n"),
 ('Q1 os itens contíguos, sem o respiro', 'const ESPACO_ENTRE_ITENS = 2.5\n', 'const ESPACO_ENTRE_ITENS = 0\n'),
 ('Q2 o pé fora da conta da última folha', '    const fim = a.rodape + a.linhaDeIdentificacao\n', '    const fim = a.rodape\n'),
 ('Q3 o pé desenhado em toda folha', '        if (p.rodape) { desenharRodape(doc, dados, topoDoRodape(alturaDoRodape(doc, dados))); desenharLinhaDeIdentificacao(doc, dados) }', '        if (p.rodape) desenharRodape(doc, dados, topoDoRodape(alturaDoRodape(doc, dados)))\n        desenharLinhaDeIdentificacao(doc, dados)'),
 ('Q4 o pé reservado em toda folha', 'const FIM_DO_CORPO = FOLHA.altura - FOLHA.margem\n', 'const FIM_DO_CORPO = FOLHA.altura - FOLHA.margem - ALTURA_DA_LINHA_DE_IDENTIFICACAO\n'),
 ('Q5 o cliente com o rótulo em cima (8,17 mm)', 'const LINHA_DO_CLIENTE = 27.4 / 4\n', 'const LINHA_DO_CLIENTE = 8.17\n'),
 ('Q6 o valor do cliente cortado numa linha', '    LINHA_DO_CLIENTE + (linhasDoCampo(doc, nome, texto, largura).length - 1) * CORPO * ENTRELINHA', '    LINHA_DO_CLIENTE'),
 ('Q7 a faixa de títulos com 8 mm', 'const ALTURA_DO_CABECALHO_DAS_COLUNAS = 4.5\n', 'const ALTURA_DO_CABECALHO_DAS_COLUNAS = 8\n'),
 ('Q8 o cabeçalho com 22 mm', 'const ALTURA_DO_CABECALHO = 14\n', 'const ALTURA_DO_CABECALHO = 22\n'),
 ('B1 a borda externa cinza', 'export const BORDA_EXTERNA_DO_ITEM = { cor: 0, largura: 0.5 * PT } as const', 'export const BORDA_EXTERNA_DO_ITEM = { cor: 160, largura: 0.5 * PT } as const'),
 ('B2 a borda externa grossa', 'export const BORDA_EXTERNA_DO_ITEM = { cor: 0, largura: 0.5 * PT } as const', 'export const BORDA_EXTERNA_DO_ITEM = { cor: 0, largura: 1 * PT } as const'),
 ('B3 as internas pretas', 'export const BORDA_INTERNA_DO_ITEM = { cor: 200, largura: 0.25 * PT } as const', 'export const BORDA_INTERNA_DO_ITEM = { cor: 0, largura: 0.25 * PT } as const'),
 ('B4 sem a borda externa', '    doc.rect(x, y, CONTEUDO, altura)\n    doc.setDrawColor(TRACO); doc.setLineWidth(0.2)\n', '    doc.setDrawColor(TRACO); doc.setLineWidth(0.2)\n'),
 ('B5 a borda externa só na faixa', '    doc.rect(x, y, CONTEUDO, altura)\n    doc.setDrawColor(TRACO); doc.setLineWidth(0.2)\n', '    doc.rect(x, y, CONTEUDO, ALTURA_DA_FAIXA)\n    doc.setDrawColor(TRACO); doc.setLineWidth(0.2)\n'),
 ('B6 fundo nas células do item', '    tracoInterno(doc); doc.rect(x, y, w, h)\n', "    tracoInterno(doc); doc.setFillColor(245, 245, 245); doc.rect(x, y, w, h, 'FD')\n"),
 ('B7 a figura sem o traço interno', '    tracoInterno(doc)\n    // a coluna Fig.', '    doc.setDrawColor(TRACO)\n    // a coluna Fig.'),
 ('A1 o rodapé logo depois do último item', 'desenharRodape(doc, dados, topoDoRodape(alturaDoRodape(doc, dados)))', 'desenharRodape(doc, dados, y)'),
 ('A2 o rodapé encostado na margem, sobre a linha de identificação', 'export const topoDoRodape = (altura: number) => FIM_DO_CORPO - ALTURA_DA_LINHA_DE_IDENTIFICACAO - altura', 'export const topoDoRodape = (altura: number) => FIM_DO_CORPO - altura'),
 ('A3 o rodapé no topo da última folha', 'export const topoDoRodape = (altura: number) => FIM_DO_CORPO - ALTURA_DA_LINHA_DE_IDENTIFICACAO - altura', 'export const topoDoRodape = (altura: number) => TOPO_DO_CORPO + 0 * altura'),
 ('A4 o rodapé ancorado com 1 mm de folga a mais', 'export const topoDoRodape = (altura: number) => FIM_DO_CORPO - ALTURA_DA_LINHA_DE_IDENTIFICACAO - altura', 'export const topoDoRodape = (altura: number) => FIM_DO_CORPO - ALTURA_DA_LINHA_DE_IDENTIFICACAO - altura - 1'),
 ('A5 a paginação reserva o rodapé em toda folha', '    let livre = a.util - a.cliente\n', '    let livre = a.util - a.cliente - a.rodape\n'),
]
orig = open(ARQ, encoding='utf-8').read()
import os as _os; sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [(ARQ, orig, de, para)]) for nome, de, para in M)
vivas = []
try:
    for nome, de, para in M:
        if orig.count(de) != 1:
            print(f'NAO APLICOU {nome}: o trecho aparece {orig.count(de)} vez(es)'); sys.exit(3)
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
