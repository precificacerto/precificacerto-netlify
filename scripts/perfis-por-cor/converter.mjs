// Converte a tabela vigente de perfis da Wolff para o formato de ABAS POR COR (pedido 0055).
//   node scripts/perfis-por-cor/converter.mjs <dump.txt> <saida-dir>
// O dump é uma linha por item: codigo|cor|referencia_perfil|descricao|custo|medida_barra_m (lido do banco, só leitura).
// O PREÇO sai IGUAL ao do banco (nenhuma conta). Decisões do PO (0055, 28/11): referências derivadas do sufixo APROVADAS; item sem sufixo derivável: referência = o próprio código; LADO MAIOR/MENOR: aba BICOLOR com a COR na coluna. Nenhum item fica fora.
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
for (const i of itens) {
    const lado = /\s+LADO\s+(MAIOR|MENOR)$/.test(i.cor)
    if (lado) { nasAbas.push({ ...i, aba: 'BICOLOR', origem: i.ref ? 'banco' : 'código próprio' , ref: i.ref ?? i.codigo }); continue }
    if (!(i.cor in CODIGO_DA_COR)) throw new Error(`cor fora da lista conhecida: ${i.cor} (${i.codigo})`)
    if (i.ref) { nasAbas.push({ ...i, aba: i.cor, origem: 'banco' }); continue }
    const k = CODIGO_DA_COR[i.cor]
    const base = i.codigo.endsWith(k) ? i.codigo.slice(0, -k.length) : null
    // decisão do PO (0055, 28/11): referência derivada do sufixo da cor APROVADA; sem sufixo derivável, a referência é o PRÓPRIO CÓDIGO
    if (base && FORMA_DA_REFERENCIA.test(base) && /^[A-Z]/.test(i.codigo)) nasAbas.push({ ...i, aba: i.cor, ref: base, origem: `derivada: código ${i.codigo} sem o sufixo da cor (${k})` })
    else nasAbas.push({ ...i, aba: i.cor, ref: i.codigo, origem: 'código próprio (sem sufixo de cor derivável)' })
}
const pendencias = []

const ordem = (a, b) => (a === 'BRANCO' ? -1 : a === 'BICOLOR' ? 1 : b === 'BRANCO' ? 1 : b === 'BICOLOR' ? -1 : a < b ? -1 : a > b ? 1 : 0)
const abas = [...new Set(nasAbas.map((i) => i.aba))].sort(ordem)
const wb = new ExcelJS.Workbook()
for (const nome of abas) {
    const ws = wb.addWorksheet(nome)
    const bi = nome === 'BICOLOR'
    ws.addRow(['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA', ...(bi ? ['COR'] : []), 'ORIGEM DA REFERÊNCIA'])
    ws.getRow(1).font = { bold: true }
    for (const i of nasAbas.filter((x) => x.aba === nome).sort((a, b) => a.ref.localeCompare(b.ref) || a.codigo.localeCompare(b.codigo))) {
        ws.addRow([i.ref, i.codigo, i.descricao, Number(i.custo), Number(i.barra), ...(bi ? [i.cor] : []), i.origem])
    }
    ws.columns = [{ width: 14 }, { width: 22 }, { width: 70 }, { width: 14 }, { width: 8 }, { width: bi ? 40 : 50 }, { width: 50 }]
}
const cores = abas.filter((a) => a !== 'BICOLOR')
const arquivo = path.join(saida, 'Wolff_Perfis_PVC_por_cor.xlsx')
await wb.xlsx.writeFile(arquivo)

// a conferência: cor × referências, e o que falta em cada aba contra o BRANCO
const refsDa = (cor) => new Set(nasAbas.filter((i) => i.aba === cor).map((i) => i.ref))
const base = refsDa('BRANCO')
const linhas = ['# Conferência das abas por cor (Wolff Perfis PVC)', '', `Itens no banco: ${itens.length}. Nas abas: ${nasAbas.length}. Fora: ${pendencias.length}.`,
    `Soma do PREÇO no banco: ${itens.reduce((s, i) => s + Number(i.custo), 0).toFixed(4)} · nas abas: ${nasAbas.reduce((s, i) => s + Number(i.custo), 0).toFixed(4)} · fora: ${pendencias.reduce((s, i) => s + Number(i.custo), 0).toFixed(4)}`,
    '', '## Cor × quantidade de referências', '', '| Cor | Itens | Referências | Derivadas do sufixo | Faltam contra o BRANCO | Só nesta aba |', '|---|---:|---:|---:|---:|---:|']
const faltas = []
for (const cor of cores) {
    const dela = refsDa(cor)
    const faltam = [...base].filter((r) => !dela.has(r)).sort()
    const sobram = [...dela].filter((r) => !base.has(r)).sort()
    const its = nasAbas.filter((i) => i.aba === cor)
    linhas.push(`| ${cor} | ${its.length} | ${dela.size} | ${its.filter((i) => i.origem !== 'banco').length} | ${cor === 'BRANCO' ? '—' : faltam.length} | ${cor === 'BRANCO' ? '—' : sobram.length} |`)
    if (cor !== 'BRANCO') faltas.push({ cor, faltam, sobram })
}
linhas.push('', '## O que falta em cada aba (referências do BRANCO que a cor não tem)', '')
for (const f of faltas) linhas.push(`- **${f.cor}** (${f.faltam.length}): ${f.faltam.join(', ') || 'nada'}${f.sobram.length ? ` — só nela: ${f.sobram.join(', ')}` : ''}`)
linhas.push('', `## BICOLOR: ${nasAbas.filter((i) => i.aba === 'BICOLOR').length} itens, cor completa na coluna COR`, '', `## Código próprio (sem sufixo de cor): ${nasAbas.filter((i) => i.origem.startsWith('código próprio')).length} itens`)
fs.writeFileSync(path.join(saida, 'conferencia.md'), linhas.join('\n') + '\n')
console.log(`abas=${cores.length} nas_abas=${nasAbas.length} pendencias=${pendencias.length} -> ${arquivo}`)
