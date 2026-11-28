// Converte a tabela vigente de perfis da Wolff para o formato de ABAS POR COR (pedido 0055).
//   node scripts/perfis-por-cor/converter.mjs <dump.txt> <saida-dir>
// O dump é uma linha por item: codigo|cor|referencia_perfil|descricao|custo|medida_barra_m (lido do banco, só leitura).
// O PREÇO sai IGUAL ao do banco (nenhuma conta). A referência que o banco já tem vai como está; a que falta é DERIVADA aqui, UMA vez, só no código
// que é "referência + código da cor" (IL4236 = IL42 + 36) — e a linha diz de onde veio na coluna ORIGEM DA REFERÊNCIA (o importador ignora essa
// coluna e NUNCA decifra pelo código). O que não se deriva sem adivinhar fica FORA do arquivo e na lista de pendências, nomeado.
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

// os códigos de cor do fornecedor (orcamentista_fornecedor_cor, grupo PERFIS DE PVC; medido em 28/11/2026)
const CODIGO_DA_COR = {
    'BRANCO': '1', 'EXTERNO PRETO TEXTURADO': '18', 'EXTERNO GOLDEN OAK': '19', 'PRETO TEXTURADO': '20', 'AMADEIRADO GOLDEN OAK': '21',
    'BRONZE': '30', 'GRAFITE': '31', 'EXTERNO BRONZE': '32', 'EXTERNO GRAFITE': '33', 'PRETO LISO': '36', 'AMADEIRADO NOGUEIRA': '37',
    'EXTERNO PRETO LISO': '38', 'EXTERNO NOGUEIRA': '39', 'PIRITA': '40', 'EXTERNO PIRITA': '41', 'PRETO': '9',
}
const FORMA_DA_REFERENCIA = /^[A-Z]{1,3}\d{1,4}[A-Z]?$/

const [, , entrada, saida] = process.argv
if (!entrada || !saida) { console.error('uso: converter.mjs <dump.txt> <saida-dir>'); process.exit(2) }
fs.mkdirSync(saida, { recursive: true })
const itens = fs.readFileSync(entrada, 'utf8').split('\n').filter(Boolean).map((l) => {
    const [codigo, cor, ref, descricao, custo, barra] = l.split('|')
    return { codigo, cor, ref: ref || null, descricao, custo, barra }
})

const nasAbas = []
const pendencias = []
for (const i of itens) {
    if (!(i.cor in CODIGO_DA_COR)) { pendencias.push({ ...i, motivo: `a cor "${i.cor}" não é nome de aba: a lista de cores do fornecedor não a tem (e o nome passa de 31 caracteres, o limite do Excel). Decisão do PO: como o lado maior/menor entra em abas.` }); continue }
    if (i.ref) { nasAbas.push({ ...i, origem: 'banco' }); continue }
    const k = CODIGO_DA_COR[i.cor]
    const base = i.codigo.endsWith(k) ? i.codigo.slice(0, -k.length) : null
    if (base && FORMA_DA_REFERENCIA.test(base) && /^[A-Z]/.test(i.codigo)) nasAbas.push({ ...i, ref: base, origem: `derivada: código ${i.codigo} sem o sufixo da cor (${k})` })
    else pendencias.push({ ...i, motivo: 'sem referência no banco, e o código não é "referência + código da cor" (o código é numérico do fornecedor): informar a referência.' })
}

const ordem = (a, b) => (a === 'BRANCO' ? -1 : b === 'BRANCO' ? 1 : a < b ? -1 : a > b ? 1 : 0)
const cores = [...new Set(nasAbas.map((i) => i.cor))].sort(ordem)
const wb = new ExcelJS.Workbook()
for (const cor of cores) {
    const ws = wb.addWorksheet(cor)
    ws.addRow(['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA', 'ORIGEM DA REFERÊNCIA'])
    ws.getRow(1).font = { bold: true }
    for (const i of nasAbas.filter((x) => x.cor === cor).sort((a, b) => a.ref.localeCompare(b.ref) || a.codigo.localeCompare(b.codigo))) {
        ws.addRow([i.ref, i.codigo, i.descricao, Number(i.custo), Number(i.barra), i.origem])
    }
    ws.columns = [{ width: 14 }, { width: 22 }, { width: 70 }, { width: 14 }, { width: 8 }, { width: 50 }]
}
const arquivo = path.join(saida, 'Wolff_Perfis_PVC_por_cor.xlsx')
await wb.xlsx.writeFile(arquivo)

// a conferência: cor × referências, e o que falta em cada aba contra o BRANCO
const refsDa = (cor) => new Set(nasAbas.filter((i) => i.cor === cor).map((i) => i.ref))
const base = refsDa('BRANCO')
const linhas = ['# Conferência das abas por cor (Wolff Perfis PVC)', '', `Itens no banco: ${itens.length}. Nas abas: ${nasAbas.length}. Fora (pendência nomeada): ${pendencias.length}.`,
    `Soma do PREÇO no banco: ${itens.reduce((s, i) => s + Number(i.custo), 0).toFixed(4)} · nas abas: ${nasAbas.reduce((s, i) => s + Number(i.custo), 0).toFixed(4)} · fora: ${pendencias.reduce((s, i) => s + Number(i.custo), 0).toFixed(4)}`,
    '', '## Cor × quantidade de referências', '', '| Cor | Itens | Referências | Derivadas do sufixo | Faltam contra o BRANCO | Só nesta aba |', '|---|---:|---:|---:|---:|---:|']
const faltas = []
for (const cor of cores) {
    const dela = refsDa(cor)
    const faltam = [...base].filter((r) => !dela.has(r)).sort()
    const sobram = [...dela].filter((r) => !base.has(r)).sort()
    const its = nasAbas.filter((i) => i.cor === cor)
    linhas.push(`| ${cor} | ${its.length} | ${dela.size} | ${its.filter((i) => i.origem !== 'banco').length} | ${cor === 'BRANCO' ? '—' : faltam.length} | ${cor === 'BRANCO' ? '—' : sobram.length} |`)
    if (cor !== 'BRANCO') faltas.push({ cor, faltam, sobram })
}
linhas.push('', '## O que falta em cada aba (referências do BRANCO que a cor não tem)', '')
for (const f of faltas) linhas.push(`- **${f.cor}** (${f.faltam.length}): ${f.faltam.join(', ') || 'nada'}${f.sobram.length ? ` — só nela: ${f.sobram.join(', ')}` : ''}`)
linhas.push('', '## Pendências (fora das abas)', '', `### Sem referência derivável (${pendencias.filter((p) => p.cor in CODIGO_DA_COR).length})`, '')
for (const p of pendencias.filter((p) => p.cor in CODIGO_DA_COR)) linhas.push(`- ${p.cor} · ${p.codigo} · ${p.descricao.trim()}`)
linhas.push('', `### Cor que não é nome de aba — lado maior/menor (${pendencias.filter((p) => !(p.cor in CODIGO_DA_COR)).length})`, '')
for (const p of pendencias.filter((p) => !(p.cor in CODIGO_DA_COR))) linhas.push(`- ${p.cor} · ${p.codigo} · ref ${p.ref}`)
fs.writeFileSync(path.join(saida, 'conferencia.md'), linhas.join('\n') + '\n')
console.log(`abas=${cores.length} nas_abas=${nasAbas.length} pendencias=${pendencias.length} -> ${arquivo}`)
